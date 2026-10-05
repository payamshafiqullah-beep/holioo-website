'use strict';
// Scanner logic without DOM or OpenCV: geometry, tracking, auto-capture decisions, page layouts.
// Runs in the page, in features/scanner/scanner-worker.js and in Node tests (tests/scan-core.test.mjs).
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

  // How sure a detection is, 0..1 (the camera says so when it is under 80 %): real edges on every side, a
  // clear step in brightness across them, an outline big enough to be the board, a plausible shape.
  //   weak = support (0..1) of the weakest side that is inside the picture; through = sides whose edge goes on
  //   past the corners (the outline may have stopped on a shadow); aspect = frame height/width.
  function confidence({support=0,contrast=0,coverage=0,minArea=.1,quad=null,aspect=1,weak=1,through=0,cutoff=false,glare=false}={}){
    const edge=Math.min(1,support/.85),step=Math.min(1,Math.abs(contrast)/30),size=Math.min(1,coverage/Math.max(1e-6,minArea));
    let shape=1;
    if(quad)shape=1-Math.min(1,Math.max(0,Math.max(...angles(quad.map(([x,y])=>[x,y*aspect])).map(a=>Math.abs(a-90)))-30)/40);
    let c=(.5*edge+.2*step+.15*size+.15*shape)*(.6+.4*Math.min(1,weak/.4));
    c*=1-.08*through;
    if(cutoff)c*=.85;
    if(glare)c*=.93;
    return Math.max(0,Math.min(1,c));
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
  // `ok` gates the auto-capture; `warn` is the hint shown to the person (a reflection is only a hint).
  function judgeFrame({sharpness=0,brightness=128,far=false,cutoff=false,glare=false,support=1,confidence=null}={},mode='document'){
    if(brightness<55)return{ok:false,warn:'dark'};
    const minSharp=mode==='board'?35:60;
    if(sharpness<minSharp)return{ok:false,warn:'blur'};
    if(cutoff)return{ok:false,warn:'cutoff'};
    if(far)return{ok:false,warn:'far'};
    // A board outline the detector is not sure of is shown, but never shot by itself (the shutter works).
    if(mode==='board'&&confidence!=null&&confidence<.6)return{ok:false,warn:'lowconf'};
    if(support<.3)return{ok:false,warn:null}; // outline not really on edges: never shoot by itself
    if(glare)return{ok:true,warn:'glare'};
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

  // Screen point → frame point: the inverse of mapToScreen (dragging a corner on the preview).
  function mapFromScreen([x,y],{videoW,videoH,elW,elH,zoom=1,crop=null}){
    const c=crop||{x:0,y:0,w:videoW,h:videoH};
    const s=Math.max(elW/videoW,elH/videoH),ox=(elW-videoW*s)/2,oy=(elH-videoH*s)/2;
    const sx=elW/2+(x-elW/2)/zoom,sy=elH/2+(y-elH/2)/zoom;
    return[((sx-ox)/s-c.x)/c.w,((sy-oy)/s-c.y)/c.h];
  }

  // Quad pulled toward its centre by a fraction of its size.
  function insetQuad(q,k){const o=orderQuad(q),cx=o.reduce((s,p)=>s+p[0],0)/4,cy=o.reduce((s,p)=>s+p[1],0)/4;return o.map(([x,y])=>[x+(cx-x)*k*2,y+(cy-y)*k*2])}

  // The part of the preview the controls leave free (screen px): below the top bar, above the shutter; in a
  // landscape phone, left of the control column. Same rule as the CSS.
  function freeBox(w,h){
    const column=w>h&&h<=520;
    return column?{x0:16,x1:w-224,y0:56,y1:h-16}:{x0:w*.07,x1:w*.93,y0:96,y1:h-250};
  }

  // A point kept inside `box`, and out of every rectangle in `avoid` (buttons): pushed out through the nearest
  // edge that stays inside the box. All in screen px.
  function placePoint([x,y],{box,avoid=[]}){
    const cl=(v,a,b)=>Math.min(Math.max(v,a),Math.max(a,b));
    x=cl(x,box.x0,box.x1);y=cl(y,box.y0,box.y1);
    for(const r of avoid){
      if(!(x>r.x0&&x<r.x1&&y>r.y0&&y<r.y1))continue;
      const moves=[[x-r.x0,[r.x0,y]],[r.x1-x,[r.x1,y]],[y-r.y0,[x,r.y0]],[r.y1-y,[x,r.y1]]]
        .map(([d,p])=>[d,[cl(p[0],box.x0,box.x1),cl(p[1],box.y0,box.y1)]])
        .filter(([,p])=>!(p[0]>r.x0&&p[0]<r.x1&&p[1]>r.y0&&p[1]<r.y1))
        .sort((a,b)=>a[0]-b[0]);
      if(moves.length){[x,y]=moves[0][1]}
    }
    return[x,y];
  }

  // A quad (screen px) brought inside the limits, or null when that leaves nothing usable: not convex, a side
  // shorter than `minSide`, or a corner that had to move more than `maxShift` px (an outline mostly off screen
  // squeezed into the edge is no help: the caller then starts from the framing guide).
  function placeQuad(q,limits,{minSide=40,maxShift=Infinity}={}){
    const p=q.map(pt=>placePoint(pt,limits));
    if(p.some((pt,i)=>dist(pt,q[i])>maxShift)||!isConvex(p))return null;
    for(let i=0;i<4;i++)if(dist(p[i],p[(i+1)%4])<minSide)return null;
    return p;
  }

  // Framing guide shown while no page is found: a rectangle (screen px, TL TR BR BL) with the shape
  // the mode expects, centred in the part of the preview the controls leave free (below the top bar and
  // above the shutter; in a landscape phone, left of the control column — same rule as the CSS).
  function guideQuad(mode,w,h){
    const land=w>h,ar={document:land?Math.SQRT2:1/Math.SQRT2,board:1.6,book:1.4,id:85.6/54,qr:1}[mode]||1/Math.SQRT2;
    const box=freeBox(w,h);
    const k=mode==='qr'?.72:1,aw=Math.max(80,box.x1-box.x0)*k,ah=Math.max(80,box.y1-box.y0)*k;
    let gw=aw,gh=gw/ar;if(gh>ah){gh=ah;gw=gh*ar}
    const cx=(box.x0+box.x1)/2,cy=(box.y0+box.y1)/2;
    return[[cx-gw/2,cy-gh/2],[cx+gw/2,cy-gh/2],[cx+gw/2,cy+gh/2],[cx-gw/2,cy+gh/2]];
  }

  // SVG path of the four corner brackets of a quad ("L" shapes along its two sides at every corner).
  function bracketPath(q,{min=14,max=36,frac=.2}={}){
    const f=n=>n.toFixed(1);let d='';
    for(let i=0;i<4;i++){
      const c=q[i],a=q[(i+3)%4],b=q[(i+1)%4],la=dist(c,a),lb=dist(c,b);
      const len=Math.max(min,Math.min(max,Math.min(la,lb)*frac)),ka=Math.min(1,len/(la||1)),kb=Math.min(1,len/(lb||1));
      d+=`M${f(c[0]+(a[0]-c[0])*ka)} ${f(c[1]+(a[1]-c[1])*ka)}L${f(c[0])} ${f(c[1])}L${f(c[0]+(b[0]-c[0])*kb)} ${f(c[1]+(b[1]-c[1])*kb)}`;
    }
    return d;
  }

  // Quad corners as a closed SVG path.
  const polyPath=q=>`M${q.map(p=>`${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('L')}Z`;

  root.ScanCore={guideQuad,bracketPath,polyPath,insetQuad,orderQuad,area,isConvex,angles,quadValid,confidence,maxCornerShift,createTracker,judgeFrame,createAutoCapture,toEditQuad,fromEditQuad,fullQuad,splitSpread,findGutter,pageRatio,mapFromScreen,freeBox,placePoint,placeQuad,idCardLayout,tiltHint,mapToScreen};
})(typeof self!=='undefined'?self:typeof window!=='undefined'?window:globalThis);
if(typeof module!=='undefined')module.exports=(typeof self!=='undefined'?self:globalThis).ScanCore;
