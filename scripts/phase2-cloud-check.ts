import {config} from 'dotenv';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {ConvexHttpClient} from 'convex/browser';
import {api} from '../convex/_generated/api';
import {talks,people} from '../packages/core/data';
import {DEFAULT_TOPIC_IDS,isPublicProof} from '../packages/core/intelligence';
config({path:'.env.local',quiet:true});
const result:Record<string,boolean|number|string>={};
async function until<T>(read:()=>Promise<T>,accept:(value:T)=>boolean):Promise<T>{for(let i=0;i<50;i++){const value=await read();if(accept(value))return value;await new Promise(r=>setTimeout(r,350));}throw new Error('Backend state did not converge');}
async function main(){
 const url=process.env.CONVEX_URL;if(!url)throw new Error('Missing CONVEX_URL');
 const a=new ConvexHttpClient(url),b=new ConvexHttpClient(url),desktop=new ConvexHttpClient(url),guest=new ConvexHttpClient(url);
 const clients=[a,b,desktop];let sessionId:any;
 try{
  for(const client of clients){const s=await client.action(api.auth.signIn,{provider:'anonymous'});assert.ok(s.tokens?.token);client.setAuth(s.tokens.token);}
  const beforeB=await b.query(api.preferences.mine,{});
  assert.deepEqual((await guest.query(api.preferences.mine,{})).topicIds,DEFAULT_TOPIC_IDS);result.deployedDefaultsMatchRepository=true;
  const rev=await a.mutation(api.preferences.setInterests,{topicIds:['opensource']});
  await a.mutation(api.preferences.toggleBookmark,{talkId:talks[0].id});await a.mutation(api.preferences.markMet,{personId:people[0].id});
  assert.deepEqual(await b.query(api.preferences.mine,{}),beforeB);result.privateIdentitiesIsolated=true;
  let rejected=false;try{await guest.mutation(api.preferences.setInterests,{topicIds:['ai']});}catch{rejected=true;}assert.ok(rejected);result.unauthenticatedWritesRejected=true;
  const state=await until(()=>a.query(api.intelligence.mine,{}),s=>s.status==='ready'&&s.revision===rev);
  assert.ok(state.talks.length>0&&state.talks.every(r=>r.topicId==='opensource'&&isPublicProof(r.proof)));result.serverStoredInterestsDriveResults=true;
  rejected=false;try{await a.action(api.graph.recommend,{topicIds:['ai']} as never);}catch{rejected=true;}assert.ok(rejected);result.clientSuppliedRecommendationTopicsRejected=true;
  const snapshot=await guest.action(api.graph.bootstrap,{});assert.ok(snapshot.graph.nodes.every(n=>['Talk','Topic','Speaker','Room'].includes(n.kind)));result.publicGraphExcludesAttendees=true;
  for(const r of state.talks)for(const edge of r.proof.edges)assert.ok(snapshot.graph.links.some(l=>l.source===edge.source&&l.target===edge.target&&l.kind===edge.kind));result.returnedDirectedPathsExistInLiveGraph=true;
  const c=await desktop.mutation(api.presentation.create,{});sessionId=c.sessionId;
  assert.equal((await a.mutation(api.presentation.pair,{code:c.code,approvedTopicIds:['opensource']})).ok,true);
  assert.equal((await b.mutation(api.presentation.pair,{code:c.code,approvedTopicIds:['opensource']})).ok,false);result.singleUsePairing=true;
  assert.equal(await b.query(api.presentation.desktop,{sessionId}),null);result.unpairedDesktopCannotReadSession=true;
  let stage=await until(()=>desktop.query(api.presentation.desktop,{sessionId}),s=>s?.status==='live'&&!!s.proof);
  assert.deepEqual(Object.keys(stage!).sort(),['status','expiresAt','codeExpiresAt','revision','proof','updatedAt'].sort());
  assert.ok(stage?.proof&&isPublicProof(stage.proof));assert.ok(state.talks.some(r=>JSON.stringify(r.proof)===JSON.stringify(stage!.proof)));result.sanitizedStageProofMatchesPrivateReturnedProof=true;
  await a.mutation(api.presentation.updateConsent,{sessionId,approvedTopicIds:[]});assert.equal((await desktop.query(api.presentation.desktop,{sessionId}))?.proof,null);result.clearConsentRemovesProof=true;
  await a.mutation(api.presentation.updateConsent,{sessionId,approvedTopicIds:['opensource']});
  const next=await a.mutation(api.preferences.setInterests,{topicIds:['security']});
  await until(()=>a.query(api.intelligence.mine,{}),s=>s.status==='ready'&&s.revision===next);
  stage=await desktop.query(api.presentation.desktop,{sessionId});assert.equal(stage?.proof,null);result.unsharedInterestNeverPublished=true;
  await a.mutation(api.presentation.updateConsent,{sessionId,approvedTopicIds:['security']});
  stage=await until(()=>desktop.query(api.presentation.desktop,{sessionId}),s=>s?.status==='live'&&!!s.proof);
  assert.ok(stage?.proof?.nodes.some(n=>n.id==='security'&&n.kind==='Topic'));result.consentScopeChangePublishesApprovedPath=true;
  await Promise.all([a.mutation(api.preferences.setInterests,{topicIds:['ai']}),a.mutation(api.preferences.setInterests,{topicIds:['opensource']}),a.mutation(api.preferences.setInterests,{topicIds:['security']})]);
  const latest=await a.query(api.preferences.mine,{});const completed=await until(()=>a.query(api.intelligence.mine,{}),s=>s.status==='ready'&&s.revision===latest.revision);
  assert.ok(completed.talks.every(r=>latest.topicIds.includes(r.topicId)));result.rapidInterestChangesConvergeOnLatestRevision=true;
  await a.mutation(api.presentation.revoke,{sessionId});await a.mutation(api.intelligence.retry,{});assert.equal((await desktop.query(api.presentation.desktop,{sessionId}))?.status,'revoked');assert.equal((await desktop.query(api.presentation.desktop,{sessionId}))?.proof,null);result.revocationPersistsAcrossRecalculation=true;
  result.publicNodes=snapshot.counts.nodes;result.publicEdges=snapshot.counts.edges;
 }finally{if(sessionId)await desktop.mutation(api.presentation.revoke,{sessionId}).catch(()=>{});for(const client of clients)await client.action(api.auth.signOut,{}).catch(()=>{});}
 result.checkedAt=new Date().toISOString();await writeFile('phase2-cloud-verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}
main().catch(()=>{console.error('FAIL Phase 2 cloud verification. No tokens or secret values logged.');process.exitCode=1;});
