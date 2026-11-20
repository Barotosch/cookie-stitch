import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const moduleText=readFileSync(new URL('../public/i18n.mjs',import.meta.url),'utf8').replace(/^export /gm,'');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const keys=[...html.matchAll(/data-i18n(?:-[\w-]+)?="([^"]+)"/g)].map(match=>match[1]);

test('first launch is English and a saved German choice survives reload',()=>{
 const values=new Map();
 const localStorage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
 function run(code){return vm.runInNewContext(moduleText+'\n'+code,{localStorage,keys});}
 assert.equal(run('language'), 'en');
 assert.equal(run("fmt(1234)+' / '+t('projects')"),'1,234 / My projects');
 run("rememberLanguage('de')");
 assert.equal(run('language'),'de');
 assert.equal(run("fmt(1234)+' / '+t('projects')"),'1.234 / Meine Projekte');
 assert.ok(run('keys.every(key=>t(key).length>0)'));
 assert.equal(run("errorText(new AppError('invalidBackup'))"),'Bitte eine gültige Cookie-Stitch-Sicherung auswählen.');
 run("rememberLanguage('en')");
 assert.equal(run('language'),'en');
 assert.ok(run('keys.every(key=>t(key).length>0)'));
});
