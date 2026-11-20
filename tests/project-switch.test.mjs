import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {IDBFactory} from 'fake-indexeddb';
import {LocalProjects} from '../public/local-project.mjs';
import {ProjectStore} from '../public/project-store.mjs';
import {Progress} from '../public/progress.mjs';
function second(){const p=structuredClone(fixture);p.pattern.id='second-project';p.progress.patternId=p.pattern.id;p.pattern.title='Second';return p;}
test('add, activate and reopen preserve separate saved progress for both projects',async()=>{
 const idb=new IDBFactory(),projects=new LocalProjects(idb),a=fixture,b=second();
 const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
 await projects.put(a);const pa=new Progress(a.pattern);pa.restore(a.progress);pa.states[0]=3;new ProjectStore(storage,a.pattern).save(pa.backup());
 await projects.put(b);const pb=new Progress(b.pattern);pb.restore(b.progress);pb.states[1]=2;new ProjectStore(storage,b.pattern).save(pb.backup());
 assert.equal((await projects.load()).id,b.pattern.id);await projects.activate(a.pattern.id);assert.equal((await new LocalProjects(idb).load()).id,a.pattern.id);
 assert.equal(JSON.parse(new ProjectStore(storage,a.pattern).read()).parked.includes(0),true);
 assert.equal(JSON.parse(new ProjectStore(storage,b.pattern).read()).done.includes(1),true);
 assert.deepEqual((await projects.list(record=>({id:record.id}))).map(r=>r.id).sort(),[a.pattern.id,b.pattern.id].sort());
 await projects.put(a);assert.equal(JSON.parse(new ProjectStore(storage,a.pattern).read()).parked.includes(0),true);
});
test('reimport accepts key reordering and rejects changed images atomically',async()=>{
 const projects=new LocalProjects(new IDBFactory());await projects.put(fixture);const reordered=structuredClone(fixture);reordered.pattern=Object.fromEntries(Object.entries(reordered.pattern).reverse());await projects.put(reordered);
 const changed=structuredClone(fixture);changed.overview='data:image/png;base64,'+Buffer.concat([Buffer.from(changed.overview.slice(22),'base64'),Buffer.from([0,0,0])]).toString('base64');
 await assert.rejects(projects.put(changed),/anderen Musterbildern/);assert.equal((await projects.load()).pkg.overview,fixture.overview);
 await assert.rejects(projects.activate('missing'),/nicht mehr vorhanden/);assert.equal((await projects.load()).id,fixture.pattern.id);
});
test('damaged active template does not prevent listing or activating another project',async()=>{
 const projects=new LocalProjects(new IDBFactory());await projects.put(fixture);const b=second();await projects.put(b);
 const db=await projects.open();await new Promise((resolve,reject)=>{const tx=db.transaction('templates','readwrite');tx.objectStore('templates').put({id:b.pattern.id,pkg:{pattern:{id:b.pattern.id,title:'Damaged'}}});tx.oncomplete=resolve;tx.onabort=reject;});db.close();
 assert.equal((await projects.list()).length,2);await assert.rejects(projects.activate(b.pattern.id));await projects.activate(fixture.pattern.id);assert.equal((await projects.load()).id,fixture.pattern.id);
});
