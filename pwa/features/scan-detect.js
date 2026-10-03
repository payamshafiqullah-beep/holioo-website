'use strict';
// Page / board / card detection with OpenCV.js. Used by workers/scanner-worker.js (off the main
// thread) and by the Node tests (tests/scan-detect.test.mjs) with the same OpenCV build.
//
//   scanDetect(cv, imageData, mode, {prior, hint}) → {quad|null, score, confidence, support, contrast, coverage,
//                                               far, cutoff, glare, sharpness, brightness, source}
//   `prior`: the outline of the previous frame. While it is still on the page's edges only that outline
//   is refined (about 3× faster and steadier); otherwise the full search below runs.
//   `hint`: a rough outline from another detector (the board model in features/scan-ml.js). It is only a
//   candidate: refined to the real edges, ranked against the others, and dropped when the edges are not there.
//   `confidence`: 0..1, see ScanCore.confidence (the camera tells the person when it is under 80 %).
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
//   5. When the result is still doubtful (confidence under 80 %): a normalised pass — light fall-off divided
//      out, highlights clipped, edge-preserving smoothing, local contrast equalised — then the same search.

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

  function candidates(cv,bin,W,H,cfg,out,source,img){
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
          out.push({q,score,source,img});
        }finally{cnt.delete()}
      }
    }finally{contours.delete();hier.delete()}
  }

  function lineEquation(l){
    const dx=l.x2-l.x1,dy=l.y2-l.y1,len=Math.hypot(dx,dy)||1;
    return{a:dy/len,b:-dx/len,c:(dx*l.y1-dy*l.x1)/len};
  }
  function lineIntersection(u,v){
    const den=u.a*v.b-v.a*u.b;
    if(Math.abs(den)<1e-6)return null;
    return[(u.b*v.c-v.b*u.c)/den,(u.c*v.a-v.c*u.a)/den];
  }

  // The few longest lines, without the near-duplicates a thick edge map produces (same direction, same place).
  function distinctLines(lines,span,max=8){
    const keep=[];
    for(const l of lines){
      if(keep.length>=max)break;
      if(keep.every(k=>Math.abs(k.a*l.a+k.b*l.b)<.9986||Math.abs(k.a*l.mx+k.b*l.my+k.c)>Math.max(6,span*.02)))keep.push(l);
    }
    return keep;
  }
  // How far (as a share of the side) the detected segment runs past the two corners it should end at.
  function overshoot(l,a,b){
    const len=Math.hypot(b[0]-a[0],b[1]-a[1])||1,ux=(b[0]-a[0])/len,uy=(b[1]-a[1])/len;
    const t1=(l.x1-a[0])*ux+(l.y1-a[1])*uy,t2=(l.x2-a[0])*ux+(l.y2-a[1])*uy;
    return(Math.max(0,-Math.min(t1,t2))+Math.max(0,Math.max(t1,t2)-len))/len;
  }

  function boardLineCandidates(cv,edges,W,H,cfg,out,source='board-lines',img){
    const lines=new cv.Mat(),Hlines=[],Vlines=[];
    try{
      cv.HoughLinesP(edges,lines,1,Math.PI/180,Math.max(28,Math.round(Math.min(W,H)*.09)),Math.max(48,Math.round(W*.25)),Math.max(10,Math.round(W*.035)));
      for(let i=0;i<lines.rows;i++){
        const o=i*4,x1=lines.data32S[o],y1=lines.data32S[o+1],x2=lines.data32S[o+2],y2=lines.data32S[o+3];
        const dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy);
        if(len<Math.min(W,H)*.2)continue;
        const item={x1,y1,x2,y2,len,mx:(x1+x2)/2,my:(y1+y2)/2,...lineEquation({x1,y1,x2,y2})};
        if(Math.abs(dx)>Math.abs(dy)*1.18)Hlines.push(item);
        else if(Math.abs(dy)>Math.abs(dx)*1.18)Vlines.push(item);
      }
      Hlines.sort((a,b)=>b.len-a.len);Vlines.sort((a,b)=>b.len-a.len);
      const hs=distinctLines(Hlines,H),vs=distinctLines(Vlines,W);
      for(let ti=0;ti<hs.length;ti++)for(let bi=ti+1;bi<hs.length;bi++){
        const top=hs[ti].my<hs[bi].my?hs[ti]:hs[bi],bottom=top===hs[ti]?hs[bi]:hs[ti];
        if(bottom.my-top.my<H*.22)continue;
        for(let li=0;li<vs.length;li++)for(let ri=li+1;ri<vs.length;ri++){
          const left=vs[li].mx<vs[ri].mx?vs[li]:vs[ri],right=left===vs[li]?vs[ri]:vs[li];
          if(right.mx-left.mx<W*.28)continue;
          const pts=[lineIntersection(top,left),lineIntersection(top,right),lineIntersection(bottom,right),lineIntersection(bottom,left)];
          if(pts.some(p=>!p))continue;
          const q=ScanCore.orderQuad(pts.map(([x,y])=>[(x+.5)/W,(y+.5)/H]));
          if(q.some(([x,y])=>x<-.08||x>1.08||y<-.08||y>1.08))continue;
          if(!ScanCore.quadValid(q,{minArea:cfg.farArea*.9,aspect:H/W,minAngle:24}))continue;
          const area=ScanCore.area(q),lineCover=(top.len+bottom.len+left.len+right.len)/(2*(W+H));
          // A side of the board ends at its corners. A line that runs far past them (a window shadow, the
          // edge of the wall, a shelf) belongs to something bigger than the board.
          const over=overshoot(top,pts[0],pts[1])+overshoot(bottom,pts[3],pts[2])+overshoot(left,pts[0],pts[3])+overshoot(right,pts[1],pts[2]);
          const cx=q.reduce((s,p)=>s+p[0],0)/4,cy=q.reduce((s,p)=>s+p[1],0)/4;
          const centre=1-.18*Math.min(1,Math.hypot(cx-.5,cy-.5)/.65);
          out.push({q,score:area*Math.min(1.4,lineCover)*centre/(1+1.5*over),source,img});
        }
      }
    }finally{lines.delete()}
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

  // A real board has an edge on every side that is in the picture: one bare side (a shadow's edge or
  // the wall was taken for it) lowers the rank, however big the outline is.
  function weakSide(q,ref){
    if(!ref.ok||!ref.sides?.length)return 1;
    let weak=1;
    ref.sides.forEach((s,i)=>{
      const a=q[i],b=q[(i+1)%4];
      if([a,b].some(([x,y])=>x<.02||x>.98||y<.02||y>.98))return; // runs off the picture: no edge to see
      weak=Math.min(weak,s.ok?s.support:0);
    });
    return weak;
  }
  const sideFactor=(q,ref)=>.45+.55*Math.min(1,weakSide(q,ref)/.4);

  // Does the edge of side i go on, in the same straight line, past the corners? Then it is the edge of
  // something bigger than the board (a shadow across the wall, a ledge) and the outline stopped there by
  // mistake. A real side of the board turns at its corners. Returns the share (0..1) of the places past
  // the corners, on the side(s) that are in the picture, where the same step in brightness is still there.
  function sideContinues(g,W,H,q,i){
    const a=[q[i][0]*W,q[i][1]*H],b=[q[(i+1)%4][0]*W,q[(i+1)%4][1]*H],L=Math.hypot(b[0]-a[0],b[1]-a[1]);
    if(L<24)return 0;
    const ux=(b[0]-a[0])/L,uy=(b[1]-a[1])/L,nx=-uy,ny=ux;
    const at=(x,y)=>{const xi=Math.round(x-.5),yi=Math.round(y-.5);return xi<0||yi<0||xi>=W||yi>=H?NaN:g[yi*W+xi]};
    // brightness step across the line at a point of it (3 px each side, away from its own blur)
    const step=(x,y)=>{let p=0,m=0;for(let k=2;k<=4;k++){p+=at(x+nx*k,y+ny*k);m+=at(x-nx*k,y-ny*k)}return(p-m)/3};
    const own=[];
    for(let k=0;k<9;k++){const t=L*(.2+.6*k/8),v=step(a[0]+ux*t,a[1]+uy*t);if(v===v)own.push(v)}
    if(own.length<6)return 0;
    own.sort((x,y)=>x-y);
    const med=own[own.length>>1];
    if(Math.abs(med)<6)return 0;
    let ok=0,n=0;
    for(const end of[-1,1]){
      let seen=0,hit=0;
      for(let k=0;k<8;k++){
        const d=L*(.08+.24*k/7),x=end<0?a[0]-ux*d:b[0]+ux*d,y=end<0?a[1]-uy*d:b[1]+uy*d,v=step(x,y);
        if(v!==v)continue;
        seen++;if(v*med>0&&Math.abs(v)>=.5*Math.abs(med))hit++;
      }
      if(seen>=6){n++;ok+=hit/seen}
    }
    return n?ok/n:0;
  }
  const continuing=(g,W,H,q)=>[0,1,2,3].reduce((n,i)=>n+(sideContinues(g,W,H,q,i)>=.6?1:0),0);

  // The best few raw outlines are refined and re-ranked; returns the winner (or null).
  function choose(found,gray,W,H,cfg){
    found.sort((a,b)=>b.score-a.score);
    const top=[];
    for(const c of found){if(top.length>=(cfg.edge?6:3))break;if(top.every(t=>ScanCore.maxCornerShift(t.q,c.q)>.025))top.push(c)}
    const refine=typeof ScanRefine!=='undefined'?ScanRefine.refineQuad:null;
    let best=null;
    for(let idx=0;idx<top.length;idx++){
      const c=top[idx];
      const ref=refine?refine(c.img||gray,W,H,c.q):{ok:false,quad:c.q,support:0,contrast:0};
      if(c.source==='ml'&&!(ref.ok&&ref.support>=.5))continue; // a model's guess must sit on real edges
      const q=ref.ok?ref.quad:c.q,area=ScanCore.area(q);
      const far=area<cfg.minArea;
      // A small outline must prove it is a real object: strong straight edges and a clear step in
      // brightness (not just a block of text on a page that is cut by the frame).
      if(far&&!(ref.ok&&ref.support>=.72&&Math.abs(ref.contrast)>=25&&(!cfg.paper||ref.contrast>0)))continue;
      const st=quadStats(gray,W,H,q);
      const through=cfg.edge?continuing(gray,W,H,q):0;
      let final=c.score*(.3+.7*Math.min(1,ref.support/.9))*sideFactor(q,ref)*Math.pow(.78,through);
      // Paper is bright: a dark mat or a screen bigger than the sheet must not win over it.
      if(cfg.paper)final*=Math.max(.25,Math.min(1,(st.median-50)/130));
      const cx=q.reduce((s,p)=>s+p[0],0)/4,cy=q.reduce((s,p)=>s+p[1],0)/4;
      final*=1-.2*Math.min(1,Math.hypot(cx-.5,cy-.5)/.55); // a page is usually where the camera points
      if(!best||final>best.final)best={q,ref,final,area,far,source:c.source,sat:st.sat,weak:weakSide(q,ref),through};
      // Every factor is ≤ 1, so no later outline can beat a winner that already tops its raw score.
      if(best.final>=(top[idx+1]?top[idx+1].score:0))break;
    }
    return best;
  }

  // The light fall-off across the picture divided out (a heavily blurred copy is the "lighting"), highlights
  // clipped, then an edge-preserving smoothing: the same brightness step reads the same everywhere. Returns a
  // new Mat (the caller deletes it).
  function flatten(cv,gray,W,H){
    const small=new cv.Mat(),bg=new cv.Mat(),big=new cv.Mat(),flat=new cv.Mat(),clip=new cv.Mat(),smooth=new cv.Mat();
    try{
      const s=Math.max(1,Math.round(Math.max(W,H)/96)),sw=Math.max(8,Math.round(W/s)),sh=Math.max(8,Math.round(H/s));
      cv.resize(gray,small,new cv.Size(sw,sh),0,0,cv.INTER_AREA);
      cv.GaussianBlur(small,bg,new cv.Size(0,0),Math.max(2,Math.max(sw,sh)/9));
      cv.resize(bg,big,new cv.Size(W,H),0,0,cv.INTER_LINEAR);
      cv.divide(gray,big,flat,128,cv.CV_8U);
      cv.threshold(flat,clip,215,255,cv.THRESH_TRUNC);
      cv.bilateralFilter(clip,smooth,5,28,5);
      return smooth.clone();
    }finally{small.delete();bg.delete();big.delete();flat.delete();clip.delete();smooth.delete()}
  }

  // Candidates from the normalised image (edges, bright / dark regions, and for boards the long straight
  // lines), then the usual choice among everything found so far. Returns the winner or null.
  function normalizedPass(cv,gray,W,H,cfg,mode,found){
    const sm=flatten(cv,gray,W,H),eq=new cv.Mat(),b=new cv.Mat(),e=new cv.Mat(),reg=new cv.Mat();
    try{
      const flat=new Uint8Array(sm.data);   // copy: the Mat is gone before the choice is made
      const clahe=new cv.CLAHE(2,new cv.Size(8,8));clahe.apply(sm,eq);clahe.delete();
      cv.GaussianBlur(eq,b,new cv.Size(5,5),0);
      cv.Canny(b,e,12,36);
      const k=cv.getStructuringElement(cv.MORPH_RECT,new cv.Size(3,3));cv.dilate(e,e,k,new cv.Point(-1,-1),cfg.dilate+1);k.delete();
      candidates(cv,e,W,H,cfg,found,'normalized',flat);
      if(mode==='board')boardLineCandidates(cv,e,W,H,cfg,found,'normalized-lines',flat);
      cv.threshold(b,reg,0,255,cv.THRESH_BINARY+cv.THRESH_OTSU);
      const k2=cv.getStructuringElement(cv.MORPH_RECT,new cv.Size(7,7));cv.morphologyEx(reg,reg,cv.MORPH_CLOSE,k2);k2.delete();
      candidates(cv,reg,W,H,cfg,found,'normalized-bright',flat);
      if(mode==='board'){const dark=new cv.Mat();try{cv.bitwise_not(reg,dark);candidates(cv,dark,W,H,cfg,found,'normalized-dark',flat)}finally{dark.delete()}}
      return choose(found,gray.data,W,H,cfg);
    }finally{sm.delete();eq.delete();b.delete();e.delete();reg.delete()}
  }

  function scanDetect(cv,img,mode='document',{prior=null,hint=null,debug=null}={}){
    const cfg=MODES[mode]||MODES.document,W=img.width,H=img.height;
    const src=cv.matFromImageData(img),gray=new cv.Mat(),blur=new cv.Mat(),edges=new cv.Mat(),bright=new cv.Mat();
    const found=[];
    try{
      cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY);
      const m=measures(cv,gray);
      const out={quad:null,score:0,confidence:0,support:0,contrast:0,coverage:0,far:false,cutoff:false,glare:false,sharpness:m.sharpness,brightness:m.brightness,source:null};
      const cutOf=q=>q.some(([x,y])=>x<.006||x>.994||y<.006||y>.994);
      const confOf=b=>ScanCore.confidence({support:b.ref.support,contrast:b.ref.contrast,coverage:b.area,minArea:cfg.minArea,quad:b.q,aspect:H/W,weak:b.weak??1,through:b.through||0,cutoff:cutOf(b.q),glare:b.sat>.035});
      const report=best=>{
        out.quad=best.q;out.score=best.final;out.support=best.ref.support;out.contrast=best.ref.contrast;
        out.coverage=best.area;out.far=best.far;out.glare=best.sat>.035;out.source=best.source;
        // A corner on the frame border: the page is probably cut off there.
        out.cutoff=cutOf(best.q);out.confidence=confOf(best);
        return out;
      };
      // Tracking: the previous outline still sits on real edges and has not jumped or changed size.
      if(prior&&typeof ScanRefine!=='undefined'){
        const ref=ScanRefine.refineQuad(gray.data,W,H,prior,mode==='board'?{range:.04,minStrength:2.2}:undefined);
        if(ref.ok&&ref.support>=.75){
          const area=ScanCore.area(ref.quad),k=area/(ScanCore.area(prior)||1);
          if(area>=cfg.farArea&&k>.8&&k<1.25)return report({q:ref.quad,ref,final:area,area,far:area<cfg.minArea,source:'track',sat:quadStats(gray.data,W,H,ref.quad).sat,weak:weakSide(ref.quad,ref)});
        }
      }
      // A model's outline (already normalised to this frame) competes with the ones found below.
      if(hint&&hint.length===4){const hq=ScanCore.orderQuad(hint);if(hq&&ScanCore.quadValid(hq,{minArea:cfg.farArea,aspect:H/W,minAngle:24}))found.push({q:hq,score:ScanCore.area(hq)*1.15,source:'ml'})}
      cv.GaussianBlur(gray,blur,new cv.Size(5,5),0);
      // 1. Edges of the sheet.
      cv.Canny(blur,edges,cfg.canny[0],cfg.canny[1]);
      const k=cv.getStructuringElement(cv.MORPH_RECT,new cv.Size(3,3));
      cv.dilate(edges,edges,k,new cv.Point(-1,-1),cfg.dilate);k.delete();
      candidates(cv,edges,W,H,cfg,found,'edges');
      if(mode==='board')boardLineCandidates(cv,edges,W,H,cfg,found);
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

      // 4. Still doubtful: normalise the light and look again (poor, uneven or sunny light, dark on dark).
      if(!best||confOf(best)<.8){
        const again=normalizedPass(cv,gray,W,H,cfg,mode,found);
        if(again&&(!best||again.final>best.final))best=again;
      }

      if(debug)debug.found=found.map(c=>({q:c.q,score:c.score,source:c.source}));
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
