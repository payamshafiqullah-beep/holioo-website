'use strict';
// Page / board / card detection with OpenCV.js. Used by workers/scanner-worker.js (off the main
// thread) and by the Node tests (tests/scan-detect.test.mjs) with the same OpenCV build.
//
//   scanDetect(cv, imageData, mode, {prior}) → {quad|null, score, support, contrast, coverage, far, cutoff,
//                                               glare, sharpness, brightness, source}
//   `prior`: the outline of the previous frame. While it is still on the page's edges only that outline
//   is refined (about 3× faster and steadier); otherwise the full search below runs.
//
// quad corners are normalised to the image (x/width, y/height), ordered TL, TR, BR, BL.
// mode: 'document' | 'board' | 'book' | 'id'
//
// How a page is found:
//   1. Fast pass: Canny edges + a bright (or dark) region → outlines with 4 corners.
//   2. If nothing convincing: a sensitive pass (local contrast equalised, low edge thresholds) for
//      white paper on a white table.
//   3. The best few outlines are refined to sub-pixel precision (scan-refine.js: real edge searched
//      across each side, straight line fitted, corners from the intersections) and ranked by size,
//      how well the edges are really there, how paper-like the inside is and how central it is.
//   4. Measures for the camera: sharpness, brightness, reflections, page too far / cut by the frame.

