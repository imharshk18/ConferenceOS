import {config} from 'dotenv';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {ConvexHttpClient} from 'convex/browser';
import {api} from '../convex/_generated/api';
config({path:'.env.local',quiet:true});
const url=process.env.CONVEX_URL!,client=new ConvexHttpClient(url);
async function main(){
const auth=await client.action(api.auth.signIn,{provider:'anonymous'});
assert.ok(auth.tokens?.token);client.setAuth(auth.tokens.token);
let captureId:any,connectionId:any;
try{
 await client.mutation(api.demo.useHarsh,{});
 ({connectionId}=await client.mutation(api.demo.connect,{code:'123456'}));
 captureId=await client.mutation(api.captures.create,{kind:'conversation',title:'Submission QA — synthetic audio',notes:'Synthetic test only; no real meeting or commitments.',connectionId,consentConfirmed:true,autoSaveDemo:true});
 const body=await readFile('work/phase4/synthetic-conversation.wav');
 for(let i=0;i<2;i++){
  const response:Response=await fetch(`${url.replace('.convex.cloud','.convex.site')}/capture-upload?captureId=${captureId}`,{method:'POST',headers:{Authorization:`Bearer ${auth.tokens.token}`,'Content-Type':'audio/wav','X-Upload-Key':'submission-audio-retry'},body});
  assert.equal(response.status,200);
 }
 assert.equal((await client.query(api.captures.mine,{}))[0].attachmentCount,1);
 console.log('PASS authenticated audio upload + idempotent retry');
 await client.mutation(api.captures.analyze,{captureId,revision:1});
 const deadline=Date.now()+115000;
 while(Date.now()<deadline){
  const capture=(await client.query(api.captures.mine,{}))[0];
  if(capture.status==='error')throw new Error(capture.error??'Analysis failed');
  if(capture.status==='approved'){
   assert.ok(capture.transcript);assert.equal(capture.draftOrigin,'openai');
   console.log('PASS real OpenAI transcription + automatic synthetic context save');
   const graph=await client.query(api.network.mine,{});
   if(graph?.status==='ready'&&graph.graph.nodes.some(n=>n.id===`memory:${capture.memoryId}`)){
    assert.ok(graph.graph.edges.some(e=>e.kind==='REMEMBERS'));
    console.log('PASS FalkorDB returned new memory node and REMEMBERS relationship');break;
   }
  }
  await new Promise(r=>setTimeout(r,2000));
 }
 const graph=await client.query(api.network.mine,{});assert.equal(graph?.status,'ready');
}finally{
 if(captureId)await client.mutation(api.captures.remove,{captureId}).catch(()=>{});
 if(connectionId)await client.mutation(api.social.revokeConnection,{connectionId}).catch(()=>{});
 await client.action(api.auth.signOut,{}).catch(()=>{});
 console.log('Synthetic QA capture and connection removed; no phone call placed.');
}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
