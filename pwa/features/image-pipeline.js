'use strict';
// Holioo image pipeline — pure image math, no DOM. Runs inside workers/image-worker.js
// (off the main thread) and, where workers can't draw, on the main thread as a fallback.
//
// Edit parameters (non-destructive, stored on the photo row as `edit`):
//   rot    0..3        quarter turns clockwise, applied first
//   flip   bool        horizontal mirror, after rot
//   angle  -45..45     straighten, degrees clockwise
//   mode   'rect'|'quad'
//   box    {cx,cy,w,h} rect mode: crop box in the straightened frame, in "width units"
//                      (oriented image width = 1), centre relative to the image centre
//   quad   [[x,y]x4]   quad mode: TL,TR,BR,BL corners in width units from the top-left
//   aspect 'free'|'original'|'a4'|'4:3'|'16:9'|'1:1'
//   filter 'original'|'document'|'whiteboard'|'gray'|'contrast'
// All coordinates are resolution independent, so the same edit renders a preview and the
// full-size image identically.

(function(root){
  const makeCanvas=(w,h)=>{
    w=Math.max(1,Math.round(w));h=Math.max(1,Math.round(h));
    if(typeof OffscreenCanvas!=='undefined')return new OffscreenCanvas(w,h);
    const c=document.createElement('canvas');c.width=w;c.height=h;return c;
  };
  const ctx2d=c=>c.getContext('2d',{willReadFrequently:false});

  const defaultEdit=()=>({rot:0,flip:false,angle:0,mode:'rect',box:null,quad:null,aspect:'free',filter:'original'});
  const isIdentity=e=>!e||(!e.rot&&!e.flip&&!e.angle&&e.filter==='original'&&!e.quad&&(!e.box||(Math.abs(e.box.w-1)<1e-3&&Math.abs(e.box.cx)<1e-3&&Math.abs(e.box.cy)<1e-3)));

  // Size of the image after quarter turns.
  const orientedSize=(w,h,rot)=>rot%2?{w:h,h:w}:{w,h};

  // Draw the source rotated by quarter turns and mirrored, scaled to `scale`.
  function drawOriented(src,rot,flip,scale=1){
    const sw=src.width,sh=src.height,o=orientedSize(sw,sh,rot);
    const c=makeCanvas(o.w*scale,o.h*scale),x=ctx2d(c);
    x.imageSmoothingQuality='high';
    x.translate(c.width/2,c.height/2);
    if(flip)x.scale(-1,1);
    x.rotate(rot*Math.PI/2);
    x.drawImage(src,-sw*scale/2,-sh*scale/2,sw*scale,sh*scale);
    return c;
  }

  // Rect-mode box → the four image points it covers (width units, from top-left).
  function boxToQuad(box,angle,ratio){ // ratio = oriented height / width
    const t=angle*Math.PI/180,c=Math.cos(t),s=Math.sin(t),cx=.5,cy=ratio/2;
    return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([sx,sy])=>{
      const dx=box.cx+sx*box.w/2,dy=box.cy+sy*box.h/2;       // display frame, centre origin
      return[cx+c*dx+s*dy,cy-s*dx+c*dy];                       // rotate by -angle back into the image
    });
  }

  function fullBox(ratio,angle=0){
    // Largest box of the image's own proportions that stays inside the image once straightened.
    const t=Math.abs(angle)*Math.PI/180,c=Math.cos(t),s=Math.sin(t);
    const k=Math.min(1/(c+ratio*s),ratio/(ratio*c+s));
    return{cx:0,cy:0,w:k,h:k*ratio};
  }

  // Height/width of an aspect choice for an image of proportions `ratio` (null = free).
  // Fixed ratios follow the photo's orientation: portrait photos get portrait A4, etc.
  function aspectRatio(aspect,ratio){
    const portrait=ratio>=1,pick=(p,l)=>portrait?p:l;
    switch(aspect){
      case 'original':return ratio;
      case 'a4':return pick(Math.SQRT2,1/Math.SQRT2);
      case '4:3':return pick(4/3,3/4);
      case '16:9':return pick(16/9,9/16);
      case '1:1':return 1;
      default:return null;
    }
  }
  // Largest centred box with that aspect that stays inside the straightened image.
  function boxForAspect(ratio,aspect,angle=0){
    const r=aspectRatio(aspect,ratio);if(!r)return fullBox(ratio,angle);
    const t=Math.abs(angle)*Math.PI/180,c=Math.cos(t),s=Math.sin(t);
    const k=Math.min(1/(c+r*s),ratio/(s+r*c));
    return{cx:0,cy:0,w:k,h:k*r};
  }

  const orderQuad=pts=>{
    const bySum=[...pts].sort((a,b)=>(a[0]+a[1])-(b[0]+b[1])),byDiff=[...pts].sort((a,b)=>(a[0]-a[1])-(b[0]-b[1]));
    return[bySum[0],byDiff[3],bySum[3],byDiff[0]]; // TL,TR,BR,BL
  };

  // Homography mapping unit square corners (0,0),(1,0),(1,1),(0,1) → quad.
  function squareToQuad(q){
    const[[x0,y0],[x1,y1],[x2,y2],[x3,y3]]=q;
    const dx1=x1-x2,dx2=x3-x2,dy1=y1-y2,dy2=y3-y2,sx=x0-x1+x2-x3,sy=y0-y1+y2-y3;
    let g=0,h=0;
    if(Math.abs(sx)>1e-9||Math.abs(sy)>1e-9){const d=dx1*dy2-dx2*dy1;g=(sx*dy2-dx2*sy)/d;h=(dx1*sy-sx*dy1)/d}
    return[x1-x0+g*x1,x3-x0+h*x3,x0,y1-y0+g*y1,y3-y0+h*y3,y0,g,h];
  }

  // Perspective warp (CPU, bilinear) on raw RGBA pixels: quad (pixels, TL,TR,BR,BL) → outW×outH.
  function warpPixels(src,sw,sh,quadPx,outW,outH){
    const W=Math.max(1,Math.round(outW)),H=Math.max(1,Math.round(outH)),d=new Uint8ClampedArray(W*H*4);
    const[a,b,c,dd,e,f,g,h]=squareToQuad(quadPx);
    for(let y=0;y<H;y++){
      const v=(y+.5)/H;
      for(let x=0;x<W;x++){
        const u=(x+.5)/W,den=g*u+h*v+1;
        let px=(a*u+b*v+c)/den-.5,py=(dd*u+e*v+f)/den-.5;
        if(px<0)px=0;else if(px>sw-1.001)px=sw-1.001;
        if(py<0)py=0;else if(py>sh-1.001)py=sh-1.001;
        const x0=px|0,y0=py|0,fx=px-x0,fy=py-y0,i00=(y0*sw+x0)*4,i10=i00+4,i01=i00+sw*4,i11=i01+4,o=(y*W+x)*4;
        for(let k=0;k<3;k++){
          const top=src[i00+k]+(src[i10+k]-src[i00+k])*fx,bot=src[i01+k]+(src[i11+k]-src[i01+k])*fx;
          d[o+k]=top+(bot-top)*fy;
        }
        d[o+3]=255;
      }
    }
    return{data:d,width:W,height:H};
  }
  function warpQuad(srcCanvas,quadPx,outW,outH){
    const sw=srcCanvas.width,sh=srcCanvas.height,src=ctx2d(srcCanvas).getImageData(0,0,sw,sh).data;
    const r=warpPixels(src,sw,sh,quadPx,outW,outH),out=makeCanvas(r.width,r.height),ox=ctx2d(out),img=ox.createImageData(r.width,r.height);
    img.data.set(r.data);ox.putImageData(img,0,0);
    return out;
  }

  // ---------- Filters: pure functions on RGBA pixels (tests/image-filters.test.mjs) ----------
  const clamp=v=>v<0?0:v>255?255:v;
  const lumAt=(d,i)=>.299*d[i]+.587*d[i+1]+.114*d[i+2];

  // Local background brightness for every pixel (the paper, the board): a coarse grid of robust
  // per-block values (a percentile, so text and marks don't count), smoothed, then interpolated.
  // A high `pct` finds a light background (paper, whiteboard); a low one a dark board.
  function backgroundMap(val,w,h,{cells=28,pct=.9}={}){
    const bs=Math.max(4,Math.ceil(Math.max(w,h)/cells)),gw=Math.ceil(w/bs),gh=Math.ceil(h/bs);
    let grid=new Float32Array(gw*gh);const hist=new Uint32Array(256);
    for(let gy=0;gy<gh;gy++)for(let gx=0;gx<gw;gx++){
      hist.fill(0);let n=0;
      const x0=gx*bs,y0=gy*bs,x1=Math.min(w,x0+bs),y1=Math.min(h,y0+bs),step=Math.max(1,Math.floor(bs/16));
      for(let y=y0;y<y1;y+=step)for(let x=x0;x<x1;x+=step){hist[val[y*w+x]|0]++;n++}
      const target=n*pct;let acc=0,v=255;for(let k=0;k<256;k++){acc+=hist[k];if(acc>=target){v=k;break}}
      grid[gy*gw+gx]=v;
    }
    for(let pass=0;pass<2;pass++){ // 3×3 smoothing of the grid
      const g2=new Float32Array(grid.length);
      for(let gy=0;gy<gh;gy++)for(let gx=0;gx<gw;gx++){let s=0,n=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const x=gx+dx,y=gy+dy;if(x<0||y<0||x>=gw||y>=gh)continue;s+=grid[y*gw+x];n++}g2[gy*gw+gx]=s/n}
      grid=g2;
    }
    const out=new Float32Array(w*h);
    for(let y=0;y<h;y++){
      const fy=Math.min(gh-1,Math.max(0,(y+.5)/bs-.5)),y0=Math.floor(fy),y1=Math.min(gh-1,y0+1),ty=fy-y0;
      for(let x=0;x<w;x++){
        const fx=Math.min(gw-1,Math.max(0,(x+.5)/bs-.5)),x0=Math.floor(fx),x1=Math.min(gw-1,x0+1),tx=fx-x0;
        const a=grid[y0*gw+x0]+(grid[y0*gw+x1]-grid[y0*gw+x0])*tx,b=grid[y1*gw+x0]+(grid[y1*gw+x1]-grid[y1*gw+x0])*tx;
        out[y*w+x]=a+(b-a)*ty;
      }
    }
    return out;
  }

  function lumArray(d,w,h){const L=new Uint8ClampedArray(w*h);for(let i=0,j=0;j<w*h;i+=4,j++)L[j]=lumAt(d,i);return L}
  function percentile(arr,p){const hist=new Uint32Array(256);let n=0;for(let i=0;i<arr.length;i+=7){hist[arr[i]|0]++;n++}let acc=0;for(let k=0;k<256;k++){acc+=hist[k];if(acc>=n*p)return k}return 255}

  // Light unsharp mask (3x3) to crisp up handwriting and board text.
  function sharpen(d,w,h,amount){
    const src=new Uint8ClampedArray(d);
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
      const i=(y*w+x)*4;
      for(let k=0;k<3;k++){
        const blur=(src[i-4+k]+src[i+4+k]+src[i-w*4+k]+src[i+w*4+k]+src[i+k]*4)/8;
        d[i+k]=clamp(src[i+k]+(src[i+k]-blur)*amount*2);
      }
    }
  }
  function saturate(d,i,k){const y=lumAt(d,i);for(let c=0;c<3;c++)d[i+c]=clamp(y+(d[i+c]-y)*k)}

  // Light evened out: every pixel divided by its local background (shadows and uneven light
  // disappear, the page becomes white), colours kept.
  function flatten(d,w,h,{pct=.9,target=245}={}){
    const bg=backgroundMap(lumArray(d,w,h),w,h,{pct});
    for(let j=0,i=0;j<w*h;j++,i+=4){const k=target/Math.max(18,bg[j]);for(let c=0;c<3;c++)d[i+c]=clamp(d[i+c]*k)}
    return bg;
  }
  function blackPoint(d,w,h,max=90){
    const L=lumArray(d,w,h),lo=Math.min(max,percentile(L,.02)),range=255-lo;
    if(lo<=0)return;
    for(let i=0;i<d.length;i+=4)for(let c=0;c<3;c++)d[i+c]=clamp((d[i+c]-lo)*255/range);
  }

  // Black & white: adaptive threshold (Bradley–Roth, integral image) after evening out the light.
  function adaptiveBW(d,w,h){
    const L=lumArray(d,w,h),bg=backgroundMap(L,w,h,{pct:.9}),N=new Float32Array(w*h);
    for(let j=0;j<w*h;j++)N[j]=Math.min(255,L[j]/Math.max(18,bg[j])*255);
    const I=new Float64Array((w+1)*(h+1));
    for(let y=0;y<h;y++){let row=0;for(let x=0;x<w;x++){row+=N[y*w+x];I[(y+1)*(w+1)+x+1]=I[y*(w+1)+x+1]+row}}
    const r=Math.max(4,Math.round(Math.max(w,h)/32)),t=.14;
    for(let y=0;y<h;y++){
      const ya=Math.max(0,y-r),yb=Math.min(h,y+r+1);
      for(let x=0;x<w;x++){
        const xa=Math.max(0,x-r),xb=Math.min(w,x+r+1),n=(xb-xa)*(yb-ya);
        const sum=I[yb*(w+1)+xb]-I[ya*(w+1)+xb]-I[yb*(w+1)+xa]+I[ya*(w+1)+xa];
        const v=N[y*w+x],black=v<sum/n*(1-t)&&v<225;
        const i=(y*w+x)*4;d[i]=d[i+1]=d[i+2]=black?0:255;
      }
    }
  }

  function filterPixels(d,w,h,filter){
    const n=w*h*4;
    switch(filter){
      case'gray':{
        const L=lumArray(d,w,h),lo=percentile(L,.01),hi=Math.max(lo+1,percentile(L,.99));
        for(let i=0,j=0;i<n;i+=4,j++){const v=clamp((L[j]-lo)*255/(hi-lo));d[i]=d[i+1]=d[i+2]=v}
        break;
      }
      case'contrast':
        for(let i=0;i<n;i+=4){const y=lumAt(d,i);for(let k=0;k<3;k++){const s=y+(d[i+k]-y)*1.2;d[i+k]=clamp((s-128)*1.5+128)}}
        break;
      case'auto': // clean white background, crisper text, colours kept
        flatten(d,w,h,{pct:.9,target:248});blackPoint(d,w,h,90);
        for(let i=0;i<n;i+=4)saturate(d,i,1.15);
        sharpen(d,w,h,.4);break;
      case'shadows': // only the light is evened out; nothing else changes
        flatten(d,w,h,{pct:.9,target:240});break;
      case'lighten':
        for(let i=0;i<n;i+=4)for(let k=0;k<3;k++)d[i+k]=clamp(255*Math.pow(d[i+k]/255,.7)+8);
        break;
      case'bw':adaptiveBW(d,w,h);break;
      case'document':{ // earlier "Document" filter: mostly grey, strong contrast
        const bg=backgroundMap(lumArray(d,w,h),w,h,{pct:.9}),black=70,range=255-black;
        for(let i=0,j=0;i<n;i+=4,j++){
          const bl=Math.max(20,bg[j]),y=lumAt(d,i),v=clamp((Math.min(255,y/bl*245)-black)*255/range);
          for(let k=0;k<3;k++){const c=clamp((Math.min(255,d[i+k]/bl*245)-black)*255/range);d[i+k]=v+(c-v)*.25}
        }
        sharpen(d,w,h,.55);break;
      }
      case'whiteboard':case'board':{
        // Whiteboard: the board turns white, reflections fade (glare is part of the local
        // background, so it is divided away), marker colours are strengthened.
        const bg=backgroundMap(lumArray(d,w,h),w,h,{pct:.85,cells:24});
        for(let i=0,j=0;i<n;i+=4,j++){const k=250/Math.max(18,bg[j]);for(let c=0;c<3;c++)d[i+c]=clamp(d[i+c]*k)}
        blackPoint(d,w,h,60);
        for(let i=0;i<n;i+=4)saturate(d,i,1.5);
        sharpen(d,w,h,.3);break;
      }
      case'board-dark':{
        // Blackboard: chalk is brighter than the board around it → dark strokes on white paper.
        const L=lumArray(d,w,h),bg=backgroundMap(L,w,h,{pct:.35,cells:24}),chalk=new Float32Array(w*h);
        for(let j=0;j<w*h;j++)chalk[j]=Math.max(0,L[j]-bg[j]);
        const top=Math.max(20,percentile(new Uint8ClampedArray(chalk),.995));
        for(let i=0,j=0;i<n;i+=4,j++){const v=clamp(255-chalk[j]/top*235);d[i]=d[i+1]=d[i+2]=v}
        break;
      }
    }
  }

  function applyFilter(canvas,filter){
    if(!filter||filter==='original')return canvas;
    const x=ctx2d(canvas),img=x.getImageData(0,0,canvas.width,canvas.height);
    filterPixels(img.data,canvas.width,canvas.height,filter);
    x.putImageData(img,0,0);
    return canvas;
  }

  // Full edit: orientation → straighten/crop (or perspective) → filter. Returns a canvas.
  function renderEdited(src,edit,{maxSide=3200,crop=true}={}){
    const e={...defaultEdit(),...(edit||{})};
    const o=orientedSize(src.width,src.height,e.rot);
    // Work at no more than ~1.25x the output size to bound memory on 12 MP photos.
    const workScale=Math.min(1,(maxSide*1.25)/Math.max(o.w,o.h));
    const oriented=drawOriented(src,e.rot,e.flip,workScale),W=oriented.width,H=oriented.height,ratio=H/W;
    let out;
    if(!crop){
      out=oriented;
    }else if(e.mode==='quad'&&e.quad){
      const q=orderQuad(e.quad).map(([x,y])=>[x*W,y*W]);
      const dist=(p,r)=>Math.hypot(p[0]-r[0],p[1]-r[1]);
      let ow=Math.max(dist(q[0],q[1]),dist(q[3],q[2])),oh=Math.max(dist(q[0],q[3]),dist(q[1],q[2]));
      // Documents: a page that is almost A4 comes out exactly A4.
      if(e.snap==='a4')for(const r of[Math.SQRT2,1/Math.SQRT2])if(Math.abs(oh/ow-r)/r<.12)oh=ow*r;
      const s=Math.min(1,maxSide/Math.max(ow,oh));ow*=s;oh*=s;
      out=warpQuad(oriented,q,ow,oh);
    }else{
      const box=e.box||boxForAspect(ratio,e.aspect,e.angle);
      let ow=box.w*W,oh=box.h*W;const s=Math.min(1,maxSide/Math.max(ow,oh));
      out=makeCanvas(ow*s,oh*s);const x=ctx2d(out);
      x.imageSmoothingQuality='high';
      x.scale(out.width/(box.w*W),out.height/(box.h*W));
      x.translate(box.w*W/2,box.h*W/2);
      x.translate(-box.cx*W,-box.cy*W);
      x.rotate(e.angle*Math.PI/180);
      x.translate(-W/2,-H/2);
      x.drawImage(oriented,0,0);
    }
    return applyFilter(out===oriented?copy(out):out,e.filter);
  }
  function copy(c){const n=makeCanvas(c.width,c.height);ctx2d(n).drawImage(c,0,0);return n}

  function scaleTo(src,maxSide){
    const s=Math.min(1,maxSide/Math.max(src.width,src.height)),c=makeCanvas(src.width*s,src.height*s),x=ctx2d(c);
    x.imageSmoothingQuality='high';x.drawImage(src,0,0,c.width,c.height);return c;
  }

  async function toBlob(canvas,type='image/jpeg',quality=.9){
    if(canvas.convertToBlob)return canvas.convertToBlob({type,quality});
    return new Promise(r=>canvas.toBlob(r,type,quality));
  }

  // ID card: front and back (cropped canvases) on one white A4 page at true size.
  function composeIdPage(front,back,{pageW=1654,pageH=2339}={}){
    const page=makeCanvas(pageW,pageH),x=ctx2d(page);
    x.fillStyle='#fff';x.fillRect(0,0,pageW,pageH);x.imageSmoothingQuality='high';
    const mm=pageW/210,cw=85.6*mm,ch=54*mm,cx=(pageW-cw)/2;
    const place=(c,cy)=>{
      if(!c)return;
      // A card photographed upright is turned to lie flat like the other.
      x.save();x.translate(cx+cw/2,cy);
      if(c.width<c.height){x.rotate(-Math.PI/2);x.drawImage(c,-ch/2,-cw/2,ch,cw)}else x.drawImage(c,-cw/2,-ch/2,cw,ch);
      x.restore();
      x.strokeStyle='#d7d9e0';x.lineWidth=2;x.strokeRect(cx,cy-ch/2,cw,ch);
    };
    place(front,pageH*.3);place(back,pageH*.7);
    return page;
  }

  root.HoliooImage={makeCanvas,defaultEdit,isIdentity,orientedSize,drawOriented,boxToQuad,fullBox,aspectRatio,boxForAspect,orderQuad,squareToQuad,warpPixels,backgroundMap,filterPixels,renderEdited,applyFilter,scaleTo,toBlob,composeIdPage};
})(typeof self!=='undefined'?self:window);
