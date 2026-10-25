import {query} from './_generated/server';
import {getAuthUserId} from '@convex-dev/auth/server';
import {profileFor} from './socialState';
import sources from '../data/creator-opportunities.json';
import {NETWORK_AREAS} from '../packages/core/network';
/** Public discoveries are ranked by stored, reviewed context. They are NOT asserted MET edges. */
export const mine=query({args:{},handler:async ctx=>{
 const userId=await getAuthUserId(ctx),p=userId?await profileFor(ctx,userId):null;
 const areas=p?.networkAreas??[];
 return {personalized:!!p,context:p?.goal??'',posts:sources.posts.map(post=>{
  const overlap=post.areas.filter(id=>areas.includes(id));
  return {...post,overlap,reason:overlap.length?`Matches your ${overlap.map(id=>NETWORK_AREAS.find(a=>a.id===id)?.label).join(' + ')} context.`:'Public creator opportunity · not yet personalized.'};
 }).sort((a,b)=>b.overlap.length-a.overlap.length)};
}});
