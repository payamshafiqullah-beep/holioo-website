// Synthetic test photos for the scanner, one per mode: a sheet on a desk, a whiteboard and a
// blackboard seen from a seat, an open book, an ID card, a QR code. Pure JS (no canvas), so the
// same images work in Node tests. Images are {data: Uint8ClampedArray RGBA, width, height}.

export function makeImage(w,h,[r,g,b]){
  const data=new Uint8ClampedArray(w*h*4);
  for(let i=0;i<w*h;i++){data[i*4]=r;data[i*4+1]=g;data[i*4+2]=b;data[i*4+3]=255}
  return{data,width:w,height:h};
}

// Filled polygon (points in pixels), even-odd scanline.
export function fillPoly(img,pts,color,alpha=1){
  const{width:W,height:H,data}=img;
  const ys=pts.map(p=>p[1]),y0=Math.max(0,Math.floor(Math.min(...ys))),y1=Math.min(H-1,Math.ceil(Math.max(...ys)));
  for(let y=y0;y<=y1;y++){
    const xs=[];
    for(let i=0;i<pts.length;i++){
      const[a,b]=[pts[i],pts[(i+1)%pts.length]];
      if((a[1]<=y+.5&&b[1]>y+.5)||(b[1]<=y+.5&&a[1]>y+.5))xs.push(a[0]+(y+.5-a[1])/(b[1]-a[1])*(b[0]-a[0]));
    }
    xs.sort((a,b)=>a-b);
    for(let k=0;k+1<xs.length;k+=2)for(let x=Math.max(0,Math.ceil(xs[k]-.5));x<=Math.min(W-1,Math.floor(xs[k+1]-.5));x++){
      const i=(y*W+x)*4;for(let c=0;c<3;c++)data[i+c]=data[i+c]*(1-alpha)+color[c]*alpha;
    }
  }
}

// Point (u,v in 0..1) inside a quad TL,TR,BR,BL (bilinear).
export const inQuad=(q,u,v)=>{const top=[q[0][0]+(q[1][0]-q[0][0])*u,q[0][1]+(q[1][1]-q[0][1])*u],bot=[q[3][0]+(q[2][0]-q[3][0])*u,q[3][1]+(q[2][1]-q[3][1])*u];return[top[0]+(bot[0]-top[0])*v,top[1]+(bot[1]-top[1])*v]};

// "Text": short dark strokes laid out in lines inside a quad region (u0..u1, v0..v1).
export function textLines(img,q,color,{u0=.1,u1=.9,v0=.1,v1=.9,lines=10,seed=1}={}){
  let s=seed;const rnd=()=>(s=(s*16807)%2147483647)/2147483647;
  for(let l=0;l<lines;l++){
    const v=v0+(v1-v0)*(l+.5)/lines,th=(v1-v0)/lines*.35;let u=u0;
    while(u<u1){
      const w=.03+rnd()*.08;if(u+w>u1)break;
      fillPoly(img,[inQuad(q,u,v),inQuad(q,u+w,v),inQuad(q,u+w,v+th),inQuad(q,u,v+th)],color);
      u+=w+.02;
    }
  }
}

export function noise(img,amount=6,seed=7){
  let s=seed;const rnd=()=>(s=(s*16807)%2147483647)/2147483647;
  for(let i=0;i<img.data.length;i+=4){const n=(rnd()-.5)*2*amount;for(let c=0;c<3;c++)img.data[i+c]+=n}
}

// Soft light variation: a shadow falling across the image (factor at left → at right).
export function shade(img,from=1,to=.6){
  const{width:W,height:H,data}=img;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const f=from+(to-from)*(x/W),i=(y*W+x)*4;for(let c=0;c<3;c++)data[i+c]*=f}
}

export function glare(img,cx,cy,r,strength=.85){
  const{width:W,height:H,data}=img;
  for(let y=Math.max(0,cy-r);y<Math.min(H,cy+r);y++)for(let x=Math.max(0,cx-r);x<Math.min(W,cx+r);x++){
    const d=Math.hypot(x-cx,y-cy)/r;if(d>=1)continue;const a=strength*(1-d*d),i=(y*W+x)*4;
    for(let c=0;c<3;c++)data[i+c]=data[i+c]*(1-a)+255*a;
  }
}

