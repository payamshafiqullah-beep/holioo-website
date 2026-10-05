'use strict';
// Notes page → pictures (PDF export, features/notes/canvas-export.js). The screen (features/notes/NotesCanvasPage.js) draws with the
// DOM; this draws the same page on a canvas from the same data and the same path functions (features/notes/canvas-doc.js):
// ink and shapes are the same path data, text is the lines the author's screen wrapped, photos are placed by their
// box, the background is the same ruling. So the picture is the page as it was placed, on any device.

const CANVAS_FONT='Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
const canvasFontCss=size=>`500 ${size}px ${CANVAS_FONT}`;
const CANVAS_BG_COLOR='#D9DEEF';
const CANVAS_RULE=1.5;                                // thickness of a ruled / grid line, page units
const CANVAS_PX_WIDTH=1654;                           // an A4 sheet at 200 dpi

// The photos of a page as bitmaps (id → ImageBitmap, null when not on this device).
async function canvasLoadPhotos(doc){
  const out=new Map();
  for(const id of new Set(canvasLive(doc.items).filter(i=>i.type==='photo').map(i=>i.photoId))){
    try{const row=await photoRow(id),blob=row&&photoBlob(row);out.set(id,blob?await createImageBitmap(blob):null)}
    catch{out.set(id,null)}
  }
  return out;
}
function canvasFreePhotos(map){for(const b of map.values())try{b?.close?.()}catch{}}

// One sheet of the page (page units y0…y1) drawn onto ctx at `scale` pixels per unit.
function canvasDrawSlice(ctx,doc,{y0,y1,scale,photos}){
  ctx.save();
  ctx.setTransform(1,0,0,1,0,0);
  ctx.fillStyle='#fff';ctx.fillRect(0,0,CANVAS_W*scale,(y1-y0)*scale);
  ctx.setTransform(scale,0,0,scale,0,-y0*scale);
  // Background: the ruling of the screen (a line at the bottom of every cell).
  if(doc.bg==='lines'||doc.bg==='grid'){
    ctx.fillStyle=CANVAS_BG_COLOR;
    for(let y=Math.max(1,Math.ceil(y0/CANVAS_LINE))*CANVAS_LINE;y-CANVAS_RULE<y1;y+=CANVAS_LINE)ctx.fillRect(0,y-CANVAS_RULE,CANVAS_W,CANVAS_RULE);
    if(doc.bg==='grid')for(let x=CANVAS_LINE;x<=CANVAS_W+CANVAS_RULE;x+=CANVAS_LINE)ctx.fillRect(x-CANVAS_RULE,y0,CANVAS_RULE,y1-y0);
  }
  // Photos and text, bottom to top.
  const measure=ctx.measureText.bind(ctx);
  for(const it of canvasLive(doc.items).sort((a,b)=>a.z-b.z)){
    if(it.y>y1||it.y+it.h+(it.size||0)<y0)continue;
    if(it.type==='photo'){
      const bmp=photos?.get(it.photoId);
      if(bmp){ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(bmp,it.x,it.y,it.w,it.h)}
      else{ctx.fillStyle='#EEF0F7';ctx.fillRect(it.x,it.y,it.w,it.h);ctx.strokeStyle='#C9CEE0';ctx.lineWidth=2;ctx.strokeRect(it.x,it.y,it.w,it.h)}
    }else if(it.type==='text'){
      // geometricPrecision: no font hinting, so the glyphs do not depend on the device's pixel ratio.
      ctx.font=canvasFontCss(it.size);ctx.fillStyle=it.color;ctx.textBaseline='alphabetic';ctx.textAlign='left';ctx.textRendering='geometricPrecision';ctx.fontKerning='normal';
      const m=measure('Hg'),asc=m.fontBoundingBoxAscent??it.size*.95,desc=m.fontBoundingBoxDescent??it.size*.25,lh=canvasLineHeight(it.size);
      it.lines.forEach((line,i)=>ctx.fillText(line,it.x+CANVAS_TEXT_PAD,it.y+CANVAS_TEXT_PAD+i*lh+(lh-(asc+desc))/2+asc));
    }
  }
  // The ink, above everything.
  for(const s of canvasLive(doc.strokes)){
    let top=Infinity,bottom=-Infinity;
    for(const p of s.pts){top=Math.min(top,p[1]);bottom=Math.max(bottom,p[1])}
    if(bottom+s.size<y0||top-s.size>y1)continue;
    const hl=s.tool==='highlighter';
    ctx.save();
    ctx.fillStyle=s.color;ctx.globalAlpha=hl?CANVAS_HIGHLIGHT_ALPHA:1;if(hl)ctx.globalCompositeOperation='multiply';
    ctx.fill(new Path2D(canvasOutlinePath(HoliooPerfectFreehand.getStroke(s.pts,canvasStrokeOptions(s)))));
    ctx.restore();
  }
  ctx.restore();
}

// Sheet number `index` (0-based) as a JPEG, A4-shaped.
function canvasRenderSheet(doc,index,{width=CANVAS_PX_WIDTH,photos}={}){
  const scale=width/CANVAS_W,height=Math.round(width*297/210);
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  canvasDrawSlice(canvas.getContext('2d'),doc,{y0:index*CANVAS_PAGE_H,y1:(index+1)*CANVAS_PAGE_H,scale,photos});
  return new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.92));
}
