import {v} from 'convex/values';
import {getAuthUserId} from '@convex-dev/auth/server';
import {query,mutation} from './_generated/server';
import {talks,people} from '../packages/core/data';
import {DEFAULT_TOPIC_IDS,validTopicIds} from '../packages/core/intelligence';
import {ensurePreferences,preferencesFor,startCalculation} from './state';
import {profileFor,recalculate} from './socialState';
const prefValidator=v.object({bookmarks:v.array(v.string()),topicIds:v.array(v.string()),met:v.array(v.string()),revision:v.number()});
export const mine=query({args:{},returns:prefValidator,handler:async(ctx)=>{
 const userId=await getAuthUserId(ctx);const p=userId?await preferencesFor(ctx,userId):null;
 return {bookmarks:p?.bookmarks??[],topicIds:p?.topicIds??DEFAULT_TOPIC_IDS,met:p?.met??[],revision:p?.revision??0};
}});
export const toggleBookmark=mutation({args:{talkId:v.string()},returns:v.boolean(),handler:async(ctx,{talkId})=>{
 const userId=await getAuthUserId(ctx);if(!userId)throw new Error('Sign in to save your agenda');
 if(!talks.some(t=>t.id===talkId))throw new Error('Unknown session');
 const p=await ensurePreferences(ctx,userId);
 const existing=p.bookmarks;const saved=!existing.includes(talkId);const bookmarks=saved?[...existing,talkId]:existing.filter(id=>id!==talkId);
 await ctx.db.patch(p._id,{bookmarks});
 return saved;
}});
export const setInterests=mutation({args:{topicIds:v.array(v.string())},returns:v.number(),handler:async(ctx,{topicIds})=>{
 const userId=await getAuthUserId(ctx);if(!userId)throw new Error('Sign in to save interests');
 const p=await ensurePreferences(ctx,userId);const revision=(p.revision??0)+1;
 const ids=validTopicIds(topicIds);
 await ctx.db.patch(p._id,{topicIds:ids,revision});
 const profile=await profileFor(ctx,userId);if(profile){await ctx.db.patch(profile._id,{skillIds:ids,contextRevision:(profile.contextRevision??0)+1});await recalculate(ctx,userId);}
 await startCalculation(ctx,userId,revision);return revision;
}});
export const markMet=mutation({args:{personId:v.string()},returns:v.boolean(),handler:async(ctx,{personId})=>{
 const userId=await getAuthUserId(ctx);if(!userId)throw new Error('Sign in to save connections');
 if(!people.some(p=>p.id===personId))throw new Error('Unknown demo attendee');
 const p=await ensurePreferences(ctx,userId);
 const existing=p.met;const saved=!existing.includes(personId);const met=saved?[...existing,personId]:existing.filter(id=>id!==personId);
 await ctx.db.patch(p._id,{met});
 return saved;
}});
