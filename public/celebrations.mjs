import {t,fmt} from './i18n.mjs?v=0.3.3';
// Presentation only: callers supply newly earned rules after a committed own action.
export const MILESTONES=Object.freeze({
 'percent-25':{piece:.25,kicker:'milestone1Kicker',message:'milestone1Message',pulse:'#d5a044',waves:1,notes:[659.25,987.77]},
 'percent-50':{piece:.5,kicker:'milestone2Kicker',message:'milestone2Message',pulse:'#d5a044',waves:2,notes:[659.25,830.61,987.77]},
 'percent-75':{piece:.75,kicker:'milestone3Kicker',message:'milestone3Message',pulse:'#d5a044',waves:3,notes:[659.25,830.61,1174.66]},
 'percent-100':{piece:1,kicker:'milestone4Kicker',message:'milestone4Message',pulse:'#e0b054',waves:2,notes:[523.25,659.25,783.99,1046.5],complete:true},
 'colour-1':{piece:1,kicker:'milestone5Kicker',message:'milestone5Message',pulse:'#628b6b',waves:1,notes:[587.33,880]},
 'stitches-100000':{piece:1,kicker:'milestone6Kicker',message:'milestone6Message',pulse:'#d5a044',waves:2,notes:[523.25,659.25,1046.5]},
 'stitches-66666':{piece:1,kicker:'milestone7Kicker',message:'milestone7Message',pulse:'#b83232',waves:1,notes:[110,164.81,220],metal:true}
});
const priority=['percent-100','stitches-66666','stitches-100000','percent-75','percent-50','percent-25','colour-1'];
export function celebrationFor(fresh){const id=priority.find(id=>fresh.some(rule=>rule.id===id));return id?{id,...MILESTONES[id],kicker:t(MILESTONES[id].kicker),message:t(MILESTONES[id].message),name:fresh.find(rule=>rule.id===id).name}:null;}
export const CELEBRATION_MS=3000;
const SOUND_KEY='cookie-stitch:milestone-sound';

export function drawMilestoneCookie(canvas,milestone={piece:1}){
 const c=canvas.getContext('2d');if(!c)return;const w=canvas.width,p=w/16;
 c.clearRect(0,0,w,w);const chips=[[5,4],[10,5],[4,9],[8,10],[11,11],[7,6]];
 for(let y=1;y<15;y++)for(let x=1;x<15;x++){
  const dx=x-7.5,dy=y-7.5;if(dx*dx+dy*dy>47||(x>=12&&y<=4)||(x>=13&&y<=6)||(x===11&&y===2))continue;
  const angle=(Math.atan2(dx,-dy)+Math.PI*2)%(Math.PI*2),active=angle<=(milestone.piece??1)*Math.PI*2;
  c.fillStyle=active?(dx*dx+dy*dy>34?'#b57c35':'#e2b65e'):'#e2b65e26';c.fillRect(x*p,y*p,p+.15,p+.15);
  if(active&&chips.some(([a,b])=>Math.abs(x-a)+Math.abs(y-b)<=1)){c.strokeStyle='#54301c';c.lineWidth=Math.max(1,p*.28);c.beginPath();c.moveTo((x+.22)*p,(y+.22)*p);c.lineTo((x+.78)*p,(y+.78)*p);c.moveTo((x+.78)*p,(y+.22)*p);c.lineTo((x+.22)*p,(y+.78)*p);c.stroke();}
 }
 if(milestone.metal){
  c.globalCompositeOperation='source-atop';c.fillStyle='#775a44';c.fillRect(0,0,w,w);c.globalCompositeOperation='source-over';
  const block=(x,y,a,b,color)=>{c.fillStyle=color;c.fillRect(x*p,y*p,a*p,b*p);};
  block(4,3,8,7,'#d3bc89');block(3,4,10,5,'#d3bc89');block(5,10,6,3,'#bfa875');block(3,5,4,3,'#171315');block(9,5,4,3,'#171315');block(4,6,2,1,'#ce4934');block(10,6,2,1,'#ce4934');block(7,8,2,2,'#261a1a');block(6,10,4,2,'#211719');
  for(const x of [5,7,9])block(x,10,1,3,'#e4cca0');
  block(4,3,3,1,'#a48b61');block(9,3,3,1,'#a48b61');block(2,9,2,1,'#261a1a');block(12,9,2,1,'#261a1a');
 }
}

