import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import { query,mutation,internalMutation,internalQuery,type MutationCtx } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import type { OnboardingProfile } from '../packages/core/onboarding';
import { internal } from './_generated/api';
import { profileFor } from './socialState';
import { preferencesFor } from './state';
import { applyProfile } from './profileState';
import { cleanOnboarding,phoneNumber } from '../packages/core/onboarding';
import { onboardingProfile } from './onboardingValidators';
async function applyCurrent(ctx:MutationCtx,c:Doc<'onboardingCalls'>,draft:OnboardingProfile){
 const profile=await profileFor(ctx,c.userId),prefs=await preferencesFor(ctx,c.userId);
 if(!draft.name||(profile?.contextRevision??0)!==c.baseProfileRevision||(prefs?.revision??0)!==c.basePreferenceRevision)return false;
 await applyProfile(ctx,c.userId,draft,profile?.color??'#bda4ff','bland');
 await ctx.db.patch(c._id,{status:'approved',draft:null,phone:'',callbackToken:'',error:null,leaseUntil:0,updatedAt:Date.now()});return true;
}

export const mine=query({args:{},handler:async ctx=>{
  const userId=await getAuthUserId(ctx); if(!userId)return null;
  const call=await ctx.db.query('onboardingCalls').withIndex('by_user',q=>q.eq('userId',userId)).order('desc').first();
  return {configured:!!(process.env.BLANDAI_API_KEY||process.env.BLAND_API_KEY),call:call?{id:call._id,status:call.status,draft:call.draft,error:call.error,building:call.applyWhenReady??false,updatedAt:call.updatedAt}:null};
}});
export const begin=mutation({args:{phone:v.string(),consent:v.boolean()},handler:async(ctx,args)=>{
  const userId=await getAuthUserId(ctx);if(!userId)throw new Error('Sign in first');
  if(!args.consent)throw new Error('Confirm this is your number and agree to the AI call');
  if(!(process.env.BLANDAI_API_KEY||process.env.BLAND_API_KEY))throw new Error('Voice onboarding is not configured yet. You can use the demo profile meanwhile.');
  const phone=phoneNumber(args.phone),now=Date.now();
  const latest=await ctx.db.query('onboardingCalls').withIndex('by_user',q=>q.eq('userId',userId)).order('desc').first();
  if(latest&&['starting','calling','processing','uncertain','review'].includes(latest.status)&&now-latest.createdAt<20*60_000){
    if(latest.phone===phone)return latest._id;
    throw new Error('Finish or discard your current onboarding before starting another call.');
  }
  const today=await ctx.db.query('onboardingCalls').withIndex('by_created',q=>q.gte('createdAt',now-86_400_000)).take(21);
  if(today.length>=20 || today.filter(c=>c.userId===userId||c.phone===phone).length>=2)throw new Error('Daily demo call limit reached. No new call was placed.');
  const profile=await profileFor(ctx,userId),prefs=await preferencesFor(ctx,userId);
  const id=await ctx.db.insert('onboardingCalls',{userId,phone,externalId:crypto.randomUUID(),callbackToken:crypto.randomUUID()+crypto.randomUUID(),status:'starting',createdAt:now,updatedAt:now,polls:0,leaseUntil:0,baseProfileRevision:profile?.contextRevision??0,basePreferenceRevision:prefs?.revision??0,draft:null,error:null});
  await ctx.scheduler.runAfter(0,internal.onboardingJobs.start,{id});
  // Backstop only checks this intent; never sends a second call.
  await ctx.scheduler.runAfter(90_000,internal.onboardingJobs.collect,{id});
  await ctx.scheduler.runAfter(86_400_000,internal.onboarding.expire,{id});
  return id;
}});
export const retryStatus=mutation({args:{id:v.id('onboardingCalls')},handler:async(ctx,{id})=>{
  const userId=await getAuthUserId(ctx),c=await ctx.db.get(id);
  if(!c||c.userId!==userId)throw new Error('Call unavailable');
  if(['approved','discarded','review'].includes(c.status))return;
  if(c.leaseUntil>Date.now())return;
  if(c.status==='starting'&&(!c.dispatchedAt||Date.now()-c.dispatchedAt<30_000))throw new Error('Your call is being requested. Please wait a moment.');
  if(c.updatedAt>Date.now()-15_000||c.polls>=30)throw new Error('Please wait before checking again');
  await ctx.db.patch(id,{status:c.callId?'calling':'uncertain',error:null,updatedAt:Date.now()});
  await ctx.scheduler.runAfter(0,internal.onboardingJobs.collect,{id});
}});
export const done=mutation({args:{id:v.id('onboardingCalls')},handler:async(ctx,{id})=>{
 const userId=await getAuthUserId(ctx),c=await ctx.db.get(id);
 if(!c||c.userId!==userId||c.status==='discarded')throw new Error('Call unavailable');
 if(c.status==='approved')return;
 if(c.draft&&c.status==='review'){
  if(!await applyCurrent(ctx,c,cleanOnboarding(c.draft)))throw new Error('Your profile changed or your name is missing. Review this draft before continuing.');
  return;
 }
 if(c.polls>=30)throw new Error('Call check limit reached. No additional call will be made.');
 await ctx.db.patch(id,{applyWhenReady:true,error:null});
 // Done can arrive before the send action. It must never cancel that dispatch or start a second one.
 if(c.status==='starting'||c.leaseUntil>Date.now())return;
 if(c.status==='error')await ctx.db.patch(id,{status:c.callId?'calling':'uncertain'});
 await ctx.scheduler.runAfter(0,internal.onboardingJobs.collect,{id});
}});
export const approve=mutation({args:{id:v.id('onboardingCalls'),draft:onboardingProfile},handler:async(ctx,{id,draft})=>{
  const userId=await getAuthUserId(ctx),c=await ctx.db.get(id);
  if(!userId||!c||c.userId!==userId||c.status!=='review')throw new Error('This profile is no longer awaiting review');
  const p=await profileFor(ctx,userId),prefs=await preferencesFor(ctx,userId);
  if((p?.contextRevision??0)!==c.baseProfileRevision||(prefs?.revision??0)!==c.basePreferenceRevision)throw new Error('Your profile changed after this call. Keep your current profile or start a new review.');
  const value=cleanOnboarding(draft); if(!value.name)throw new Error('Add your name to finish');
  await applyProfile(ctx,userId,value,p?.color??'#bda4ff','bland');
  await ctx.db.patch(id,{status:'approved',draft:null,phone:'',callbackToken:'',updatedAt:Date.now()});
}});
export const discard=mutation({args:{id:v.id('onboardingCalls')},handler:async(ctx,{id})=>{
  const userId=await getAuthUserId(ctx),c=await ctx.db.get(id);if(!c||c.userId!==userId)throw new Error('Call unavailable');
  await ctx.db.patch(id,{status:'discarded',draft:null,phone:'',callbackToken:'',error:null,updatedAt:Date.now()});
}});
export const input=internalQuery({args:{id:v.id('onboardingCalls')},handler:(ctx,{id})=>ctx.db.get(id)});
export const claimStart=internalMutation({args:{id:v.id('onboardingCalls')},handler:async(ctx,{id})=>{
 const c=await ctx.db.get(id);if(!c||c.status!=='starting'||c.dispatchedAt)return null;
 // At-most-once dispatch. Ambiguous provider failures are reconciled by external_id, never redialed.
 await ctx.db.patch(id,{dispatchedAt:Date.now()});return c;
}});
export const started=internalMutation({args:{id:v.id('onboardingCalls'),callId:v.optional(v.string()),error:v.optional(v.string()),rejected:v.optional(v.boolean())},handler:async(ctx,a)=>{
  const c=await ctx.db.get(a.id);if(!c||!['starting','uncertain'].includes(c.status))return false;
  await ctx.db.patch(c._id,{...(a.callId?{callId:a.callId}:{}),status:a.callId?'calling':a.rejected?'error':'uncertain',error:a.error??null,updatedAt:Date.now()});return true;
}});
export const claim=internalMutation({args:{id:v.id('onboardingCalls')},handler:async(ctx,{id})=>{
  const c=await ctx.db.get(id);if(!c||['approved','discarded','review','error'].includes(c.status)||c.leaseUntil>Date.now()||c.polls>=30)return null;
  if(c.status==='starting'&&(!c.dispatchedAt||Date.now()-c.dispatchedAt<30_000))return null;
  const leaseId=crypto.randomUUID();
  await ctx.db.patch(id,{leaseId,leaseUntil:Date.now()+90_000,polls:c.polls+1,updatedAt:Date.now()});return {...c,leaseId};
}});
export const processing=internalMutation({args:{id:v.id('onboardingCalls'),leaseId:v.string()},handler:async(ctx,{id,leaseId})=>{
 const c=await ctx.db.get(id);if(!c||c.leaseId!==leaseId||['approved','discarded','review','error'].includes(c.status))return false;
 await ctx.db.patch(id,{status:'processing',updatedAt:Date.now()});return true;
}});
export const notification=internalMutation({args:{token:v.string(),callId:v.string()},handler:async(ctx,{token,callId})=>{
  // The high-entropy per-call capability is supplied only to Bland. Webhook content is NOT imported.
  const c=await ctx.db.query('onboardingCalls').withIndex('by_token',q=>q.eq('callbackToken',token)).unique();
  if(!c||c.createdAt<Date.now()-86_400_000||['approved','discarded','review'].includes(c.status)||(c.callId&&c.callId!==callId)||c.leaseUntil>Date.now()||c.polls>=30)return;
  if(c.status==='error')await ctx.db.patch(c._id,{status:'calling',error:null});
  await ctx.scheduler.runAfter(0,internal.onboardingJobs.collect,{id:c._id});
}});
export const finish=internalMutation({args:{id:v.id('onboardingCalls'),leaseId:v.string(),callId:v.optional(v.string()),draft:v.optional(onboardingProfile),error:v.optional(v.string()),waiting:v.optional(v.boolean())},handler:async(ctx,a)=>{
  const c=await ctx.db.get(a.id);if(!c||c.leaseId!==a.leaseId||['approved','discarded','review','error'].includes(c.status)||(c.callId&&a.callId&&c.callId!==a.callId))return false;
  const draft=a.draft?cleanOnboarding(a.draft):null;
  if(draft&&c.applyWhenReady&&await applyCurrent(ctx,c,draft))return true;
  const expired=a.waiting&&(c.polls>=20||Date.now()-c.createdAt>=20*60_000);
  await ctx.db.patch(c._id,{...(a.callId?{callId:a.callId}:{}),status:draft?'review':a.waiting&&!expired?'calling':'error',draft,error:a.error??(expired?'The call is taking longer than expected. Check the same call again; no new call will be placed.':draft&&c.applyWhenReady?'Your profile changed or your name is missing. Please review the draft.':null),leaseUntil:0,leaseId:undefined,updatedAt:Date.now()});
  if(a.waiting&&c.polls<20&&Date.now()-c.createdAt<20*60_000)await ctx.scheduler.runAfter(45_000,internal.onboardingJobs.collect,{id:c._id});
  return true;
}});
export const expire=internalMutation({args:{id:v.id('onboardingCalls')},handler:async(ctx,{id})=>{
 const c=await ctx.db.get(id);if(!c||Date.now()-c.createdAt<86_400_000)return;
 await ctx.db.patch(id,{phone:'',callbackToken:'',draft:null,status:c.status==='approved'?'approved':'discarded',leaseUntil:0,leaseId:undefined,updatedAt:Date.now()});
}});
