import test from 'node:test';
import assert from 'node:assert/strict';
import {ProjectStore,StorageConflict} from '../public/project-store.mjs';
import {Progress} from '../public/progress.mjs';
const pattern={id:'storage-test',sourceHash:'a'.repeat(64),width:2,height:2,cells:[0,0,0,0],palette:[{count:4}]};
function setup(){const map=new Map();return {map,storage:{getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)}};}
function locks(){
 const held=new Set();
 return {async request(name,options,callback){if(held.has(name))return callback(null);held.add(name);try{return await callback({name});}finally{held.delete(name);}}};
}
test('stale writer cannot replace newer stitches, even without a storage event',()=>{
 const {storage}=setup(),a=new ProjectStore(storage,pattern),b=new ProjectStore(storage,pattern);
 const pa=new Progress(pattern),pb=new Progress(pattern);
 pa.states[0]=2;a.save(pa.backup());pb.states[1]=2;
 assert.throws(()=>b.save(pb.backup()),StorageConflict);
 assert.deepEqual(JSON.parse(a.read()).done,[0]);assert.equal(a.recovery(),null);
});
test('storage clear and external view writes are conflicts too',()=>{
 const {storage,map}=setup(),store=new ProjectStore(storage,pattern),p=new Progress(pattern);
 store.save(p.backup());map.delete(store.key);
 assert.throws(()=>store.save(p.backup()),StorageConflict);
 store.read();store.save(p.backup());map.set(store.key,JSON.stringify(p.backup({x:42})));
 assert.throws(()=>store.save(p.backup()),StorageConflict);
});
test('exclusive editing is held until release; other projects remain editable',async()=>{
 const {storage}=setup(),manager=locks(),a=new ProjectStore(storage,pattern,{requireLock:true}),b=new ProjectStore(storage,pattern,{requireLock:true});
 assert.throws(()=>a.save(new Progress(pattern).backup()),/anderen Fenster/);
 assert.equal(await a.acquireWriteLock(manager),true);
 assert.equal(await b.acquireWriteLock(manager),false);
 const other=new ProjectStore(storage,{...pattern,id:'other'},{requireLock:true});
 assert.equal(await other.acquireWriteLock(manager),true);
 a.save(new Progress(pattern).backup());a.releaseWriteLock();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(await b.acquireWriteLock(manager),true);
 assert.throws(()=>b.save(new Progress(pattern).backup()),StorageConflict);
 b.read();b.save(new Progress(pattern).backup());b.releaseWriteLock();other.releaseWriteLock();
});
test('quota failure preserves stored stitches; confirmed repair retains recovery',()=>{
 const {storage,map}=setup(),store=new ProjectStore(storage,pattern),p=new Progress(pattern);
 p.states[0]=2;store.save(p.backup());p.states[1]=2;store.save(p.backup());const old=store.read(),recovery=JSON.stringify(store.recovery());
 const set=storage.setItem;storage.setItem=()=>{throw Error('quota');};p.states[2]=2;assert.throws(()=>store.save(p.backup()),/quota/);assert.equal(store.read(),old);
 storage.setItem=set;map.set(store.key,'corrupt');store.read();assert.throws(()=>store.save(p.backup()));
 store.save(JSON.parse(recovery),{replaceCorrupt:true});assert.equal(JSON.stringify(store.recovery()),recovery);assert.deepEqual(JSON.parse(store.read()).done,[0]);
});
