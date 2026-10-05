'use strict';
// Session notebook, geometry: ruler snapping and the eraser's hit tests.
function snapRulerPoints(points){
  const start=points[0],end=points.at(-1);
  const dx=end[0]-start[0],dy=end[1]-start[1];
  const len=Math.hypot(dx,dy);
  if(!len)return points;
  let angle=Math.atan2(dy,dx),deg=angle*180/Math.PI;
  const snaps=[-180,-135,-90,-45,0,45,90,135,180];
  let best=deg,delta=Infinity;
  for(const s of snaps){
    const d=Math.abs((((deg-s)+180)%360)-180);
    if(d<delta){delta=d;best=s}
  }
  if(delta<=7)angle=best*Math.PI/180;
  const next=[Math.max(0,Math.min(1,start[0]+Math.cos(angle)*len)),Math.max(0,Math.min(1,start[1]+Math.sin(angle)*len)),end[2]||.5];
  return[start,next];
}

function eraseNotebookStrokes(doc,blockId,points,tolerance=.025){
  const deleted=[];
  const active=visibleInkStrokes(doc).filter(s=>s.blockId===blockId);
  for(const stroke of active){
    if(strokeTouchesPath(stroke.points,points,tolerance)){
      stroke.deleted=true;
      stroke.updatedAt=Date.now();
      deleted.push(stroke.id);
    }
  }
  return deleted;
}

function strokeTouchesPath(a,b,tolerance){
  for(let i=1;i<a.length;i++){
    for(let j=1;j<b.length;j++){
      if(segmentDistance(a[i-1],a[i],b[j-1],b[j])<=tolerance)return true;
    }
  }
  for(const p of a)for(const q of b)if(Math.hypot(p[0]-q[0],p[1]-q[1])<=tolerance)return true;
  return false;
}

function pointSegmentDistance(p,a,b){
  const vx=b[0]-a[0],vy=b[1]-a[1],wx=p[0]-a[0],wy=p[1]-a[1];
  const len=vx*vx+vy*vy;
  const t=len?Math.max(0,Math.min(1,(wx*vx+wy*vy)/len)):0;
  return Math.hypot(p[0]-(a[0]+vx*t),p[1]-(a[1]+vy*t));
}

function ccw(a,b,c){return(c[1]-a[1])*(b[0]-a[0])>(b[1]-a[1])*(c[0]-a[0])}
function segmentsIntersect(a,b,c,d){return ccw(a,c,d)!==ccw(b,c,d)&&ccw(a,b,c)!==ccw(a,b,d)}
function segmentDistance(a,b,c,d){
  if(segmentsIntersect(a,b,c,d))return 0;
  return Math.min(pointSegmentDistance(a,c,d),pointSegmentDistance(b,c,d),pointSegmentDistance(c,a,b),pointSegmentDistance(d,a,b));
}
