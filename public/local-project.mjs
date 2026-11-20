import {AppError} from './i18n.mjs?v=0.3.3';
import {Progress} from './progress.mjs?v=0.3.3';

export const MAX_FILE_BYTES=32_000_000;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const text=(value,max)=>typeof value==='string'&&value.length<=max;
// DMC identifiers include numbered threads, letter prefixes, and named whites.
const dmcCode=/^(?:[a-z]{0,2}[0-9]{1,6}|ecru|blanc|white)$/i;

// Read IHDR before the browser allocates decoded image pixels.
export function validateImage(data,name){
 if(typeof data!=='string'||data.length>8_000_000||(data.length-22)%4!==0||!/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(data))throw new AppError('invalidImages');
 let bytes;
 try{bytes=Uint8Array.from(atob(data.slice(22,66)),c=>c.charCodeAt(0));}catch{throw new AppError('invalidImages');}
 const view=new DataView(bytes.buffer);
 if(bytes.length<33||view.getUint32(8)!==13||view.getUint32(12)!==0x49484452)throw new AppError('invalidPng');
 const width=view.getUint32(16),height=view.getUint32(20);
 const expected=name==='symbols'?[720,336]:[512,900];
 if(width!==expected[0]||height!==expected[1])throw new AppError('imageSize');
 return data;
}