export class MilestoneCelebration {
 constructor(root,{onReveal=()=>{},storage,environment=globalThis}={}){
  this.root=root;this.env=environment;this.onReveal=onReveal;this.animations=[];this.run=0;this.soundEnabled=false;
  try{this.storage=storage??environment.localStorage;this.soundEnabled=this.storage?.getItem(SOUND_KEY)==='on';}catch{}
  const doc=root.ownerDocument;
  this.layer=doc.createElement('div');this.layer.className='milestone-layer';this.layer.hidden=true;
  this.layer.innerHTML='<div class="milestone-effects" aria-hidden="true"></div><div class="milestone-panel"><canvas class="milestone-cookie" width="192" height="192" aria-hidden="true"></canvas><div class="milestone-kicker"></div><div class="milestone-name"></div><div class="milestone-message"></div><div class="milestone-extra"></div></div><div class="milestone-announcement" role="status" aria-live="polite" aria-atomic="true"></div>';
  this.effects=this.layer.querySelector('.milestone-effects');this.panel=this.layer.querySelector('.milestone-panel');root.append(this.layer);
 }
 setSound(enabled){this.soundEnabled=Boolean(enabled);try{this.storage?.setItem(SOUND_KEY,enabled?'on':'off');}catch{}if(enabled)this.armAudio();}
 armAudio(){
  if(!this.soundEnabled)return;
  try{const Audio=this.env.AudioContext||this.env.webkitAudioContext;if(!Audio)return;this.audio??=new Audio();this.audio.resume()?.catch(()=>{});}catch{}
 }
 playSound(m){
  if(!this.soundEnabled)return;
  this.armAudio();if(!this.audio)return;
  try{
   const a=this.audio,now=a.currentTime;
   if(m.metal){
    const shaper=a.createWaveShaper(),filter=a.createBiquadFilter(),volume=a.createGain(),curve=new Float32Array(2048);
    for(let i=0;i<curve.length;i++)curve[i]=Math.tanh(((i/(curve.length-1))*2-1)*3);shaper.curve=curve;
    filter.type='lowpass';filter.frequency.value=1200;volume.gain.setValueAtTime(0,now);volume.gain.linearRampToValueAtTime(.045,now+.025);volume.gain.exponentialRampToValueAtTime(.0001,now+.95);shaper.connect(filter);filter.connect(volume);volume.connect(a.destination);
    for(const frequency of m.notes){const oscillator=a.createOscillator(),gain=a.createGain();oscillator.type='sawtooth';oscillator.frequency.value=frequency;gain.gain.value=.22;oscillator.connect(gain);gain.connect(shaper);this.startTone(oscillator,gain,now,now+1);}
   }else m.notes.forEach((frequency,i)=>{
    const oscillator=a.createOscillator(),gain=a.createGain();oscillator.type='sine';oscillator.frequency.value=frequency;gain.gain.setValueAtTime(0,now+i*.095);gain.gain.linearRampToValueAtTime(.035,now+i*.095+.012);gain.gain.exponentialRampToValueAtTime(.0001,now+i*.095+.55);oscillator.connect(gain);gain.connect(a.destination);this.startTone(oscillator,gain,now+i*.095,now+i*.095+.6);
   });
  }catch{}
 }
 startTone(oscillator,gain,start,end){
  this.tones??=new Set();const tone={oscillator,gain};this.tones.add(tone);oscillator.onended=()=>{this.tones.delete(tone);oscillator.disconnect();gain.disconnect();};oscillator.start(start);oscillator.stop(end);
 }
 animate(node,frames,options){try{if(node.animate)this.animations.push(node.animate(frames,options));}catch{}}
 dismiss(){
  if(this.layer.hidden)return;
  this.run++;this.env.clearTimeout(this.timer);this.env.cancelAnimationFrame(this.frame);this.animations.forEach(a=>a.cancel());this.animations=[];
  for(const tone of this.tones||[]){try{tone.oscillator.stop();}catch{}}this.tones?.clear();
  this.layer.hidden=true;this.effects.replaceChildren();this.onReveal(0);
 }
 show(fresh,{x,y,color}={}){
  const m=celebrationFor(fresh);if(!m)return false;
  this.dismiss();const run=this.run,rect=this.root.getBoundingClientRect(),width=rect.width,height=rect.height;
  const clamp=(value,size)=>Math.max(0,Math.min(size,Number.isFinite(value)?value:size/2));x=clamp(x,width);y=clamp(y,height);
  const pulse=m.id==='colour-1'&&/^#[a-f\d]{6}$/i.test(color)?color:m.pulse;
  this.layer.style.setProperty('--milestone-pulse',pulse);this.layer.classList.toggle('milestone-metal',Boolean(m.metal));
  for(const [selector,text] of [['.milestone-kicker',m.kicker],['.milestone-name',m.name],['.milestone-message',m.message],['.milestone-extra',fresh.length>1?t('cookiesMore',{count:fmt(fresh.length-1)}):'']])this.layer.querySelector(selector).textContent=text;
  this.layer.querySelector('.milestone-announcement').textContent=`${m.kicker}. ${m.name}.${fresh.length>1?` ${t('cookiesNew',{count:fmt(fresh.length)})}.`:''}`;
  drawMilestoneCookie(this.layer.querySelector('canvas'),m);this.layer.hidden=false;
  // Remain visible even when Web Animations are unavailable.
  this.panel.style.opacity='1';this.panel.style.transform='translate(-50%,-50%)';
  const reduced=this.env.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false,duration=CELEBRATION_MS+(m.complete?650:0);
  this.playSound(m);
  if(reduced){if(m.complete)this.onReveal(1);}
  else{
   const flash=this.element('milestone-flash');flash.style.setProperty('--milestone-x',x+'px');flash.style.setProperty('--milestone-y',y+'px');this.animate(flash,[{opacity:0},{opacity:1,offset:.25},{opacity:0}],{duration:1100,fill:'forwards'});
   for(let i=0;i<m.waves;i++){
    const ring=this.element('milestone-ring');ring.style.left=x+'px';ring.style.top=y+'px';const diameter=Math.hypot(width,height)*2.1;
    this.animate(ring,[{transform:'translate(-50%,-50%)',width:'6px',height:'6px',opacity:.95},{opacity:.65,offset:.32},{transform:'translate(-50%,-50%)',width:diameter+'px',height:diameter+'px',opacity:0}],{duration:m.complete?1800:1400,delay:i*150,easing:'cubic-bezier(.15,.45,.35,1)',fill:'both'});
   }
   if(m.metal)for(let i=0;i<4;i++){
    const bolt=this.element('milestone-bolt');bolt.style.left=(i<2?7+i*12:74+(i-2)*12)+'%';bolt.style.top=(i%2?30:-15)+'px';bolt.style.transform=`rotate(${i<2?16:-16}deg)`;this.animate(bolt,[{opacity:0},{opacity:.78,offset:.23},{opacity:.35,offset:.58},{opacity:0}],{duration:1300,delay:100+(i%2)*180,fill:'both'});
   }
   for(let i=0;i<(m.complete?22:m.metal?24:m.id==='stitches-100000'?15:9);i++){
    const crumb=this.element('milestone-crumb');crumb.style.left=x+'px';crumb.style.top=y+'px';if(m.metal)crumb.classList.add('milestone-ember');else if(i%3===0)crumb.style.background='#57321c';
    const angle=i*2.399,reach=m.metal?70+(i%7)*17:35+(i%5)*14;
    this.animate(crumb,[{opacity:0,transform:'translate(-50%,-50%) scale(.3)'},{opacity:1,offset:.12},{opacity:0,transform:`translate(${Math.cos(angle)*reach}px,${Math.sin(angle)*reach+25}px) rotate(${i*47}deg)`}],{duration:1000,delay:100,fill:'both',easing:'ease-out'});
   }
   this.animate(this.panel,[{opacity:0,transform:'translate(-50%,-42%) scale(.91)'},{opacity:1,transform:'translate(-50%,-50%) scale(1)',offset:.14},{opacity:1,offset:.87},{opacity:0,transform:'translate(-50%,-58%) scale(.97)'}],{duration,fill:'forwards',easing:'ease-out'});
   this.animate(this.layer.querySelector('canvas'),m.metal?[{transform:'scale(1.15) rotate(-3deg)'},{transform:'scale(.98) rotate(2deg)',offset:.5},{transform:'scale(1) rotate(0)'}]:[{transform:'scale(.75) rotate(-12deg)'},{transform:'scale(1.09) rotate(5deg)',offset:.55},{transform:'scale(1) rotate(0)'}],{duration:680,fill:'both',easing:'ease-out'});
   if(m.complete){const start=this.env.performance.now();const reveal=t=>{if(run!==this.run)return;this.onReveal(Math.min(1,(t-start)/1500));if(t-start<1500)this.frame=this.env.requestAnimationFrame(reveal);};this.frame=this.env.requestAnimationFrame(reveal);}
  }
  this.timer=this.env.setTimeout(()=>{if(run===this.run)this.dismiss();},duration);
  return true;
 }
 element(className){const node=this.root.ownerDocument.createElement('div');node.className=className;this.effects.append(node);return node;}
}