(function(root){
  // minArea: share of the frame a page should fill to be shot; farArea: smallest outline reported at all
  // (between the two it is shown with a "come closer" hint and never auto-captured).
  const MODES={
    document:{canny:[40,130],dilate:1,minArea:.18,farArea:.05,edge:false,paper:true},
    book:{canny:[35,120],dilate:2,minArea:.25,farArea:.08,edge:false,paper:true},
    id:{canny:[40,130],dilate:1,minArea:.03,farArea:.03,edge:false,aspect:85.6/54},
    // Boards are seen at an angle from far away, often cut by the frame or with reflections:
    // looser edges, smaller minimum size, bright-region fallback.
    board:{canny:[20,80],dilate:2,minArea:.08,farArea:.04,edge:true}
  };
  const GOOD=.1; // a final score under this (and weak edges) triggers the sensitive pass

  function measures(cv,gray){
    const lap=new cv.Mat(),mean=new cv.Mat(),std=new cv.Mat();
    try{
      cv.Laplacian(gray,lap,cv.CV_64F);
      cv.meanStdDev(lap,mean,std);
      const sharpness=std.doubleAt(0,0)**2;
      const brightness=cv.mean(gray)[0];
      return{sharpness,brightness};
    }finally{lap.delete();mean.delete();std.delete()}
  }

  // Four corners from a contour: its polygon if it has 4 corners, else its convex hull simplified.
  function quadFrom(cv,cnt,loose){
    for(const eps of loose?[.02,.035,.05]:[.02,.03]){
      const approx=new cv.Mat();
      try{
        const peri=cv.arcLength(cnt,true);cv.approxPolyDP(cnt,approx,eps*peri,true);
        if(approx.rows===4&&cv.isContourConvex(approx)){const d=approx.data32S;return[[d[0],d[1]],[d[2],d[3]],[d[4],d[5]],[d[6],d[7]]]}
      }finally{approx.delete()}
    }
    const hull=new cv.Mat();
    try{
      cv.convexHull(cnt,hull,false,true);
      for(const eps of[.02,.04,.06,.08]){
        const approx=new cv.Mat();
        try{
          const peri=cv.arcLength(hull,true);cv.approxPolyDP(hull,approx,eps*peri,true);
          if(approx.rows===4){const d=approx.data32S;return[[d[0],d[1]],[d[2],d[3]],[d[4],d[5]],[d[6],d[7]]]}
        }finally{approx.delete()}
      }
    }finally{hull.delete()}
    return null;
  }

  function candidates(cv,bin,W,H,cfg,out,source){
    const contours=new cv.MatVector(),hier=new cv.Mat();
    try{
      cv.findContours(bin,contours,hier,cv.RETR_LIST,cv.CHAIN_APPROX_SIMPLE);
      for(let i=0;i<contours.size();i++){
        const cnt=contours.get(i);
        try{
          const a=cv.contourArea(cnt);
          if(a<cfg.farArea*W*H||a>.995*W*H)continue;
          const px=quadFrom(cv,cnt,cfg.edge);if(!px)continue;
          // Contour points are pixel indices: centre of pixel i is i+.5 in the scanner's coordinates.
          const q=ScanCore.orderQuad(px.map(([x,y])=>[(x+.5)/W,(y+.5)/H]));
          if(!ScanCore.quadValid(q,{minArea:cfg.farArea*.9,aspect:H/W,minAngle:cfg.edge?30:40}))continue;
          const qa=ScanCore.area(q.map(([x,y])=>[x,y*H/W]))*W*W;
          // Prefer big quads that fill their contour (a real sheet, not a blob of text).
          let score=qa/(W*H)*Math.min(1,a/qa);
          if(cfg.aspect){
            const r=1/ScanCore.pageRatio(q.map(([x,y])=>[x,y*H/W]));const k=Math.max(r,1/r);
            score*=Math.max(0,1-Math.abs(k-cfg.aspect)/cfg.aspect*2.5);
          }
          // A quad with 3–4 corners on the frame border is the frame itself (or the wall around the
          // board), not the page. Boards cut by the photo's edge (2 corners outside) remain allowed.
          const onBorder=q.filter(([x,y])=>x<.015||x>.985||y<.015||y>.985).length;
          if(onBorder>=(cfg.edge?3:2))continue;
          out.push({q,score,source});
        }finally{cnt.delete()}
      }
    }finally{contours.delete();hier.delete()}
  }

  // Median brightness and share of burnt-out pixels inside a quad (scanline fill on the grey image).
  // The median, not the mean: a sheet lying on a dark mat must not make the mat look bright.
  function quadStats(g,W,H,q){
    const P=q.map(([x,y])=>[x*W,y*H]),ys=P.map(p=>p[1]);
    const y0=Math.max(0,Math.floor(Math.min(...ys))),y1=Math.min(H-1,Math.ceil(Math.max(...ys)));
    let n=0,sat=0;const hist=new Uint32Array(256);
    for(let y=y0;y<=y1;y++){
      const yc=y+.5;let xl=Infinity,xr=-Infinity;
      for(let i=0;i<4;i++){
        const a=P[i],b=P[(i+1)%4];
        if((a[1]<=yc&&b[1]>yc)||(b[1]<=yc&&a[1]>yc)){const x=a[0]+(yc-a[1])/(b[1]-a[1])*(b[0]-a[0]);if(x<xl)xl=x;if(x>xr)xr=x}
      }
      if(xl>xr)continue;
      const x0=Math.max(0,Math.ceil(xl-.5)),x1=Math.min(W-1,Math.floor(xr-.5)),row=y*W;
      for(let x=x0;x<=x1;x++){const v=g[row+x];hist[v]++;n++;if(v>=247)sat++}
    }
    let acc=0,median=0;
    for(let v=0;v<256;v++){acc+=hist[v];if(acc>=n/2){median=v;break}}
    return{median,sat:n?sat/n:0,n};
  }

  // True when a big, rectangle-like region runs off the frame: the page is larger than the picture.
  function cutSignal(cv,bin,W,H){
    const contours=new cv.MatVector(),hier=new cv.Mat();
    let cut=false;
    try{
      cv.findContours(bin,contours,hier,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_SIMPLE);
      for(let i=0;i<contours.size()&&!cut;i++){
        const cnt=contours.get(i);
        try{
          const a=cv.contourArea(cnt);
          if(a<.3*W*H||a>.97*W*H)continue;
          const r=cv.boundingRect(cnt);
          const touch=(r.x<=1)+(r.y<=1)+(r.x+r.width>=W-1)+(r.y+r.height>=H-1);
          if(touch<1||touch>3)continue;
          const hull=new cv.Mat();
          try{cv.convexHull(cnt,hull,false,true);cut=a/(cv.contourArea(hull)||1)>=.93}finally{hull.delete()}
        }finally{cnt.delete()}
      }
    }finally{contours.delete();hier.delete()}
    return cut;
  }

  // The best few raw outlines are refined and re-ranked; returns the winner (or null).
  function choose(found,gray,W,H,cfg){
    found.sort((a,b)=>b.score-a.score);
    const top=[];
    for(const c of found){if(top.length>=3)break;if(top.every(t=>ScanCore.maxCornerShift(t.q,c.q)>.025))top.push(c)}
    const refine=typeof ScanRefine!=='undefined'?ScanRefine.refineQuad:null;
    let best=null;
    for(let idx=0;idx<top.length;idx++){
      const c=top[idx];
      const ref=refine?refine(gray,W,H,c.q):{ok:false,quad:c.q,support:0,contrast:0};
      const q=ref.ok?ref.quad:c.q,area=ScanCore.area(q);
      const far=area<cfg.minArea;
      // A small outline must prove it is a real object: strong straight edges and a clear step in
      // brightness (not just a block of text on a page that is cut by the frame).
      if(far&&!(ref.ok&&ref.support>=.72&&Math.abs(ref.contrast)>=25&&(!cfg.paper||ref.contrast>0)))continue;
      const st=quadStats(gray,W,H,q);
      let final=c.score*(.3+.7*Math.min(1,ref.support/.9));
      // Paper is bright: a dark mat or a screen bigger than the sheet must not win over it.
      if(cfg.paper)final*=Math.max(.25,Math.min(1,(st.median-50)/130));
      const cx=q.reduce((s,p)=>s+p[0],0)/4,cy=q.reduce((s,p)=>s+p[1],0)/4;
      final*=1-.2*Math.min(1,Math.hypot(cx-.5,cy-.5)/.55); // a page is usually where the camera points
      if(!best||final>best.final)best={q,ref,final,area,far,source:c.source,sat:st.sat};
      // Every factor is ≤ 1, so no later outline can beat a winner that already tops its raw score.
      if(best.final>=(top[idx+1]?top[idx+1].score:0))break;
    }
    return best;
  }

  function scanDetect(cv,img,mode='document',{prior=null}={}){
    const cfg=MODES[mode]||MODES.document,W=img.width,H=img.height;
    const src=cv.matFromImageData(img),gray=new cv.Mat(),blur=new cv.Mat(),edges=new cv.Mat(),bright=new cv.Mat();
    const found=[];
    try{
      cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY);
      const m=measures(cv,gray);
      const out={quad:null,score:0,support:0,contrast:0,coverage:0,far:false,cutoff:false,glare:false,sharpness:m.sharpness,brightness:m.brightness,source:null};
      const report=best=>{
        out.quad=best.q;out.score=best.final;out.support=best.ref.support;out.contrast=best.ref.contrast;
        out.coverage=best.area;out.far=best.far;out.glare=best.sat>.035;out.source=best.source;
        // A corner on the frame border: the page is probably cut off there.
        out.cutoff=best.q.some(([x,y])=>x<.006||x>.994||y<.006||y>.994);
        return out;
      };
      // Tracking: the previous outline still sits on real edges and has not jumped or changed size.
      if(prior&&typeof ScanRefine!=='undefined'){
        const ref=ScanRefine.refineQuad(gray.data,W,H,prior);
        if(ref.ok&&ref.support>=.75){
          const area=ScanCore.area(ref.quad),k=area/(ScanCore.area(prior)||1);
          if(area>=cfg.farArea&&k>.8&&k<1.25)return report({q:ref.quad,ref,final:area,area,far:area<cfg.minArea,source:'track',sat:quadStats(gray.data,W,H,ref.quad).sat});
        }
      }
      cv.GaussianBlur(gray,blur,new cv.Size(5,5),0);
      // 1. Edges of the sheet.
      cv.Canny(blur,edges,cfg.canny[0],cfg.canny[1]);
      const k=cv.getStructuringElement(cv.MORPH_RECT,new cv.Size(3,3));
      cv.dilate(edges,edges,k,new cv.Point(-1,-1),cfg.dilate);k.delete();
      candidates(cv,edges,W,H,cfg,found,'edges');
      // 2. Bright region (white sheet on a desk, whiteboard on a wall): works when edges are weak.
      cv.threshold(blur,bright,0,255,cv.THRESH_BINARY+cv.THRESH_OTSU);
      const k2=cv.getStructuringElement(cv.MORPH_RECT,new cv.Size(7,7));
      cv.morphologyEx(bright,bright,cv.MORPH_CLOSE,k2);k2.delete();
      candidates(cv,bright,W,H,cfg,found,'bright');
      // Blackboards are darker than the wall: look at dark regions too.
      if(mode==='board'){const dark=new cv.Mat();try{cv.bitwise_not(bright,dark);candidates(cv,dark,W,H,cfg,found,'dark')}finally{dark.delete()}}
      let best=choose(found,gray.data,W,H,cfg);

      // 3. Sensitive pass when the fast one found nothing convincing (white paper on a white table).
      if(!best||(best.final<GOOD&&best.ref.support<.5)){
        const eq=new cv.Mat(),b2=new cv.Mat(),e2=new cv.Mat();
        try{
          const clahe=new cv.CLAHE(3,new cv.Size(8,8));clahe.apply(gray,eq);clahe.delete();
          cv.GaussianBlur(eq,b2,new cv.Size(7,7),0);
          cv.Canny(b2,e2,10,30);
          const k3=cv.getStructuringElement(cv.MORPH_RECT,new cv.Size(3,3));
          cv.dilate(e2,e2,k3,new cv.Point(-1,-1),cfg.dilate+1);k3.delete();
          candidates(cv,e2,W,H,cfg,found,'sensitive');
          const again=choose(found,gray.data,W,H,cfg);
          if(again&&(!best||again.final>best.final))best=again;
        }finally{eq.delete();b2.delete();e2.delete()}
      }

      if(best)return report(best);
      out.cutoff=cutSignal(cv,bright,W,H);
      return out;
    }finally{src.delete();gray.delete();blur.delete();edges.delete();bright.delete()}
  }

  // Brightness at a frame point, for ScanCore.findGutter (book fold).
  function lumSampler(img){
    const{data,width:W,height:H}=img;
    return(x,y)=>{const i=(Math.min(H-1,Math.max(0,Math.round(y*(H-1))))*W+Math.min(W-1,Math.max(0,Math.round(x*(W-1)))))*4;return .299*data[i]+.587*data[i+1]+.114*data[i+2]};
  }

  root.scanDetect=scanDetect;root.scanLumSampler=lumSampler;
})(typeof self!=='undefined'?self:globalThis);
