import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { networkSnapshot, networkStats, verifyNetworkGraph, redactNetworkGraph, validSharedContextGraph, type NetworkInput } from "../packages/core/network";
import { talks } from "../packages/core/data";
const modules = import.meta.glob("../convex/**/*.ts");
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-24T20:00:00Z")); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
const profile = (name: string, networkAreas: string[]) => ({ name, headline: "Creator", goal: "Private ambition", skillIds: [], networkAreas, color: "#abcdef" });
async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => ({ a: await ctx.db.insert("users", {}), b: await ctx.db.insert("users", {}), d: await ctx.db.insert("users", {}) }));
  const a = t.withIdentity({ subject: `${ids.a}|a` }), b = t.withIdentity({ subject: `${ids.b}|b` }), d = t.withIdentity({ subject: `${ids.d}|d` });
  await a.mutation(api.social.saveProfile, profile("Private A", [])); await b.mutation(api.social.saveProfile, profile("Private B", ["content", "design"]));
  const invite = await a.mutation(api.social.createInvite, {}); await b.mutation(api.social.requestConnection, { code: invite.code });
  const connectionId = (await a.query(api.social.mine, {}))!.connections[0].id;
  await a.mutation(api.social.respondConnection, { connectionId, accept: true });
  return { t, ids, a, b, d, connectionId };
}
async function commit(s: Awaited<ReturnType<typeof setup>>) {
  const state = (await s.a.query(api.network.mine, {}))!;
  const input = (await s.t.query(internal.network.input, { userId: s.ids.a, revision: state.revision }))!;
  const snapshot = networkSnapshot(input), graph = { ...snapshot, edges: snapshot.edges.map((e, i) => ({ ...e, id: `falkor:${100 + i}` })) };
  expect(await s.t.mutation(internal.network.commit, { userId: s.ids.a, revision: state.revision, graph, failed: false })).toBe(true);
  return { input, graph, revision: state.revision };
}
it("counts accepted declared areas once; counts conversation context only after both approve", async () => {
  const s = await setup();
  let state = (await s.a.query(api.network.mine, {}))!;
  expect(state.stats.areas.find(a => a.id === "content")).toMatchObject({ connections: 1, memoryCount: 0, score: 15 });
  expect(state.stats.areas.find(a => a.id === "ai")?.score).toBe(0);
  await s.a.mutation(api.social.saveMemory, { connectionId: s.connectionId, summary: "Private creative discussion", topicIds: [], networkAreas: ["content"] });
  expect((await s.a.query(api.network.mine, {}))!.stats.sharedMemories).toBe(0);
  const m = (await s.b.query(api.social.mine, {}))!.memories[0]; expect(m.networkAreas).toEqual(["content"]);
  await s.b.mutation(api.social.approveMemory, { memoryId: m.id, revision: m.revision });
  state = (await s.a.query(api.network.mine, {}))!;
  expect(state.stats.areas.find(a => a.id === "content")).toMatchObject({ connections: 1, memoryCount: 1, score: 25 });
  const { graph } = await commit(s); expect(graph.edges.some(e => e.kind === "REMEMBERS")).toBe(true);
  await s.a.mutation(api.social.revokeMemory, { memoryId: m.id });
  expect((await s.a.query(api.network.mine, {}))!.stats.sharedMemories).toBe(0);
  expect((await s.a.query(api.network.mine, {}))!.graph.edges).toEqual([]);
});
it("keeps private learning separate from network score and self-reported attendance", async () => {
  const s = await setup(), captureId = await s.a.mutation(api.captures.create, { kind: "session", title: "Private learning", notes: "Notes", talkId: talks[0].id, consentConfirmed: true });
  await s.a.mutation(api.captures.approve, { captureId, revision: 1, summary: "Creative techniques", topicIds: [], networkAreas: ["content"], takeaways: [], actions: [], attended: false });
  const a = (await s.a.query(api.network.mine, {}))!, b = (await s.b.query(api.network.mine, {}))!;
  expect(a.stats).toMatchObject({ learningCaptures: 1, sessionsAttended: 0 });
  expect(a.stats.areas.find(a => a.id === "content")).toMatchObject({ score: 15, learningCount: 1 });
  expect(b.stats.learningCaptures).toBe(0);
  await s.a.mutation(api.captures.remove, { captureId }); expect((await s.a.query(api.network.mine, {}))!.stats.learningCaptures).toBe(0);
});
it("rejects stale results, duplicate commits and invented or reversed relationships", async () => {
  const s = await setup(), old = await commit(s);
  await s.b.mutation(api.social.saveProfile, profile("Private B", ["design"]));
  expect(await s.t.mutation(internal.network.commit, { userId: s.ids.a, revision: old.revision, graph: old.graph, failed: false })).toBe(false);
  const current = (await s.a.query(api.network.mine, {}))!;
  expect(await s.t.mutation(internal.network.commit, { userId: s.ids.a, revision: current.revision, graph: old.graph, failed: false })).toBe(false);
  expect((await s.a.query(api.network.mine, {}))!.status).toBe("error");
  const reversed = structuredClone(old.graph); [reversed.edges[0].source, reversed.edges[0].target] = [reversed.edges[0].target, reversed.edges[0].source];
  expect(verifyNetworkGraph(old.input, reversed)).toBeNull();
  const invented = structuredClone(old.graph); invented.edges[0].id = "invented:1"; expect(verifyNetworkGraph(old.input, invented)).toBeNull();
});
it("shares only salted anonymous topology after separate opt-in and revokes immediately", async () => {
  const s = await setup(); await commit(s);
  const pairing = await s.d.mutation(api.presentation.create, {}); await s.a.mutation(api.presentation.pair, { code: pairing.code, approvedTopicIds: [] });
  expect(await s.d.query(api.network.stage, { sessionId: pairing.sessionId })).toBeNull();
  await s.a.mutation(api.network.setPresentation, { enabled: true });
  const stage = (await s.d.query(api.network.stage, { sessionId: pairing.sessionId }))!; expect(validSharedContextGraph(stage.graph!)).toBe(true);
  for (const value of ["Private A", "Private B", "content", "design", s.connectionId, s.ids.a, "Private ambition"]) expect(JSON.stringify(stage)).not.toContain(value);
  expect(await s.b.query(api.network.stage, { sessionId: pairing.sessionId })).toBeNull();
  await s.a.mutation(api.network.setPresentation, { enabled: false }); expect(await s.d.query(api.network.stage, { sessionId: pairing.sessionId })).toBeNull();
  await s.a.mutation(api.network.setPresentation, { enabled: true }); await s.d.mutation(api.presentation.revoke, { sessionId: pairing.sessionId });
  expect(await s.d.query(api.network.stage, { sessionId: pairing.sessionId })).toBeNull();
});
it("expires network presentation and does not leak private graph to unauthenticated users", async () => {
  const s = await setup(); await commit(s);
  const p = await s.d.mutation(api.presentation.create, {}); await s.a.mutation(api.presentation.pair, { code: p.code, approvedTopicIds: [] }); await s.a.mutation(api.network.setPresentation, { enabled: true });
  expect(await s.t.query(api.network.mine, {})).toBeNull();
  vi.setSystemTime(p.expiresAt); expect(await s.d.query(api.network.stage, { sessionId: p.sessionId })).toBeNull();
  await expect(s.a.mutation(api.network.setPresentation, { enabled: true })).rejects.toThrow();
});
it("does not relabel graph failures as live or erase saved context", async () => {
  const s = await setup(), state = (await s.a.query(api.network.mine, {}))!;
  await s.t.mutation(internal.network.commit, { userId: s.ids.a, revision: state.revision, graph: { nodes: [], edges: [] }, failed: true });
  expect(await s.a.query(api.network.mine, {})).toMatchObject({ status: "error", generatedAt: null, graph: { nodes: [], edges: [] }, stats: { connections: 1 } });
});
it("uses distinct session aliases and transparent capped coverage, not personal skill ratings", async () => {
  const input: NetworkInput = { scope: "test", revision: 1, me: { name: "Me", areaIds: ["ai"] }, connections: [{ id: "c", name: "Creator", headline: "", color: "#fff", areaIds: ["ai", "content"], acceptedAt: Date.now() }], memories: [], captures: [] };
  const snapshot = networkSnapshot(input), graph = { ...snapshot, edges: snapshot.edges.map((e,i) => ({ ...e, id: `falkor:${i}` })) };
  expect(networkStats(input, Date.now()).areas.find(a => a.id === "ai")?.score).toBe(15);
  const a = await redactNetworkGraph(graph, "a"), b = await redactNetworkGraph(graph, "b");
  expect(a.nodes[0].id).not.toBe(b.nodes[0].id); expect(validSharedContextGraph(a)).toBe(true);
  a.nodes[0].label = "Private name"; expect(validSharedContextGraph(a)).toBe(false);
});
it("does not count multiple captures of the same session as multiple attendances", () => {
  const capture = { kind: "session" as const, title: "Session", summary: "Learning", areaIds: ["content"], attended: true, talkId: "official-session" };
  const input: NetworkInput = { scope: "test", revision: 1, me: { name: "Me", areaIds: [] }, connections: [], memories: [], captures: [{ ...capture, id: "one" }, { ...capture, id: "two" }] };
  expect(networkStats(input, Date.now())).toMatchObject({ learningCaptures: 2, sessionsAttended: 1 });
});
