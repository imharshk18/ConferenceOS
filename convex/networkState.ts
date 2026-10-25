import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { redactNetworkGraph, type NetworkInput } from "../packages/core/network";
import { usableMemory } from './memoryConsent';
type ReadCtx = MutationCtx | QueryCtx;
export const networkFor = (ctx: ReadCtx, userId: Id<"users">) => ctx.db.query("networkIntelligence").withIndex("by_user", q => q.eq("userId", userId)).unique();
export async function networkSessions(ctx: ReadCtx, userId: Id<"users">) {
  return (await ctx.db.query("presentations").withIndex("by_mobile", q => q.eq("mobileUserId", userId)).order("desc").take(20)).filter(s => s.expiresAt > Date.now() && !["waiting", "expired", "revoked"].includes(s.status));
}
export async function networkInput(ctx: ReadCtx, userId: Id<"users">): Promise<NetworkInput> {
  const state = await networkFor(ctx, userId);
  const profile = await ctx.db.query("profiles").withIndex("by_userId", q => q.eq("userId", userId)).unique();
  const input: NetworkInput = { scope: state?.scope ?? "", revision: state?.revision ?? 0, me: { name: profile?.name ?? "You", areaIds: profile?.networkAreas ?? profile?.skillIds ?? [] }, connections: [], memories: [], captures: [] };
  const connections = [...await ctx.db.query("connections").withIndex("by_requestor", q => q.eq("requestorId", userId)).order("desc").take(50), ...await ctx.db.query("connections").withIndex("by_recipient", q => q.eq("recipientId", userId)).order("desc").take(50)].filter(c => c.status === "accepted").sort((a,b) => b.createdAt-a.createdAt).slice(0,20);
  for (const c of connections) {
    const peerId = c.requestorId === userId ? c.recipientId : c.requestorId;
    const peer = await ctx.db.query("profiles").withIndex("by_userId", q => q.eq("userId", peerId)).unique();
    if (!peer) continue;
    input.connections.push({ id: c._id, name: peer.name, headline: peer.headline, color: peer.color, areaIds: peer.networkAreas ?? peer.skillIds, acceptedAt: c.acceptedAt ?? 0, demo: c.demo ?? false });
    for (const m of await ctx.db.query("memories").withIndex("by_connection", q => q.eq("connectionId", c._id)).order("desc").take(20)) {
      if (usableMemory(m,c)) input.memories.push({ id: m._id, connectionId: c._id, summary: m.summary, areaIds: m.networkAreas ?? m.topicIds, demo: c.demo ?? false, autoSaved: m.autoSaved ?? false });
    }
  }
  for (const c of await ctx.db.query("captures").withIndex("by_user", q => q.eq("userId", userId)).order("desc").take(30)) {
    if (c.status === "approved" && c.draft && c.kind !== "conversation") input.captures.push({ id: c._id, kind: c.kind, title: c.title, summary: c.draft.summary, areaIds: c.draft.networkAreas ?? c.draft.topicIds, attended: c.attended, ...(c.talkId ? { talkId: c.talkId } : {}) });
  }
  return input;
}
export async function publishNetwork(ctx: MutationCtx, userId: Id<"users">) {
  const state = await networkFor(ctx, userId);
  for (const session of await networkSessions(ctx, userId)) {
    const stage = await ctx.db.query("networkPresentation").withIndex("by_session", q => q.eq("sessionId", session._id)).unique();
    if (stage) await ctx.db.patch(stage._id, { graph: stage.enabled && state?.status === "ready" ? await redactNetworkGraph(state.graph, stage.salt) : null, revision: stage.revision + 1, updatedAt: Date.now() });
  }
}
export async function refreshNetwork(ctx: MutationCtx, userId: Id<"users">) {
  const old = await networkFor(ctx, userId), revision = (old?.revision ?? 0) + 1;
  const value = { userId, scope: crypto.randomUUID(), revision, status: "loading" as const, graph: { nodes: [], edges: [] }, error: null, updatedAt: Date.now(), generatedAt: null };
  if (old) await ctx.db.patch(old._id, value); else await ctx.db.insert("networkIntelligence", value);
  await publishNetwork(ctx, userId);
  await ctx.scheduler.runAfter(0, internal.networkJobs.calculate, { userId, revision });
  await ctx.scheduler.runAfter(90_000, internal.network.timeout, { userId, revision });
  if (old) await ctx.scheduler.runAfter(0, internal.networkJobs.cleanup, { scope: old.scope });
}
