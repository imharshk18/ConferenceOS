import {v} from 'convex/values';
import {getAuthUserId} from '@convex-dev/auth/server';
import {query,mutation,internalQuery,internalMutation} from './_generated/server';
import {recommendationValidator,sessionRecommendation,personRecommendation} from './validators';
import {ensurePreferences,preferencesFor,startCalculation,activeMobilePresentations,refreshPresentation} from './state';
import {canCommitRevision,type RecommendationState} from '../packages/core/intelligence';
const empty=(revision:number):RecommendationState=>({revision,status:'idle',source:'live',talks:[],people:[],error:null,updatedAt:null});
export const mine=query({args:{},returns:recommendationValidator,handler:async(ctx)=>{
 const userId=await getAuthUserId(ctx);if(!userId)return empty(0);
 const p=await preferencesFor(ctx,userId);const state=await ctx.db.query('recommendations').withIndex('by_userId',q=>q.eq('userId',userId)).unique();
 if(!state||!canCommitRevision(p?.revision,state.revision))return empty(p?.revision??0);
 const {revision,status,source,talks,people,error,updatedAt}=state;return {revision,status,source,talks,people,error,updatedAt};
}});
export const ensure=mutation({args:{},returns:v.null(),handler:async(ctx)=>{
 const userId=await getAuthUserId(ctx);if(!userId)throw new Error('Sign in to load recommendations');
 const p=await ensurePreferences(ctx,userId);const current=await ctx.db.query('recommendations').withIndex('by_userId',q=>q.eq('userId',userId)).unique();
 if(!current||current.revision!==(p.revision??0)||current.status==='idle')await startCalculation(ctx,userId,p.revision??0);return null;
}});
export const retry=mutation({args:{},returns:v.null(),handler:async(ctx)=>{
 const userId=await getAuthUserId(ctx);if(!userId)throw new Error('Sign in to retry');
 const p=await ensurePreferences(ctx,userId);const revision=(p.revision??0)+1;await ctx.db.patch(p._id,{revision});await startCalculation(ctx,userId,revision);return null;
}});
export const calculationInput=internalQuery({args:{userId:v.id('users'),revision:v.number()},returns:v.union(v.object({topicIds:v.array(v.string())}),v.null()),handler:async(ctx,{userId,revision})=>{
 const p=await preferencesFor(ctx,userId);return p&&canCommitRevision(p.revision,revision)?{topicIds:p.topicIds}:null;
}});
export const authenticatedInput=internalQuery({args:{},returns:v.union(v.object({topicIds:v.array(v.string())}),v.null()),handler:async(ctx)=>{
 const userId=await getAuthUserId(ctx);if(!userId)return null;const p=await preferencesFor(ctx,userId);return {topicIds:p?.topicIds??['ai','security']};
}});
export const commit=internalMutation({args:{userId:v.id('users'),revision:v.number(),talks:v.array(sessionRecommendation),people:v.array(personRecommendation),failed:v.boolean()},returns:v.boolean(),handler:async(ctx,{userId,revision,talks,people,failed})=>{
 const p=await preferencesFor(ctx,userId);const state=await ctx.db.query('recommendations').withIndex('by_userId',q=>q.eq('userId',userId)).unique();
 if(!p||!state||!canCommitRevision(p.revision,revision)||state.revision!==revision||state.status!=='loading')return false;
 const safeTalks=failed?[]:talks.filter(r=>p.topicIds.includes(r.topicId));const safePeople=failed?[]:people.filter(r=>p.topicIds.includes(r.topicId));
 const status=failed?'error' as const:'ready' as const;
 await ctx.db.patch(state._id,{status,source:'live',talks:safeTalks,people:safePeople,error:failed?'Live graph is temporarily unavailable. Retry to reconnect.':null,updatedAt:Date.now()});
 for(const s of await activeMobilePresentations(ctx,userId))await refreshPresentation(ctx,s,p.topicIds,revision,status,safeTalks);
 return true;
}});
