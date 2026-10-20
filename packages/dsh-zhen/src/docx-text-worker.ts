import {parseDocx,DOCX_LIMITS} from './docx-parse.ts';
if(!process.connected)process.exit(1);process.once('disconnect',()=>process.exit(1));
process.once('message',(input:unknown)=>{
 let output:unknown={ok:false,code:'INVALID'};
 try{if(!input||typeof input!=='object'||!('bytes'in input)||!(input.bytes instanceof Uint8Array)||input.bytes.byteLength>DOCX_LIMITS.inputBytes)throw Error('INVALID');globalThis.fetch=async()=>{throw Error('NETWORK_DISABLED');};output={ok:true,text:parseDocx(input.bytes)};}
 catch(error){const code=error instanceof Error?error.message:'';output={ok:false,code:['LIMIT','TEXT_LIMIT','UNSUPPORTED'].includes(code)?code:'INVALID'};}
 if(process.send)process.send(output,()=>process.exit(0));else process.exit(1);
});
