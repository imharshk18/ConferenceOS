import { config } from "dotenv";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { withGraph } from "../packages/core/graph";
import { isRedactedSocialProof } from "../packages/core/social";
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });
const checks: Record<string, boolean> = {};
let step = "authentication";
async function until<T>(
  read: () => Promise<T>,
  accept: (v: T) => boolean,
): Promise<T> {
  for (let i = 0; i < 70; i++) {
    const value = await read();
    if (accept(value)) return value;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Timed out");
}
async function main() {
  const url = process.env.CONVEX_URL;
  if (!url) throw new Error("Missing deployment");
  const a = new ConvexHttpClient(url),
    b = new ConvexHttpClient(url),
    c = new ConvexHttpClient(url),
    d = new ConvexHttpClient(url);
  const clients = [a, b, c, d];
  let connectionId: any;
  let sessionId: any;
  let postId: any;
  try {
    for (const client of clients) {
      const result = await client.action(api.auth.signIn, {
        provider: "anonymous",
      });
      assert.ok(result.tokens?.token);
      client.setAuth(result.tokens.token);
    }
    for (const [client, name, goal] of [
      [a, "Maya Demo", "Find an AI engineer"],
      [b, "Aarnav Demo", "Build production agents"],
      [c, "Isolated Demo", "Explore Universe"],
    ] as const)
      await client.mutation(api.social.saveProfile, {
        name,
        headline: "ConferenceOS test profile",
        goal,
        skillIds: ["ai"],
        color: "#bda4f6",
      });
    step = "pairing";
    const pair = await d.mutation(api.presentation.create, {});
    sessionId = pair.sessionId;
    assert.equal(
      (
        await b.mutation(api.presentation.pair, {
          code: pair.code,
          approvedTopicIds: [],
        })
      ).ok,
      true,
    );
    assert.equal(await d.query(api.social.stage, { sessionId }), null);
    await b.mutation(api.social.setStageSharing, { enabled: true });
    step = "mutual connection";
    const invite = await a.mutation(api.social.createInvite, {});
    assert.equal(
      (await b.mutation(api.social.requestConnection, { code: invite.code }))
        .ok,
      true,
    );
    connectionId = (await a.query(api.social.mine, {}))!.connections[0].id;
    assert.equal(
      (await b.query(api.social.mine, {}))!.connections[0].status,
      "pending",
    );
    await a.mutation(api.social.respondConnection, {
      connectionId,
      accept: true,
    });
    assert.equal(
      (await b.query(api.social.mine, {}))!.connections[0].status,
      "accepted",
    );
    checks.mutualConnection = true;
    assert.deepEqual(await d.query(api.social.stage, { sessionId }), {
      kind: "connection",
      revision: 3,
      proof: null,
      updatedAt: (await d.query(api.social.stage, { sessionId }))!.updatedAt,
      networkCount: 1,
    });
    checks.anonymousConnectionEvent = true;
    step = "memory consent";
    await a.mutation(api.social.saveMemory, {
      connectionId,
      summary:
        "At Universe we discussed production AI agents. Maya is building a team and Aarnav works on reliable agent tooling.",
      topicIds: ["ai"],
    });
    const memory = (await b.query(api.social.mine, {}))!.memories[0];
    postId = await a.mutation(api.social.publishDemoPost, {
      excerpt:
        "Demo: Looking for an AI engineer to help ship production agents.",
      topicIds: ["ai"],
    });
    let state = await until(
      () => b.query(api.social.mine, {}),
      (v) => v?.feed.status === "ready" || v?.feed.status === "error",
    );
    assert.equal(state!.feed.status, "ready");
    assert.equal(state!.feed.items.length, 0);
    checks.unapprovedMemoryExcluded = true;
    await b.mutation(api.social.approveMemory, {
      memoryId: memory.id,
      revision: memory.revision,
    });
    step = "live graph calculation";
    state = await until(
      () => b.query(api.social.mine, {}),
      (v) => v?.feed.status === "ready" || v?.feed.status === "error",
    );
    assert.equal(state!.feed.status, "ready");
    assert.equal(state!.feed.items.length, 1);
    const card = state!.feed.items[0];
    assert.equal(card.name, "Maya Demo");
    assert.equal(card.provenance, "simulation");
    checks.realFalkorDBRecommendation = true;
    step = "exact graph path";
    const edgeIds = card.proof.edges.map((e) =>
      Number(e.id.replace("falkor:", "")),
    );
    const rows = await withGraph(
      async (graph) =>
        (
          await graph.roQuery(
            "MATCH (a:COSRecord)-[e]->(b:COSRecord) WHERE id(e) IN $ids RETURN id(e) AS id,a.key AS source,b.key AS target,type(e) AS kind",
            { params: { ids: edgeIds } },
          )
        ).data ?? [],
    );
    for (const edge of card.proof.edges)
      assert.ok(
        rows.some(
          (r: any) =>
            `falkor:${r.id}` === edge.id &&
            r.source === edge.source &&
            r.target === edge.target &&
            r.kind === edge.kind,
        ),
      );
    assert.equal(card.proof.traversalNodeIds.length, 5);
    checks.exactReturnedEdgesVerifiedInDatabase = true;
    step = "user isolation";
    const stranger = (await c.query(api.social.mine, {}))!;
    assert.equal(stranger.connections.length, 0);
    assert.equal(stranger.memories.length, 0);
    assert.equal(stranger.feed.items.length, 0);
    assert.equal(await c.query(api.social.stage, { sessionId }), null);
    checks.userIsolation = true;
    step = "redacted projection";
    await b.mutation(api.social.presentPath, { cardId: card.id });
    const stage = await d.query(api.social.stage, { sessionId });
    assert.ok(stage?.proof && isRedactedSocialProof(stage.proof));
    for (const sensitive of [
      "Maya",
      "Aarnav",
      card.connectionId,
      card.memoryId,
      card.postId,
      card.summary,
      "AI & agents",
    ])
      assert.ok(!JSON.stringify(stage).includes(sensitive));
    checks.noPersonalDataOnDesktop = true;
    await b.mutation(api.social.setStageSharing, { enabled: false });
    assert.equal((await d.query(api.social.stage, { sessionId }))!.proof, null);
    checks.clearStageConsent = true;
    step = "memory revision";
    await a.mutation(api.social.saveMemory, {
      connectionId,
      memoryId: memory.id,
      revision: memory.revision,
      summary: "Updated notes: building reliable agents with observability.",
      topicIds: ["ai"],
    });
    let rejected = false;
    try {
      await b.mutation(api.social.approveMemory, {
        memoryId: memory.id,
        revision: memory.revision,
      });
    } catch {
      rejected = true;
    }
    assert.ok(rejected);
    checks.unseenMemoryRevisionRejected = true;
    assert.equal((await b.query(api.social.mine, {}))!.feed.items.length, 0);
    const revised = (await b.query(api.social.mine, {}))!.memories[0];
    await b.mutation(api.social.approveMemory, {
      memoryId: revised.id,
      revision: revised.revision,
    });
    await until(
      () => b.query(api.social.mine, {}),
      (v) => v?.feed.status === "ready" && v.feed.items.length === 1,
    );
    step = "source replay";
    await a.mutation(api.social.loadBrightDataDemo, {});
    state = await until(
      () => b.query(api.social.mine, {}),
      (v) => v?.feed.status === "ready" && v.feed.items.length === 2,
    );
    assert.ok(
      state!.feed.items.some(
        (i) =>
          i.provenance === "brightdata-demo" &&
          i.sourceUrl?.includes("x.com/sa64r/status/") &&
          i.proof.edges.some((e) => e.kind === "SHARED_SOURCE") &&
          !i.proof.edges.some((e) => e.kind === "WROTE"),
      ),
    );
    checks.brightDataReplayHasProvenance = true;
    step = "latest revision";
    await Promise.all([
      b.mutation(api.social.retryFeed, {}),
      b.mutation(api.social.retryFeed, {}),
      b.mutation(api.social.retryFeed, {}),
    ]);
    const latest = (await b.query(api.social.mine, {}))!.feed.revision;
    state = await until(
      () => b.query(api.social.mine, {}),
      (v) => v?.feed.revision === latest && v.feed.status === "ready",
    );
    checks.latestRevisionWins = true;
    step = "revocation";
    await b.mutation(api.social.presentPath, {
      cardId: state!.feed.items[0].id,
    });
    await a.mutation(api.social.revokeConnection, { connectionId });
    assert.equal((await b.query(api.social.mine, {}))!.feed.items.length, 0);
    assert.equal((await d.query(api.social.stage, { sessionId }))!.proof, null);
    checks.revokeClearsFeedAndStage = true;
    await d.mutation(api.presentation.revoke, { sessionId });
    assert.equal(await d.query(api.social.stage, { sessionId }), null);
    checks.pairingRevocation = true;
  } finally {
    if (postId)
      await a.mutation(api.social.retractPost, { postId }).catch(() => {});
    if (connectionId)
      await a
        .mutation(api.social.revokeConnection, { connectionId })
        .catch(() => {});
    if (sessionId)
      await d.mutation(api.presentation.revoke, { sessionId }).catch(() => {});
    for (const client of clients)
      await client.action(api.auth.signOut, {}).catch(() => {});
  }
  const report = {
    checkedAt: new Date().toISOString(),
    checks,
    allPassed: Object.values(checks).every(Boolean),
    note: "Uses separate authenticated cloud identities, actual FalkorDB queries and direct edge-ID verification. All sample conversations and connections are explicitly simulated.",
  };
  await writeFile(
    "phase3-cloud-verification.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
}
main().catch(() => {
  console.error(`FAIL Phase 3 cloud check at: ${step}. No secrets logged.`);
  process.exitCode = 1;
});