// Box blur (to simulate a shaky photo).
export function blur(img,r=3){
  const{width:W,height:H,data}=img,src=new Float32Array(data);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)for(let c=0;c<3;c++){
    let s=0,n=0;for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=W||yy>=H)continue;s+=src[(yy*W+xx)*4+c];n++}
    data[(y*W+x)*4+c]=s/n;
  }
}

const W=512,H=384;
const norm=q=>q.map(([x,y])=>[x/W,y/H]);

export function documentScene(){
  const img=makeImage(W,H,[92,70,58]);noise(img,10);
  const q=[[120,50],[400,72],[430,340],[95,318]];
  fillPoly(img,q,[244,241,232]);textLines(img,q,[40,40,55],{lines:12});
  shade(img,1,.75);noise(img,4,3);
  return{img,quad:norm(q)};
}

// Whiteboard seen from a seat on the left, below: a trapezoid, aluminium frame, marker, glare.
export function whiteboardScene(){
  const img=makeImage(W,H,[205,203,196]);
  const q=[[70,70],[470,40],[480,290],[60,250]];
  const frame=q.map(([x,y],i)=>[x+(i===0||i===3?-6:6),y+(i<2?-6:6)]);
  fillPoly(img,frame,[150,152,158]);fillPoly(img,q,[236,238,240]);
  textLines(img,q,[30,60,160],{lines:5,v1:.55,seed:3});textLines(img,q,[190,40,40],{lines:3,v0:.6,seed:5});
  glare(img,330,120,70,.8);shade(img,1.02,.85);noise(img,5,11);
  return{img,quad:norm(q)};
}

export function blackboardScene(){
  const img=makeImage(W,H,[196,186,164]);
  const q=[[60,60],[455,48],[470,300],[50,285]];
  fillPoly(img,q,[38,62,52]);textLines(img,q,[225,228,220],{lines:6,seed:9});noise(img,6,13);
  return{img,quad:norm(q)};
}

// Open book: two pages with a darker fold at 52% of the spread.
export function bookScene(){
  const img=makeImage(W,H,[70,58,50]);noise(img,8,17);
  const q=[[40,60],[475,52],[488,335],[30,345]];
  fillPoly(img,q,[240,236,226]);
  const gut=.52;
  for(let k=-6;k<=6;k++){const u=gut+k*.004,a=1-Math.abs(k)/7;fillPoly(img,[inQuad(q,u,0),inQuad(q,u+.004,0),inQuad(q,u+.004,1),inQuad(q,u,1)],[150,145,135],a*.8)}
  textLines(img,q,[45,45,50],{u0:.06,u1:.46,lines:14,seed:21});textLines(img,q,[45,45,50],{u0:.58,u1:.95,lines:14,seed:23});
  return{img,quad:norm(q),gutter:gut};
}

// ID card (85.6 × 54 mm) on a dark table, small in the frame.
export function idCardScene(){
  const img=makeImage(W,H,[45,42,48]);noise(img,6,29);
  const cx=256,cy=190,w=210,h=w/1.585,a=.12,c=Math.cos(a),s=Math.sin(a);
  const q=[[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]].map(([x,y])=>[cx+x*c-y*s,cy+x*s+y*c]);
  fillPoly(img,q,[182,210,232]);fillPoly(img,[inQuad(q,.06,.2),inQuad(q,.32,.2),inQuad(q,.32,.8),inQuad(q,.06,.8)],[120,130,150]);
  textLines(img,q,[30,40,60],{u0:.4,u1:.94,v0:.25,v1:.85,lines:5,seed:31});
  return{img,quad:norm(q)};
}

// QR code from a module matrix (0/1 rows), drawn flat with a quiet zone.
export function qrScene(matrix,scale=6){
  const n=matrix.length,size=(n+8)*scale,img=makeImage(size,size,[255,255,255]);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(matrix[y][x]){const px=(x+4)*scale,py=(y+4)*scale;fillPoly(img,[[px,py],[px+scale,py],[px+scale,py+scale],[px,py+scale]],[0,0,0])}
  return{img};
}

