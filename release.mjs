import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {prepareRelease} from './package-tools.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const result=await prepareRelease({publicDir:path.join(here,'public'),out:path.join(here,'releases'),bump:process.argv[2]});
console.log(`Prepared Cookie Stitch ${result.version}\n${result.archive}\nNot deployed.`);
