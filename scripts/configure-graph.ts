/** Explicit FalkorDB-only secret transfer to the approved development deployment. */
import {config} from 'dotenv';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
config({path:'.env',quiet:true});
async function main(){
 const url=process.env.FALKORDB_URL;if(!url)throw new Error('FALKORDB_URL is missing');
 await promisify(execFile)(process.execPath,['node_modules/convex/bin/main.js','env','set','--deployment','resilient-llama-452','FALKORDB_URL',url],{maxBuffer:1024*1024});
 console.log('PASS FalkorDB URL stored in approved deployment resilient-llama-452; no other credentials accessed');
}
main().catch(()=>{console.error('FalkorDB-only secret configuration failed; secret values not logged');process.exitCode=1;});
