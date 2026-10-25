import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import type { SocialInput } from "../packages/core/social";
import { refreshNetwork } from "./networkState";
import { usableMemory } from './memoryConsent';

type ReadCtx = QueryCtx | MutationCtx;
export const profileFor = (ctx: ReadCtx, userId: Id<"users">) =>
  ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
export const intelligenceFor = (ctx: ReadCtx, userId: Id<"users">) =>
  ctx.db
    .query("socialIntelligence")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
export async function connectionsFor(ctx: ReadCtx, userId: Id<"users">) {
  const [sent, received] = await Promise.all([
    ctx.db
      .query("connections")
      .withIndex("by_requestor", (q) => q.eq("requestorId", userId))
      .order("desc")
      .take(50),
    ctx.db
      .query("connections")
      .withIndex("by_recipient", (q) => q.eq("recipientId", userId))
      .order("desc")
      .take(50),
  ]);
  return [...sent, ...received].sort((a, b) => b.createdAt - a.createdAt);
}
export function participant(c: Doc<"connections">, userId: Id<"users">) {
  return c.requestorId === userId || c.recipientId === userId;
}
export function peerId(c: Doc<"connections">, userId: Id<"users">) {
  return c.requestorId === userId ? c.recipientId : c.requestorId;
}
export async function activeStage(ctx: ReadCtx, userId: Id<"users">) {
  const sessions = await ctx.db
    .query("presentations")
    .withIndex("by_mobile", (q) => q.eq("mobileUserId", userId))
    .order("desc")
    .take(20);
  return sessions.filter(
    (s) =>
      s.expiresAt > Date.now() &&
      !["revoked", "expired", "waiting"].includes(s.status),
  );
}
export async function clearSocialStage(ctx: MutationCtx, userId: Id<"users">) {
  for (const session of await activeStage(ctx, userId)) {
    const stage = await ctx.db
      .query("socialPresentation")
      .withIndex("by_session", (q) => q.eq("sessionId", session._id))
      .unique();
    if (stage)
      await ctx.db.patch(stage._id, {
        kind: "none",
        proof: null,
        revision: stage.revision + 1,
        updatedAt: Date.now(),
      });
  }
}
export async function recalculate(ctx: MutationCtx, userId: Id<"users">) {
  await refreshNetwork(ctx, userId);
  const old = await intelligenceFor(ctx, userId);
  const revision = (old?.revision ?? 0) + 1;
  const value = {
    userId,
    scope: crypto.randomUUID(),
    revision,
    status: "loading" as const,
    items: [],
    error: null,
    updatedAt: Date.now(),
  };
  if (old) await ctx.db.patch(old._id, value);
  else await ctx.db.insert("socialIntelligence", value);
  await clearSocialStage(ctx, userId);
  await ctx.scheduler.runAfter(0, internal.socialJobs.calculate, {
    userId,
    revision,
  });
  if (old)
    await ctx.scheduler.runAfter(0, internal.socialJobs.cleanup, {
      scope: old.scope,
    });
}
export async function recalculatePair(ctx: MutationCtx, c: Doc<"connections">) {
  await recalculate(ctx, c.requestorId);
  if (!c.demo) await recalculate(ctx, c.recipientId);
}
export async function connectionPulse(ctx: MutationCtx, userId: Id<"users">) {
  for (const session of await activeStage(ctx, userId)) {
    const stage = await ctx.db
      .query("socialPresentation")
      .withIndex("by_session", (q) => q.eq("sessionId", session._id))
      .unique();
    if (stage?.allowNetwork)
      await ctx.db.patch(stage._id, {
        kind: "connection",
        proof: null,
        revision: stage.revision + 1,
        updatedAt: Date.now(),
      });
  }
}
export async function socialInput(
  ctx: ReadCtx,
  userId: Id<"users">,
  revision: number,
): Promise<SocialInput | null> {
  const state = await intelligenceFor(ctx, userId),
    profile = await profileFor(ctx, userId);
  if (!state || state.revision !== revision || !profile) return null;
  const accepted = (await connectionsFor(ctx, userId)).filter(
    (c) => c.status === "accepted",
  );
  const input: SocialInput = {
    scope: state.scope,
    revision,
    me: { name: profile.name, skillIds: [...new Set([...profile.skillIds,...(profile.networkAreas??[])])] },
    connections: [],
    memories: [],
    posts: [],
  };
  for (const c of accepted) {
    const peer = await profileFor(ctx, peerId(c, userId));
    if (!peer) continue;
    input.connections.push({
      id: c._id,
      name: peer.name,
      color: peer.color,
      headline: peer.headline,
    });
    const memories = await ctx.db
      .query("memories")
      .withIndex("by_connection", (q) => q.eq("connectionId", c._id))
      .order("desc")
      .take(20);
    for (const m of memories)
      if (usableMemory(m,c))
        input.memories.push({
          id: m._id,
          connectionId: c._id,
          summary: m.summary,
          topicIds: [...new Set([...m.topicIds,...(m.networkAreas??[])])],
          demo: c.demo ?? false,
        });
    const posts = await ctx.db
      .query("socialPosts")
      .withIndex("by_author", (q) => q.eq("authorId", peer.userId))
      .order("desc")
      .take(20);
    const sources = await ctx.db.query("publicSources").withIndex("by_user", q => q.eq("userId", userId)).take(20);
    const ownSources = sources.filter(s => !s.deleted && s.connectionId === c._id);
    const sourcePosts = (await Promise.all(ownSources.map(s => ctx.db.query("socialPosts").withIndex("by_source", q => q.eq("sourceId", s._id)).order("desc").take(20)))).flat();
    for (const p of [...posts.filter(p => !p.sourceId), ...sourcePosts])
      if (!p.retracted)
        input.posts.push({
          id: p._id,
          connectionId: c._id,
          excerpt: p.excerpt,
          topicIds: p.topicIds,
          provenance: p.provenance,
          sourceUrl: p.sourceUrl,
          createdAt: p.createdAt,
        });
  }
  return input;
}