export function validateProject(pkg){
 if(!object(pkg)||pkg.app!=='cookie-stitch-project'||pkg.version!==1)throw new AppError('invalidProjectFile');
 const p=pkg.pattern;
 if(!object(p)||!Number.isInteger(p.width)||!Number.isInteger(p.height)||p.width<1||p.height<1||p.width*p.height>1_000_000||!Array.isArray(p.cells)||p.cells.length!==p.width*p.height||!Array.isArray(p.palette)||p.palette.length<1||p.palette.length>105||!Array.isArray(p.pages)||p.pages.length>1000||!text(p.title,150)||typeof p.id!=='string'||!/^[-a-zA-Z0-9_]{1,120}$/.test(p.id)||typeof p.sourceHash!=='string'||! /^[a-f0-9]{64}$/.test(p.sourceHash))throw new AppError('invalidPattern');
 const counts=Array(p.palette.length).fill(0);
 for(const c of p.cells){if(!Number.isInteger(c)||c<0||c>=counts.length)throw new AppError('invalidColor');counts[c]++;}
 const palette=p.palette.map((c,i)=>{
  if(!object(c)||typeof c.dmc!=='string'||!dmcCode.test(c.dmc)||c.dmc.trim()!==c.dmc||typeof c.hex!=='string'||!/^#[a-fA-F0-9]{6}$/.test(c.hex)||c.hex.length!==7||c.count!==counts[i])throw new AppError('invalidColorCount');
  const color={dmc:c.dmc,hex:c.hex,count:c.count};
  if(c.symbol!==undefined){if(!text(c.symbol,32))throw new AppError('invalidSymbol');color.symbol=c.symbol;}
  if(c.expected!==undefined){if(!Number.isInteger(c.expected)||c.expected<0)throw new AppError('invalidCount');color.expected=c.expected;}
  if(c.rgb!==undefined){if(!Array.isArray(c.rgb)||c.rgb.length!==3||c.rgb.some(v=>!Number.isFinite(v)||v<0||v>1))throw new AppError('invalidColor');color.rgb=[...c.rgb];}
  return color;
 });
 const pages=p.pages.map(page=>{
  if(!object(page)||!['page','x','y','width','height'].every(k=>Number.isInteger(page[k]))||page.page<1||page.x<0||page.y<0||page.width<1||page.height<1||page.x+page.width>p.width||page.y+page.height>p.height)throw new AppError('invalidPage');
  return {page:page.page,x:page.x,y:page.y,width:page.width,height:page.height};
 });
 const pattern={id:p.id,sourceHash:p.sourceHash,title:p.title,width:p.width,height:p.height,palette,cells:[...p.cells],pages};
 if(p.sourceName!==undefined){if(!text(p.sourceName,255))throw new AppError('invalidFilename');pattern.sourceName=p.sourceName;}
 const state=new Progress(pattern),view=state.restore(pkg.progress);
 const progress=state.backup(view);
 if(typeof pkg.progress.savedAt==='string'&&pkg.progress.savedAt.length<=40)progress.savedAt=pkg.progress.savedAt;
 return {app:'cookie-stitch-project',version:1,pattern,symbols:validateImage(pkg.symbols,'symbols'),overview:validateImage(pkg.overview,'overview'),progress};
}

export function exportProject(pkg,progress){
 const normalized=validateProject({...pkg,progress});
 const content=JSON.stringify(normalized);
 if(new Blob([content]).size>MAX_FILE_BYTES)throw new AppError('exportLimit');
 return content;
}

export function minimapRect(pattern,view,cw,ch,width,height){
 const x=Math.max(0,Math.min(width,(24-view.x)/view.size*width/pattern.width));
 const y=Math.max(0,Math.min(height,(24-view.y)/view.size*height/pattern.height));
 const right=Math.max(0,Math.min(width,(cw-view.x)/view.size*width/pattern.width));
 const bottom=Math.max(0,Math.min(height,(ch-view.y)/view.size*height/pattern.height));
 return {x,y,w:Math.max(0,right-x),h:Math.max(0,bottom-y)};
}

function canonical(value){
 if(Array.isArray(value))return value.map(canonical);
 if(object(value))return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
 return value;
}
export function sameTemplate(a,b){
 return a.symbols===b.symbols&&a.overview===b.overview&&JSON.stringify(canonical(a.pattern))===JSON.stringify(canonical(b.pattern));
}

export class LocalProjects {
 constructor(idb=globalThis.indexedDB){this.idb=idb;}
 open(){return new Promise((resolve,reject)=>{
  const req=this.idb.open('cookie-stitch-local-projects',1);
  req.onupgradeneeded=()=>{req.result.createObjectStore('templates',{keyPath:'id'});req.result.createObjectStore('settings');};
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(new AppError('noProjectStorage'));
  req.onblocked=()=>reject(new AppError('blockedProjectStorage'));
 });}
 async load(){
  const db=await this.open();
  try{return await new Promise((resolve,reject)=>{
   const tx=db.transaction(['templates','settings'],'readonly'),active=tx.objectStore('settings').get('active');let project=null;
   active.onsuccess=()=>{if(active.result){const get=tx.objectStore('templates').get(active.result);get.onsuccess=()=>project=get.result||null;}};
   tx.oncomplete=()=>resolve(project);
   tx.onabort=()=>reject(new AppError('projectLoadFailed'));
  });}finally{db.close();}
 }
 async list(mapRecord=record=>record){
  const db=await this.open();
  try{return await new Promise((resolve,reject)=>{
   const tx=db.transaction('templates','readonly'),records=[];
   const request=tx.objectStore('templates').openCursor();
   request.onsuccess=()=>{const cursor=request.result;if(!cursor)return;try{records.push(mapRecord(cursor.value));cursor.continue();}catch{tx.abort();}};
   tx.oncomplete=()=>resolve(records);
   tx.onabort=()=>reject(new AppError('projectListFailed'));
  });}finally{db.close();}
 }
 async activate(id){
  const db=await this.open();
  try{await new Promise((resolve,reject)=>{
   const tx=db.transaction(['templates','settings'],'readwrite'),request=tx.objectStore('templates').get(id);let failure=new AppError('projectActivateFailed');
   request.onsuccess=()=>{try{if(!request.result||request.result.pkg.pattern.id!==id)throw new AppError('projectMissing');validateProject(request.result.pkg);tx.objectStore('settings').put(id,'active');}catch(error){failure=error;tx.abort();}};
   tx.oncomplete=resolve;tx.onabort=()=>reject(failure);
  });}finally{db.close();}
 }
 async put(pkg){
  pkg=validateProject(pkg);
  const db=await this.open();
  try{await new Promise((resolve,reject)=>{
   const tx=db.transaction(['templates','settings'],'readwrite'),store=tx.objectStore('templates'),old=store.get(pkg.pattern.id);let failure=new AppError('projectPutFailed');
   old.onsuccess=()=>{try{
    if(old.result&&!sameTemplate(validateProject(old.result.pkg),pkg))throw new AppError('projectMismatch');
    store.put({id:pkg.pattern.id,pkg});tx.objectStore('settings').put(pkg.pattern.id,'active');
   }catch(error){failure=error;tx.abort();}};
   tx.oncomplete=resolve;tx.onabort=()=>reject(failure);
  });}finally{db.close();}
 }
}
