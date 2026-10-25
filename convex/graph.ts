"use node";
import {v} from 'convex/values';
import {action} from './_generated/server';
import {internal} from './_generated/api';
import {sessionRecommendation,personRecommendation} from './validators';
import type {SessionRecommendation,PersonRecommendation} from '../packages/core/intelligence';
import {talks,speakers,topics,people,rooms,event} from '../packages/core/data';
import {graphSnapshot,recommendGraph} from '../packages/core/graph';
const talk=v.object({id:v.string(),title:v.string(),subtitle:v.string(),speakerId:v.string(),topicIds:v.array(v.string()),roomId:v.string(),time:v.string(),end:v.string(),day:v.number(),duration:v.number(),track:v.string(),format:v.string(),color:v.string(),featured:v.boolean()});
const person=v.object({id:v.string(),name:v.string(),role:v.string(),company:v.string(),initials:v.string(),color:v.string(),topicIds:v.array(v.string()),city:v.string(),latitude:v.number(),longitude:v.number(),demo:v.boolean()});
// The globe-only desktop does not need legacy demo personas or their profile metadata.
export const publicSnapshot=action({args:{},returns:v.object({nodes:v.array(v.object({id:v.string(),kind:v.string(),label:v.string()})),links:v.array(v.object({source:v.string(),target:v.string(),kind:v.string()})),counts:v.object({nodes:v.number(),edges:v.number()})}),handler:async()=>graphSnapshot()});
export const bootstrap=action({args:{},returns:v.object({talks:v.array(talk),speakers:v.array(v.object({id:v.string(),name:v.string(),role:v.string(),company:v.string(),initials:v.string(),color:v.string()})),topics:v.array(v.object({id:v.string(),name:v.string(),color:v.string()})),people:v.array(person),rooms:v.array(v.object({id:v.string(),name:v.string()})),event:v.object({name:v.string(),date:v.string(),venue:v.string(),demo:v.boolean()}),graph:v.object({nodes:v.array(v.object({id:v.string(),kind:v.string(),label:v.string()})),links:v.array(v.object({source:v.string(),target:v.string(),kind:v.string()}))}),counts:v.object({nodes:v.number(),edges:v.number()}),source:v.literal('live')}),handler:async()=>{
 const {nodes,links,counts}=await graphSnapshot();
 // Keep the public API contract deliberately bounded; source provenance remains in the shared official data module.
 return {talks:talks.map(t=>({id:t.id,title:t.title,subtitle:t.subtitle,speakerId:t.speakerId,topicIds:t.topicIds,roomId:t.roomId,time:t.time,end:t.end,day:t.day,duration:t.duration,track:t.track,format:t.format,color:t.color,featured:t.featured})),speakers:speakers.map(s=>({id:s.id,name:s.name,role:s.role,company:s.company,initials:s.initials,color:s.color})),topics:topics.map(t=>({id:t.id,name:t.name,color:t.color})),people:people.map(p=>({id:p.id,name:p.name,role:p.role,company:p.company,initials:p.initials,color:p.color,topicIds:p.topicIds,city:p.city,latitude:p.latitude,longitude:p.longitude,demo:p.demo})),rooms:rooms.map(r=>({id:r.id,name:r.name})),event:{name:event.name,date:event.date,venue:event.venue,demo:event.demo},graph:{nodes,links},counts,source:'live' as const};
}});
export const recommend=action({args:{},returns:v.object({talks:v.array(sessionRecommendation),people:v.array(personRecommendation),source:v.literal('live')}),handler:async(ctx):Promise<{talks:SessionRecommendation[];people:PersonRecommendation[];source:'live'}>=>{
 const input=await ctx.runQuery(internal.intelligence.authenticatedInput,{});if(!input)throw new Error('Sign in to load recommendations');return recommendGraph(input.topicIds);
}});