// ---------- hard scenes: what a phone really sees ----------

// Ellipse (pixels), for hands, pens, lamps.
export function fillEllipse(img,cx,cy,rx,ry,color,alpha=1,angle=0){
  const c=Math.cos(angle),s=Math.sin(angle),{width:W,height:H,data}=img,r=Math.max(rx,ry)+2;
  for(let y=Math.max(0,Math.floor(cy-r));y<Math.min(H,Math.ceil(cy+r));y++)for(let x=Math.max(0,Math.floor(cx-r));x<Math.min(W,Math.ceil(cx+r));x++){
    const dx=x-cx,dy=y-cy,u=(dx*c+dy*s)/rx,v=(-dx*s+dy*c)/ry;
    if(u*u+v*v>1)continue;
    const i=(y*W+x)*4;for(let k=0;k<3;k++)data[i+k]=data[i+k]*(1-alpha)+color[k]*alpha;
  }
}

// Light paper on a light table: only ~35 grey levels between them, soft shadow, sensor noise.
export function lowContrastScene(){
  const img=makeImage(W,H,[206,199,186]);noise(img,5,41);
  const q=[[110,58],[410,70],[438,334],[88,322]];
  fillPoly(img,q,[240,237,230]);textLines(img,q,[70,70,86],{lines:11,seed:5});
  shade(img,1,.82);noise(img,4,43);
  return{img,quad:norm(q)};
}

// A shadow (phone, hand, lamp) falls across half of the page and the desk.
export function shadowScene(){
  const img=makeImage(W,H,[120,92,70]);noise(img,9,51);
  const q=[[96,44],[420,60],[446,338],[78,322]];
  fillPoly(img,q,[246,243,236]);textLines(img,q,[38,38,52],{lines:12,seed:7});
  const{width:w,data}=img;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const f=x<190?1:x>300?.42:1-(x-190)/110*.58,i=(y*w+x)*4;for(let c=0;c<3;c++)data[i+c]*=f}
  noise(img,4,53);
  return{img,quad:norm(q)};
}

// A hand holds the page: a thumb over one corner and fingers over the left edge.
export function handScene(){
  const img=makeImage(W,H,[84,96,92]);noise(img,8,61);
  const q=[[118,46],[404,62],[430,330],[96,314]];
  fillPoly(img,q,[242,240,232]);textLines(img,q,[40,40,56],{lines:11,seed:9});
  const skin=[205,150,120];
  fillEllipse(img,111,308,30,22,skin,1,-.5);   // thumb on the bottom-left corner
  fillEllipse(img,100,170,17,32,skin,1,.1);     // fingers over the left edge
  noise(img,4,63);
  return{img,quad:norm(q)};
}

// Page next to a big dark laptop, a pen and a table edge crossing the picture.
export function clutterScene(){
  const img=makeImage(W,H,[150,118,86]);noise(img,8,71);
  fillPoly(img,[[0,300],[W,262],[W,H],[0,H]],[104,78,56]);          // table edge
  fillPoly(img,[[300,10],[505,28],[498,150],[296,132]],[34,36,42]);   // laptop
  const q=[[44,90],[300,104],[318,330],[30,318]];
  fillPoly(img,q,[244,241,234]);textLines(img,q,[42,42,58],{lines:10,seed:11});
  fillEllipse(img,360,230,70,5,[30,60,150],1,.3);                    // pen
  noise(img,4,73);
  return{img,quad:norm(q)};
}

// Dim room: everything dark and noisy.
export function dimScene(){
  const img=makeImage(W,H,[40,32,28]);noise(img,10,81);
  const q=[[120,56],[402,66],[428,332],[92,320]];
  fillPoly(img,q,[132,128,118]);textLines(img,q,[28,28,36],{lines:11,seed:13});
  noise(img,9,83);
  return{img,quad:norm(q)};
}

// Strongly turned and in perspective, ~35°.
export function turnedScene(){
  const img=makeImage(W,H,[70,86,100]);noise(img,8,91);
  const q=[[210,28],[470,150],[330,350],[40,230]];
  fillPoly(img,q,[238,236,228]);textLines(img,q,[40,40,56],{lines:12,seed:15});
  noise(img,4,93);
  return{img,quad:norm(q)};
}

