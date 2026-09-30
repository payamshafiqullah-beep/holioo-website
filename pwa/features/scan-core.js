'use strict';
// Scanner logic without DOM or OpenCV: geometry, tracking, auto-capture decisions, page layouts.
// Runs in the page, in workers/scanner-worker.js and in Node tests (tests/scan-core.test.mjs).
//
// Frame points are [x, y] normalised to the analysed frame: x/width, y/height, in 0..1.
// Photo-editor points ("width units", see image-pipeline.js) are [x/width, y/width].

(function(root){
  const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  const lerp=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];

  // Corners in reading order TL, TR, BR, BL, whatever the order given and however the page is turned.
  function orderQuad(pts){
    if(!pts||pts.length!==4)return null;
    const cx=pts.reduce((s,p)=>s+p[0],0)/4,cy=pts.reduce((s,p)=>s+p[1],0)/4;
    const byAngle=[...pts].sort((a,b)=>Math.atan2(a[1]-cy,a[0]-cx)-Math.atan2(b[1]-cy,b[0]-cx)); // clockwise on screen
    let start=0;
    for(let i=1;i<4;i++)if(byAngle[i][0]+byAngle[i][1]<byAngle[start][0]+byAngle[start][1])start=i;
    return[0,1,2,3].map(i=>byAngle[(start+i)%4].slice());
  }

  function area(q){let s=0;for(let i=0;i<4;i++){const a=q[i],b=q[(i+1)%4];s+=a[0]*b[1]-b[0]*a[1]}return Math.abs(s)/2}

  function isConvex(q){
    let sign=0;
    for(let i=0;i<4;i++){
      const a=q[i],b=q[(i+1)%4],c=q[(i+2)%4];
      const z=(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);
      if(Math.abs(z)<1e-12)return false;
      if(!sign)sign=Math.sign(z);else if(Math.sign(z)!==sign)return false;
    }
    return true;
  }

  // Interior angles in degrees.
  function angles(q){
    return q.map((p,i)=>{
      const a=q[(i+3)%4],b=q[(i+1)%4],v1=[a[0]-p[0],a[1]-p[1]],v2=[b[0]-p[0],b[1]-p[1]];
      const c=(v1[0]*v2[0]+v1[1]*v2[1])/(Math.hypot(...v1)*Math.hypot(...v2)||1);
      return Math.acos(Math.max(-1,Math.min(1,c)))*180/Math.PI;
    });
  }

  // A plausible page: convex, big enough, no needle-thin corner. `aspect` = frame height/width.
  function quadValid(q,{minArea=.1,aspect=1,minAngle=35}={}){
    if(!q||q.length!==4)return false;
    const sq=q.map(([x,y])=>[x,y*aspect]); // compare shapes in real proportions
    return isConvex(sq)&&area(sq)>=minArea*aspect&&angles(sq).every(a=>a>=minAngle&&a<=180-minAngle);
  }

  const maxCornerShift=(a,b)=>Math.max(...a.map((p,i)=>dist(p,b[i])));

  // Smooth, jitter-free quad that follows detections, plus "held still long enough" for auto-capture.
  // update(rawQuad|null, timeMs) → {quad, stable, stableFor, visible}
  function createTracker({alpha=.35,jump=.09,confirm=2,lose=4,stableMs=1000,stableTol=.015}={}){
    let quad=null,candidate=null,candidateHits=0,misses=0;
    const history=[];
    return{
      update(raw,t){
        raw=raw&&orderQuad(raw);
        if(!raw){
          if(++misses>=lose){quad=null;candidate=null;candidateHits=0;history.length=0}
          return this.state(t);
        }
        misses=0;
        if(!quad||maxCornerShift(raw,quad)>jump){
          // A new position must be seen a few times in a row before the frame jumps there.
          if(candidate&&maxCornerShift(raw,candidate)<=jump){candidateHits++;candidate=raw}else{candidate=raw;candidateHits=1}
          if(candidateHits>=confirm){quad=candidate.map(p=>p.slice());candidate=null;candidateHits=0;history.length=0}
        }else{
          quad=quad.map((p,i)=>lerp(p,raw[i],alpha));
          candidate=null;candidateHits=0;
        }
        if(quad){history.push({t,q:raw});while(history.length&&t-history[0].t>stableMs*1.6)history.shift()}
        return this.state(t);
      },
      state(t){
        let stableFor=0;
        if(quad&&history.length){
          const last=history[history.length-1].q;
          for(let i=history.length-1;i>=0;i--){if(maxCornerShift(history[i].q,last)>stableTol)break;stableFor=t-history[i].t}
        }
        return{quad:quad&&quad.map(p=>p.slice()),visible:!!quad,stableFor,stable:!!quad&&stableFor>=stableMs};
      },
      reset(){quad=null;candidate=null;candidateHits=0;misses=0;history.length=0}
    };
  }

  // Frame quality from the worker's measures. Thresholds are tuned for 512 px analysis frames.
  function judgeFrame({sharpness=0,brightness=128}={},mode='document'){
    if(brightness<55)return{ok:false,warn:'dark'};
    const minSharp=mode==='board'?35:60;
    if(sharpness<minSharp)return{ok:false,warn:'blur'};
    return{ok:true,warn:null};
  }

  // Auto-capture once the page is held still and sharp; never twice for the same page:
  // after a shot, the page must leave or move before the next one (turning a page does that).
  function createAutoCapture({cooldownMs=1500,moveTol=.06}={}){
    let lastAt=-1e9,lastQuad=null,armed=true;
    return{
      decide({quad,stable,quality,t,enabled}){
        if(!quad){armed=true;return false}
        if(!armed&&lastQuad&&maxCornerShift(quad,lastQuad)>moveTol)armed=true;
        if(!enabled||!armed||!stable||!quality?.ok||t-lastAt<cooldownMs)return false;
        lastAt=t;lastQuad=quad.map(p=>p.slice());armed=false;return true;
      },
      reset(){lastAt=-1e9;lastQuad=null;armed=true}
    };
  }

  // Frame point → photo-editor point (width units) for a frame of size w×h.
  const toEditQuad=(q,w,h)=>orderQuad(q).map(([x,y])=>[x,y*h/w]);
  const fromEditQuad=(q,w,h)=>q.map(([x,y])=>[x,y*w/h]);
  const fullQuad=()=>[[0,0],[1,0],[1,1],[0,1]];

  // Two-page spread → left and right pages, cut along the fold at `t` (0..1 across the spread).
  function splitSpread(q,t=.5){
    const[tl,tr,br,bl]=orderQuad(q),top=lerp(tl,tr,t),bottom=lerp(bl,br,t);
    return[[tl,top,bottom,bl],[top,tr,br,bottom]];
  }

  // The fold of a book: a dark valley near the middle with the page's blank inner margins on both
  // sides (text columns are dark too, but they have text, not white margins, next to them).
  // `lum(x,y)` gives the brightness at frame point x,y (0..1). Returns t (0..1 across the spread).
  function findGutter(q,lum,{from=.3,to=.7,steps=81,samples=60,side=.07}={}){
    const[tl,tr,br,bl]=orderQuad(q),profile=[];
    for(let i=0;i<steps;i++){
      const t=from+(to-from)*i/(steps-1),a=lerp(tl,tr,t),b=lerp(bl,br,t);let s=0;
      for(let k=1;k<samples;k++){const p=lerp(a,b,k/samples);s+=lum(p[0],p[1])}
      profile.push(s/(samples-1));
    }
    const dt=(to-from)/(steps-1),w=Math.max(1,Math.round(side/dt));
    let best=.5,bestScore=-Infinity;
    for(let i=0;i<steps;i++){
      let left=-Infinity,right=-Infinity;
      for(let k=1;k<=w;k++){if(i-k>=0)left=Math.max(left,profile[i-k]);if(i+k<steps)right=Math.max(right,profile[i+k])}
      if(!isFinite(left)||!isFinite(right))continue;
      const t=from+i*dt,depth=Math.min(left,right)-profile[i];
      const score=depth-Math.abs(t-.5)*20; // prefer the centre on near-ties
      if(score>bestScore){bestScore=score;best=t}
    }
    // No visible fold (flat spread, photocopy): cut in the middle.
    return bestScore<8?.5:best;
  }

  // Photo-editor output ratio (height/width) of a quad, snapped to A4 when it is close.
  function pageRatio(q,{snap=null,tol=.12}={}){
    const[tl,tr,br,bl]=q,w=Math.max(dist(tl,tr),dist(bl,br)),h=Math.max(dist(tl,bl),dist(tr,br));
    let r=h/w;
    if(snap==='a4'){for(const a of[Math.SQRT2,1/Math.SQRT2])if(Math.abs(r-a)/a<tol)r=a}
    return r;
  }

  // ID card front and back on one A4 page at true size (ID-1: 85.6 × 54 mm), one above the other.
  function idCardLayout(pageW,pageH){
    const mm=pageW/210,cw=85.6*mm,ch=54*mm,x=(pageW-cw)/2;
    return{front:{x,y:pageH*.3-ch/2,w:cw,h:ch},back:{x,y:pageH*.7-ch/2,w:cw,h:ch}};
  }

  // "Hold the phone parallel": documents on a table → phone flat; boards on a wall → phone upright.
  // beta/gamma from DeviceOrientationEvent (degrees). Returns a hint key or null.
  function tiltHint(beta,gamma,mode){
    if(beta==null||gamma==null)return null;
    const tilt=mode==='board'?Math.max(Math.abs(Math.abs(beta)-90),Math.abs(gamma)):Math.max(Math.abs(beta),Math.abs(gamma));
    // Between flat and upright is ambiguous (a page held in front of you): no hint.
    if(mode!=='board'&&Math.abs(beta)>55)return null;
    return tilt>22?'tilt':null;
  }

  // Frame point → screen point for a <video> shown with object-fit: cover and a CSS zoom around
  // its centre. `crop` = the part of the video frame that was analysed {x,y,w,h} in video pixels.
  function mapToScreen(q,{videoW,videoH,elW,elH,zoom=1,crop=null}){
    const c=crop||{x:0,y:0,w:videoW,h:videoH};
    const s=Math.max(elW/videoW,elH/videoH),ox=(elW-videoW*s)/2,oy=(elH-videoH*s)/2;
    return q.map(([x,y])=>{
      const vx=c.x+x*c.w,vy=c.y+y*c.h;
      const sx=ox+vx*s,sy=oy+vy*s;
      return[elW/2+(sx-elW/2)*zoom,elH/2+(sy-elH/2)*zoom];
    });
  }

  root.ScanCore={orderQuad,area,isConvex,angles,quadValid,maxCornerShift,createTracker,judgeFrame,createAutoCapture,toEditQuad,fromEditQuad,fullQuad,splitSpread,findGutter,pageRatio,idCardLayout,tiltHint,mapToScreen};
})(typeof self!=='undefined'?self:typeof window!=='undefined'?window:globalThis);
if(typeof module!=='undefined')module.exports=(typeof self!=='undefined'?self:globalThis).ScanCore;
