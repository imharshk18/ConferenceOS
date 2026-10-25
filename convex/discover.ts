import {query} from './_generated/server';
import {getAuthUserId} from '@convex-dev/auth/server';
import {profileFor} from './socialState';
import {talks,topics} from '../packages/core/data';
import {NETWORK_AREAS} from '../packages/core/network';
const terms:Record<string,string[]>={content:['creator','content','storytelling'],product:['product','design','user experience'],founders:['startup','founder','entrepreneur'],growth:['community','growth','collaboration'],design:['design','user experience'],research:['research']};
/** Program-text matches are clearly separate from verified FalkorDB traversals. */
export const mine=query({args:{},handler:async ctx=>{
 const userId=await getAuthUserId(ctx);if(!userId)return {personalized:false,items:[]};
 const profile=await profileFor(ctx,userId);if(!profile)return {personalized:false,items:[]};
 const recommendations=await ctx.db.query('recommendations').withIndex('by_userId',q=>q.eq('userId',userId)).unique();
 const items=talks.map(talk=>{
  const text=`${talk.title} ${talk.subtitle}`.toLowerCase(),areas=profile.networkAreas??profile.skillIds;
  const hits=areas.flatMap(id=>(terms[id]??[]).filter(word=>text.includes(word)).map(word=>({id,word})));
  const proof=recommendations?.status==='ready'&&recommendations.source==='live'?recommendations.talks.find(t=>t.talkId===talk.id&&profile.skillIds.includes(t.topicId)):undefined;
  const topic=proof?topics.find(t=>t.id===proof.topicId):null;
  const first=hits[0],area=first?NETWORK_AREAS.find(a=>a.id===first.id):null;
  return {talkId:talk.id,score:(proof?10:0)+hits.length,kind:proof?'graph':'program-text',reason:proof?`You’re interested in ${topic?.name??'this topic'}. This session and its speaker are connected to that topic in the conference program.`:first?`You’re looking to grow your ${area?.label.toLowerCase()} network. This session’s published description covers ${first.word}.`:''};
 }).filter(t=>t.score>0).sort((a,b)=>b.score-a.score).slice(0,8);
 return {personalized:true,items};
}});
