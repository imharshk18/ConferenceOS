import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { talks } from "../packages/core/data";
import { publicProfile, discoveryRequest, normalizePublicPost } from "../packages/core/publicSources";
import { cleanDraft, mediaType } from "../packages/core/capture";
vi.mock("../packages/core/socialGraph", () => ({ calculateSocialGraph: vi.fn(async () => []), deleteSocialSnapshot: vi.fn(async () => {}) }));
vi.mock("../packages/core/graph", () => ({ recommend: vi.fn(async () => ({ talks: [], people: [] })) }));
const modules = import.meta.glob("../convex/**/*.ts");
const draft = { summary: "We discussed production AI agents.", topicIds: ["ai"], takeaways: ["Reliable evaluations matter."], actions: ["Suggest comparing evaluation approaches."] };
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-24T20:00:00Z")); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => ({ a: await ctx.db.insert("users", {}), b: await ctx.db.insert("users", {}), c: await ctx.db.insert("users", {}) }));
  const a = t.withIdentity({ subject: `${ids.a}|a` }), b = t.withIdentity({ subject: `${ids.b}|b` }), c = t.withIdentity({ subject: `${ids.c}|c` });
  for (const [client, name] of [[a, "Demo One"], [b, "Demo Two"], [c, "Stranger"]] as const) await client.mutation(api.social.saveProfile, { name, headline: "", goal: "AI agents", skillIds: ["ai"], color: "#aaaaaa" });
  const invite = await a.mutation(api.social.createInvite, {});
  await b.mutation(api.social.requestConnection, { code: invite.code });
  const connectionId = (await a.query(api.social.mine, {}))!.connections[0].id;
  await a.mutation(api.social.respondConnection, { connectionId, accept: true });
  return { t, ids, a, b, c, connectionId };
}
describe("Safe public-source normalization", () => {
  it("accepts public profiles/handles without OAuth and removes tracking parameters", () => {
    expect(publicProfile("@sa64r")).toEqual({ platform: "x", url: "https://x.com/sa64r" });
    expect(publicProfile("https://www.linkedin.com/in/harsh-kadodwala/?isSelfProfile=true").url).toBe("https://www.linkedin.com/in/harsh-kadodwala");
  });
  it("rejects arbitrary hosts, credentials, ports, post URLs and navigation pages", () => {
    for (const value of ["http://x.com/one", "https://x.com.evil.test/one", "https://user@x.com/one", "https://x.com:123/one", "https://x.com/one/status/123", "https://x.com/home", "file:///etc/passwd", "https://localhost/one"]) expect(() => publicProfile(value)).toThrow();
  });
  it("bounds real profile discovery to three original posts and chosen dates", () => {
    const spec = discoveryRequest("https://x.com/sa64r", "2026-05-01", "2026-10-24");
    expect(spec.url).toContain("discover_by=profile_url");
    expect(spec.body.limit_per_input).toBe(3);
    expect(spec.body.input[0]).toMatchObject({ num_of_posts: 3, include_reposts: false });
  });
  it("rejects wrong authors, reposts, missing dates and future/old posts", () => {
    const raw = { url: "https://x.com/sa64r/status/123", description: "Hiring AI engineers for graph agents", date_posted: "2026-07-09" };
    const normalize = (r: unknown) => normalizePublicPost(r, "https://x.com/sa64r", "2026-05-01", "2026-10-24");
    expect(normalize(raw)?.topicIds).toEqual(["ai", "graph"]);
    for (const r of [{ ...raw, url: "https://x.com/wrong/status/123" }, { ...raw, is_repost: true }, { ...raw, date_posted: "" }, { ...raw, date_posted: "2028-01-01" }, { ...raw, date_posted: "2025-01-01" }]) expect(normalize(r)).toBeNull();
  });
  it("requires matching LinkedIn author profile and keeps only a short excerpt", () => {
    const raw = { url: "https://www.linkedin.com/posts/harsh-test-123", use_url: "https://www.linkedin.com/in/harsh-kadodwala/", post_text: "AI " + "test ".repeat(60), date_posted: "2026-10-22" };
    expect(normalizePublicPost(raw, "https://www.linkedin.com/in/harsh-kadodwala", "2026-05-01", "2026-10-24")?.excerpt.split(" ")).toHaveLength(22);
    expect(normalizePublicPost({ ...raw, use_url: "https://www.linkedin.com/in/wrong" }, "https://www.linkedin.com/in/harsh-kadodwala", "2026-05-01", "2026-10-24")).toBeNull();
  });
});
describe("Private reviewed capture", () => {
  it("validates media/draft bounds and known topics", () => {
    expect(mediaType("audio/webm;codecs=opus").kind).toBe("audio");
    expect(() => mediaType("text/html")).toThrow();
    expect(() => cleanDraft({ ...draft, topicIds: ["invented"] })).toThrow();
    expect(() => cleanDraft({ ...draft, summary: "x".repeat(1001) })).toThrow();
  });
  it("requires capture consent, accepted participants, and official sessions", async () => {
    const { a, c, connectionId } = await setup();
    const args = { kind: "conversation" as const, title: "Conversation", notes: "AI", connectionId, consentConfirmed: true };
    await expect(a.mutation(api.captures.create, { ...args, consentConfirmed: false })).rejects.toThrow();
    await expect(c.mutation(api.captures.create, args)).rejects.toThrow();
    await expect(a.mutation(api.captures.create, { kind: "session", title: "Talk", notes: "", talkId: "fake", consentConfirmed: true })).rejects.toThrow();
  });
  it("keeps raw context private; approval creates only an owner-approved memory until peer reviews", async () => {
    const { a, b, c, connectionId } = await setup();
    const id = await a.mutation(api.captures.create, { kind: "conversation", title: "Meeting", notes: "Private unreviewed words", connectionId, consentConfirmed: true });
    expect(await b.query(api.captures.mine, {})).toEqual([]);
    expect(await c.query(api.captures.mine, {})).toEqual([]);
    expect((await b.query(api.social.mine, {}))!.memories).toEqual([]);
    await expect(b.mutation(api.captures.approve, { captureId: id, revision: 1, ...draft })).rejects.toThrow();
    await a.mutation(api.captures.approve, { captureId: id, revision: 1, ...draft });
    expect((await a.query(api.captures.mine, {}))[0].draftOrigin).toBe("manual");
    const memory = (await b.query(api.social.mine, {}))!.memories[0];
    expect(memory.status).toBe("draft"); expect(memory.summary).not.toContain("Private unreviewed");
    await b.mutation(api.social.approveMemory, { memoryId: memory.id, revision: memory.revision });
    expect((await b.query(api.social.mine, {}))!.memories[0].status).toBe("shared");
    await expect(a.mutation(api.captures.approve, { captureId: id, revision: 1, ...draft })).rejects.toThrow();
    await a.mutation(api.captures.remove, { captureId: id });
    expect((await b.query(api.social.mine, {}))!.memories).toEqual([]);
  });
  it("accepts only current agent results and refuses results after deletion or disconnect", async () => {
    const { a, t, connectionId } = await setup();
    const id = await a.mutation(api.captures.create, { kind: "conversation", title: "Meeting", notes: "AI", connectionId, consentConfirmed: true });
    await a.mutation(api.captures.analyze, { captureId: id, revision: 1 });
    expect(await t.mutation(internal.captures.finish, { captureId: id, revision: 1, transcript: "Old", draft, error: null })).toBe(false);
    expect(await t.mutation(internal.captures.finish, { captureId: id, revision: 2, transcript: "Current", draft, error: null })).toBe(true);
    expect(await t.mutation(internal.captures.finish, { captureId: id, revision: 2, transcript: "Duplicate", draft, error: null })).toBe(false);
    await a.mutation(api.captures.remove, { captureId: id });
    expect(await t.mutation(internal.captures.finish, { captureId: id, revision: 2, transcript: "Late", draft, error: null })).toBe(false);
  });
  it("approves goal topics into persistent preferences but never labels attendance automatically", async () => {
    const { a } = await setup();
    const id = await a.mutation(api.captures.create, { kind: "goal", title: "My goals", notes: "Learn AI agents", consentConfirmed: true });
    await a.mutation(api.captures.approve, { captureId: id, revision: 1, ...draft, attended: true });
    expect((await a.query(api.preferences.mine, {})).topicIds).toEqual(["ai"]);
    expect((await a.query(api.captures.mine, {}))[0].attended).toBe(false);
    vi.advanceTimersByTime(2001);
    const session = await a.mutation(api.captures.create, { kind: "session", title: "A real talk", notes: "Learned about agents", talkId: talks[0].id, consentConfirmed: true });
    await a.mutation(api.captures.approve, { captureId: session, revision: 1, ...draft, attended: true });
    expect((await a.query(api.captures.mine, {})).find(c => c.id === session)?.attended).toBe(true);
  });
  it("authenticates uploads/reads, rejects foreign uploads, bounds files and deletes stored media", async () => {
    const { a, b } = await setup();
    const id = await a.mutation(api.captures.create, { kind: "session", title: "Notes", notes: "AI", talkId: talks[0].id, consentConfirmed: true });
    const body = new Uint8Array([137, 80, 78, 71]);
    const path = `/capture-upload?captureId=${id}`;
    expect((await b.fetch(path, { method: "POST", headers: { "Content-Type": "image/png" }, body })).status).toBe(400);
    expect((await a.fetch(path, { method: "POST", headers: { "Content-Type": "text/html" }, body })).status).toBe(415);
    for (let i = 0; i < 3; i++) expect((await a.fetch(path, { method: "POST", headers: { "Content-Type": "image/png" }, body })).status).toBe(200);
    expect((await a.fetch(path, { method: "POST", headers: { "Content-Type": "image/png" }, body })).status).toBe(400);
    expect((await b.fetch(`/capture-media?captureId=${id}&index=0`)).status).toBe(404);
    expect((await a.fetch(`/capture-media?captureId=${id}&index=0`)).status).toBe(200);
    await a.mutation(api.captures.remove, { captureId: id });
    expect((await a.fetch(`/capture-media?captureId=${id}&index=0`)).status).toBe(404);
  });
  it("marks a missing OpenAI key as an error, never as an AI draft", async () => {
    const { a, t } = await setup(); vi.stubEnv("OPENAI_API_KEY", "");
    const id = await a.mutation(api.captures.create, { kind: "goal", title: "Goal", notes: "Build AI", consentConfirmed: true });
    await a.mutation(api.captures.analyze, { captureId: id, revision: 1 });
    await t.action(internal.captureJobs.analyze, { captureId: id, revision: 2 });
    const capture = (await a.query(api.captures.mine, {}))[0];
    expect(capture.status).toBe("error"); expect(capture.draft).toBeNull(); expect(capture.error).toContain("not configured");
  });
});
describe("Public posts stay in the requesting connection's private scope", () => {
  it("requires a real accepted connection and source confirmation; does not expose URLs to peers", async () => {
    const { a, b, c, connectionId } = await setup();
    const args = { connectionId, profileUrl: "https://x.com/sa64r", confirmed: true };
    await expect(c.mutation(api.sources.add, args)).rejects.toThrow();
    await expect(a.mutation(api.sources.add, { ...args, confirmed: false })).rejects.toThrow();
    await a.mutation(api.sources.add, args);
    expect(await b.query(api.sources.mine, {})).toEqual([]);
    expect(await c.query(api.sources.mine, {})).toEqual([]);
  });
  it("persists a single trigger claim and blocks ambiguous or duplicate paid starts", async () => {
    const { a, t, connectionId } = await setup();
    const sourceId = await a.mutation(api.sources.add, { connectionId, profileUrl: "https://x.com/sa64r", confirmed: true });
    await a.mutation(api.sources.refresh, { sourceId });
    const source = await t.run(ctx => ctx.db.get(sourceId)); const jobId = source!.jobId!;
    expect(await t.mutation(internal.sources.claim, { jobId })).not.toBeNull();
    expect(await t.mutation(internal.sources.claim, { jobId })).toBeNull();
    await t.mutation(internal.sources.unconfirmed, { jobId });
    expect((await a.query(api.sources.mine, {}))[0].status).toBe("uncertain");
    vi.advanceTimersByTime(600_001);
    await expect(a.mutation(api.sources.refresh, { sourceId })).rejects.toThrow();
  });
  it("deduplicates imported posts, isolates them from peer publication, and invalidates removed sources", async () => {
    const { a, b, c, t, ids, connectionId } = await setup();
    const sourceId = await a.mutation(api.sources.add, { connectionId, profileUrl: "https://x.com/sa64r", confirmed: true });
    await a.mutation(api.sources.refresh, { sourceId });
    const source = await t.run(ctx => ctx.db.get(sourceId)), jobId = source!.jobId!;
    const post = { url: "https://x.com/sa64r/status/123", excerpt: "Hiring AI engineers", topicIds: ["ai"], publishedAt: Date.now() - 1000 };
    expect(await t.mutation(internal.sources.finish, { jobId, posts: [post, post] })).toBe(true);
    expect((await a.query(api.sources.mine, {}))[0].postCount).toBe(1);
    expect((await b.query(api.social.mine, {}))!.posts).toEqual([]);
    expect((await c.query(api.social.mine, {}))!.feed.items).toEqual([]);
    const state = await t.run(ctx => ctx.db.query("socialIntelligence").withIndex("by_userId", q => q.eq("userId", ids.a)).unique());
    const input = await t.query(internal.social.calculationInput, { userId: ids.a, revision: state!.revision });
    expect(input!.posts[0].provenance).toBe("brightdata-public");
    await a.mutation(api.sources.remove, { sourceId });
    expect(await a.query(api.sources.mine, {})).toEqual([]);
    expect(await t.mutation(internal.sources.finish, { jobId, posts: [post] })).toBe(false);
  });
});
