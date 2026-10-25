import {v} from 'convex/values';
import {getAuthUserId} from '@convex-dev/auth/server';
import {query,mutation,internalMutation} from './_generated/server';
import {internal} from './_generated/api';
import {desktopPresentationValidator,presentationStatus} from './validators';
import {validTopicIds,choosePresentationProof,type PresentationStatus} from '../packages/core/intelligence';
import {ensurePreferences,preferencesFor,refreshPresentation,startCalculation,terminal} from './state';
const CODE_TTL=5*60*1000,SESSION_TTL=30*60*1000;
const sessionArgs={sessionId:v.id('presentations')};
const pairedResult=v.union(v.object({ok:v.literal(true),sessionId:v.id('presentations')}),v.object({ok:v.literal(false),error:v.string()}));
async function hashCode(code:string){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`conferenceos-presentation:${code}`));return Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,'0')).join('');}
function normalizedCode(code:string){return code.replace(/[\s-]/g,'');}
function approved(ids:string[]){const safe=validTopicIds(ids);if(safe.length!==new Set(ids).size||ids.length>6)throw new Error('Choose only the six available topics');return safe;}

export const create=mutation({args:{},returns:v.object({sessionId:v.id('presentations'),code:v.string(),codeExpiresAt:v.number(),expiresAt:v.number()}),handler:async(ctx)=>{
 const desktopUserId=await getAuthUserId(ctx);if(!desktopUserId)throw new Error('Sign in to create a presentation');
 const now=Date.now();const previous=await ctx.db.query('presentations').withIndex('by_desktop',q=>q.eq('desktopUserId',desktopUserId)).order('desc').take(20);
 for(const s of previous)if(!terminal(s,now))await ctx.db.patch(s._id,{status:'revoked',proof:null,codeHash:undefined,updatedAt:now});
 let code='',codeHash='';
 for(let attempt=0;attempt<8;attempt++){const bytes=crypto.getRandomValues(new Uint32Array(1));code=String(bytes[0]%1_000_000).padStart(6,'0');codeHash=await hashCode(code);if(!(await ctx.db.query('presentations').withIndex('by_codeHash',q=>q.eq('codeHash',codeHash)).first()))break;codeHash='';}
 if(!codeHash)throw new Error('Could not create a code. Try again.');
 const codeExpiresAt=now+CODE_TTL,expiresAt=now+SESSION_TTL;
 const sessionId=await ctx.db.insert('presentations',{desktopUserId,codeHash,codeExpiresAt,expiresAt,status:'waiting',approvedTopicIds:[],consentRevision:0,revision:null,proof:null,updatedAt:now});
 await ctx.scheduler.runAt(codeExpiresAt,internal.presentation.expireCode,{sessionId});await ctx.scheduler.runAt(expiresAt,internal.presentation.expire,{sessionId});
 return {sessionId,code,codeExpiresAt,expiresAt};
}});

export const desktop=query({args:sessionArgs,returns:v.union(desktopPresentationValidator,v.null()),handler:async(ctx,{sessionId})=>{
 const userId=await getAuthUserId(ctx);if(!userId)return null;const s=await ctx.db.get(sessionId);if(!s||s.desktopUserId!==userId)return null;
 const expired=s.expiresAt<=Date.now()||(s.status==='waiting'&&s.codeExpiresAt<=Date.now());
 const status:PresentationStatus=s.status==='revoked'?'revoked':expired?'expired':s.status;
 return {status,expiresAt:s.expiresAt,codeExpiresAt:s.codeExpiresAt,revision:s.revision,proof:expired||s.status==='revoked'?null:s.proof,updatedAt:s.updatedAt};
}});

