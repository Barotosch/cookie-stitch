import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,rm,readFile,readdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareRelease,PUBLIC_FILES} from '../package-tools.mjs';
const source=fileURLToPath(new URL('../public',import.meta.url));
async function setup(t){const dir=await mkdtemp(path.join(tmpdir(),'cookie-release-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));const publicDir=path.join(dir,'public'),out=path.join(dir,'out');await cp(source,publicDir,{recursive:true});return {publicDir,out};}
test('failed ZIP creation changes no source files',async t=>{
 const opts=await setup(t),before=await Promise.all(PUBLIC_FILES.map(name=>readFile(path.join(opts.publicDir,name))));
 await assert.rejects(prepareRelease({...opts,bump:'patch',zip:()=>{throw Error('ZIP failed');}}),/ZIP failed/);
 for(let i=0;i<PUBLIC_FILES.length;i++)assert.deepEqual(await readFile(path.join(opts.publicDir,PUBLIC_FILES[i])),before[i]);
 assert.deepEqual(await readdir(opts.out),[]);
});
test('release stages and verifies only public files; archive cannot be overwritten',async t=>{
 const opts=await setup(t),result=await prepareRelease({...opts,bump:'patch'});assert.match(await readFile(path.join(opts.publicDir,'sw.js'),'utf8'),new RegExp('local-'+result.version.replaceAll('.','\\.')));
 const archive=await readFile(result.archive);
 await cp(source,opts.publicDir,{recursive:true});await assert.rejects(prepareRelease({...opts,bump:'patch'}),/already exists/);assert.deepEqual(await readFile(result.archive),archive);
});
test('private references stop packaging before any source changes',async t=>{
 const opts=await setup(t),html=await readFile(path.join(opts.publicDir,'index.html'),'utf8');await writeFile(path.join(opts.publicDir,'app.mjs'),'// chart.pdf');
 await assert.rejects(prepareRelease({...opts,bump:'patch'}),/Private data/);assert.equal(await readFile(path.join(opts.publicDir,'index.html'),'utf8'),html);
});
