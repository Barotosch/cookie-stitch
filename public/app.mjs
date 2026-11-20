import {MilestoneCelebration,celebrationFor,drawMilestoneCookie} from './celebrations.mjs?v=0.3.3';
import {availableRules,updateAchievements} from './achievements.mjs?v=0.3.3';
import {Progress,supplementProgress} from './progress.mjs?v=0.3.3';
import {ProjectStore,StorageConflict} from './project-store.mjs?v=0.3.3';
import {loadLocalProject,openProjectList,prepareOffline,MAX_FILE_BYTES,exportProject,minimapRect} from './local-boot.mjs?v=0.3.3';
import {AppError,errorText,fmt,language,localizePage,parseJson,percent,rememberLanguage,t} from './i18n.mjs?v=0.3.3';

const $=id=>document.getElementById(id);
localizePage(document);
let currentPackage, projectStore, pattern, progress, symbols, overview, key, selected=0, mode='pan', isolate=true;
let view={size:22,x:38,y:45}, cw=0,ch=0, frame=0, saveTimer, toastTimer, restoredBackup, stale=false, recoveryNeeded=false;
const canvas=$('chart'),ctx=canvas.getContext('2d'),mini=$('minimap'),mctx=mini.getContext('2d');
let achievementTimer,celebrations,celebrationReveal=0;
function updateCollection(){const revealed=progress.achievements.discovered;$('focusCollection').hidden=!revealed;const brand=document.querySelector('.brand');brand.classList.toggle('collection-ready',revealed);if(revealed){brand.setAttribute('role','button');brand.setAttribute('tabindex','0');brand.setAttribute('aria-label',t('collectionOpen'));}else{brand.removeAttribute('role');brand.removeAttribute('tabindex');brand.setAttribute('aria-label','Cookie Stitch');}}
function collect(parked=false,viewedColor=null,cellIndex=null){
 const fresh=updateAchievements(progress,{ownAction:true,parked,viewedColor});updateCollection();if(!fresh.length)return;
 const notice=$('achievementNotice');clearTimeout(achievementTimer);notice.hidden=true;
 const origin=Number.isInteger(cellIndex)?{x:view.x+(cellIndex%pattern.width+.5)*view.size,y:view.y+(Math.floor(cellIndex/pattern.width)+.5)*view.size,color:pattern.palette[pattern.cells[cellIndex]].hex}:{};
 try{if(celebrations?.show(fresh,origin))return;}catch{celebrations?.dismiss();}
 notice.textContent='🍪 '+(fresh.length===1?fresh[0].name:t('cookiesNew',{count:fmt(fresh.length)}));notice.hidden=false;achievementTimer=setTimeout(()=>notice.hidden=true,6500);
}
function openCollection(){
 if(!progress?.achievements.discovered)return;
 celebrations?.dismiss();const a=progress.achievements;
 info(t('collection'),`${t('collectionIntro')}<div class=achievement-grid>${availableRules(pattern).map(r=>{
  const unlocked=a.unlocked.includes(r.id),special=celebrationFor([r]);
  return `<article class=achievement-card><span aria-hidden=true>${unlocked?special?`<canvas width="96" height="96" data-milestone="${r.id}"></canvas>`:'🍪':'◌'}</span><strong>${unlocked?r.name:t('hiddenCookie')}</strong></article>`;
 }).join('')}</div><label class="milestone-sound-setting"><input type="checkbox" id="milestoneSound"> ${t('sound')}</label>`);
 $('dialogContent').querySelectorAll('canvas[data-milestone]').forEach(canvas=>drawMilestoneCookie(canvas,celebrationFor(availableRules(pattern).filter(rule=>rule.id===canvas.dataset.milestone))));
 $('milestoneSound').checked=celebrations?.soundEnabled??false;$('milestoneSound').onchange=event=>celebrations?.setSound(event.target.checked);
}
let focused=false, centerOnResize=null;
let counts, paletteButtons=[], pointers=new Map(), gesture=null, lastCell=null, touched=false;
const modes={pan:t('panHint'),park:t('parkHint'),done:t('doneHint'),erase:t('eraseHint')};
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4200);}
function info(title,body){$('dialogContent').innerHTML=`<h2>${title}</h2>${body}`;$('infoDialog').showModal();}
function setMode(next){if(!modes[next])return;celebrations?.dismiss();mode=next;canvas.dataset.mode=mode;document.querySelectorAll('[data-mode]').forEach(b=>{b.classList.toggle('active',b.dataset.mode===mode);b.setAttribute('aria-pressed',String(b.dataset.mode===mode));});$('modeHint').textContent=modes[mode];$('focusToolName').textContent=t(mode);}
function updateSymbol(el,index,size){el.style.backgroundPosition=`-${index%15*size}px -${Math.floor(index/15)*size}px`;}
function buildPalette(){
  const frag=document.createDocumentFragment();
  pattern.palette.forEach((p,i)=>{const b=document.createElement('button');b.className='color-row';b.dataset.color=String(i);b.setAttribute('aria-pressed','false');b.innerHTML=`<span class="symbol"></span><span class="color-name">DMC ${p.dmc}<span class="color-label">${t('paletteTotal',{count:fmt(p.count)})}</span></span><span class="remaining"></span>`;updateSymbol(b.firstElementChild,i,32);b.onclick=()=>chooseColor(i);frag.append(b);paletteButtons.push(b);});
  $('palette').append(frag);
}
function chooseColor(i){if(!Number.isInteger(i)||i<0||i>=pattern.palette.length)return;celebrations?.dismiss();selected=i;if(!stale)collect(false,i);updateUI();requestDraw();queueSave();}
function updateUI(){
 counts=progress.counts();const p=pattern.palette[selected];const remain=p.count-counts.done[selected];
 $('activeDmc').textContent=`DMC ${p.dmc}`;updateSymbol($('activeSymbol'),selected,36);
 $('activeRemaining').textContent=fmt(remain);$('activeParked').textContent=fmt(counts.parked[selected]);$('activeDone').textContent=fmt(counts.done[selected]);
 $('totalPercent').textContent=percent(counts.totalDone/progress.states.length,2);
 $('totalCount').textContent=t('progressDone',{done:fmt(counts.totalDone),total:fmt(progress.states.length)});
 $('progressFill').style.width=`${counts.totalDone/progress.states.length*100}%`;
 const pendingReview=progress.states.reduce((n,s)=>n+(s===4),0);$('reviewNext').hidden=!pendingReview;$('reviewNext').textContent=t('reviewCount',{count:fmt(pendingReview)});
 $('undo').disabled=!progress.undoStack.length||stale;$('redo').disabled=!progress.redoStack.length||stale;
 paletteButtons.forEach((b,i)=>{const p=pattern.palette[i],left=p.count-counts.done[i];b.classList.toggle('selected',i===selected);b.setAttribute('aria-pressed',String(i===selected));b.querySelector('.remaining').textContent=left?fmt(left):'✓';b.setAttribute('aria-label',t('paletteColor',{dmc:p.dmc,left:fmt(left),parked:fmt(counts.parked[i])}));});
}
function snapshotView(){return {size:view.size,x:view.x,y:view.y,color:selected,isolate};}
function queueSave(){clearTimeout(saveTimer);if(stale)return;$('saveStatus').textContent=t('saving');saveTimer=setTimeout(save,300);}
function save(){
 if(stale||!progress||progress.pending)return;
 try{const data={...progress.backup(snapshotView()),localProject:true};projectStore.save(data);$('saveStatus').textContent=t('saved');$('saveStatus').classList.remove('error');$('storageWarning').hidden=true;}
 catch(error){if(error instanceof StorageConflict){stale=true;progress.cancel();pointers.clear();gesture=null;updateUI();requestDraw();}$('storageWarning').hidden=false;$('saveStatus').textContent=t('saveFailed');$('saveStatus').classList.add('error');}
}
function saveBeforeProjectChange(){
 if(pointers.size||progress.pending)throw new AppError('finishMarking');
 if(stale&&!recoveryNeeded){if(!projectStore.lockHeld)return;throw new AppError('changedElsewhere');}
 if(recoveryNeeded)return;
 clearTimeout(saveTimer);
 save();
 if(!$('storageWarning').hidden)throw new AppError('saveBeforeSwitch');
}
function applyView(v){
 if(Number.isFinite(v.size)&&v.size>=.5&&v.size<=64)view.size=v.size;
 if(Number.isFinite(v.x)&&Math.abs(v.x)<1e7)view.x=v.x;
 if(Number.isFinite(v.y)&&Math.abs(v.y)<1e7)view.y=v.y;
 if(Number.isInteger(v.color)&&v.color>=0&&v.color<pattern.palette.length)selected=v.color;
 if(typeof v.isolate==='boolean')isolate=v.isolate;
 $('isolate').checked=isolate;$('focusIsolate').checked=isolate;
}
function requestDraw(){if(!frame)frame=requestAnimationFrame(()=>{frame=0;draw();});}
function clampView(){if(!pattern)return;view.x=Math.max(40-pattern.width*view.size,Math.min(cw-40,view.x));view.y=Math.max(40-pattern.height*view.size,Math.min(ch-40,view.y));}
function setFocused(value){if(pointers.size||!pattern)return;centerOnResize={x:(cw/2-view.x)/view.size,y:(ch/2-view.y)/view.size};focused=value;document.body.classList.toggle('focus-mode',focused);$('focusToggle').setAttribute('aria-pressed',String(focused));$('focusLabel').textContent=focused?t('controls'):t('focus');$('focusToggle').title=focused?t('focusShow'):t('focusHide');$('sidebar').classList.remove('open');$('paletteToggle').setAttribute('aria-expanded','false');showProjectMenu(false);resize();queueSave();}
function resize(){celebrations?.dismiss();const r=$('chartWrap').getBoundingClientRect();cw=r.width;ch=r.height;if(centerOnResize){view.x=cw/2-centerOnResize.x*view.size;view.y=ch/2-centerOnResize.y*view.size;centerOnResize=null;}const dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(cw*dpr);canvas.height=Math.round(ch*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);clampView();requestDraw();}
// Visual trial threshold against the cream canvas, not a progress classification.
function needsHighlightOutline(hex){
 const rgb=hex.slice(1).match(/.{2}/g).map(v=>{const c=parseInt(v,16)/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;});
 const luminance=.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
 const cream=.2126*1+.7152*((250/255+.055)/1.055)**2.4+.0722*((241/255+.055)/1.055)**2.4;
 return (Math.max(cream,luminance)+.05)/(Math.min(cream,luminance)+.05)<1.8;
}
function draw(){
 if(!pattern||!symbols)return;
 const s=view.size;ctx.clearRect(0,0,cw,ch);ctx.fillStyle='#f1e8d9';ctx.fillRect(0,0,cw,ch);
 const x0=Math.max(0,Math.floor((24-view.x)/s)),y0=Math.max(0,Math.floor((24-view.y)/s));
 const x1=Math.min(pattern.width,Math.ceil((cw-view.x)/s)),y1=Math.min(pattern.height,Math.ceil((ch-view.y)/s));
 ctx.save();ctx.beginPath();ctx.rect(24,24,cw-24,ch-24);ctx.clip();
 ctx.fillStyle='#fffaf1';ctx.fillRect(view.x,view.y,pattern.width*s,pattern.height*s);
 for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
  const idx=y*pattern.width+x,c=pattern.cells[idx],state=progress.states[idx],px=view.x+x*s,py=view.y+y*s;
  const dim=isolate&&c!==selected,alpha=state===2?(s>=9?.23:.3):dim?.18:1;
  if(s>=9){ctx.globalAlpha=alpha+(1-alpha)*celebrationReveal;ctx.drawImage(symbols,(c%15)*48,Math.floor(c/15)*48,48,48,px,py,s+.2,s+.2);ctx.globalAlpha=1;}
  else{ctx.fillStyle=pattern.palette[c].hex;ctx.globalAlpha=alpha+(1-alpha)*celebrationReveal;ctx.fillRect(px,py,s+.2,s+.2);ctx.globalAlpha=1;}
  if(state===1){ctx.fillStyle='#e3b74b55';ctx.fillRect(px,py,s,s);ctx.strokeStyle='#b88321';ctx.lineWidth=s>=12?1.7:.8;ctx.strokeRect(px+1,py+1,s-2,s-2);if(s>=16){ctx.fillStyle='#b88321';ctx.beginPath();ctx.moveTo(px+s-1,py+1);ctx.lineTo(px+s-1,py+7);ctx.lineTo(px+s-7,py+1);ctx.fill();}}
  if(state===2&&s>=10){ctx.globalAlpha=1-celebrationReveal;ctx.strokeStyle='#6b472d';ctx.lineWidth=Math.max(1.5,s/12);ctx.beginPath();ctx.moveTo(px+s*.24,py+s*.53);ctx.lineTo(px+s*.43,py+s*.72);ctx.lineTo(px+s*.78,py+s*.29);ctx.stroke();ctx.globalAlpha=1;}
 }
 if(s>=8){ctx.beginPath();for(let x=x0;x<=x1;x++){const px=view.x+x*s;ctx.moveTo(px,Math.max(24,view.y+y0*s));ctx.lineTo(px,view.y+y1*s);}for(let y=y0;y<=y1;y++){const py=view.y+y*s;ctx.moveTo(Math.max(24,view.x+x0*s),py);ctx.lineTo(view.x+x1*s,py);}ctx.lineWidth=s>=32?2.6:2;ctx.strokeStyle='#fffdf4b3';ctx.stroke();ctx.lineWidth=s>=32?1.3:1;ctx.strokeStyle='#493726a6';ctx.stroke();}
 ctx.beginPath();for(let x=Math.ceil(x0/10)*10;x<=x1;x+=10){const px=view.x+x*s;ctx.moveTo(px,view.y+y0*s);ctx.lineTo(px,view.y+y1*s);}for(let y=Math.ceil(y0/10)*10;y<=y1;y+=10){const py=view.y+y*s;ctx.moveTo(view.x+x0*s,py);ctx.lineTo(view.x+x1*s,py);}ctx.lineWidth=s>=32?5:s>=8?3.8:1.6;ctx.strokeStyle='#fffdf4dd';ctx.stroke();ctx.lineWidth=s>=32?3:s>=8?2.2:.8;ctx.strokeStyle=s>=8?'#38261ee6':'#795a3d99';ctx.stroke();
 if(isolate&&s>=4&&needsHighlightOutline(pattern.palette[selected].hex)){
  ctx.strokeStyle='#f00024';ctx.lineWidth=Math.max(.8,Math.min(1.8,s*.065));const inset=Math.max(1,s*.08);
  ctx.beginPath();for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const i=y*pattern.width+x;if(pattern.cells[i]!==selected||![0,3].includes(progress.states[i]))continue;ctx.rect(view.x+x*s+inset,view.y+y*s+inset,s-2*inset,s-2*inset);}ctx.stroke();
 }
 for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const i=y*pattern.width+x;if(progress.states[i]!==3)continue;const px=view.x+(x+.5)*s,py=view.y+(y+.5)*s,r=Math.max(3,Math.min(s*.35,11));ctx.fillStyle=pattern.palette[pattern.cells[i]].hex;ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.beginPath();ctx.arc(px,py,r,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.strokeStyle='#38261e';ctx.lineWidth=1.5;ctx.stroke();if(s>=18){ctx.fillStyle='#fff';ctx.strokeStyle='#38261e';ctx.lineWidth=2;ctx.font=`bold ${Math.min(16,s*.6)}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.strokeText('⚑',px,py);ctx.fillText('⚑',px,py);}}
 for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){if(progress.states[y*pattern.width+x]!==4)continue;const px=view.x+x*s,py=view.y+y*s;ctx.strokeStyle='#fff';ctx.lineWidth=5;ctx.strokeRect(px+2,py+2,Math.max(1,s-4),Math.max(1,s-4));ctx.strokeStyle='#d47600';ctx.lineWidth=2;ctx.strokeRect(px+2,py+2,Math.max(1,s-4),Math.max(1,s-4));if(s>=18){ctx.fillStyle='#d47600';ctx.font='bold 14px sans-serif';ctx.textAlign='center';ctx.fillText('?',px+s/2,py+s*.7);}}
 ctx.restore();
 ctx.fillStyle='#fbf6edf5';ctx.fillRect(0,0,cw,24);ctx.fillRect(0,0,24,ch);ctx.font='9px -apple-system, sans-serif';ctx.fillStyle='#a08569';ctx.textAlign='center';ctx.textBaseline='middle';
 const step=s<3?100:s<9?50:10;
 for(let x=Math.max(step,Math.ceil(x0/step)*step);x<=x1;x+=step){const px=view.x+(x-.5)*s;if(px>30&&px<cw-10)ctx.fillText(String(x),px,12);}
 for(let y=Math.max(step,Math.ceil(y0/step)*step);y<=y1;y+=step){const py=view.y+(y-.5)*s;if(py>30&&py<ch-10)ctx.fillText(String(y),12,py);}
 $('zoomLabel').textContent=percent(s/22);drawMini();
}
function drawMini(){
 if(!overview)return;
 const scale=Math.min(128/pattern.width,225/pattern.height);
 const width=Math.max(1,Math.round(pattern.width*scale)),height=Math.max(1,Math.round(pattern.height*scale));
 if(mini.width!==width||mini.height!==height){mini.width=width;mini.height=height;mini.style.aspectRatio=`${width} / ${height}`;mini.style.height='auto';}
 mctx.clearRect(0,0,width,height);mctx.drawImage(overview,0,0,width,height);
 mctx.fillStyle='#fffaf255';mctx.fillRect(0,0,width,height);
 const {x,y,w,h}=minimapRect(pattern,view,cw,ch,width,height);
 if(w>0&&h>0){mctx.save();mctx.beginPath();mctx.rect(x,y,w,h);mctx.clip();mctx.drawImage(overview,0,0,width,height);mctx.restore();mctx.strokeStyle='#704326';mctx.lineWidth=2;mctx.strokeRect(x,y,Math.max(2,w),Math.max(2,h));}
}
function localPoint(e){const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
function cellAt(p){const x=Math.floor((p.x-view.x)/view.size),y=Math.floor((p.y-view.y)/view.size);return p.x>=24&&p.y>=24&&x>=0&&x<pattern.width&&y>=0&&y<pattern.height?{x,y,index:y*pattern.width+x}:null;}
function paint(cell){if(!cell)return;const target=mode==='done'?2:0;if(progress.set(cell.index,target,selected))touched=true;}
function paintLine(a,b){if(!b)return;if(!a){paint(b);return;}const dx=b.x-a.x,dy=b.y-a.y,steps=Math.max(Math.abs(dx),Math.abs(dy));for(let j=0;j<=steps;j++){const x=Math.round(a.x+dx*(steps?j/steps:0)),y=Math.round(a.y+dy*(steps?j/steps:0));paint({x,y,index:y*pattern.width+x});}}
function pinchStart(){const pts=[...pointers.values()];if(pts.length<2)return;if(progress.pending)progress.cancel();lastCell=null;const a=pts[0],b=pts[1];const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};gesture={kind:'pinch',distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),size:view.size,anchorX:(mid.x-view.x)/view.size,anchorY:(mid.y-view.y)/view.size};requestDraw();}
canvas.addEventListener('pointerdown',e=>{
 if(!pattern||e.button>0)return;celebrations?.dismiss();celebrations?.armAudio();e.preventDefault();canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);const p=localPoint(e);pointers.set(e.pointerId,p);
 if(pointers.size>1){pinchStart();return;}
 if(gesture?.kind==='blocked')return;
 touched=false;
 if(mode==='pan'){gesture={kind:'pan',start:p,origin:{...view},moved:false};canvas.style.cursor='grabbing';return;}
 if(stale){toast(t('changedElsewhere'));gesture={kind:'blocked'};return;}
 if(view.size<12){toast(t('zoomToMark'));gesture={kind:'blocked'};return;}
 if(mode==='park'){gesture={kind:'park',start:p,cell:cellAt(p),moved:false};return;}
 progress.begin();gesture={kind:'paint'};lastCell=cellAt(p);paint(lastCell);requestDraw();
});
canvas.addEventListener('pointermove',e=>{
 if(!pattern)return;const p=localPoint(e),cell=cellAt(p);if(cell)$('coordinates').textContent=t('coordinates',{x:fmt(cell.x+1),y:fmt(cell.y+1)});
 if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,p);
 if(gesture?.kind==='pinch'&&pointers.size>=2){const[a,b]=[...pointers.values()],mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};view.size=Math.max(.5,Math.min(64,gesture.size*Math.hypot(a.x-b.x,a.y-b.y)/gesture.distance));view.x=mid.x-gesture.anchorX*view.size;view.y=mid.y-gesture.anchorY*view.size;clampView();requestDraw();return;}
 if(gesture?.kind==='pan'){const dx=p.x-gesture.start.x,dy=p.y-gesture.start.y;if(Math.hypot(dx,dy)>5)gesture.moved=true;if(gesture.moved){view.x=gesture.origin.x+dx;view.y=gesture.origin.y+dy;clampView();requestDraw();}}
 if(gesture?.kind==='park'&&Math.hypot(p.x-gesture.start.x,p.y-gesture.start.y)>6)gesture.moved=true;
 if(gesture?.kind==='paint'){paintLine(lastCell,cell);lastCell=cell;requestDraw();}
});
function pointerEnd(e,cancelled=false){
 if(!pointers.has(e.pointerId))return;const p=pointers.get(e.pointerId);pointers.delete(e.pointerId);
 if(gesture?.kind==='paint'){if(cancelled)progress.cancel();else if(progress.commit()){collect(false,null,progress.undoStack.at(-1)?.at(-1)?.[0]);updateUI();queueSave();}else if(!touched)toast(t('noOpenStitches'));}
 if(gesture?.kind==='park'&&!cancelled&&!gesture.moved){const c=cellAt(p);if(c&&c.index===gesture.cell?.index){progress.begin();const parked=progress.states[c.index]===3;const changed=progress.set(c.index,parked?0:3,selected);progress.commit();if(changed){collect(!parked,null,c.index);updateUI();queueSave();toast(parked?t('threadPickedUp'):t('threadParked'));}else toast(t('chooseOpenSquare'));}}
 if(gesture?.kind==='pan'&&!gesture.moved&&!cancelled){const cell=cellAt(p);if(cell)chooseColor(pattern.cells[cell.index]);}
 if(pointers.size){gesture={kind:'blocked'};}else{gesture=null;lastCell=null;canvas.style.cursor='';queueSave();}
 requestDraw();
}
canvas.addEventListener('pointerup',e=>pointerEnd(e));canvas.addEventListener('pointercancel',e=>pointerEnd(e,true));canvas.addEventListener('lostpointercapture',e=>{if(pointers.has(e.pointerId))pointerEnd(e,true);});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
function zoom(factor,p={x:cw/2,y:ch/2}){if(!pattern||pointers.size)return;celebrations?.dismiss();const old=view.size;view.size=Math.max(.5,Math.min(64,old*factor));view.x=p.x-(p.x-view.x)/old*view.size;view.y=p.y-(p.y-view.y)/old*view.size;clampView();requestDraw();queueSave();}
canvas.addEventListener('wheel',e=>{e.preventDefault();if(!pattern||pointers.size)return;celebrations?.dismiss();if(e.ctrlKey||e.metaKey)zoom(Math.exp(-e.deltaY*.012),localPoint(e));else{view.x-=e.deltaX;view.y-=e.deltaY;clampView();requestDraw();queueSave();}},{passive:false});
function fit(){if(!pattern)return;setMode('pan');view.size=Math.max(.5,Math.min((cw-80)/pattern.width,(ch-80)/pattern.height));view.x=(cw-pattern.width*view.size)/2+12;view.y=(ch-pattern.height*view.size)/2+12;requestDraw();queueSave();}
function navigateMini(e){celebrations?.dismiss();const r=mini.getBoundingClientRect(),x=Math.max(0,Math.min(pattern.width,(e.clientX-r.left)/r.width*pattern.width)),y=Math.max(0,Math.min(pattern.height,(e.clientY-r.top)/r.height*pattern.height));view.x=cw/2-x*view.size;view.y=ch/2-y*view.size;clampView();requestDraw();queueSave();}
mini.addEventListener('pointerdown',e=>{if(!pattern)return;e.preventDefault();mini.setPointerCapture(e.pointerId);navigateMini(e);});mini.addEventListener('pointermove',e=>{if(mini.hasPointerCapture(e.pointerId))navigateMini(e);});
function changeHistory(kind){if(stale||!progress||pointers.size)return;celebrations?.dismiss();if(progress[kind]()){updateUI();requestDraw();queueSave();}}
function nextColor(){const start=selected;for(let j=1;j<=pattern.palette.length;j++){const i=(start+j)%pattern.palette.length;if(pattern.palette[i].count-counts.done[i]>0){chooseColor(i);paletteButtons[i].scrollIntoView({block:'nearest'});toast(t('continueDmc',{dmc:pattern.palette[i].dmc}));return;}}toast(t('allDone'));}
function downloadBackup(){if(!progress)return;try{if(progress.pending){progress.cancel();pointers.clear();gesture=null;requestDraw();}const content=exportProject(currentPackage,progress.backup(snapshotView())),url=URL.createObjectURL(new Blob([content],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`cookie-stitch-project-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);toast(t('backupCreated'));}catch(error){toast(errorText(error));}}
function loadImage(src){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new AppError('imagesLoadFailed'));img.src=src;});}
function showProjectMenu(open){
 $('projectMenu').hidden=!open;
 $('menuButton').setAttribute('aria-expanded',String(open));
}
function bindLanguage(id,onChange){
 const select=$(id);
 select.value=language;
 select.onchange=()=>{
  if(select.value===language)return;
  try{
   onChange?.();
   try{rememberLanguage(select.value);}catch{throw new AppError('languageFailed');}
   location.reload();
  }catch(error){
   select.value=language;
   if(id==='welcomeLanguage')$('localError').textContent=errorText(error);
   else toast(errorText(error));
  }
 };
}
function bind(){
 celebrations=new MilestoneCelebration($('chartWrap'),{onReveal:value=>{if(celebrationReveal===value)return;celebrationReveal=value;requestDraw();}});
 const brand=document.querySelector('.brand');brand.onclick=openCollection;brand.onkeydown=e=>{if(progress.achievements.discovered&&['Enter',' '].includes(e.key)){e.preventDefault();openCollection();}};$('achievementNotice').onclick=openCollection;$('focusCollection').onclick=openCollection;
 $('reviewNext').onclick=()=>{if(pointers.size)return;const candidates=[...progress.states.keys()].filter(i=>progress.states[i]===4);if(!candidates.length)return;const index=candidates.find(i=>i>Number($('reviewNext').dataset.last??-1))??candidates[0];$('reviewNext').dataset.last=index;chooseColor(pattern.cells[index]);setMode('pan');view.size=32;view.x=cw/2-(index%pattern.width+.5)*32;view.y=ch/2-(Math.floor(index/pattern.width)+.5)*32;clampView();requestDraw();info(t('comparePiece'),t('reviewHelp',{coordinates:t('coordinates',{x:fmt(index%pattern.width+1),y:fmt(Math.floor(index/pattern.width)+1)})}));};
 const supplementDialog=$('supplementDialog');
 let preparedSupplement=null;
 $('supplementProgress').onclick=()=>{
  if(stale||pointers.size||progress.pending||supplementDialog.open)return;
  showProjectMenu(false);
  try{
   const before=progress.backup(snapshotView());
   preparedSupplement=supplementProgress(pattern,before,currentPackage.progress);
   const added=preparedSupplement.done.length-before.done.length;
   $('supplementSummary').textContent=t('supplementConfirm',{count:fmt(added)});
   supplementDialog.showModal();
  }catch(error){
   preparedSupplement=null;
   info(t('supplementFailed'),'<p></p>');
   $('dialogContent').querySelector('p').textContent=errorText(error);
  }
 };
 $('cancelSupplement').onclick=()=>supplementDialog.close();
 supplementDialog.addEventListener('close',()=>{
  if(supplementDialog.open)return;
  preparedSupplement=null;
  if(!$('infoDialog').open)$('menuButton').focus();
 });
 $('confirmSupplement').onclick=()=>{
  if(!supplementDialog.open||!preparedSupplement||pointers.size||progress.pending)return;
  const next=preparedSupplement;
  preparedSupplement=null;
  supplementDialog.close();
  if(stale){toast(t('reloadFirst'));return;}
  try{
   projectStore.save(next);
   progress.restore(next);
   updateUI();
   updateCollection();
   requestDraw();
   toast(t('supplemented'));
  }catch(error){
   info(t('supplementFailed'),'<p></p>');
   $('dialogContent').querySelector('p').textContent=errorText(error);
  }
 };
 $('focusToggle').onclick=()=>setFocused(!focused);
 $('focusToolsToggle').onclick=()=>{const collapsed=$('focusTools').classList.toggle('collapsed');$('focusToolsToggle').setAttribute('aria-expanded',String(!collapsed));$('focusToolsChevron').textContent=collapsed?'⌃':'⌄';};
 document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{if(pointers.size)return;setMode(b.dataset.mode);});
 const changeHighlight=e=>{celebrations?.dismiss();isolate=e.target.checked;$('isolate').checked=isolate;$('focusIsolate').checked=isolate;requestDraw();queueSave();};
 $('isolate').onchange=changeHighlight;$('focusIsolate').onchange=changeHighlight;
 $('colorSearch').oninput=()=>{const q=$('colorSearch').value.trim().toLowerCase().replace(/^dmc\s*/, '').trim();let hits=0;paletteButtons.forEach((b,i)=>{b.hidden=!pattern.palette[i].dmc.toLowerCase().includes(q);b.style.display=b.hidden?'none':'';if(!b.hidden)hits++;});let empty=$('noColors');if(!hits&&!empty){empty=document.createElement('p');empty.id='noColors';empty.className='empty-palette';empty.textContent=t('noColors');$('palette').append(empty);}else if(hits&&empty)empty.remove();};
 $('nextColor').onclick=nextColor;$('undo').onclick=()=>changeHistory('undo');$('redo').onclick=()=>changeHistory('redo');
 $('zoomIn').onclick=()=>zoom(1.3);$('zoomOut').onclick=()=>zoom(1/1.3);$('fit').onclick=fit;
 $('backupButton').onclick=downloadBackup;$('emergencyBackup').onclick=downloadBackup;
 $('recoveryBackup').onclick=()=>{try{const data=projectStore.recovery();if(!data){toast(t('noRecovery'));return;}const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='cookie-stitch-previous-progress.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);showProjectMenu(false);toast(t('recoveryExported'));}catch{toast(t('recoveryUnreadable'));}};
 $('helpButton').onclick=()=>info(t('helpTitle'),t('helpBody'));
 $('importInfo').onclick=()=>{info(t('localProjectTitle'),t('localProjectHelp'));};
 $('infoDialog').querySelector('.dialog-close').onclick=()=>$('infoDialog').close();$('infoDialog').querySelector('.dialog-ok').onclick=()=>$('infoDialog').close();
 $('menuButton').onclick=()=>showProjectMenu($('projectMenu').hidden);
 bindLanguage('projectLanguage',saveBeforeProjectChange);
 document.addEventListener('click',e=>{if(!$('projectMenu').contains(e.target)&&!$('menuButton').contains(e.target))showProjectMenu(false);});
 $('openLocalProject').onclick=()=>{openProjectList({activeId:pattern.id,beforeLeave:saveBeforeProjectChange});showProjectMenu(false);};
 $('restoreButton').onclick=()=>{showProjectMenu(false);$('restoreInput').click();};
 $('restoreInput').onchange=async()=>{const f=$('restoreInput').files[0];$('restoreInput').value='';if(!f)return;try{if(f.size>MAX_FILE_BYTES)throw new AppError('restoreTooBig');const incoming=parseJson(await f.text());if(!incoming||typeof incoming!=='object'||Array.isArray(incoming))throw new AppError('invalidBackup');const d=incoming.app==='cookie-stitch-project'?incoming.progress:incoming;const validator=new Progress(pattern);const safeView=validator.restore(d);restoredBackup={...d,view:safeView};$('restoreSummary').textContent=t('restoreSummary',{done:fmt(d.done.length),parked:fmt(d.parked?.length||0)});$('restoreDialog').showModal();}catch(e){info(t('restoreFailed'),'<p></p>');$('dialogContent').querySelector('p').textContent=errorText(e);}};
 $('cancelRestore').onclick=()=>$('restoreDialog').close();
 $('restoreDialog').addEventListener('close',()=>{if(!$('restoreDialog').open)restoredBackup=null;});
 $('confirmRestore').onclick=()=>{if(!restoredBackup)return;if(stale&&!recoveryNeeded){toast(t('reloadFirst'));return;}if(pointers.size)return;try{const merged=new Progress(pattern);merged.restore(progress.backup(snapshotView()));merged.restore(restoredBackup);const next=merged.backup(restoredBackup.view);projectStore.save({...next,localProject:true},{replaceCorrupt:recoveryNeeded});applyView(progress.restore(next));stale=false;recoveryNeeded=false;updateUI();updateCollection();clampView();requestDraw();queueSave();$('restoreDialog').close();toast(t('restored'));restoredBackup=null;}catch(e){toast(errorText(e));}};
 $('paletteToggle').onclick=()=>{const open=$('sidebar').classList.toggle('open');$('paletteToggle').setAttribute('aria-expanded',String(open));};
 document.addEventListener('keydown',e=>{if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||document.querySelector('dialog[open]'))return;if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();changeHistory(e.shiftKey?'redo':'undo');}if(e.key.toLowerCase()==='f'&&!e.metaKey&&!e.ctrlKey&&!e.altKey){e.preventDefault();setFocused(!focused);}if(e.key==='Escape'){if(!$('projectMenu').hidden)$('menuButton').focus();if(focused)setFocused(false);$('sidebar').classList.remove('open');$('paletteToggle').setAttribute('aria-expanded','false');showProjectMenu(false);}});
 window.addEventListener('pagehide',()=>{celebrations?.dismiss();if(progress.pending)progress.cancel();clearTimeout(saveTimer);save();projectStore.releaseWriteLock();});
 window.addEventListener('pageshow',async event=>{if(!event.persisted)return;stale=true;try{const acquired=await projectStore.acquireWriteLock();stale=!acquired||localStorage.getItem(key)!==projectStore.expectedRaw;}catch{}if(stale){$('saveStatus').textContent=t('pleaseReload');$('saveStatus').classList.add('error');}updateUI();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){celebrations?.dismiss();if(progress.pending){progress.cancel();pointers.clear();gesture=null;requestDraw();}clearTimeout(saveTimer);save();}});
 window.addEventListener('storage',e=>{if(e.key===key||e.key===null){celebrations?.dismiss();clearTimeout(saveTimer);stale=true;progress.cancel();pointers.clear();gesture=null;requestDraw();$('saveStatus').textContent=t('elsewhereStatus');$('saveStatus').classList.add('error');updateUI();toast(t('progressChangedElsewhere'));}});
}
async function cookieWelcome(){
 if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const logo=document.querySelector('.welcome-logo');
 if(!logo?.animate)return;
 const box=logo.getBoundingClientRect();
 const crumbs=document.createElement('div');
 crumbs.className='welcome-crumbs';crumbs.setAttribute('aria-hidden','true');
 document.body.append(crumbs);
 const animations=[];
 try{
  animations.push(logo.animate([
   {transform:'rotate(0deg) scale(1)'},
   {transform:'rotate(-12deg) scale(.92)',offset:.22},
   {transform:'translateY(-14px) rotate(10deg) scale(1.08)',offset:.5},
   {transform:'translateY(0) rotate(-4deg) scale(1.02)',offset:.78},
   {transform:'rotate(0deg) scale(1)'}
  ],{duration:620,easing:'ease-in-out'}));
  for(let i=0;i<8;i++){
   const crumb=document.createElement('i');crumbs.append(crumb);
   crumb.style.left=`${box.left+box.width/2}px`;
   crumb.style.top=`${box.top+box.height/2}px`;
   const angle=(i/8)*Math.PI*2;
   const x=Math.cos(angle)*(box.width/2+24),y=Math.sin(angle)*(box.height/2+24);
   animations.push(crumb.animate([
    {transform:'translate(-50%,-50%) scale(0)',opacity:0},
    {opacity:1,offset:.2},
    {transform:`translate(calc(-50% + ${x}px),calc(-50% + ${y+18}px)) rotate(${i*63}deg) scale(.65)`,opacity:0}
   ],{duration:620,easing:'ease-out'}));
  }
  await Promise.all(animations.map(animation=>animation.finished.catch(()=>{})));
 }finally{animations.forEach(animation=>animation.cancel());crumbs.remove();}
}