export const pair=mutation({args:{code:v.string(),approvedTopicIds:v.array(v.string())},returns:pairedResult,handler:async(ctx,{code,approvedTopicIds})=>{
 const userId=await getAuthUserId(ctx);if(!userId)return {ok:false as const,error:'Sign in before pairing'};
 const now=Date.now();const attempt=await ctx.db.query('pairingAttempts').withIndex('by_userId',q=>q.eq('userId',userId)).unique();
 if(attempt&&now-attempt.windowStart<60_000&&attempt.count>=5)return {ok:false as const,error:'Too many attempts. Try again in a minute.'};
 if(attempt)await ctx.db.patch(attempt._id,now-attempt.windowStart>=60_000?{windowStart:now,count:1}:{count:attempt.count+1});else await ctx.db.insert('pairingAttempts',{userId,windowStart:now,count:1});
 const normalized=normalizedCode(code);if(!/^\d{6}$/.test(normalized))return {ok:false as const,error:'Enter the six digit presentation code'};
 const scope=validTopicIds(approvedTopicIds);if(scope.length!==new Set(approvedTopicIds).size||approvedTopicIds.length>6)return {ok:false as const,error:'Choose only the available topics'};
 const codeHash=await hashCode(normalized);const s=await ctx.db.query('presentations').withIndex('by_codeHash',q=>q.eq('codeHash',codeHash)).unique();
 if(!s||s.status!=='waiting'||s.mobileUserId||s.codeExpiresAt<=now||s.expiresAt<=now)return {ok:false as const,error:'This code is invalid, expired, or already used'};
 if(s.desktopUserId===userId)return {ok:false as const,error:'Use the code from a different device session'};
 const previous=await ctx.db.query('presentations').withIndex('by_mobile',q=>q.eq('mobileUserId',userId)).order('desc').take(20);
 for(const old of previous)if(!terminal(old,now))await ctx.db.patch(old._id,{status:'revoked',proof:null,codeHash:undefined,updatedAt:now});
 const p=await ensurePreferences(ctx,userId);const state=await ctx.db.query('recommendations').withIndex('by_userId',q=>q.eq('userId',userId)).unique();
 const ready=state?.revision===(p.revision??0)&&state.status==='ready';
 const proof=ready?choosePresentationProof(state.talks,scope,p.topicIds):null;
 await ctx.db.patch(s._id,{mobileUserId:userId,codeHash:undefined,approvedTopicIds:scope,consentRevision:s.consentRevision+1,revision:p.revision??0,status:ready?(proof?'live':'paired'):'loading',proof,updatedAt:now});
 if(!state||state.revision!==(p.revision??0)||state.status==='idle'||state.status==='error')await startCalculation(ctx,userId,p.revision??0);
 return {ok:true as const,sessionId:s._id};
}});

export const mine=query({args:{},returns:v.union(v.object({sessionId:v.id('presentations'),status:presentationStatus,approvedTopicIds:v.array(v.string()),expiresAt:v.number(),revision:v.union(v.number(),v.null()),updatedAt:v.union(v.number(),v.null())}),v.null()),handler:async(ctx)=>{
 const userId=await getAuthUserId(ctx);if(!userId)return null;
 const s=await ctx.db.query('presentations').withIndex('by_mobile',q=>q.eq('mobileUserId',userId)).order('desc').first();if(!s)return null;
 const status:PresentationStatus=s.status==='revoked'?'revoked':s.expiresAt<=Date.now()?'expired':s.status;
 return {sessionId:s._id,status,approvedTopicIds:s.approvedTopicIds,expiresAt:s.expiresAt,revision:s.revision,updatedAt:s.updatedAt};
}});

export const updateConsent=mutation({args:{...sessionArgs,approvedTopicIds:v.array(v.string())},returns:v.null(),handler:async(ctx,{sessionId,approvedTopicIds})=>{
 const userId=await getAuthUserId(ctx);const s=await ctx.db.get(sessionId);if(!userId||!s||s.mobileUserId!==userId)throw new Error('Presentation not available');
 if(terminal(s,Date.now()))throw new Error('Presentation has ended');const scope=approved(approvedTopicIds);
 const updated={...s,approvedTopicIds:scope,consentRevision:s.consentRevision+1,proof:null};
 await ctx.db.patch(s._id,{approvedTopicIds:scope,consentRevision:updated.consentRevision,proof:null,updatedAt:Date.now()});
 const p=await preferencesFor(ctx,userId);const state=await ctx.db.query('recommendations').withIndex('by_userId',q=>q.eq('userId',userId)).unique();
 if(p&&state&&state.revision===(p.revision??0))await refreshPresentation(ctx,updated,p.topicIds,p.revision??0,state.status==='ready'?'ready':state.status==='error'?'error':'loading',state.talks);
 return null;
}});

export const revoke=mutation({args:sessionArgs,returns:v.null(),handler:async(ctx,{sessionId})=>{
 const userId=await getAuthUserId(ctx);const s=await ctx.db.get(sessionId);if(!userId||!s||(s.desktopUserId!==userId&&s.mobileUserId!==userId))throw new Error('Presentation not available');
 await ctx.db.patch(s._id,{status:'revoked',proof:null,codeHash:undefined,consentRevision:s.consentRevision+1,updatedAt:Date.now()});return null;
}});

export const expireCode=internalMutation({args:sessionArgs,returns:v.null(),handler:async(ctx,{sessionId})=>{
 const s=await ctx.db.get(sessionId);if(s&&s.status==='waiting'&&s.codeExpiresAt<=Date.now())await ctx.db.patch(s._id,{status:'expired',proof:null,codeHash:undefined,updatedAt:Date.now()});return null;
}});
export const expire=internalMutation({args:sessionArgs,returns:v.null(),handler:async(ctx,{sessionId})=>{
 const s=await ctx.db.get(sessionId);if(s&&s.expiresAt<=Date.now()&&s.status!=='revoked')await ctx.db.patch(s._id,{status:'expired',proof:null,codeHash:undefined,updatedAt:Date.now()});return null;
}});
