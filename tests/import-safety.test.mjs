import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {validateProject,validateImage,exportProject,MAX_FILE_BYTES,sameTemplate,minimapRect} from '../public/local-project.mjs';
test('wrong field types and invalid page addresses are rejected before use',()=>{
 for(const edit of [p=>p.pattern.palette[0].dmc=310,p=>p.pattern.palette[0].hex=['#000000'],p=>p.pattern.id=123,p=>p.pattern.palette[0].symbol={},p=>p.pattern.pages[0].x=-1,p=>p.pattern.pages[0].width=p.pattern.width+1,p=>p.progress.achievements.seenColors=[105]]){
  const pkg=structuredClone(fixture);edit(pkg);assert.throws(()=>validateProject(pkg));
 }
});
test('PNG dimensions are checked before any browser image decoding',()=>{
 const bytes=Buffer.from(fixture.symbols.slice(22),'base64');bytes.writeUInt32BE(100000,16);
 assert.throws(()=>validateImage('data:image/png;base64,'+bytes.toString('base64'),'symbols'),/Bildgrößen/);
 assert.equal(validateImage(fixture.overview,'overview'),fixture.overview);
});
test('unknown data is not exported; backups above the former 10 MiB limit round-trip',()=>{
 const pkg=structuredClone(fixture);pkg.extra='x'.repeat(11_000_000);pkg.pattern.extra='x'.repeat(100);pkg.progress.view.extra='secret';
 const normalized=validateProject(pkg);assert.ok(!('extra' in normalized));assert.ok(!('extra' in normalized.pattern));assert.ok(!('extra' in normalized.progress.view));
 // Valid PNGs allow trailing bytes. Keep a complete PNG and a valid base64 encoding.
 const large=structuredClone(fixture),image=Buffer.from(fixture.overview.slice(22),'base64');
 large.overview='data:image/png;base64,'+Buffer.concat([image,Buffer.alloc(7_900_000*3/4-image.length)]).toString('base64');
 const symbols=Buffer.from(fixture.symbols.slice(22),'base64');
 large.symbols='data:image/png;base64,'+Buffer.concat([symbols,Buffer.alloc(7_900_000*3/4-symbols.length)]).toString('base64');
 const content=exportProject(large,large.progress);assert.ok(content.length>10*1024*1024);assert.ok(content.length<MAX_FILE_BYTES);
 assert.deepEqual(validateProject(JSON.parse(content)).progress.done,fixture.progress.done);
});
test('template identity ignores object key order, but binds both images',()=>{
 const a=validateProject(fixture),b=validateProject(fixture);
 b.pattern=Object.fromEntries(Object.entries(b.pattern).reverse());b.pattern.palette=b.pattern.palette.map(c=>Object.fromEntries(Object.entries(c).reverse()));
 assert.equal(sameTemplate(a,b),true);b.symbols=b.overview;assert.equal(sameTemplate(a,b),false);
});
test('minimap viewport uses actual landscape and portrait dimensions',()=>{
 const landscape=minimapRect({width:420,height:295},{x:-6000,y:-2000,size:20},500,500,128,90);
 assert.ok(landscape.x>91&&landscape.x<93);assert.ok(landscape.w>7&&landscape.w<8);assert.ok(landscape.h>7&&landscape.h<8);
 const portrait=minimapRect({width:256,height:450},{x:24,y:24,size:2},280,474,128,225);
 assert.deepEqual(portrait,{x:0,y:0,w:64,h:112.5});
});
