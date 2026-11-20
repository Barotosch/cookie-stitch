import {AppError} from './i18n.mjs?v=0.3.3';
import {emptyAchievements,validateAchievements,mergeAchievements,updateAchievements} from './achievements.mjs?v=0.3.3';
// Keep only view settings the workspace can use, including on direct backup restore.
function safeView(view,colourCount){
 const result={};
 if(!view||typeof view!=='object'||Array.isArray(view))return result;
 if(Number.isFinite(view.size)&&view.size>=.5&&view.size<=64)result.size=view.size;
 for(const axis of ['x','y']){
  if(Number.isFinite(view[axis])&&Math.abs(view[axis])<1e7)result[axis]=view[axis];
 }
 if(Number.isInteger(view.color)&&view.color>=0&&view.color<colourCount)result.color=view.color;
 if(typeof view.isolate==='boolean')result.isolate=view.isolate;
 return result;
}

export class Progress {
  constructor(pattern) {
    this.pattern = pattern;
    this.achievements=emptyAchievements();
    this.states = new Uint8Array(pattern.cells.length);
    this.undoStack = [];
    this.redoStack = [];
    this.pending = null;
  }
  begin() { if (this.pending) throw new AppError('changeRunning'); this.pending = new Map(); }
  set(index, state, color) {
    if (!this.pending) throw new AppError('noActiveChange');
    if (!Number.isInteger(index) || index < 0 || index >= this.states.length || ![0,1,2,3,4].includes(state)) return false;
    if (this.pattern.cells[index] !== color || ([1,3].includes(state) && this.states[index] === 2)) return false;
    if (this.states[index] === state) return false;
    if (!this.pending.has(index)) this.pending.set(index, this.states[index]);
    this.states[index] = state;
    return true;
  }
  commit() {
    if (!this.pending) return false;
    const changes = [...this.pending].filter(([i, before]) => before !== this.states[i]).map(([i,before]) => [i,before,this.states[i]]);
    this.pending = null;
    if (!changes.length) return false;
    this.undoStack.push(changes);
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack.length = 0;
    return true;
  }
  cancel() { if (this.pending) for (const [i,before] of this.pending) this.states[i] = before; this.pending = null; }
  undo() { this.cancel(); const c = this.undoStack.pop(); if (!c) return false; for (const [i,before] of c) this.states[i]=before; this.redoStack.push(c); return true; }
  redo() { this.cancel(); const c = this.redoStack.pop(); if (!c) return false; for (const [i,,after] of c) this.states[i]=after; this.undoStack.push(c); return true; }
  finishPlanned(color) { this.begin(); for (let i=0;i<this.states.length;i++) if (this.states[i]===1) this.set(i,2,color); return this.commit(); }
  counts() {
    const planned = Array(this.pattern.palette.length).fill(0), done = [...planned], parked=[...planned];
    for (let i=0;i<this.states.length;i++) { if (this.states[i]===1) planned[this.pattern.cells[i]]++; if (this.states[i]===2) done[this.pattern.cells[i]]++; if (this.states[i]===3) parked[this.pattern.cells[i]]++; }
    return {planned,done,parked,totalParked:parked.reduce((a,b)=>a+b,0),totalDone:done.reduce((a,b)=>a+b,0),totalPlanned:planned.reduce((a,b)=>a+b,0)};
  }
  backup(view={}) {
    const planned=[], done=[], parked=[], review=[];
    this.states.forEach((s,i)=>{if(s===1)planned.push(i);if(s===2)done.push(i);if(s===3)parked.push(i);if(s===4)review.push(i);});
    return {app:'stichzeit',version:4,patternId:this.pattern.id,sourceHash:this.pattern.sourceHash,savedAt:new Date().toISOString(),planned,done,parked,review,achievements:structuredClone(this.achievements),view:safeView(view,this.pattern.palette.length)};
  }
  restore(data) {
    if (!data || data.app!=='stichzeit' || ![1,2,3,4].includes(data.version) || data.patternId!==this.pattern.id || data.sourceHash!==this.pattern.sourceHash || !Array.isArray(data.planned) || !Array.isArray(data.done)||(data.version>=2&&!Array.isArray(data.parked))||(data.version>=4&&!Array.isArray(data.review))) throw new AppError('invalidProgress');
    const next=new Uint8Array(this.states.length), seen=new Set();
    for (const [list,state] of [[data.planned,1],[data.done,2],[(data.version>=2?data.parked:[]),3],[(data.version>=4?data.review:[]),4]]) {
      if (list.length>next.length) throw new AppError('invalidStitchList');
      for (const i of list) { if (!Number.isInteger(i)||i<0||i>=next.length||seen.has(i)) throw new AppError('invalidStitch'); seen.add(i); next[i]=state; }
    }
    const incoming=data.version>=3?validateAchievements(data.achievements):emptyAchievements();
    if(incoming.seenColors.some(i=>i>=this.pattern.palette.length))throw new AppError('invalidSeenColor');
    const achievements=mergeAchievements(this.achievements,incoming);
    this.cancel();
    this.begin();
    for (let i=0;i<next.length;i++) if(this.states[i]!==next[i]) {this.pending.set(i,this.states[i]);this.states[i]=next[i];}
    this.commit();
    this.achievements=achievements;updateAchievements(this);
    return safeView(data.view,this.pattern.palette.length);
  }
}

// Supplement only genuinely open cells. Existing completed, planned and parked work wins.
export function supplementProgress(pattern,current,incoming){
 const existing=new Progress(pattern);existing.restore(current);const source=new Progress(pattern);source.restore(incoming);
 const next=existing.backup(current.view);const occupied=new Set([...next.done,...next.planned,...next.parked]);
 for(const i of source.backup().done)if(!occupied.has(i)){next.done.push(i);occupied.add(i);}
 next.review=[...new Set([...next.review,...source.backup().review])].filter(i=>!occupied.has(i));
 next.done.sort((a,b)=>a-b);next.review.sort((a,b)=>a-b);return next;
}
