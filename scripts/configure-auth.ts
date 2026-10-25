/** Initialize newly generated auth keys only. Does not read .env or supplied API credentials. */
import {config} from 'dotenv';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {generateKeyPair,exportPKCS8,exportJWK} from 'jose';
config({path:'.env.local',quiet:true});
const run=promisify(execFile);
async function cli(args:string[]) {
 try {return await run(process.execPath,['node_modules/convex/bin/main.js',...args],{maxBuffer:1024*1024});}
 catch(error){
  const output=(error as {stderr?:string}).stderr??'';
  console.error(`Failed auth operation: ${args.slice(0,3).join(' ')}`);
  console.error(output.replace(/-----BEGIN[\s\S]*?-----END[^\n]*/g,'[redacted generated key]').replace(/"keys"[\s\S]*/g,'[redacted public key]'));
  throw new Error('Auth operation failed');
 }
}
async function main(){
 let exists=false;try{const r=await cli(['env','get','JWKS']);exists=r.stdout.includes('keys');}catch{}
 if(!exists){
  const keys=await generateKeyPair('RS256',{extractable:true});
  const privateKey=await exportPKCS8(keys.privateKey);
  const publicKey=await exportJWK(keys.publicKey);
  await cli(['env','set','JWT_PRIVATE_KEY','--',privateKey.trimEnd().replace(/\n/g,' ')]);
  await cli(['env','set','JWKS',JSON.stringify({keys:[{use:'sig',...publicKey}]})]);
 }
 await cli(['env','set','SITE_URL','http://localhost:5173']);
 console.log('PASS Anonymous authentication keys configured; supplied credentials were not accessed');
}
main().catch(()=>{console.error('Auth-only configuration failed. No secret values logged.');process.exitCode=1;});
