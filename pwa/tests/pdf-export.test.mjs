// PDF export (features/pdf-actions.js) with the real pdf-lib: page order and orientation, invisible
// searchable text, table of contents, metadata, file name. Run: node --test pwa/tests
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const lib=require('pdf-lib');
// Same realm as pdf-lib (it checks arrays with instanceof), as in the browser.
const mod={exports:{}};
new Function('module',fs.readFileSync(new URL('../features/pdf-actions.js',import.meta.url),'utf8'))(mod);
const P=mod.exports;

const b64=s=>new Uint8Array(Buffer.from(s,'base64'));
const JPG={portrait:b64('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCABQADwDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD0HxL4lsvCunR319FPJHJMIgIFBbJBPcjj5TXMf8Lk8O/8+Wp/9+o//i62PH3hq98VaHDY2MsEckdyspM7ELgKw7A8/MK8+/4U34i/5/dM/wC/sn/xFCt1A6n/AIXJ4d/58tT/AO/Uf/xdWLD4r6DqOo21jDaaislzMkSF40CgsQBnD9Oa47/hTfiL/n90z/v7J/8AEVd0X4Ua9p2uWF9Nd6c0dtcxyuEkcsQrAnGU68U7RA9boooqACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA/9k='),landscape:b64('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAA8AFoDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD0HxL4lsvCunR319FPJHJMIgIFBbJBPcjj5TXMf8Lk8O/8+Wp/9+o//i62PH3hq98VaHDY2MsEckdyspM7ELgKw7A8/MK8+/4U34i/5/dM/wC/sn/xFCt1A6n/AIXJ4d/58tT/AO/Uf/xdWLD4r6DqOo21jDaaislzMkSF40CgsQBnD9Oa47/hTfiL/n90z/v7J/8AEVd0X4Ua9p2uWF9Nd6c0dtcxyuEkcsQrAnGU68U7RA9boooqACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP/Z')};
const encode=async blob=>({bytes:blob.bytes,width:blob.w,height:blob.h});
const page=(kind,words=null,label='Analyse · CM · CM 1')=>({blob:{bytes:JPG[kind],w:kind==='portrait'?60:90,h:kind==='portrait'?80:60},words,label});

// Text of all content streams (inflated), to look for the text layer.
function contentText(bytes){
  const s=Buffer.from(bytes).toString('latin1');let out='';
  for(const m of s.matchAll(/stream\r?\n([\s\S]*?)endstream/g)){
    const raw=Buffer.from(m[1],'latin1');
    try{out+=zlib.inflateSync(raw).toString('latin1')}catch{out+=m[1]}
  }
  return out;
}
const hex=t=>'<'+Buffer.from(t,'latin1').toString('hex').toUpperCase()+'>';

test('one page per photo, landscape photos on landscape pages, numbered X / Y',async()=>{
  const r=await P.buildPdfDocument(lib,{pages:[page('portrait'),page('landscape'),page('portrait')],title:'Analyse — CM',encode});
  const doc=await lib.PDFDocument.load(r.bytes);
  assert.equal(doc.getPageCount(),3);
  const [a,b]=doc.getPages();
  assert.ok(a.getHeight()>a.getWidth(),'portrait');assert.ok(b.getWidth()>b.getHeight(),'landscape');
  assert.ok(contentText(r.bytes).includes(hex('2 / 3')),'footer page number');
});

test('searchable: recognised words are written as invisible text over the photo',async()=>{
  const words=[['Bonjour',.1,.1,.4,.16],['Théorème',.1,.2,.5,.26]];
  const r=await P.buildPdfDocument(lib,{pages:[page('portrait',words)],title:'T',encode});
  assert.equal(r.withText,1);
  const c=contentText(r.bytes);
  assert.ok(/\b3 Tr\b/.test(c),'invisible text mode');
  assert.ok(c.includes(hex('Bonjour'))&&c.includes(hex('Théorème')),'words present (accents kept)');
});

test('cover and table of contents shift the page numbers',async()=>{
  const r=await P.buildPdfDocument(lib,{pages:[page('portrait'),page('portrait')],title:'Doc',cover:{heading:'Analyse',lines:['CM']},toc:[{head:'CM'},{title:'CM 1',index:0},{title:'CM 2',index:1}],encode});
  const doc=await lib.PDFDocument.load(r.bytes);
  assert.equal(doc.getPageCount(),4);assert.equal(r.total,4);
  const c=contentText(r.bytes);
  assert.ok(c.includes(hex('3 / 4'))&&c.includes(hex('Table des mati\u00e8res')));
});

test('metadata: title, subject, keywords, creator',async()=>{
  const r=await P.buildPdfDocument(lib,{pages:[page('portrait')],title:'Analyse — CM 3',subject:'Analyse — CM',keywords:['Analyse','CM'],author:'Sara',encode});
  const doc=await lib.PDFDocument.load(r.bytes,{updateMetadata:false});
  assert.equal(doc.getTitle(),'Analyse - CM 3'.replace('-','\u2014'));
  assert.equal(doc.getAuthor(),'Sara');assert.equal(doc.getCreator(),'Holioo');
  assert.match(doc.getKeywords(),/Analyse/);
});

test('page size, fit and word placement',()=>{
  assert.deepEqual([...P.pdfPageSize('a4',100,200)],[595.28,841.89]);
  assert.deepEqual([...P.pdfPageSize('letter',300,200)],[792,612]);
  const box=P.pdfFit(200,100,{x:0,y:0,w:100,h:100});
  assert.equal(box.width,100);assert.equal(box.height,50);assert.equal(box.y,25);
  const at=P.pdfWordPlacement([0,0,.5,.1],{x:0,y:0,width:100,height:200},10);
  assert.ok(at.y>170&&at.y<200,'top of the image is the top of the page');
  assert.ok(at.size<=20+1e-9);
});

test('text for standard fonts: accents kept, other characters replaced, never an error',()=>{
  const charset=new Set([...'abcdefghijklmnopqrstuvwxyzéèàçœ<=\'" -.'].map(c=>c.codePointAt(0)));
  assert.equal(P.pdfSafeText('déjà',charset),'déjà');
  assert.equal(P.pdfSafeText('ą’x≤',charset),"a'x<=",'ą → a, typographic quote → quote');
  assert.equal(P.pdfSafeText('łx',charset),'x','letters without a Western equivalent are dropped');
  assert.equal(P.pdfSafeText('∑',charset),'');
});

test('file name: Cours_Section_AAAA-MM-JJ_Séance.pdf',()=>{
  assert.equal(P.pdfFileName({course:'Analyse 1',sections:['CM'],sessions:[{title:'CM 3 — Intégrales',createdAt:'2026-10-05T08:10:00Z'}],title:'x'}),'Analyse_1_CM_2026-10-05_CM_3_—_Intégrales.pdf');
  assert.equal(P.pdfFileName({course:'Physique',sections:['CM','TD'],sessions:[{title:'a',createdAt:'2026-10-02T08:00:00Z'},{title:'b',createdAt:'2026-10-01T08:00:00Z'}],title:'Révisions'}),'Physique_Sections_2026-10-01_Révisions.pdf');
});
