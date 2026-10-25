/** Bounded development verification. Two three-post imports only with --allow-paid-imports.
 * Synthetic captures and isolated demo accounts; never impersonates the real source author. */
import { config } from "dotenv";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { talks } from "../packages/core/data";
import type { Id } from "../convex/_generated/dataModel";
config({ path: ".env.local", quiet: true });
const url = process.env.CONVEX_URL!;
const site = url.replace(/\.convex\.cloud$/, ".convex.site");
const checks: Record<string, boolean | string | number> = {};
const providerResults: unknown[] = [];
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor<T>(fn: () => Promise<T>, done: (v: T) => boolean, seconds: number) {
  for (let i = 0; i < seconds; i += 2) { const value = await fn(); if (done(value)) return value; await delay(2000); }
  return await fn();
}
async function main() {
  const a = new ConvexHttpClient(url), b = new ConvexHttpClient(url), c = new ConvexHttpClient(url);
  const tokens: string[] = [], captures: Id<"captures">[] = [], sources: Id<"publicSources">[] = [];
  let connectionId: Id<"connections"> | undefined;
  try {
    for (const client of [a, b, c]) { const auth = await client.action(api.auth.signIn, { provider: "anonymous" }); assert.ok(auth.tokens?.token); client.setAuth(auth.tokens.token); tokens.push(auth.tokens.token); }
    for (const [client, name] of [[a, "Journey QA viewer"], [b, "Simulated source contact — not the real author"], [c, "Isolated QA user"]] as const) await client.mutation(api.social.saveProfile, { name, headline: "Isolated synthetic test", goal: "Build reliable AI agents", skillIds: ["ai", "graph"], color: "#bda4f6" });
    const invite = await a.mutation(api.social.createInvite, {});
    assert.equal((await b.mutation(api.social.requestConnection, { code: invite.code })).ok, true);
    connectionId = (await a.query(api.social.mine, {}))!.connections[0].id;
    await a.mutation(api.social.respondConnection, { connectionId, accept: true });
    checks.connection = true;
    const captureId = await a.mutation(api.captures.create, { kind: "conversation", title: "Synthetic test conversation", connectionId,
      notes: "Synthetic test only. We discussed AI agents, graph context, and comparing evaluation approaches. No real people or commitments are represented.", consentConfirmed: true });
    captures.push(captureId);
    const wav = await readFile("work/phase4/synthetic-conversation.wav");
    assert.ok(wav.length > 10_000, "Generate a nonempty synthetic speech fixture before testing transcription");
    const unauth = await fetch(`${site}/capture-upload?captureId=${captureId}`, { method: "POST", headers: { "Content-Type": "audio/wav" }, body: wav });
    assert.equal(unauth.status, 401);
    const foreign = await fetch(`${site}/capture-upload?captureId=${captureId}`, { method: "POST", headers: { Authorization: `Bearer ${tokens[1]}`, "Content-Type": "audio/wav" }, body: wav });
    assert.equal(foreign.status, 400);
    const upload = await fetch(`${site}/capture-upload?captureId=${captureId}`, { method: "POST", headers: { Authorization: `Bearer ${tokens[0]}`, "Content-Type": "audio/wav" }, body: wav });
    assert.equal(upload.status, 200);
    // Generate and decode a valid synthetic image, with no third-party personal data.
    const { PNG } = createRequire(import.meta.url)("pngjs");
    const fixture = new PNG({ width: 256, height: 256 });
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const i = (y * 256 + x) * 4;
      fixture.data[i] = x; fixture.data[i + 1] = y; fixture.data[i + 2] = 180; fixture.data[i + 3] = 255;
    }
    const png = PNG.sync.write(fixture); assert.equal(PNG.sync.read(png).width, 256);
    assert.equal((await fetch(`${site}/capture-upload?captureId=${captureId}`, { method: "POST", headers: { Authorization: `Bearer ${tokens[0]}`, "Content-Type": "image/png" }, body: png })).status, 200);
    const mediaUrl = `${site}/capture-media?captureId=${captureId}&index=0`;
    assert.equal((await fetch(mediaUrl)).status, 401);
    assert.equal((await fetch(mediaUrl, { headers: { Authorization: `Bearer ${tokens[1]}` } })).status, 404);
    assert.equal((await fetch(mediaUrl, { headers: { Authorization: `Bearer ${tokens[0]}` } })).status, 200);
    assert.deepEqual(await b.query(api.captures.mine, {}), []);
    checks.authenticatedMediaIsolation = true;
    console.log("PASS: private upload/read isolation; starting saved-capture analysis.");
    await a.mutation(api.captures.analyze, { captureId, revision: 1 });
    const capture = await waitFor(async () => (await a.query(api.captures.mine, {}))[0], r => r.status !== "processing", 150);
    checks.openaiAnalysis = capture.status === "review" ? "PASS: real audio + image + notes analysis" : `BLOCKED: ${capture.error ?? capture.status}`;
    checks.transcriptReturned = !!capture.transcript;
    assert.equal((await b.query(api.social.mine, {}))!.memories.length, 0);
    if (capture.status === "processing") throw new Error("Capture analysis still running after its deadline");
    const draft = capture.draft ?? { summary: "Synthetic reviewed conversation about reliable AI agents and graph context.", topicIds: ["ai", "graph"], takeaways: ["Evaluate reliability."], actions: ["Suggest comparing approaches."] };
    await a.mutation(api.captures.approve, { captureId, revision: capture.revision, ...draft, topicIds: ["ai", "graph"] });
    const memory = (await b.query(api.social.mine, {}))!.memories[0];
    assert.equal(memory.status, "draft");
    await b.mutation(api.social.approveMemory, { memoryId: memory.id, revision: memory.revision });
    assert.equal((await b.query(api.social.mine, {}))!.memories[0].status, "shared");
    checks.reviewBeforeSharedMemory = true;
    const session = await a.mutation(api.captures.create, { kind: "session", title: "Synthetic session capture", talkId: talks[0].id, notes: "Recorded learning context", consentConfirmed: true });
    captures.push(session);
    await a.mutation(api.captures.approve, { captureId: session, revision: 1, ...draft, attended: true });
    assert.equal((await a.query(api.captures.mine, {})).find(c => c.id === session)?.attended, true);
    checks.selfReportedSessionAttendance = true;
    if (process.argv.includes("--allow-paid-imports")) {
      for (const profileUrl of ["https://x.com/sa64r", "https://www.linkedin.com/in/harsh-kadodwala"]) {
        const sourceId = await a.mutation(api.sources.add, { connectionId, profileUrl, confirmed: true }); sources.push(sourceId);
        await a.mutation(api.sources.refresh, { sourceId });
      }
      console.log("Started exactly two public-profile imports, capped at three posts each. No automatic trigger retries.");
      await waitFor(() => a.query(api.sources.mine, {}), rows => rows.length === 2 && rows.every(s => ["ready", "error", "uncertain"].includes(s.status)), 280);
      for (const source of await a.query(api.sources.mine, {})) providerResults.push({ platform: source.platform, status: source.status, posts: source.postCount, error: source.error });
      assert.deepEqual(await b.query(api.sources.mine, {}), []);
      assert.deepEqual((await b.query(api.social.mine, {}))!.posts, []);
      checks.privateSourceAssociation = true;
      const feed = await waitFor(async () => (await a.query(api.social.mine, {}))!.feed, f => f.status !== "loading", 40);
      checks.graphFeedStatus = feed.status;
      checks.importedOpportunityCards = feed.items.filter(i => i.provenance === "brightdata-public").length;
      checks.publicPostsUseSourceEdge = feed.items.filter(i => i.provenance === "brightdata-public").every(i => i.proof.edges.some(e => e.kind === "SHARED_SOURCE"));
      assert.deepEqual((await c.query(api.social.mine, {}))!.feed.items, []);
    }
    await a.mutation(api.captures.remove, { captureId }); captures.splice(captures.indexOf(captureId), 1);
    assert.equal((await fetch(mediaUrl, { headers: { Authorization: `Bearer ${tokens[0]}` } })).status, 404);
    assert.equal((await b.query(api.social.mine, {}))!.memories.length, 0);
    checks.removalRevokesMediaAndMemory = true;
  } finally {
    for (const sourceId of sources) await a.mutation(api.sources.remove, { sourceId }).catch(() => {});
    for (const captureId of captures) await a.mutation(api.captures.remove, { captureId }).catch(() => {});
    if (connectionId) await a.mutation(api.social.revokeConnection, { connectionId }).catch(() => {});
    for (const client of [a, b, c]) await client.action(api.auth.signOut, {}).catch(() => {});
    const report = { checkedAt: new Date().toISOString(), checks, providers: providerResults, safety: "Synthetic test data only. Max 2 triggers / 6 records; isolated sources and captures removed after test." };
    await writeFile(process.argv.includes("--ai-only") ? "phase5-ai-verification.json" : "phase4-cloud-verification.json", JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Verification failed"); process.exitCode = 1; });
