'use strict';
// Sub-pixel page-edge refinement in plain JS (no OpenCV). Used by workers/scanner-worker.js (live
// frames and full-size stills) and by the Node tests (tests/scan-refine.test.mjs).
//
//   ScanRefine.refineQuad(gray, W, H, quad, opts) → {quad, ok, support, contrast, sides, shift}
//
// A detected outline lies only roughly on the page edge (a few pixels off, corners rounded by the
// contour). For each side we look for the real edge across its normal at ~48 places, fit one straight
// line through the best of them (RANSAC: a thumb, a shadow or a pen over part of an edge is ignored)
// and take every corner as the intersection of two neighbouring lines. Result: straight edges, exact
// corners — even a corner hidden under a finger is recovered from the two lines that meet there.
//
// Quad points are normalised to the image (x/width, y/height), ordered TL, TR, BR, BL. Pixel i covers
// [i, i+1) in these coordinates (its centre is i+.5), the same convention the whole scanner uses.

(function(root){
  const abs=Math.abs,GAPS=[.25,.35,.5,.7,.9];
  const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  const median=a=>{if(!a.length)return 0;const s=Float64Array.from(a).sort(),n=s.length;return n%2?s[(n-1)>>1]:(s[n/2-1]+s[n/2])/2};

  // Luminance from RGBA pixels (Rec. 601).
  function toGray(rgba,w,h){
    const g=new Uint8ClampedArray(w*h);
    for(let i=0,j=0;i<g.length;i++,j+=4)g[i]=(rgba[j]*77+rgba[j+1]*150+rgba[j+2]*29)>>8;
    return g;
  }

  // Bilinear sampler on continuous coordinates; NaN outside the image.
  function sampler(g,W,H){
    const mx=W-1,my=H-1;
    return(u,v)=>{
      const x=u-.5,y=v-.5;
      if(!(x>=0&&y>=0&&x<=mx&&y<=my))return NaN;
      const x0=x|0,y0=y|0,x1=x0<mx?x0+1:x0,y1=y0<my?y0+1:y0,fx=x-x0,fy=y-y0,r0=y0*W,r1=y1*W;
      const a=g[r0+x0],b=g[r0+x1],c=g[r1+x0],d=g[r1+x1];
      return a+(b-a)*fx+(c-a)*fy+(a-b-c+d)*fx*fy;
    };
  }

  // Straight line s = a + b·t through points {t,s,w}, robust to outliers: RANSAC over pairs of points
  // at several distances along the side (the points come in order), then weighted least squares on
  // the inliers. ~110 pairs instead of all 1100: an edge is long, any good pair will do.
  function fitOffsetLine(pts,tau,maxSlope){
    const n=pts.length,T=new Float64Array(n),Y=new Float64Array(n);
    for(let k=0;k<n;k++){T[k]=pts[k].t;Y[k]=pts[k].s}
    let best=null;
    for(const g of GAPS){
      const gap=Math.max(1,Math.round(n*g));
      for(let i=0;i+gap<n;i++){
        const j=i+gap,dt=T[j]-T[i];if(dt<.2)continue;
        const b=(Y[j]-Y[i])/dt;if(abs(b)>maxSlope)continue;
        const a=Y[i]-b*T[i];
        let score=0;
        for(let k=0;k<n;k++){const r=abs(Y[k]-a-b*T[k]);if(r<=tau)score+=1-r/tau*.5}
        if(!best||score>best.score)best={a,b,score};
      }
    }
    if(!best)return null;
    let{a,b}=best,inl=[];
    for(let it=0;it<3;it++){
      inl=[];let sw=0,st=0,ss=0,stt=0,sts=0;
      for(let k=0;k<n;k++){
        if(abs(Y[k]-a-b*T[k])>tau)continue;
        const w=pts[k].w;inl.push(k);sw+=w;st+=w*T[k];ss+=w*Y[k];stt+=w*T[k]*T[k];sts+=w*T[k]*Y[k];
      }
      if(inl.length<2)return null;
      const den=sw*stt-st*st;if(abs(den)<1e-9)break;
      b=(sw*sts-st*ss)/den;a=(ss-b*st)/sw;
    }
    return{a,b,inliers:inl};
  }

  // Intersection of the lines (p1, direction d1) and (p2, direction d2).
  function intersect(p1,d1,p2,d2){
    const den=d1[0]*d2[1]-d1[1]*d2[0];if(Math.abs(den)<1e-9)return null;
    const t=((p2[0]-p1[0])*d2[1]-(p2[1]-p1[1])*d2[0])/den;
    return[p1[0]+d1[0]*t,p1[1]+d1[1]*t];
  }

  function convex(q){
    let sign=0;
    for(let i=0;i<4;i++){
      const a=q[i],b=q[(i+1)%4],c=q[(i+2)%4],z=(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);
      if(Math.abs(z)<1e-9)return false;
      if(!sign)sign=Math.sign(z);else if(Math.sign(z)!==sign)return false;
    }
    return true;
  }

  // One side P0→P1 (pixels): the real edge's offset (px, positive = toward the page interior) at
  // each of `N` places along the side, then one straight line through them.
  function scanSide(smp,P0,P1,{w,st,delta,N}){
    const L=dist(P0,P1);
    if(L<8)return{ok:false,support:0,reason:'short'};
    const dx=(P1[0]-P0[0])/L,dy=(P1[1]-P0[1])/L,nx=-dy,ny=dx; // inward normal for a clockwise outline
    const tau=Math.max(1.2,L*.012),n=Math.floor(2*w/st)+1,m=Math.max(1,Math.round(delta/st));
    const prof=new Float64Array(n),pre=new Float64Array(n+1),Dall=new Float64Array(N*n);
    const steps=[],raw=[];
    for(let k=0;k<N;k++){
      const t=.07+.86*(k+.5)/N,cx=P0[0]+dx*L*t,cy=P0[1]+dy*L*t;
      let valid=true;
      for(let j=0;j<n&&valid;j++){
        const s=-w+j*st;let sum=0;
        for(let q=-1;q<=1;q++){const v=smp(cx+nx*s+dx*tau*q,cy+ny*s+dy*tau*q);if(v!==v){valid=false;break}sum+=v}
        prof[j]=sum/3;
      }
      if(!valid)continue;
      pre[0]=0;for(let j=0;j<n;j++)pre[j+1]=pre[j]+prof[j];
      // Brightness step across the whole window: decides which way the page is brighter or darker.
      const h=Math.max(m,Math.round(n*.3));
      steps.push((pre[n]-pre[n-h])/h-pre[h]/h);
      const off=raw.length*n;
      for(let j=m;j+m<=n;j++)Dall[off+j]=(pre[j+m]-pre[j])/m-(pre[j]-pre[j-m])/m;
      raw.push({t,off});
    }
    return{L,dx,dy,nx,ny,tau,n,m,raw,Dall,steps,N};
  }

  // Edge position for every scanned place, given the polarity sign (+1 page brighter than outside).
  function pickEdges(side,sign,{w,st,minStrength}){
    const pts=[],{raw,n,m,Dall}=side,scratch=new Float64Array(n);
    for(const r of raw){
      const o=r.off;
      let bj=-1,bs=-Infinity;
      for(let j=m+1;j+m<n;j++){
        const v=sign*Dall[o+j];if(v<=0||v<sign*Dall[o+j-1]||v<sign*Dall[o+j+1])continue; // local maximum
        const s=-w+(j-.5)*st,score=v*(1-.35*abs(s)/w);
        if(score>bs){bs=score;bj=j}
      }
      if(bj<0)continue;
      const strength=sign*Dall[o+bj];
      // Noise floor from the part of the window away from the peak (the edge's own lobe is not noise).
      let c=0;for(let j=m;j+m<=n;j++)if(abs(j-bj)>3*m)scratch[c++]=abs(Dall[o+j]);
      let noise=0;
      if(c>=6){const v=scratch.subarray(0,c).sort();noise=1.4826*(c%2?v[(c-1)>>1]:(v[c/2-1]+v[c/2])/2)}
      if(strength<Math.max(minStrength,3*noise))continue;
      // Edge position = centre of mass of the whole derivative lobe above half its height: exact for
      // a sharp edge and still stable on a blurred one, where the peak itself is a flat plateau.
      const half=strength/2;let lo=bj,hi=bj;
      while(lo>m&&sign*Dall[o+lo-1]>=half)lo--;
      while(hi<n-m-1&&sign*Dall[o+hi+1]>=half)hi++;
      let sw=0,sx=0;
      for(let j=lo;j<=hi;j++){const u=sign*Dall[o+j]-half;if(u>0){sw+=u;sx+=u*(-w+(j-.5)*st)}}
      const s=sw>0?sx/sw:-w+(bj-.5)*st;
      if(abs(s)>w-1.5*m*st)continue; // at the window's border: the edge is probably further out
      pts.push({t:r.t,s,w:strength});
    }
    return pts;
  }

  // refineQuad(gray, W, H, quad, {range, samples, passes, fixed}) — see the file header.
  //   range   search distance either side of the outline, as a share of the long image side (pass 1)
  //   fixed   [bool×4] sides that are not edges of the page (the fold of a book half): left as they are
  function refineQuad(gray,W,H,quad,{range=.028,samples=48,passes=2,fixed=[false,false,false,false],minStrength=3.5}={}){
    const fail={quad,ok:false,support:0,contrast:0,sides:[],shift:0};
    if(!quad||quad.length!==4)return fail;
    const smp=sampler(gray,W,H),long=Math.max(W,H);
    const st=Math.max(.5,long/1400),delta=Math.max(1.2,long/400);
    const orig=quad.map(([x,y])=>[x*W,y*H]);
    let cur=orig.map(p=>p.slice()),sides=[],contrast=0;
    const w1=Math.max(4*delta,range*long);
    for(let pass=0;pass<passes;pass++){
      const w=pass===0?w1:Math.max(6*delta,Math.min(w1/2,.012*long)),opt={w,st,delta,N:samples,minStrength};
      const scans=[0,1,2,3].map(i=>fixed[i]?null:scanSide(smp,cur[i],cur[(i+1)%4],opt));
      // Polarity: the page is normally brighter (or darker) than its surroundings on all sides.
      const meds=scans.map(s=>s&&s.steps?median(s.steps):0),G=median(meds.filter((v,i)=>scans[i]));
      if(pass===0)contrast=G;
      const lines=[];sides=[];
      for(let i=0;i<4;i++){
        const sc=scans[i];
        const keep={ok:false,support:0,strength:0};
        if(!sc||!sc.raw){lines.push(null);sides.push(keep);continue}
        const own=meds[i],sign=(Math.abs(own)>=6?own:G)>=0?1:-1;
        const pts=pickEdges(sc,sign,opt);
        if(pts.length<Math.max(8,sc.N*.3)){lines.push(null);sides.push(keep);continue}
        const fit=fitOffsetLine(pts,Math.max(1,.0016*sc.L+.6),w*2);
        if(!fit||fit.inliers.length<Math.max(6,pts.length*.4)){lines.push(null);sides.push(keep);continue}
        const ts=fit.inliers.map(k=>pts[k].t);
        if(Math.max(...ts)-Math.min(...ts)<.4){lines.push(null);sides.push(keep);continue}
        const str=median(fit.inliers.map(k=>pts[k].w));
        lines.push({sc,fit,P0:cur[i],P1:cur[(i+1)%4]});
        sides.push({ok:true,support:fit.inliers.length/sc.N*Math.min(1,str/12),strength:str,inliers:fit.inliers.length,samples:sc.N});
      }
      // Corners from neighbouring lines; a side without a good fit keeps its current line.
      const asLine=(i)=>{
        const l=lines[i];
        if(l){const{sc,fit,P0,P1}=l;return{p:[P0[0]+sc.nx*fit.a,P0[1]+sc.ny*fit.a],d:[P1[0]-P0[0]+sc.nx*fit.b,P1[1]-P0[1]+sc.ny*fit.b]}}
        return{p:cur[i],d:[cur[(i+1)%4][0]-cur[i][0],cur[(i+1)%4][1]-cur[i][1]]};
      };
      const next=[];
      for(let i=0;i<4;i++){
        const a=asLine((i+3)%4),b=asLine(i),c=intersect(a.p,a.d,b.p,b.d);
        if(!c)return fail;
        next.push(c);
      }
      cur=next;
    }
    const okSides=sides.filter(s=>s.ok).length+fixed.filter(Boolean).length;
    const shift=Math.max(...cur.map((p,i)=>dist(p,orig[i])));
    const out=cur.map(([x,y])=>[x/W,y/H]);
    const inside=out.every(([x,y])=>x>-.02&&x<1.02&&y>-.02&&y<1.02);
    const sane=convex(cur)&&inside&&shift<=w1*2.2&&okSides>=3;
    const nOwn=sides.length-fixed.filter(Boolean).length||1;
    const support=sides.reduce((s,x,i)=>s+(fixed[i]?0:x.support),0)/nOwn;
    return{quad:sane?out:quad,ok:sane,support,contrast,sides,shift};
  }

  root.ScanRefine={refineQuad,toGray,fitOffsetLine,sampler};
})(typeof self!=='undefined'?self:typeof window!=='undefined'?window:globalThis);
if(typeof module!=='undefined')module.exports=(typeof self!=='undefined'?self:globalThis).ScanRefine;
