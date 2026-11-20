import {AppError} from './i18n.mjs?v=0.3.3';
import {Progress} from './progress.mjs?v=0.3.3';

export class StorageConflict extends AppError {
 constructor(){super('storageConflict');}
}

export class ProjectStore {
 constructor(storage,pattern,{requireLock=false}={}){
  this.storage=storage;this.pattern=pattern;this.key=`stichzeit:${pattern.id}`;
  this.recoveryKey=this.key+':previous-valid';this.requireLock=requireLock;
  this.lockHeld=false;this.expectedRaw=storage.getItem(this.key);
 }
 // Observe only when explicitly loading. Saving must compare against that baseline.
 read(){return this.expectedRaw=this.storage.getItem(this.key);}
 validate(data){new Progress(this.pattern).restore(data);return data;}
 recovery(){const raw=this.storage.getItem(this.recoveryKey);return raw?this.validate(JSON.parse(raw)):null;}
 async acquireWriteLock(locks=globalThis.navigator?.locks){
  if(this.lockHeld)return true;
  if(!locks?.request)throw new AppError('locksUnsupported');
  if(this.lockRequest)return this.lockRequest;
  this.lockRequest=new Promise((resolve,reject)=>{
   locks.request(this.key,{ifAvailable:true},async lock=>{
    if(!lock){resolve(false);return;}
    this.lockHeld=true;
    await new Promise(release=>{this.releaseLock=release;resolve(true);});
    this.lockHeld=false;
   }).catch(reject);
  });
  const acquired=await this.lockRequest;
  if(!acquired)this.lockRequest=null;
  return acquired;
 }
 releaseWriteLock(){this.lockHeld=false;this.releaseLock?.();this.releaseLock=null;this.lockRequest=null;}
 save(data,{replaceCorrupt=false}={}){
  if(this.requireLock&&!this.lockHeld)throw new AppError('lockedSave');
  this.validate(data);
  const raw=JSON.stringify(data),old=this.storage.getItem(this.key);
  let previous;
  if(old!==null){try{previous=this.validate(JSON.parse(old));}catch(error){if(!replaceCorrupt)throw error;}}
  if(old!==this.expectedRaw&&!(replaceCorrupt&&old!==null&&!previous))throw new StorageConflict();
  if(previous&&JSON.stringify([previous.planned,previous.done,previous.parked||[],previous.achievements||null,previous.review||[]])!==JSON.stringify([data.planned,data.done,data.parked||[],data.achievements||null,data.review||[]])){
   this.storage.setItem(this.recoveryKey,old);
   if(this.storage.getItem(this.recoveryKey)!==old)throw new AppError('recoveryVerify');
  }
  this.storage.setItem(this.key,raw);
  if(this.storage.getItem(this.key)!==raw)throw new AppError('saveVerify');
  this.expectedRaw=raw;
 }
}
