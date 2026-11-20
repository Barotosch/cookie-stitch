import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,readdirSync} from 'node:fs';import {exportProject,validateProject} from '../public/local-project.mjs';import {Progress} from '../public/progress.mjs';
import {PUBLIC_FILES} from '../package-tools.mjs';
import {fixture as pkg} from './fixture.mjs';
test('synthetic project round trips with exact progress, parking and collection metadata',()=>{const project=validateProject(pkg),p=new Progress(project.pattern);p.restore(project.progress);const b=validateProject(JSON.parse(JSON.stringify({...project,progress:p.backup()})));assert.deepEqual(b.progress.done,project.progress.done);assert.deepEqual(b.progress.parked,project.progress.parked||[]);assert.equal(b.pattern.cells.length,120);assert.equal(b.progress.review.length,1);assert.equal(b.progress.done.length,3);});
test('malformed pattern, injection, mismatched progress, and external images are rejected',()=>{for(const edit of [p=>p.pattern.width++,p=>p.pattern.palette[0].dmc='<img>',p=>p.pattern.palette[0].count++,p=>p.pattern.cells[0]=999,p=>p.symbols='https://example.com/image.png',p=>p.progress.sourceHash='wrong',p=>p.pattern.id='../escape']){const p=structuredClone(pkg);edit(p);assert.throws(()=>validateProject(p));}});
test('public upload is an explicit allowlist and contains no PDFs, project data, scans or personal exports',()=>{const files=readdirSync(new URL('../public/',import.meta.url));assert.deepEqual(files.sort(),PUBLIC_FILES);assert.ok(files.includes('index.html'));for(const f of files){assert.ok(!/\.pdf$|pattern\.json|symbols\.png|overview\.png|comparison|fairy|PRIVATE|\.openai/.test(f));if(f.endsWith('.png'))continue;const t=readFileSync(new URL('../public/'+f,import.meta.url),'utf8');assert.ok(!/stichzeit-pokemon|epic-pokemon|@icloud|115200/.test(t),f);}});

test('project export and import preserve alphanumeric and named DMC codes',()=>{
 for(const dmc of ['B5200','ECRU','BLANC','White','e310','310']){
  const project=structuredClone(pkg);
  project.pattern.palette[0].dmc=dmc;
  const saved=JSON.parse(exportProject(project,project.progress));
  assert.equal(validateProject(saved).pattern.palette[0].dmc,dmc);
 }
 for(const dmc of [' B5200','5200B','B-5200','1234567','<svg>','blue']){
  const project=structuredClone(pkg);
  project.pattern.palette[0].dmc=dmc;
  assert.throws(()=>validateProject(project));
 }
});
