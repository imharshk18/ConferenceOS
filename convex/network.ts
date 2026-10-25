import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { networkFor, networkInput, networkSessions, publishNetwork, refreshNetwork } from "./networkState";
import { networkStats, redactNetworkGraph, verifyNetworkGraph } from "../packages/core/network";
import { networkGraph } from "./networkValidators";
export const mine = query({ args: {}, handler: async ctx => {
  const userId = await getAuthUserId(ctx); if (!userId) return null;
  const state = await networkFor(ctx, userId), input = await networkInput(ctx, userId);
  const session = (await networkSessions(ctx, userId))[0];
  const stage = session ? await ctx.db.query("networkPresentation").withIndex("by_session", q => q.eq("sessionId", session._id)).unique() : null;
  return { status: state?.status ?? "idle", revision: state?.revision ?? 0, error: state?.error ?? null, generatedAt: state?.generatedAt ?? null, graph: state?.status === "ready" ? state.graph : { nodes: [], edges: [] }, stats: networkStats(input, Date.now()), presentationEnabled: stage?.enabled ?? false };
} });
export const refresh = mutation({ args: {}, handler: async ctx => {
  const userId = await getAuthUserId(ctx); if (!userId) throw new Error("Sign in first");
  const state = await networkFor(ctx, userId);
  if (state && Date.now() - state.updatedAt < 5000) return null;
  await refreshNetwork(ctx, userId); return null;
} });
export const setPresentation = mutation({ args: { enabled: v.boolean() }, handler: async (ctx, { enabled }) => {
  const userId = await getAuthUserId(ctx); if (!userId) throw new Error("Sign in first");
  const session = (await networkSessions(ctx, userId))[0]; if (!session) throw new Error("Pair with a desktop first");
  const old = await ctx.db.query("networkPresentation").withIndex("by_session", q => q.eq("sessionId", session._id)).unique(), state = await networkFor(ctx, userId);
  const salt = old?.salt ?? crypto.randomUUID();
  const value = { sessionId: session._id, enabled, salt, revision: (old?.revision ?? 0) + 1, graph: enabled && state?.status === "ready" ? await redactNetworkGraph(state.graph, salt) : null, updatedAt: Date.now() };
  if (old) await ctx.db.patch(old._id, value); else await ctx.db.insert("networkPresentation", value); return null;
} });
export const stage = query({ args: { sessionId: v.id("presentations") }, handler: async (ctx, { sessionId }) => {
  const userId = await getAuthUserId(ctx), session = await ctx.db.get(sessionId);
  if (!userId || !session || session.desktopUserId !== userId || session.expiresAt <= Date.now() || ["waiting", "revoked", "expired"].includes(session.status)) return null;
  const stage = await ctx.db.query("networkPresentation").withIndex("by_session", q => q.eq("sessionId", sessionId)).unique();
  return stage?.enabled ? { graph: stage.graph, revision: stage.revision, updatedAt: stage.updatedAt } : null;
} });
export const input = internalQuery({ args: { userId: v.id("users"), revision: v.number() }, handler: async (ctx, args) => {
  const state = await networkFor(ctx, args.userId); return state?.revision === args.revision && state.status === "loading" ? await networkInput(ctx, args.userId) : null;
} });
export const commit = internalMutation({ args: { userId: v.id("users"), revision: v.number(), graph: networkGraph, failed: v.boolean() }, handler: async (ctx, args) => {
  const state = await networkFor(ctx, args.userId); if (!state || state.revision !== args.revision || state.status !== "loading") return false;
  const verified = args.failed ? null : verifyNetworkGraph(await networkInput(ctx, args.userId), args.graph);
  await ctx.db.patch(state._id, { status: verified ? "ready" : "error", graph: verified ?? { nodes: [], edges: [] }, error: verified ? null : "Live graph is unavailable. Your saved context is safe; retry shortly.", updatedAt: Date.now(), generatedAt: verified ? Date.now() : null });
  await publishNetwork(ctx, args.userId); return !!verified;
} });
export const timeout = internalMutation({ args: { userId: v.id("users"), revision: v.number() }, handler: async (ctx, args) => {
  const state = await networkFor(ctx, args.userId);
  if (state?.revision === args.revision && state.status === "loading") { await ctx.db.patch(state._id, { status: "error", error: "Live graph timed out. Your saved context is safe; retry shortly.", updatedAt: Date.now() }); await publishNetwork(ctx, args.userId); }
  return null;
} });
