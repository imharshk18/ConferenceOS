import { v } from 'convex/values';
import { mutation } from './_generated/server';
import { getAuthUserId } from '@convex-dev/auth/server';
import { applyProfile } from './profileState';
import { profileFor,connectionsFor,recalculate,connectionPulse } from './socialState';

/** Explicit demo activation, not a default identity and never an authentication claim about Harsh. */
export const useHarsh=mutation({args:{},handler:async ctx=>{
 const userId=await getAuthUserId(ctx);if(!userId)throw new Error('Sign in first');
 await applyProfile(ctx,userId,{name:'Harsh · demo',headline:'Building coCreatr · creator communities',goal:'Meet creators and consumer-app founders to grow coCreatr through collaborations, community and distribution.',context:'Demo persona based on Harsh’s supplied goals and his public LinkedIn posts: building coCreatr to help nearby creators collaborate, grow together and find local opportunities. Interested in creator-first consumer products, community-led growth, creator events and partnerships. Not a claim of conference attendance or existing relationships.',skillIds:[],networkAreas:['content','product','founders','growth']},'#bba6ff','demo');
 return null;
}});
/** A separate synthetic peer per owner. 123456 can never approve a real person's request. */
export const connect=mutation({args:{code:v.string()},handler:async(ctx,{code})=>{
 const userId=await getAuthUserId(ctx);if(!userId)throw new Error('Sign in first');
 if(code.trim()!=='123456')throw new Error('Use demo code 123456, or a real private invite.');
 if(!await profileFor(ctx,userId))throw new Error('Use your voice profile or activate Harsh’s demo first.');
 const connections=await connectionsFor(ctx,userId),existing=connections.find(c=>c.demo&&c.status==='accepted');
 if(existing)return {connectionId:existing._id};
 if(connections.filter(c=>c.status!=='revoked').length>=20)throw new Error('Connection limit reached');
 const peer=await ctx.db.insert('users',{name:'Alex · simulated creator'});
 await ctx.db.insert('profiles',{userId:peer,name:'Alex · demo',headline:'Simulated creator & consumer-app builder',goal:'',skillIds:[],networkAreas:['content','product','growth'],color:'#99e4ce',source:'demo'});
 const id=await ctx.db.insert('connections',{requestorId:userId,recipientId:peer,demo:true,status:'accepted',createdAt:Date.now(),acceptedAt:Date.now()});
 await recalculate(ctx,userId);await connectionPulse(ctx,userId);
 return {connectionId:id};
}});
