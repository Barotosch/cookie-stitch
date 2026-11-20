import test from 'node:test';
import assert from 'node:assert/strict';
import {MilestoneCelebration,celebrationFor,MILESTONES,CELEBRATION_MS} from '../public/celebrations.mjs';
function fixture({reduced=false,animations=true,storage,AudioContext}={}){
 const writes=[],timers=[],frames=[],moves=[],effects=[];let audioCreates=0;
 const context=new Proxy({},{get:()=>()=>{}});
 const doc={createElement(){
  const nodes=new Map(),classes=new Set();
  const node={ownerDocument:doc,width:192,height:192,hidden:false,style:{setProperty(key,value){this[key]=value;}},classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name);},add(name){classes.add(name);},contains:name=>classes.has(name)},append(child){effects.push(child);},querySelector(selector){if(selector==='canvas')selector='.milestone-cookie';if(!nodes.has(selector))nodes.set(selector,doc.createElement('div'));return nodes.get(selector);},replaceChildren(){},getContext:()=>context,getBoundingClientRect:()=>({width:700,height:400})};
  if(animations)node.animate=(frames,options)=>{moves.push({frames,options});return {cancel(){}};};
  return node;
 }};
 const root=doc.createElement('div');
 const env={setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout(){},requestAnimationFrame:fn=>{frames.push(fn);return frames.length;},cancelAnimationFrame(){},performance:{now:()=>0},matchMedia:()=>({matches:reduced}),AudioContext:AudioContext||class{constructor(){audioCreates++;throw Error('audio unavailable');}}};
 const store=storage||{getItem:()=>null,setItem:(k,v)=>writes.push([k,v])};
 const ui=new MilestoneCelebration(root,{storage:store,environment:env,onReveal:n=>effects.push({reveal:n})});
 return {ui,writes,timers,frames,moves,effects,audioCreates:()=>audioCreates};
}
const rule=id=>({id,name:'Name '+id});
test('only the seven approved milestones celebrate; simultaneous unlocks select one major event',()=>{
 for(const id of Object.keys(MILESTONES))assert.equal(celebrationFor([rule(id)]).id,id);
 for(const id of ['stitches-1','percent-1','percent-10','percent-90','parking-10','colour-5','palette-all'])assert.equal(celebrationFor([rule(id)]),null);
 assert.equal(celebrationFor([rule('colour-1'),rule('stitches-100000'),rule('percent-100')]).id,'percent-100');
});
test('celebrations last three seconds and do not write project or achievement state',()=>{
 const {ui,writes,timers}=fixture(),fresh=Object.freeze([Object.freeze(rule('percent-25'))]);
 assert.equal(ui.show(fresh,{x:150,y:180}),true);assert.equal(ui.layer.hidden,false);assert.equal(timers.at(-1).ms,3000);assert.equal(CELEBRATION_MS,3000);
 assert.deepEqual(writes,[]);timers.at(-1).fn();assert.equal(ui.layer.hidden,true);
});
test('unsupported animations still show the milestone; later animation timers cannot dismiss a newer one',()=>{
 const {ui,timers}=fixture({animations:false});ui.show([rule('percent-25')]);const old=timers.at(-1);
 assert.equal(ui.panel.style.opacity,'1');ui.show([rule('stitches-66666')]);old.fn();assert.equal(ui.layer.hidden,false);assert.ok(ui.layer.classList.contains('milestone-metal'));
 ui.dismiss();assert.equal(ui.layer.hidden,true);
});
test('first colour uses its actual yarn colour and multiple unlocks are combined',()=>{
 const {ui}=fixture();ui.show([rule('colour-1'),rule('stitches-100')],{color:'#aabbcc'});
 assert.equal(ui.layer.style['--milestone-pulse'],'#aabbcc');assert.match(ui.layer.querySelector('.milestone-extra').textContent,/1 more/);
});
test('reduced motion has no waves; completion reveals the original colours and dismissal restores the view',()=>{
 const {ui,moves,effects,timers}=fixture({reduced:true});ui.show([rule('percent-100')]);
 assert.equal(moves.length,0);assert.equal(timers.at(-1).ms,3650);assert.ok(effects.some(x=>x.reveal===1));ui.dismiss();assert.equal(effects.at(-1).reveal,0);
});
test('completion reveal frames become inert after the next touch cancels the celebration',()=>{
 const {ui,frames,effects}=fixture();ui.show([rule('percent-100')]);const lateFrame=frames.at(-1);ui.dismiss();const length=effects.length;lateFrame(1000);assert.equal(effects.length,length);
});
test('sound defaults off, is explicitly remembered outside project storage, and cannot break stitching',()=>{
 const {ui,writes,audioCreates}=fixture();ui.show([rule('stitches-66666')]);assert.equal(audioCreates(),0);
 ui.setSound(true);assert.deepEqual(writes,[['cookie-stitch:milestone-sound','on']]);assert.doesNotThrow(()=>ui.show([rule('percent-50')]));
 const failed=fixture({storage:{getItem(){throw Error('quota');},setItem(){throw Error('quota');}}});assert.equal(failed.ui.soundEnabled,false);assert.doesNotThrow(()=>failed.ui.setSound(true));
});
test('metal sound is an original low power chord and active voices stop when dismissed',()=>{
 const oscillators=[];
 const param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}});
 class Audio{
  constructor(){this.currentTime=0;this.destination={};}
  resume(){return Promise.resolve();}
  createWaveShaper(){return {connect(){}};}
  createBiquadFilter(){return {frequency:param(),connect(){}};}
  createGain(){return {gain:param(),connect(){},disconnect(){}};}
  createOscillator(){const oscillator={frequency:param(),connect(){},disconnect(){},start(){},stop(){this.stops=(this.stops||0)+1;}};oscillators.push(oscillator);return oscillator;}
 }
 const {ui}=fixture({AudioContext:Audio});ui.setSound(true);ui.show([rule('stitches-66666')]);
 assert.deepEqual(oscillators.map(o=>o.frequency.value),[110,164.81,220]);assert.ok(oscillators.every(o=>o.type==='sawtooth'));ui.dismiss();assert.ok(oscillators.every(o=>o.stops===2));
});

test('dismissing an idle celebration does not touch the canvas reveal',()=>{
 const {ui,effects}=fixture();
 ui.dismiss();
 assert.deepEqual(effects.filter(effect=>'reveal' in effect),[]);
});