async function start(){
 $('chooseProject').disabled=false;
 $('continueProject').disabled=true;
 $('continueProject').hidden=true;
 $('localError').textContent='';
 try{
 currentPackage=await loadLocalProject();
 if(!currentPackage){$('importPanel').hidden=false;$('loading').hidden=true;return;}
 pattern=currentPackage.pattern;
 $('chooseProject').onclick=()=>openProjectList({activeId:pattern.id});
 // The welcome screen only reads saved progress. Opening the workspace re-reads it.
 const welcomeStore=new ProjectStore(localStorage,pattern), welcomeProgress=new Progress(pattern);
 try{
  const raw=welcomeStore.read();welcomeProgress.restore(raw===null?currentPackage.progress:JSON.parse(raw));
  const done=welcomeProgress.backup().done.length,total=pattern.cells.length;
  $('welcomeProgressFill').style.width=`${done/total*100}%`;
  $('welcomeProgressText').textContent=`${t('progressCount',{done:fmt(done),total:fmt(total)})} · ${percent(done/total,1)}`;
 }catch{
  $('welcomeProgressText').textContent=t('checkProgress');
  $('continueProject').textContent=t('checkProject');
 }
 $('welcomeProjectTitle').textContent=pattern.title;
 $('welcomeProject').hidden=false;$('welcomeIntro').hidden=true;
 $('chooseProject').textContent=t('projects');$('chooseProject').classList.add('welcome-secondary');
 $('continueProject').hidden=false;
 // Leave the welcome screen usable if image decoding fails.
 const continueButton=$('continueProject');
 for(;;){
  continueButton.disabled=false;
  await new Promise(resolve=>{continueButton.onclick=()=>{
   continueButton.disabled=true;
   $('localError').textContent='';
   resolve();
  };});
  try{
   const entrance=cookieWelcome().catch(()=>{});
   [symbols,overview]=await Promise.all([loadImage(currentPackage.symbols),loadImage(currentPackage.overview)]);
   await entrance;
   break;
  }catch(error){
   $('localError').textContent=errorText(error,'failedStart');
   continueButton.textContent=t('retryStart');
  }
 }
 document.documentElement.style.setProperty('--local-symbols',`url("${currentPackage.symbols}")`);
 document.querySelector('.project-heading h1').textContent=pattern.title;
 document.querySelector('.palette-heading h2 span:last-child').textContent=pattern.palette.length;
 projectStore=new ProjectStore(localStorage,pattern,{requireLock:true});progress=new Progress(pattern);key=projectStore.key;selected=0;
 let restoreError=null,comparisonReset=false,lockError=null;
 try{if(!await projectStore.acquireWriteLock())throw new AppError('lockedElsewhere');}catch(error){lockError=error;stale=true;}
 try{
  const raw=projectStore.read();
  comparisonReset=raw===null;
  const savedView=progress.restore(raw===null?currentPackage.progress:JSON.parse(raw));
  if(savedView.color===undefined){
   const {done}=progress.counts();
   selected=Math.max(0,pattern.palette.findIndex((colour,i)=>colour.count>done[i]));
  }
  applyView(savedView);
  if(raw===null&&projectStore.lockHeld)projectStore.save(progress.backup(snapshotView()));
  progress.undoStack=[];progress.redoStack=[];
 }catch(e){restoreError=e;stale=true;recoveryNeeded=true;}
 $('appShell').hidden=false;$('importPanel').hidden=true;
 buildPalette();bind();setMode('pan');updateUI();updateCollection();new ResizeObserver(resize).observe($('chartWrap'));resize();
 if(comparisonReset)fit();
 $('loading').hidden=true;
 if(restoreError){$('saveStatus').textContent=t('checkProgress');$('saveStatus').classList.add('error');info(t('unreadableProgress'),t('unreadableHelp'));}else if(lockError){$('saveStatus').textContent=t('readOnly');$('saveStatus').classList.add('error');info(t('alreadyOpen'),'<p></p>');$('dialogContent').querySelector('p').textContent=errorText(lockError);}else{$('saveStatus').textContent=t('saved');queueSave();}
 paletteButtons[selected].scrollIntoView({block:'nearest'});

 }catch(error){
  projectStore?.releaseWriteLock();
  $('localError').textContent=errorText(error,'failedStart');
  $('importPanel').hidden=false;
  const retry=$('continueProject');
  retry.hidden=false;
  retry.disabled=false;
  retry.textContent=t('retryStart');
  retry.onclick=start;
 }
}
bindLanguage('welcomeLanguage');
prepareOffline();
start();
