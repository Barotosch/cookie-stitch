import {LocalProjects,validateProject,MAX_FILE_BYTES} from './local-project.mjs?v=0.3.3';
import {Progress} from './progress.mjs?v=0.3.3';
import {availableRules} from './achievements.mjs?v=0.3.3';
import {ProjectStore} from './project-store.mjs?v=0.3.3';

export {MAX_FILE_BYTES,exportProject,minimapRect} from './local-project.mjs?v=0.3.3';
import {AppError,errorText,fmt,language,parseJson,t} from './i18n.mjs?v=0.3.3';

const projects=new LocalProjects();
const $=id=>document.getElementById(id);
let beforeLeave;
let busy=false;
let listGeneration=0;

export async function loadLocalProject(){
 const record=await projects.load();
 return record?validateProject(record.pkg):null;
}
function image(data){
 return new Promise((resolve,reject)=>{
  const img=new Image();
  img.onload=()=>resolve(img);
  img.onerror=()=>reject(new AppError('damagedImage'));
  img.src=data;
 });
}
export async function importProjectFile(file,prepareSwitch){
 if(!file||file.size>MAX_FILE_BYTES)throw new AppError('fileLimit');
 const pkg=validateProject(parseJson(await file.text()));
 const [symbols,overview]=await Promise.all([image(pkg.symbols),image(pkg.overview)]);
 if(symbols.width!==720||symbols.height!==336||overview.width!==512||overview.height!==900)throw new AppError('imageSize');
 prepareSwitch?.();
 await projects.put(pkg);
 location.reload();
}
function setBusy(value){
 busy=value;
 for(const button of $('projectsDialog').querySelectorAll('button'))button.disabled=value;
 $('chooseProject').disabled=value;
}
async function changeProject(action){
 if(busy)return;
 const inList=$('projectsDialog').open;
 const error=$(inList?'projectListError':'localError');
 error.textContent='';
 setBusy(true);
 try{await action();}
 catch(err){error.textContent=errorText(err);setBusy(false);}
}
function progressSummary(pkg){
 try{
  const store=new ProjectStore(localStorage,pkg.pattern);
  const raw=store.read();
  const backup=raw===null?pkg.progress:JSON.parse(raw);
  const state=new Progress(pkg.pattern);
  state.restore(backup);
  const stitches=t('progressCount',{done:fmt(backup.done.length),total:fmt(pkg.pattern.cells.length)});
  const {discovered,unlocked}=state.achievements;
  const achievements=discovered?availableRules(pkg.pattern).filter(rule=>unlocked.includes(rule.id)).length:null;
  return {stitches,achievements};
 }catch{return {stitches:t('checkProgress'),achievements:null};}
}
function projectListRecord(record){
 try{
  const pkg=validateProject(record.pkg);
  const {title,width,height}=pkg.pattern;
  return {id:record.id,pkg:{pattern:{title,width,height},overview:pkg.overview},summary:progressSummary(pkg)};
 }catch{
  const title=typeof record?.pkg?.pattern?.title==='string'?record.pkg.pattern.title:t('damagedProject');
  return {id:record?.id,invalid:true,pkg:{pattern:{title}},summary:{stitches:t('damagedLibraryPattern'),achievements:null}};
 }
}
function projectRow(record,activeId){
 const {id,pkg}=record;
 const current=id===activeId;
 const li=document.createElement('li');
 const button=document.createElement('button');
 button.type='button';
 button.className='project-card';
 if(current)button.setAttribute('aria-current','true');
 const preview=document.createElement('img');
 preview.alt='';
 const {width,height}=pkg.pattern;
 if(Number.isInteger(width)&&Number.isInteger(height)&&width>0&&height>0){
  const scale=45/Math.max(width,height);
  preview.style.width=Math.max(4,width*scale)+'px';
  preview.style.height=Math.max(4,height*scale)+'px';
 }
 if(pkg.overview?.startsWith('data:image/png;base64,'))preview.src=pkg.overview;
 const text=document.createElement('span');
 const title=document.createElement('strong');
 title.textContent=pkg.pattern.title;
 const summary=document.createElement('small');
 const {stitches,achievements}=record.summary||progressSummary(pkg);
 summary.textContent=stitches;
 text.append(title,summary);
 if(achievements!==null){
  const count=document.createElement('small');
  count.className='project-card-achievements';
  const icon=document.createElement('span');
  icon.setAttribute('aria-hidden','true');
  icon.textContent='🍪 ';
  const value=document.createElement('span');
  value.setAttribute('aria-hidden','true');
  value.textContent=fmt(achievements);
  const accessibleLabel=document.createElement('span');
  accessibleLabel.className='project-card-visually-hidden';
  accessibleLabel.textContent=t(achievements===1?'achievementOne':'achievementMany',{count:value.textContent});
  count.append(icon,value,accessibleLabel);
  text.append(count);
 }
 const action=document.createElement('span');
 action.className='project-card-action';
 action.textContent=current?t('currentProject'):t('openProject');
 button.append(preview,text,action);
 button.disabled=Boolean(record.invalid);
 button.onclick=()=>{
  if(current){$('projectsDialog').close();return;}
  changeProject(async()=>{
   beforeLeave?.();
   await projects.activate(id);
   location.reload();
  });
 };
 li.append(button);
 return li;
}
export async function openProjectList({activeId,beforeLeave:prepareSwitch}={}){
 const dialog=$('projectsDialog');
 if(dialog.open||busy)return;
 beforeLeave=prepareSwitch;
 const generation=++listGeneration;
 $('projectList').replaceChildren();
 $('projectListError').textContent='';
 $('projectListStatus').textContent=t('loadingProjects');
 dialog.showModal();
 try{
  const records=await projects.list(projectListRecord);
  if(!dialog.open||generation!==listGeneration)return;
  records.sort((a,b)=>Number(b.id===activeId)-Number(a.id===activeId)||a.pkg.pattern.title.localeCompare(b.pkg.pattern.title,language));
  $('projectList').replaceChildren(...records.map(record=>projectRow(record,activeId)));
  $('projectListStatus').textContent=records.length?'':t('emptyLibrary');
 }catch(err){
  if(dialog.open&&generation===listGeneration){
   $('projectListStatus').textContent='';
   $('projectListError').textContent=errorText(err);
  }
 }
}
$('projectsDialog').addEventListener('cancel',event=>{if(busy)event.preventDefault();});
$('addProjectFile').onclick=()=>$('localFile').click();
$('localFile').onchange=event=>{
 const file=event.target.files[0];
 event.target.value='';
 if(!file)return;
 const prepareSwitch=$('projectsDialog').open?beforeLeave:undefined;
 changeProject(()=>importProjectFile(file,prepareSwitch));
};
$('chooseProject').onclick=()=>openProjectList();
function withinTimeout(task,milliseconds=10000){
 let timer;
 const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Timeout')),milliseconds);});
 return Promise.race([task,timeout]).finally(()=>clearTimeout(timer));
}

export async function prepareOffline(){
 const status=$('offlineStatus');
 if(!('serviceWorker' in navigator)){status.textContent=t('offlineUnsupported');return;}
 try{
  const worker=navigator.serviceWorker;
  const registration=await withinTimeout(worker.register('./sw.js').then(()=>worker.ready));
  const channel=new MessageChannel();
  try{
   const cached=new Promise((resolve,reject)=>{
    channel.port1.onmessage=event=>event.data?.ready?resolve():reject(new Error('Offline cache incomplete'));
    registration.active.postMessage({type:'CHECK_OFFLINE'},[channel.port2]);
   });
   await withinTimeout(cached);
  }finally{
   channel.port1.close();
   channel.port2.close();
  }
  status.textContent=t('offlineReady');
 }catch{status.textContent=t('offlineFailed');}
 if(navigator.storage?.persist)try{await navigator.storage.persist();}catch{}
}
