import {readFile,writeFile,readdir,mkdir,mkdtemp,rename,rm,link} from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

export const PUBLIC_FILES=['_headers','achievements.mjs','app.mjs','celebrations.mjs','cookie-icon-32.png','cookie-icon-180.png','cookie-icon-192.png','cookie-icon-512.png','cookie-icon-maskable.png','index.html','i18n.mjs','local-boot.mjs','local-project.mjs','manifest.webmanifest','progress.mjs','project-store.mjs','style.css','sw.js'].sort();
export async function readPublicFiles(directory){
 const actual=(await readdir(directory)).sort();
 if(JSON.stringify(actual)!==JSON.stringify(PUBLIC_FILES))throw Error('Unexpected public files; release stopped');
 const files=new Map();
 for(const name of PUBLIC_FILES){
  const bytes=await readFile(path.join(directory,name));
  if(!name.endsWith('.png')&&/\.pdf\b|\/Users\/|\.cookie-stitch\.json\b/i.test(bytes.toString()))throw Error('Private data/reference in public file '+name);
  files.set(name,bytes);
 }
 return files;
}
export async function atomicWrite(file,content){
 const temp=await mkdtemp(path.join(path.dirname(file),'.cookie-write-'));
 try{const staged=path.join(temp,'file');await writeFile(staged,content);await rename(staged,file);}finally{await rm(temp,{recursive:true,force:true});}
}
export async function prepareRelease({publicDir,out,bump,zip=execFileSync}){
 if(!['patch','minor','major'].includes(bump))throw Error('Usage: node cloudflare/release.mjs patch|minor|major');
 const originals=await readPublicFiles(publicDir),html=originals.get('index.html').toString();
 const match=html.match(/Version (\d+)\.(\d+)(?:\.(\d+))?</);
 if(!match)throw Error('Cannot find current app version');
 let [major,minor,patch]=[Number(match[1]),Number(match[2]),Number(match[3]||0)];
 if(bump==='major'){major++;minor=0;patch=0;}else if(bump==='minor'){minor++;patch=0;}else patch++;
 const version=`${major}.${minor}.${patch}`,files=new Map(originals);
 for(const [name,bytes] of originals){
  if(!/\.(html|mjs|js|css)$/.test(name))continue;
  let source=bytes.toString().replace(/\?v=[A-Za-z0-9._-]+/g,`?v=${version}`);
  if(name==='index.html')source=source.replace(match[0],`Version ${version}<`);
  if(name==='sw.js'){
   if(!/const CACHE='cookie-stitch-local-[^']+';/.test(source))throw Error('Cannot find offline cache version');
   source=source.replace(/const CACHE='cookie-stitch-local-[^']+';/,`const CACHE='cookie-stitch-local-${version}';`);
  }
  files.set(name,Buffer.from(source));
 }
 await mkdir(out,{recursive:true});
 const archive=path.join(out,`UPLOAD-cookie-stitch-app-${version}.zip`);
 try{await readFile(archive);throw Error('Release archive already exists');}catch(error){if(error.code!=='ENOENT')throw error;}
 const stage=await mkdtemp(path.join(out,'.cookie-release-')),changed=[];
 try{
  for(const [name,bytes] of files)await writeFile(path.join(stage,name),bytes);
  const stagedArchive=path.join(stage,'release.zip');
  zip('/usr/bin/zip',['-q',stagedArchive,...PUBLIC_FILES],{cwd:stage});
  const entries=execFileSync('/usr/bin/unzip',['-Z1',stagedArchive],{encoding:'utf8'}).trim().split('\n').sort();
  if(JSON.stringify(entries)!==JSON.stringify(PUBLIC_FILES))throw Error('Release archive contains unexpected files');
  for(const [name,bytes] of files){if(!execFileSync('/usr/bin/unzip',['-p',stagedArchive,name],{maxBuffer:16_000_000}).equals(bytes))throw Error('Release archive verification failed: '+name);}
  try{
   for(const [name,bytes] of files){changed.push(name);await atomicWrite(path.join(publicDir,name),bytes);}
   // link refuses an existing archive, including one created by a competing run.
   await link(stagedArchive,archive);
  }catch(error){
   for(const name of changed)await atomicWrite(path.join(publicDir,name),originals.get(name));
   throw error;
  }
  return {version,archive};
 }finally{await rm(stage,{recursive:true,force:true});}
}
