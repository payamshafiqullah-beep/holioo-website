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

  // Perspective warp (CPU, bilinear). Only used for quad mode; rect mode uses the GPU path.
  function warpQuad(srcCanvas,quadPx,outW,outH){
    const sw=srcCanvas.width,sh=srcCanvas.height,src=ctx2d(srcCanvas).getImageData(0,0,sw,sh).data;
    const out=makeCanvas(outW,outH),ox=ctx2d(out),img=ox.createImageData(out.width,out.height),d=img.data;
    const[a,b,c,dd,e,f,g,h]=squareToQuad(quadPx),W=out.width,H=out.height;
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
    ox.putImageData(img,0,0);
    return out;
  }

  // Smooth background estimate: shrink then enlarge (the canvas scaler acts as a wide blur).
  function background(canvas,factor=24){
    const small=makeCanvas(canvas.width/factor,canvas.height/factor),sx=ctx2d(small);
    sx.imageSmoothingQuality='high';sx.drawImage(canvas,0,0,small.width,small.height);
    const tiny=makeCanvas(small.width/2,small.height/2),tx=ctx2d(tiny);
    tx.drawImage(small,0,0,tiny.width,tiny.height);sx.clearRect(0,0,small.width,small.height);sx.drawImage(tiny,0,0,small.width,small.height);
    const big=makeCanvas(canvas.width,canvas.height),bx=ctx2d(big);
    bx.imageSmoothingQuality='high';bx.drawImage(small,0,0,big.width,big.height);
    return bx.getImageData(0,0,big.width,big.height).data;
  }

  const clamp=v=>v<0?0:v>255?255:v;

  function applyFilter(canvas,filter){
    if(!filter||filter==='original')return canvas;
    const x=ctx2d(canvas),img=x.getImageData(0,0,canvas.width,canvas.height),d=img.data,n=d.length;
    if(filter==='gray'){
      for(let i=0;i<n;i+=4){const y=.299*d[i]+.587*d[i+1]+.114*d[i+2];d[i]=d[i+1]=d[i+2]=y}
    }else if(filter==='contrast'){
      for(let i=0;i<n;i+=4){
        const y=.299*d[i]+.587*d[i+1]+.114*d[i+2];
        for(let k=0;k<3;k++){const s=y+(d[i+k]-y)*1.2;d[i+k]=clamp((s-128)*1.5+128)}
      }
    }else if(filter==='document'||filter==='whiteboard'){
      const bg=background(canvas),doc=filter==='document';
      const black=doc?70:35,range=255-black;
      for(let i=0;i<n;i+=4){
        if(doc){
          // Divide by the paper's local brightness: shadows and uneven light disappear, ink stays.
          const bl=Math.max(20,.299*bg[i]+.587*bg[i+1]+.114*bg[i+2]);
          const y=.299*d[i]+.587*d[i+1]+.114*d[i+2],v=clamp((Math.min(255,y/bl*245)-black)*255/range);
          for(let k=0;k<3;k++){const c=clamp((Math.min(255,d[i+k]/bl*245)-black)*255/range);d[i+k]=v+(c-v)*.25}
        }else{
          // Per channel, so coloured markers keep their colour while the board turns white.
          for(let k=0;k<3;k++)d[i+k]=clamp((Math.min(255,d[i+k]/Math.max(20,bg[i+k])*250)-black)*255/range);
          const y=.299*d[i]+.587*d[i+1]+.114*d[i+2];
          for(let k=0;k<3;k++)d[i+k]=clamp(y+(d[i+k]-y)*1.4);
        }
      }
      if(doc)sharpen(d,canvas.width,canvas.height,.55);
    }
    x.putImageData(img,0,0);
    return canvas;
  }

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

  root.HoliooImage={makeCanvas,defaultEdit,isIdentity,orientedSize,drawOriented,boxToQuad,fullBox,aspectRatio,boxForAspect,orderQuad,renderEdited,applyFilter,scaleTo,toBlob};
})(typeof self!=='undefined'?self:window);
