"use node";
import {v} from 'convex/values';
import {internalAction} from './_generated/server';
import {internal} from './_generated/api';
import {recommendGraph} from '../packages/core/graph';
export const calculate=internalAction({args:{userId:v.id('users'),revision:v.number()},returns:v.null(),handler:async(ctx,{userId,revision})=>{
 const input=await ctx.runQuery(internal.intelligence.calculationInput,{userId,revision});if(!input)return null;
 try{const result=await recommendGraph(input.topicIds);await ctx.runMutation(internal.intelligence.commit,{userId,revision,talks:result.talks,people:result.people,failed:false});}
 catch{await ctx.runMutation(internal.intelligence.commit,{userId,revision,talks:[],people:[],failed:true});}return null;
}});
