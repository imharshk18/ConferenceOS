import type {MutationCtx,QueryCtx} from './_generated/server';
import type {Id,Doc} from './_generated/dataModel';
import {internal} from './_generated/api';
import {DEFAULT_TOPIC_IDS,choosePresentationProof,type SessionRecommendation} from '../packages/core/intelligence';

export async function preferencesFor(ctx:Pick<QueryCtx,'db'>,userId:Id<'users'>){return ctx.db.query('preferences').withIndex('by_userId',q=>q.eq('userId',userId)).unique();}
export async function ensurePreferences(ctx:MutationCtx,userId:Id<'users'>){
 const existing=await preferencesFor(ctx,userId);if(existing){if(existing.revision===undefined){await ctx.db.patch(existing._id,{revision:0});return {...existing,revision:0};}return existing;}
 const id=await ctx.db.insert('preferences',{userId,bookmarks:[],topicIds:DEFAULT_TOPIC_IDS,met:[],revision:0});return (await ctx.db.get(id))!;
}
export async function activeMobilePresentations(ctx:Pick<QueryCtx,'db'>,userId:Id<'users'>){return ctx.db.query('presentations').withIndex('by_mobile',q=>q.eq('mobileUserId',userId)).order('desc').take(20);}
export function terminal(session:Pick<Doc<'presentations'>,'status'|'expiresAt'>,now:number){return session.status==='revoked'||session.status==='expired'||session.expiresAt<=now;}
export async function clearForRevision(ctx:MutationCtx,userId:Id<'users'>,revision:number){
 const now=Date.now();for(const s of await activeMobilePresentations(ctx,userId)){if(terminal(s,now))continue;await ctx.db.patch(s._id,{status:'loading',revision,proof:null,updatedAt:now});}
}
export async function startCalculation(ctx:MutationCtx,userId:Id<'users'>,revision:number){
 const data={userId,revision,status:'loading' as const,source:'live' as const,talks:[],people:[],error:null,updatedAt:null};
 const current=await ctx.db.query('recommendations').withIndex('by_userId',q=>q.eq('userId',userId)).unique();
 if(current)await ctx.db.patch(current._id,data);else await ctx.db.insert('recommendations',data);
 await clearForRevision(ctx,userId,revision);
 await ctx.scheduler.runAfter(0,internal.intelligenceJobs.calculate,{userId,revision});
}
/** This runs in the same transaction as the revision guard and reads the latest consent. */
export async function refreshPresentation(ctx:MutationCtx,s:Doc<'presentations'>,topicIds:string[],revision:number,status:'loading'|'ready'|'error',recommendations:SessionRecommendation[]){
 const now=Date.now();if(terminal(s,now))return;
 const proof=status==='ready'?choosePresentationProof(recommendations,s.approvedTopicIds,topicIds):null;
 await ctx.db.patch(s._id,{status:status==='ready'?(proof?'live':'paired'):status,revision,proof,updatedAt:now});
}
