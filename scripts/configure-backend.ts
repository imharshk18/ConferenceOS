/** Authentication only by default. Graph secret upload is an explicit separate command. */
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile);
async function main(){
 const {stdout}=await run(process.execPath,['--import','tsx','scripts/configure-auth.ts'],{maxBuffer:1024*1024});
 process.stdout.write(stdout);
 console.log('Graph secret setup, when authorized: node --import tsx scripts/configure-graph.ts');
}
main().catch(()=>{console.error('Auth configuration failed; no supplied credentials read or uploaded');process.exitCode=1;});
