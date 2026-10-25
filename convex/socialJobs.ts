"use node";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  calculateSocialGraph,
  deleteSocialSnapshot,
} from "../packages/core/socialGraph";
import type { SocialInput } from "../packages/core/social";
export const calculate = internalAction({
  args: { userId: v.id("users"), revision: v.number() },
  returns: v.null(),
  handler: async (ctx, { userId, revision }) => {
    const input: SocialInput | null = await ctx.runQuery(
      internal.social.calculationInput,
      { userId, revision },
    );
    if (!input) return null;
    let accepted = false;
    try {
      const items = await calculateSocialGraph(input);
      accepted = await ctx.runMutation(internal.social.commit, {
        userId,
        revision,
        items,
        failed: false,
      });
    } catch {
      await ctx.runMutation(internal.social.commit, {
        userId,
        revision,
        items: [],
        failed: true,
      });
    } finally {
      if (!accepted) await deleteSocialSnapshot(input.scope).catch(() => {});
    }
    return null;
  },
});
export const cleanup = internalAction({
  args: { scope: v.string(), attempt: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, { scope, attempt = 0 }) => {
    try {
      await deleteSocialSnapshot(scope);
    } catch {
      if (attempt < 2)
        await ctx.scheduler.runAfter(
          30_000 * (attempt + 1),
          internal.socialJobs.cleanup,
          { scope, attempt: attempt + 1 },
        );
      else
        console.warn(
          "A superseded private graph scope could not be removed. Retry cleanup after graph recovery.",
        );
    }
    return null;
  },
});
