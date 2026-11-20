import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {celebrationFor,drawMilestoneCookie} from '../public/celebrations.mjs';
import {Progress,supplementProgress} from '../public/progress.mjs';
import {availableRules,updateAchievements} from '../public/achievements.mjs';
import {ProjectStore,StorageConflict} from '../public/project-store.mjs';
import {exportProject,MAX_FILE_BYTES,minimapRect} from '../public/local-project.mjs';
import * as i18n from '../public/i18n.mjs';
const source=readFileSync(new URL('../public/app.mjs',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/bindLanguage\('welcomeLanguage'\);\s*prepareOffline\(\);\s*start\(\);\s*$/,'');
const pattern={id:'ui-test',sourceHash:'a'.repeat(64),width:2,height:2,cells:[0,1,0,1],palette:[{dmc:'310',hex:'#000000',count:2},{dmc:'300',hex:'#b37b33',count:2}]};
function setup(overrides={}){
 const nodes=new Map(),events=new Map(),values=new Map();
 function node(){return {style:{setProperty(){}},dataset:{},hidden:true,disabled:true,textContent:'',open:false,firstChild:{},firstElementChild:{style:{}},classList:{add(){},remove(){},toggle(){}},events:{},addEventListener(name,fn){this.events[name]=fn;},setPointerCapture(){},setAttribute(){},removeAttribute(){},append(){},replaceChildren(){},scrollIntoView(){},focus(){},getContext(){return {setTransform(){}};},getBoundingClientRect(){return {width:800,height:600,left:0,top:0};},querySelector(){return node();},querySelectorAll(){return [];},showModal(){this.open=true;},close(){this.open=false;}};}
 nodes.set('projectLanguage',node());
 for(const match of source.matchAll(/\$\('([^']+)'\)/g)){if(!match[1].includes(' '))nodes.set(match[1],node());}
 const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
 const context=vm.createContext({...i18n,celebrationFor,drawMilestoneCookie,MilestoneCelebration:class{show(){return false;}dismiss(){}armAudio(){}},Progress,supplementProgress,availableRules,updateAchievements,ProjectStore,StorageConflict,MAX_FILE_BYTES,exportProject,minimapRect,structuredClone,Intl,console,localStorage:storage,document:{getElementById:id=>nodes.get(id)||null,querySelector:()=>node(),querySelectorAll:()=>[],createElement:()=>node(),createDocumentFragment:()=>node(),addEventListener(){},documentElement:node(),body:node()},window:{addEventListener:(name,fn)=>events.set(name,fn),devicePixelRatio:1},ResizeObserver:class{observe(){}},requestAnimationFrame:()=>1,setTimeout:()=>1,clearTimeout(){},loadLocalProject:async()=>null,openProjectList(){},prepareOffline(){},...overrides});
 vm.runInContext(source,context);
 vm.runInContext(`pattern=${JSON.stringify(pattern)};progress=new Progress(pattern);counts=progress.counts();`,context);
 return {context,nodes,events,storage};
}
test('palette buttons call the achievement integration with the viewed colour',()=>{
 const {context}=setup();vm.runInContext('chooseColor(0);chooseColor(1);',context);
 const result=JSON.parse(vm.runInContext('JSON.stringify(progress.achievements)',context));
 assert.deepEqual(result.seenColors,[0,1]);assert.ok(result.unlocked.includes('palette-all'));
});
test('failed active project load still leaves the project picker enabled',async()=>{
 const {context,nodes}=setup({loadLocalProject:async()=>{throw Error('Damaged active project');}});
 await vm.runInContext('start()',context);assert.equal(nodes.get('chooseProject').disabled,false);assert.equal(nodes.get('localError').textContent,'Could not open the project. Please try again.');
});
test('lock failure shows a readable explanation and never seeds browser progress',async()=>{
 const pkg={pattern,progress:new Progress(pattern).backup(),symbols:'test',overview:'test'};
 class LockedStore extends ProjectStore{async acquireWriteLock(){return false;}}
 const {context,nodes,storage}=setup({loadLocalProject:async()=>pkg,ProjectStore:LockedStore});
 vm.runInContext('loadImage=async()=>({});cookieWelcome=async()=>{};',context);
 // Keep querySelector results stable so an actual missing paragraph causes a failure.
 const paragraph={textContent:''};nodes.get('dialogContent').querySelector=()=>paragraph;
 const started=vm.runInContext('start()',context);await new Promise(resolve=>setImmediate(resolve));nodes.get('continueProject').onclick();await started;
 assert.match(paragraph.textContent,/another window/);assert.equal(nodes.get('importPanel').hidden,true);assert.equal(nodes.get('saveStatus').textContent,'View only in this window');assert.equal(storage.getItem('stichzeit:'+pattern.id),null);
});
test('restore writes merged earned achievements immediately and remains undoable',()=>{
 const {context,nodes,storage}=setup();
 vm.runInContext(`projectStore=new ProjectStore(localStorage,pattern);progress.states[0]=2;updateAchievements(progress,{ownAction:true});projectStore.save(progress.backup());restoredBackup=new Progress(pattern).backup();bind();`,context);
 nodes.get('confirmRestore').onclick();const saved=JSON.parse(storage.getItem('stichzeit:'+pattern.id));
 assert.deepEqual(saved.done,[]);assert.ok(saved.achievements.unlocked.includes('stitches-1'));assert.equal(saved.achievements.discovered,true);
 assert.equal(vm.runInContext('progress.undo();progress.states[0]',context),2);
});

test('paint celebrates only after committing; the next touch dismisses it; undo/redo never replay it',()=>{
 const shown=[],dismissals=[];
 class Presentation{show(fresh,point){shown.push({fresh,point});return true;}dismiss(){dismissals.push(1);}armAudio(){}}
 const {context,nodes}=setup({MilestoneCelebration:Presentation});
 vm.runInContext(`pattern={id:'threshold',sourceHash:'a'.repeat(64),width:20,height:20,cells:Array(400).fill(0),palette:[{count:400,hex:'#123456'}]};progress=new Progress(pattern);progress.states.fill(2,1,100);updateAchievements(progress);bind();setMode('done');`,context);
 const event={button:0,pointerId:1,clientX:49,clientY:56,preventDefault(){}};
 const chart=nodes.get('chart');chart.events.pointerdown(event);assert.equal(shown.length,0);chart.events.pointercancel(event);assert.equal(shown.length,0);
 assert.equal(vm.runInContext('progress.counts().totalDone',context),99);
 chart.events.pointerdown(event);chart.events.pointerup(event);assert.equal(shown.length,1);assert.ok(shown[0].fresh.some(rule=>rule.id==='percent-25'));assert.equal(shown[0].point.color,'#123456');
 const before=dismissals.length;chart.events.pointerdown(event);assert.ok(dismissals.length>before);chart.events.pointercancel(event);
 vm.runInContext(`changeHistory('undo');changeHistory('redo');`,context);assert.equal(shown.length,1);
});

test('continue can retry after a pattern image fails to load',async()=>{
 const pkg={pattern,progress:new Progress(pattern).backup(),symbols:'test',overview:'test'};
 class ReadOnlyStore extends ProjectStore{async acquireWriteLock(){return false;}}
 const {context,nodes}=setup({loadLocalProject:async()=>pkg,ProjectStore:ReadOnlyStore});
 vm.runInContext("loadImage=async()=>{throw new AppError('imagesLoadFailed');};cookieWelcome=async()=>{};",context);
 const started=vm.runInContext('start()',context);
 await new Promise(resolve=>setImmediate(resolve));
 const button=nodes.get('continueProject');
 button.onclick();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(button.disabled,false);
 assert.equal(button.textContent,'Try again →');
 assert.equal(nodes.get('localError').textContent,'The pattern images could not be loaded.');
 vm.runInContext('loadImage=async()=>({});',context);
 button.onclick();
 await started;
 assert.equal(nodes.get('appShell').hidden,false);
});

test('null backup gets a readable error and never opens the restore confirmation',async()=>{
 const {context,nodes}=setup();
 vm.runInContext('bind()',context);
 const paragraph={textContent:''};
 nodes.get('dialogContent').querySelector=()=>paragraph;
 const input=nodes.get('restoreInput');
 input.files=[{size:4,text:async()=>'null'}];
 await input.onchange();
 assert.equal(paragraph.textContent,'Choose a valid Cookie Stitch backup.');
 assert.equal(nodes.get('restoreDialog').open,false);
});

test('restore persists only supported view fields',()=>{
 const {context,nodes,storage}=setup();
 vm.runInContext(`projectStore=new ProjectStore(localStorage,pattern);restoredBackup=new Progress(pattern).backup();restoredBackup.view={x:44,isolate:false,color:500,arbitrary:'x'.repeat(100000)};bind();`,context);
 nodes.get('confirmRestore').onclick();
 const saved=JSON.parse(storage.getItem('stichzeit:'+pattern.id));
 assert.deepEqual(saved.view,{x:44,isolate:false});
});

test('thread search matches lettered DMC codes and named whites regardless of case',()=>{
 const {context,nodes}=setup();
 vm.runInContext(`pattern.palette[0].dmc='B5200';pattern.palette[1].dmc='ECRU';buildPalette();bind();`,context);
 nodes.delete('noColors');
 const search=nodes.get('colorSearch');
 for(const [query,hidden] of [['b5200',[false,true]],['DMC eCrU',[true,false]],['',[false,false]]]){
  search.value=query;
  search.oninput();
  assert.equal(vm.runInContext('JSON.stringify(paletteButtons.map(row=>row.hidden))',context),JSON.stringify(hidden));
 }
});

test('opening a project chooses the first unfinished colour unless a colour was saved',async()=>{
 for(const [view,done,expected] of [[{},[0,2],1],[{color:0},[0,2],0],[{},[0,1,2,3],0]]){
  const initial=new Progress(pattern);
  for(const i of done)initial.states[i]=2;
  const pkg={pattern,progress:initial.backup(view),symbols:'test',overview:'test'};
  class ReadOnlyStore extends ProjectStore{async acquireWriteLock(){return false;}}
  const {context,nodes}=setup({loadLocalProject:async()=>pkg,ProjectStore:ReadOnlyStore});
  vm.runInContext('loadImage=async()=>({});cookieWelcome=async()=>{};',context);
  const started=vm.runInContext('start()',context);
  await new Promise(resolve=>setImmediate(resolve));
  nodes.get('continueProject').onclick();
  await started;
  assert.equal(vm.runInContext('selected',context),expected);
 }
});

test('adding prepared progress waits for confirmation, preserves existing stitches and can be undone',()=>{
 const {context,nodes,storage}=setup();
 vm.runInContext(`
  const incoming=new Progress(pattern);
  incoming.states[1]=2;
  currentPackage={progress:incoming.backup()};
  progress.states[0]=2;
  projectStore=new ProjectStore(localStorage,pattern);
  projectStore.save(progress.backup());
  bind();
 `,context);
 const dialog=nodes.get('supplementDialog');
 const open=()=>nodes.get('supplementProgress').onclick();
 const confirm=()=>nodes.get('confirmSupplement').onclick();
 const saved=()=>JSON.parse(storage.getItem('stichzeit:'+pattern.id)).done;
 open();
 assert.equal(dialog.open,true);
 assert.match(nodes.get('supplementSummary').textContent,/Add 1 completed stitches/);
 assert.deepEqual(saved(),[0]);
 nodes.get('cancelSupplement').onclick();
 confirm();
 assert.deepEqual(saved(),[0]);
 open();
 confirm();
 assert.deepEqual(saved(),[0,1]);
 assert.equal(vm.runInContext('progress.undo();progress.states[1]',context),0);
});
