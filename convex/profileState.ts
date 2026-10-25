import type { MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { profileFor, recalculate, connectionsFor, peerId } from './socialState';
import { ensurePreferences, startCalculation } from './state';
import type { OnboardingProfile } from '../packages/core/onboarding';
/** One transaction updates the profile, session interests, private network and follow-up ranking. */
export async function applyProfile(ctx:MutationCtx,userId:Id<'users'>,value:OnboardingProfile,color:string,source:'manual'|'bland'|'demo') {
  const old=await profileFor(ctx,userId);
  const next={...value,userId,color,source,contextRevision:(old?.contextRevision??0)+1};
  if(old) await ctx.db.patch(old._id,next); else await ctx.db.insert('profiles',next);
  const prefs=await ensurePreferences(ctx,userId),revision=(prefs.revision??0)+1;
  await ctx.db.patch(prefs._id,{topicIds:value.skillIds,revision});
  await startCalculation(ctx,userId,revision);
  await recalculate(ctx,userId);
  for(const c of await connectionsFor(ctx,userId)) if(c.status==='accepted'&&!c.demo) await recalculate(ctx,peerId(c,userId));
}