// Page far away: ~20 % of the frame.
export function farScene(){
  const img=makeImage(W,H,[96,82,70]);noise(img,8,101);
  const q=[[190,130],[320,138],[330,262],[182,254]];
  fillPoly(img,q,[240,238,230]);textLines(img,q,[40,40,56],{lines:8,seed:17});
  noise(img,4,103);
  return{img,quad:norm(q)};
}

// Page larger than the frame: two corners are outside the picture.
export function cutoffScene(){
  const img=makeImage(W,H,[92,76,66]);noise(img,8,111);
  const q=[[70,40],[470,52],[560,430],[10,440]];
  fillPoly(img,q,[242,239,230]);textLines(img,q,[40,40,56],{lines:14,seed:19});
  noise(img,4,113);
  return{img,quad:norm(q),cutoff:true};
}

// Wooden desk with strong grain: lots of competing edges around the page.
export function woodScene(){
  const img=makeImage(W,H,[150,108,70]);
  let s=5;const rnd=()=>(s=(s*16807)%2147483647)/2147483647;
  const{data}=img;
  const phase=Array.from({length:40},()=>rnd()*6.28);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const g=Math.sin(y*.55+phase[Math.floor(x/13)%40]+Math.sin(x*.03)*2)*22+Math.sin(y*.17+x*.01)*14;
    const i=(y*W+x)*4;data[i]+=g;data[i+1]+=g*.8;data[i+2]+=g*.6;
  }
  noise(img,6,121);
  const q=[[112,60],[408,74],[436,336],[90,322]];
  fillPoly(img,q,[238,234,224]);textLines(img,q,[44,44,60],{lines:11,seed:21});
  noise(img,4,123);
  return{img,quad:norm(q)};
}

// Window reflection washing out part of the page and its edge.
export function glareScene(){
  const img=makeImage(W,H,[88,74,64]);noise(img,8,131);
  const q=[[100,52],[414,66],[440,330],[80,316]];
  fillPoly(img,q,[236,232,222]);textLines(img,q,[44,44,60],{lines:11,seed:23});
  glare(img,380,120,95,.95);
  noise(img,4,133);
  return{img,quad:norm(q)};
}

// A form with a thick dark printed frame 6 % inside the paper edge.
export function framedScene(){
  const img=makeImage(W,H,[96,84,72]);noise(img,8,141);
  const q=[[90,48],[420,60],[446,336],[70,322]];
  fillPoly(img,q,[244,241,232]);
  const inner=(a)=>[inQuad(q,a,a),inQuad(q,1-a,a),inQuad(q,1-a,1-a),inQuad(q,a,1-a)];
  fillPoly(img,inner(.06),[30,30,40]);fillPoly(img,inner(.075),[244,241,232]);
  textLines(img,q,[44,44,60],{u0:.12,u1:.88,v0:.12,v1:.88,lines:10,seed:25});
  noise(img,4,143);
  return{img,quad:norm(q)};
}

// White paper on a white-ish table: only ~14 grey levels between them (hard case).
export function whiteOnWhiteScene(){
  const img=makeImage(W,H,[224,224,219]);noise(img,5,151);
  const q=[[112,56],[408,68],[436,334],[90,320]];
  fillPoly(img,q,[238,238,233]);textLines(img,q,[90,90,104],{lines:11,seed:27});
  shade(img,1,.9);noise(img,3,153);
  return{img,quad:norm(q)};
}

// Page on a larger dark desk mat, on a light desk: the mat is the biggest rectangle, the page is what to scan.
export function matScene(){
  const img=makeImage(W,H,[196,184,160]);noise(img,6,161);
  fillPoly(img,[[14,18],[498,26],[502,368],[10,360]],[52,58,70]);
  const q=[[120,70],[390,80],[412,310],[98,298]];
  fillPoly(img,q,[244,242,234]);textLines(img,q,[40,40,56],{lines:10,seed:29});
  noise(img,4,163);
  return{img,quad:norm(q),pageOnMat:true};
}
