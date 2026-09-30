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
