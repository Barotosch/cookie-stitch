import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
function worker(fetch){
 const shell={name:'offline-shell'},timers=[];
 const context=vm.createContext({self:{addEventListener(){}},fetch,AbortController,Response,caches:{open:async()=>({match:async()=>shell})},setTimeout(fn){timers.push(fn);return 1;},clearTimeout(){}});
 vm.runInContext(source,context);
 return {context,timers,shell};
}
test('offline shell is returned for a disconnected or failing host',async()=>{
 for(const fetch of [async()=>{throw Error('offline');},async()=>({status:503})]){
  const {context,shell}=worker(fetch);assert.equal(await vm.runInContext('navigate({})',context),shell);
 }
});
test('a hanging network request is aborted and returns the offline shell',async()=>{
 const {context,timers,shell}=worker((_,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')))));
 const pending=vm.runInContext('navigate({})',context);timers[0]();assert.equal(await pending,shell);
});
test('healthy navigation response is retained',async()=>{
 const response={status:200}, {context}=worker(async()=>response);assert.equal(await vm.runInContext('navigate({})',context),response);
});

test('a worker that never becomes ready shows the offline fallback',async()=>{
 const source=readFileSync(new URL('../public/local-boot.mjs',import.meta.url),'utf8');
 const offlineSource=source.slice(source.indexOf('function withinTimeout')).replace('export async','async');
 const timer=[],status={};
 const context=vm.createContext({
  $:()=>status,t:key=>key,
  navigator:{serviceWorker:{register:async()=>{},ready:new Promise(()=>{})}},
  setTimeout(fn){timer.push(fn);return 1;},clearTimeout(){}
 });
 const pending=vm.runInContext(offlineSource+'\nprepareOffline();',context);
 timer[0]();
 await pending;
 assert.equal(status.textContent,'offlineFailed');
});
