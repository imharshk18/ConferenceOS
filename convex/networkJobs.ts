"use node";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { calculateNetworkGraph, deleteNetworkSnapshot } from "../packages/core/networkGraph";
import type { NetworkInput } from "../packages/core/network";
export const calculate = internalAction({ args: { userId: v.id("users"), revision: v.number() }, returns: v.null(), handler: async (ctx, args) => {
  const input: NetworkInput | null = await ctx.runQuery(internal.network.input, args);
  if (!input) return null;
  let accepted = false;
  try { const graph = await calculateNetworkGraph(input); accepted = await ctx.runMutation(internal.network.commit, { ...args, graph, failed: false }); }
  catch { await ctx.runMutation(internal.network.commit, { ...args, graph: { nodes: [], edges: [] }, failed: true }); }
  finally { if (!accepted) await ctx.scheduler.runAfter(0, internal.networkJobs.cleanup, { scope: input.scope }); }
  return null;
} });
export const cleanup = internalAction({ args: { scope: v.string(), attempt: v.optional(v.number()) }, returns: v.null(), handler: async (ctx, { scope, attempt = 0 }) => {
  try { await deleteNetworkSnapshot(scope); } catch { if (attempt < 2) await ctx.scheduler.runAfter(30_000 * (attempt + 1), internal.networkJobs.cleanup, { scope, attempt: attempt + 1 }); else console.warn("Superseded opaque network graph needs cleanup after graph recovery."); }
  return null;
} });
