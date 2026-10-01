'use strict';
// Minimal .xlsx writer (no library): several sheets of text and numbers, a bold frozen header row and
// column widths. Used by the Administration screen. Zip entries are stored uncompressed.
// buildXlsx([{name, rows:[[...header],[...row]], widths:[chars]}]) → Blob

const XLSX_CRC_TABLE=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
function xlsxCrc(bytes){let c=0xFFFFFFFF;for(const b of bytes)c=XLSX_CRC_TABLE[(c^b)&255]^(c>>>8);return(c^0xFFFFFFFF)>>>0}

function xlsxZip(files){
  const enc=new TextEncoder(),parts=[],central=[];
  const u16=n=>[n&255,(n>>>8)&255],u32=n=>[n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255];
  let offset=0;
  for(const f of files){
    const name=enc.encode(f.name),data=enc.encode(f.text),crc=xlsxCrc(data);
    const common=[...u16(0x0800),...u16(0),...u16(0),...u16(0x21),...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0)];
    parts.push(new Uint8Array([0x50,0x4b,3,4,...u16(20),...common]),name,data);
    central.push(new Uint8Array([0x50,0x4b,1,2,...u16(20),...u16(20),...common,...u16(0),...u16(0),...u16(0),...u32(0),...u32(offset)]),name);
    offset+=30+name.length+data.length;
  }
  const cdSize=central.reduce((n,c)=>n+c.length,0);
  parts.push(...central,new Uint8Array([0x50,0x4b,5,6,...u16(0),...u16(0),...u16(files.length),...u16(files.length),...u32(cdSize),...u32(offset),...u16(0)]));
  return new Blob(parts,{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}

const xlsxEsc=v=>String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function xlsxCol(i){let s='';for(i++;i>0;i=Math.floor((i-1)/26))s=String.fromCharCode(65+(i-1)%26)+s;return s}

function xlsxSheet({rows,widths=[]}){
  const cols=widths.length?`<cols>${widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('')}</cols>`:'';
  const data=rows.map((row,r)=>`<row r="${r+1}">${row.map((v,c)=>{
    if(v===null||v===undefined||v==='')return'';
    const ref=`${xlsxCol(c)}${r+1}`,style=r===0?' s="1"':'';
    return typeof v==='number'&&Number.isFinite(v)?`<c r="${ref}"${style}><v>${v}</v></c>`:`<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xlsxEsc(v)}</t></is></c>`;
  }).join('')}</row>`).join('');
  return`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${data}</sheetData></worksheet>`;
}

function buildXlsx(sheets){
  const NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main',REL='http://schemas.openxmlformats.org/officeDocument/2006/relationships',HEAD='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const names=sheets.map((s,i)=>xlsxEsc(String(s.name||`Feuille ${i+1}`).replace(/[\[\]:*?\/\\]/g,' ').slice(0,31)));
  const files=[
    {name:'[Content_Types].xml',text:`${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`},
    {name:'_rels/.rels',text:`${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`},
    {name:'xl/workbook.xml',text:`${HEAD}<workbook xmlns="${NS}" xmlns:r="${REL}"><sheets>${names.map((n,i)=>`<sheet name="${n}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`},
    {name:'xl/_rels/workbook.xml.rels',text:`${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="${REL}/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length+1}" Type="${REL}/styles" Target="styles.xml"/></Relationships>`},
    {name:'xl/styles.xml',text:`${HEAD}<styleSheet xmlns="${NS}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`},
    ...sheets.map((s,i)=>({name:`xl/worksheets/sheet${i+1}.xml`,text:xlsxSheet(s)}))
  ];
  return xlsxZip(files);
}
