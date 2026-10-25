import { v } from "convex/values";
export const networkNode = v.object({ id: v.string(), kind: v.union(v.literal("self"), v.literal("person"), v.literal("area"), v.literal("memory"), v.literal("session"), v.literal("goal")), label: v.string(), detail: v.string(), areaIds: v.array(v.string()), color: v.string(), evidence: v.union(v.literal("accepted-connection"), v.literal("self-declared"), v.literal("mutually-approved"), v.literal("reviewed-learning"), v.literal("reviewed-goal"), v.literal("demo-simulation")) });
export const networkEdge = v.object({ id: v.string(), source: v.string(), target: v.string(), kind: v.string() });
export const networkGraph = v.object({ nodes: v.array(networkNode), edges: v.array(networkEdge) });
export const sharedContextGraph = v.object({ nodes: v.array(v.object({ id: v.string(), kind: v.string(), label: v.string() })), edges: v.array(networkEdge) });
