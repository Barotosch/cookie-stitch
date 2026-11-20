// Synthetic data only: no private template, imported progress or user images.
import {deflateSync} from 'node:zlib';
import {Progress} from '../public/progress.mjs';
function chunk(type,data){
 const name=Buffer.from(type),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);
 let value=0xffffffff;for(const byte of Buffer.concat([name,data])){value^=byte;for(let bit=0;bit<8;bit++)value=value&1?(value>>>1)^0xedb88320:value>>>1;}
 crc.writeUInt32BE((value^0xffffffff)>>>0);return Buffer.concat([length,name,data,crc]);
}
function png(width,height){
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;
 const pixels=Buffer.alloc(height*(width*3+1),255);for(let y=0;y<height;y++)pixels[y*(width*3+1)]=0;
 return 'data:image/png;base64,'+Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]).toString('base64');
}
const pattern={id:'synthetic-project',sourceHash:'a'.repeat(64),sourceName:'synthetic',title:'Synthetic template',width:12,height:10,cells:Array.from({length:120},(_,i)=>i%2),palette:[{dmc:'310',hex:'#000000',count:60},{dmc:'300',hex:'#b37b33',count:60}],pages:[{page:1,x:0,y:0,width:12,height:10}]};
const state=new Progress(pattern);for(const i of [0,2,4])state.states[i]=2;state.states[1]=3;state.states[3]=4;
export const fixture={app:'cookie-stitch-project',version:1,pattern,symbols:png(720,336),overview:png(512,900),progress:state.backup()};
