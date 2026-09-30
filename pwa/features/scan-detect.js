'use strict';
// Page / board / card detection with OpenCV.js. Used by workers/scanner-worker.js (off the main
// thread) and by the Node tests (tests/scan-detect.test.mjs) with the same OpenCV build.
//
//   scanDetect(cv, imageData, mode) → {quad|null, sharpness, brightness, score}
//
// quad corners are normalised to the image (x/width, y/height), ordered TL, TR, BR, BL.
// mode: 'document' | 'board' | 'book' | 'id'

(function(root){
  const MODES={
    document:{canny:[40,130],dilate:1,minArea:.18,edge:false},
    book:{canny:[35,120],dilate:2,minArea:.25,edge:false},
    id:{canny:[40,130],dilate:1,minArea:.03,edge:false,aspect:85.6/54},
    // Boards are seen at an angle from far away, often cut by the frame or with reflections:
    // looser edges, smaller minimum size, bright-region fallback.
    board:{canny:[20,80],dilate:2,minArea:.08,edge:true}
  };

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
          if(a<cfg.minArea*W*H||a>.995*W*H)continue;
          const px=quadFrom(cv,cnt,cfg.edge);if(!px)continue;
          const q=ScanCore.orderQuad(px.map(([x,y])=>[x/W,y/H]));
          if(!ScanCore.quadValid(q,{minArea:cfg.minArea*.9,aspect:H/W,minAngle:cfg.edge?30:40}))continue;
          const qa=ScanCore.area(q.map(([x,y])=>[x,y*H/W]))*W*W;
          // Prefer big quads that fill their contour (a real sheet, not a blob of text).
          let score=qa/(W*H)*Math.min(1,a/qa);
          if(cfg.aspect){
            const r=1/ScanCore.pageRatio(q.map(([x,y])=>[x,y*H/W]));const k=Math.max(r,1/r);
            score*=Math.max(0,1-Math.abs(k-cfg.aspect)/cfg.aspect*2.5);
          }
          // A quad glued to the whole frame border is usually the frame itself, not the page.
          const onBorder=q.filter(([x,y])=>x<.01||x>.99||y<.01||y>.99).length;
          if(onBorder>=3&&!cfg.edge)continue;
          out.push({q,score,source});
        }finally{cnt.delete()}
      }
    }finally{contours.delete();hier.delete()}
  }

  function scanDetect(cv,img,mode='document'){
    const cfg=MODES[mode]||MODES.document,W=img.width,H=img.height;
    const src=cv.matFromImageData(img),gray=new cv.Mat(),blur=new cv.Mat(),edges=new cv.Mat();
    const found=[];
    try{
      cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY);
      const m=measures(cv,gray);
      cv.GaussianBlur(gray,blur,new cv.Size(5,5),0);
      // 1. Edges of the sheet.
      cv.Canny(blur,edges,cfg.canny[0],cfg.canny[1]);
      const k=cv.getStructuringElement(cv.MORPH_RECT,new cv.Size(3,3));
      cv.dilate(edges,edges,k,new cv.Point(-1,-1),cfg.dilate);k.delete();
      candidates(cv,edges,W,H,cfg,found,'edges');
      // 2. Bright region (white sheet on a desk, whiteboard on a wall): works when edges are weak.
      const bright=new cv.Mat();
      try{
        cv.threshold(blur,bright,0,255,cv.THRESH_BINARY+cv.THRESH_OTSU);
        const k2=cv.getStructuringElement(cv.MORPH_RECT,new cv.Size(7,7));
        cv.morphologyEx(bright,bright,cv.MORPH_CLOSE,k2);k2.delete();
        candidates(cv,bright,W,H,cfg,found,'bright');
        // Blackboards are darker than the wall: look at dark regions too.
        if(mode==='board'){cv.bitwise_not(bright,bright);candidates(cv,bright,W,H,cfg,found,'dark')}
      }finally{bright.delete()}
      found.sort((a,b)=>b.score-a.score);
      const best=found[0]||null;
      return{quad:best?best.q:null,score:best?best.score:0,sharpness:m.sharpness,brightness:m.brightness};
    }finally{src.delete();gray.delete();blur.delete();edges.delete()}
  }

  // Brightness at a frame point, for ScanCore.findGutter (book fold).
  function lumSampler(img){
    const{data,width:W,height:H}=img;
    return(x,y)=>{const i=(Math.min(H-1,Math.max(0,Math.round(y*(H-1))))*W+Math.min(W-1,Math.max(0,Math.round(x*(W-1)))))*4;return .299*data[i]+.587*data[i+1]+.114*data[i+2]};
  }

  root.scanDetect=scanDetect;root.scanLumSampler=lumSampler;
})(typeof self!=='undefined'?self:globalThis);
