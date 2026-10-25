import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import {
  calculateSocialGraph,
  deleteSocialSnapshot,
} from "../packages/core/socialGraph";
import {
  socialSnapshot,
  socialProof,
  feedItem,
  redactSocialProof,
  isRedactedSocialProof,
  type SocialInput,
  type FeedItem,
} from "../packages/core/social";
import type { GraphProof } from "../packages/core/intelligence";
vi.mock("../packages/core/socialGraph", () => ({
  calculateSocialGraph: vi.fn(),
  deleteSocialSnapshot: vi.fn(),
}));
const modules = import.meta.glob("../convex/**/*.ts");
function answer(input: SocialInput): FeedItem[] {
  const memory = input.memories[0],
    post = input.posts[0];
  if (!memory || !post) return [];
  const ids = [
    "me",
    "topic:ai",
    `memory:${memory.id}`,
    `peer:${memory.connectionId}`,
    `post:${post.id}`,
  ];
  const snapshot = socialSnapshot(input);
  const proof: GraphProof = {
    nodes: ids.map((id) => snapshot.nodes.find((n) => n.id === id)!),
    traversalNodeIds: ids,
    edges: [
      { id: "falkor:1", source: ids[0], target: ids[1], kind: "HAS_SKILL" },
      { id: "falkor:2", source: ids[2], target: ids[1], kind: "DISCUSSED" },
      { id: "falkor:3", source: ids[3], target: ids[2], kind: "REMEMBERS" },
      {
        id: "falkor:4",
        source: ids[3],
        target: ids[4],
        kind: post.provenance === "simulation" ? "WROTE" : "SHARED_SOURCE",
      },
    ],
  };
  const item = feedItem(input, proof, post.id, memory.id);
  return item ? [item] : [];
}
async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => ({
    a: await ctx.db.insert("users", {}),
    b: await ctx.db.insert("users", {}),
    c: await ctx.db.insert("users", {}),
    d: await ctx.db.insert("users", {}),
  }));
  const a = t.withIdentity({ subject: `${ids.a}|a` }),
    b = t.withIdentity({ subject: `${ids.b}|b` }),
    c = t.withIdentity({ subject: `${ids.c}|c` }),
    d = t.withIdentity({ subject: `${ids.d}|d` });
  await a.mutation(api.social.saveProfile, {
    name: "Maya",
    headline: "Building agents",
    goal: "Hire an engineer",
    skillIds: ["ai"],
    color: "#d0b5ff",
  });
  await b.mutation(api.social.saveProfile, {
    name: "Aarnav",
    headline: "AI engineer",
    goal: "Join a team",
    skillIds: ["ai"],
    color: "#8de5cc",
  });
  await c.mutation(api.social.saveProfile, {
    name: "Stranger",
    headline: "",
    goal: "",
    skillIds: ["ai"],
    color: "#aaaaaa",
  });
  return { t, ids, a, b, c, d };
}
async function connected() {
  const s = await setup();
  const invite = await s.a.mutation(api.social.createInvite, {});
  expect(
    (await s.b.mutation(api.social.requestConnection, { code: invite.code }))
      .ok,
  ).toBe(true);
  const connectionId = (await s.a.query(api.social.mine, {}))!.connections[0]
    .id;
  await s.a.mutation(api.social.respondConnection, {
    connectionId,
    accept: true,
  });
  return { ...s, connectionId };
}
async function ready() {
  const s = await connected();
  await s.a.mutation(api.social.saveMemory, {
    connectionId: s.connectionId,
    summary: "We discussed production AI agents and engineering work.",
    topicIds: ["ai"],
  });
  const memory = (await s.b.query(api.social.mine, {}))!.memories[0];
  await s.b.mutation(api.social.approveMemory, {
    memoryId: memory.id,
    revision: memory.revision,
  });
  await s.a.mutation(api.social.publishDemoPost, {
    excerpt: "Looking for an AI engineer to build agents.",
    topicIds: ["ai"],
  });
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  return { ...s, memoryId: memory.id };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-24T20:00:00Z"));
  vi.mocked(calculateSocialGraph).mockReset();
  vi.mocked(calculateSocialGraph).mockImplementation(async (input) =>
    answer(input),
  );
  vi.mocked(deleteSocialSnapshot).mockReset();
  vi.mocked(deleteSocialSnapshot).mockResolvedValue(undefined);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});
describe("Private relationship lifecycle", () => {
  it("requires mutual acceptance, rejects self/stranger acceptance, and exposes no stranger network", async () => {
    const { a, b, c, t } = await setup();
    const invite = await a.mutation(api.social.createInvite, {});
    expect(
      (await a.mutation(api.social.requestConnection, { code: invite.code }))
        .ok,
    ).toBe(false);
    expect(
      (await b.mutation(api.social.requestConnection, { code: invite.code }))
        .ok,
    ).toBe(true);
    expect(
      (await c.mutation(api.social.requestConnection, { code: invite.code }))
        .ok,
    ).toBe(false);
    const pending = (await b.query(api.social.mine, {}))!.connections[0];
    expect(pending.status).toBe("pending");
    await expect(
      b.mutation(api.social.respondConnection, {
        connectionId: pending.id,
        accept: true,
      }),
    ).rejects.toThrow();
    await expect(
      c.mutation(api.social.respondConnection, {
        connectionId: pending.id,
        accept: true,
      }),
    ).rejects.toThrow();
    await expect(t.mutation(api.social.createInvite, {})).rejects.toThrow();
    await a.mutation(api.social.respondConnection, {
      connectionId: pending.id,
      accept: true,
    });
    expect((await b.query(api.social.mine, {}))!.connections[0].status).toBe(
      "accepted",
    );
    const stranger = (await c.query(api.social.mine, {}))!;
    expect(stranger.connections).toEqual([]);
    expect(stranger.memories).toEqual([]);
    expect(stranger.posts).toEqual([]);
    expect(stranger.feed.items).toEqual([]);
  });
  it("expires invitation codes and commits failed-attempt throttling", async () => {
    const { a, b, c } = await setup();
    const invite = await a.mutation(api.social.createInvite, {});
    vi.setSystemTime(invite.expiresAt);
    expect(
      (await b.mutation(api.social.requestConnection, { code: invite.code }))
        .ok,
    ).toBe(false);
    for (let i = 0; i < 5; i++)
      await c.mutation(api.social.requestConnection, { code: "invalid" });
    expect(
      (await c.mutation(api.social.requestConnection, { code: "invalid" }))
        .error,
    ).toMatch(/Too many/);
  });
  it("withholds unapproved memories from graph inputs and requires review after edits", async () => {
    const { t, ids, a, b, c, connectionId } = await connected();
    await a.mutation(api.social.saveMemory, {
      connectionId,
      summary: "Agents discussion",
      topicIds: ["ai"],
    });
    let m = (await b.query(api.social.mine, {}))!.memories[0];
    let state = (await b.query(api.social.mine, {}))!.feed;
    expect(
      (await t.query(internal.social.calculationInput, {
        userId: ids.b,
        revision: state.revision,
      }))!.memories,
    ).toEqual([]);
    await expect(
      c.mutation(api.social.approveMemory, {
        memoryId: m.id,
        revision: m.revision,
      }),
    ).rejects.toThrow();
    await a.mutation(api.social.saveMemory, {
      connectionId,
      memoryId: m.id,
      revision: m.revision,
      summary: "Changed discussion",
      topicIds: ["ai"],
    });
    await expect(
      b.mutation(api.social.approveMemory, {
        memoryId: m.id,
        revision: m.revision,
      }),
    ).rejects.toThrow(/changed/);
    m = (await b.query(api.social.mine, {}))!.memories[0];
    await b.mutation(api.social.approveMemory, {
      memoryId: m.id,
      revision: m.revision,
    });
    state = (await b.query(api.social.mine, {}))!.feed;
    expect(
      (await t.query(internal.social.calculationInput, {
        userId: ids.b,
        revision: state.revision,
      }))!.memories,
    ).toHaveLength(1);
    await a.mutation(api.social.saveMemory, {
      connectionId,
      memoryId: m.id,
      revision: m.revision,
      summary: "Edited again",
      topicIds: ["ai"],
    });
    expect((await b.query(api.social.mine, {}))!.memories[0]).toMatchObject({
      status: "draft",
      approvedByMe: false,
    });
  });
  it("matches a connection post only to stored skills and a mutually approved memory", async () => {
    const { a, b, c } = await ready();
    const bState = (await b.query(api.social.mine, {}))!;
    expect(bState.feed.status).toBe("ready");
    expect(bState.feed.items).toHaveLength(1);
    expect(bState.feed.items[0].name).toBe("Maya");
    expect(bState.feed.items[0].provenance).toBe("simulation");
    expect((await a.query(api.social.mine, {}))!.feed.items).toEqual([]);
    expect((await c.query(api.social.mine, {}))!.feed.items).toEqual([]);
    await b.mutation(api.social.saveProfile, {
      name: "Aarnav",
      headline: "",
      goal: "",
      skillIds: ["security"],
      color: "#8de5cc",
    });
    expect((await b.query(api.social.mine, {}))!.feed.items).toEqual([]);
    const input = vi.mocked(calculateSocialGraph).mock.calls.at(-1)![0];
    expect(input.me.skillIds).toEqual(["ai"]);
  });
  it("invalidates cards immediately on memory or connection revocation and rejects late results", async () => {
    const { t, ids, a, b, connectionId, memoryId } = await ready();
    const old = (await b.query(api.social.mine, {}))!.feed;
    await b.mutation(api.social.revokeMemory, { memoryId });
    expect((await b.query(api.social.mine, {}))!.feed.items).toEqual([]);
    expect(
      await t.mutation(internal.social.commit, {
        userId: ids.b,
        revision: old.revision,
        items: old.items,
        failed: false,
      }),
    ).toBe(false);
    await a.mutation(api.social.revokeConnection, { connectionId });
    expect((await b.query(api.social.mine, {}))!.connections).toEqual([]);
    await expect(
      a.mutation(api.social.saveMemory, {
        connectionId,
        summary: "No longer shared",
        topicIds: ["ai"],
      }),
    ).rejects.toThrow();
  });
  it("rejects stale jobs, duplicate commits and invented graph relationships", async () => {
    const { t, ids, b } = await ready();
    const old = (await b.query(api.social.mine, {}))!.feed;
    await b.mutation(api.social.retryFeed, {});
    const current = (await b.query(api.social.mine, {}))!.feed;
    expect(
      await t.query(internal.social.calculationInput, {
        userId: ids.b,
        revision: old.revision,
      }),
    ).toBe(null);
    expect(
      await t.mutation(internal.social.commit, {
        userId: ids.b,
        revision: old.revision,
        items: old.items,
        failed: false,
      }),
    ).toBe(false);
    const forged = structuredClone(old.items);
    forged[0].proof.edges[0].kind = "KNOWS";
    expect(
      await t.mutation(internal.social.commit, {
        userId: ids.b,
        revision: current.revision,
        items: forged,
        failed: false,
      }),
    ).toBe(true);
    expect((await b.query(api.social.mine, {}))!.feed.items).toEqual([]);
    expect(
      await t.mutation(internal.social.commit, {
        userId: ids.b,
        revision: current.revision,
        items: old.items,
        failed: false,
      }),
    ).toBe(false);
  });
  it("clears stale live results on graph failure without losing approved memories", async () => {
    const { t, b } = await ready();
    vi.mocked(calculateSocialGraph).mockRejectedValue(
      new Error("secret internal failure"),
    );
    await b.mutation(api.social.retryFeed, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const state = (await b.query(api.social.mine, {}))!;
    expect(state.feed.status).toBe("error");
    expect(state.feed.items).toEqual([]);
    expect(state.feed.error).not.toContain("secret");
    expect(state.memories[0].status).toBe("shared");
  });
  it("labels the real Bright Data excerpt as a replay, deduplicates it and supports retraction", async () => {
    const { a, b, t } = await ready();
    await a.mutation(api.social.loadBrightDataDemo, {});
    await a.mutation(api.social.loadBrightDataDemo, {});
    const posts = (await a.query(api.social.mine, {}))!.posts.filter(
      (p) => p.provenance === "brightdata-demo",
    );
    expect(posts).toHaveLength(1);
    expect(posts[0].sourceUrl).toMatch(/^https:\/\/x.com\/sa64r\/status\//);
    const revision = (await b.query(api.social.mine, {}))!.feed.revision;
    const userId = await t.run(
      async (ctx) =>
        (await ctx.db.query("profiles").collect()).find(
          (p) => p.name === "Aarnav",
        )!.userId,
    );
    const input = await t.query(internal.social.calculationInput, {
      userId,
      revision,
    });
    const replay = input!.posts.find(
      (p) => p.provenance === "brightdata-demo",
    )!;
    expect(socialSnapshot(input!).edges).toContainEqual({
      source: `peer:${replay.connectionId}`,
      kind: "SHARED_SOURCE",
      target: `post:${replay.id}`,
    });
    expect(socialSnapshot(input!).edges).not.toContainEqual({
      source: `peer:${replay.connectionId}`,
      kind: "WROTE",
      target: `post:${replay.id}`,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await a.mutation(api.social.retractPost, { postId: posts[0].id });
    expect((await b.query(api.social.mine, {}))!.feed.items).toEqual([]);
  });
});
describe("Opt-in desktop projection", () => {
  it("only exposes explicitly shared redacted paths, never names, contacts, memory text or private IDs", async () => {
    const { a, b, c, d, t, memoryId } = await ready();
    const pairing = await d.mutation(api.presentation.create, {});
    await b.mutation(api.presentation.pair, {
      code: pairing.code,
      approvedTopicIds: [],
    });
    expect(
      await d.query(api.social.stage, { sessionId: pairing.sessionId }),
    ).toBe(null);
    const card = (await b.query(api.social.mine, {}))!.feed.items[0];
    await b.mutation(api.social.presentPath, { cardId: card.id });
    const stage = await d.query(api.social.stage, {
      sessionId: pairing.sessionId,
    });
    expect(stage?.networkCount).toBe(0);
    expect(isRedactedSocialProof(stage!.proof!)).toBe(true);
    const serialized = JSON.stringify(stage);
    for (const privateValue of [
      "Maya",
      "Aarnav",
      memoryId,
      card.connectionId,
      card.postId,
      card.summary,
      "AI & agents",
    ])
      expect(serialized).not.toContain(privateValue);
    expect(
      await c.query(api.social.stage, { sessionId: pairing.sessionId }),
    ).toBe(null);
    await b.mutation(api.social.setStageSharing, { enabled: true });
    expect(
      (await d.query(api.social.stage, { sessionId: pairing.sessionId }))
        ?.networkCount,
    ).toBe(1);
    await b.mutation(api.social.presentPath, { cardId: card.id });
    await b.mutation(api.social.setStageSharing, { enabled: false });
    expect(
      (await d.query(api.social.stage, { sessionId: pairing.sessionId }))
        ?.proof,
    ).toBe(null);
    await b.mutation(api.social.presentPath, { cardId: card.id });
    await a.mutation(api.social.revokeMemory, { memoryId });
    expect(
      (await d.query(api.social.stage, { sessionId: pairing.sessionId }))
        ?.proof,
    ).toBe(null);
  });
  it("ends social publication when pairing expires or is revoked", async () => {
    const { b, d } = await ready();
    const pairing = await d.mutation(api.presentation.create, {});
    await b.mutation(api.presentation.pair, {
      code: pairing.code,
      approvedTopicIds: [],
    });
    await b.mutation(api.social.setStageSharing, { enabled: true });
    vi.setSystemTime(pairing.expiresAt);
    expect(
      await d.query(api.social.stage, { sessionId: pairing.sessionId }),
    ).toBe(null);
    await expect(
      b.mutation(api.social.setStageSharing, { enabled: true }),
    ).rejects.toThrow();
    const next = await d.mutation(api.presentation.create, {});
    await b.mutation(api.presentation.pair, {
      code: next.code,
      approvedTopicIds: [],
    });
    await b.mutation(api.social.setStageSharing, { enabled: true });
    await d.mutation(api.presentation.revoke, { sessionId: next.sessionId });
    expect(await d.query(api.social.stage, { sessionId: next.sessionId })).toBe(
      null,
    );
  });
  it("publishes a connection pulse only after mutual acceptance and explicit network consent", async () => {
    const { a, b, d } = await setup();
    const pairing = await d.mutation(api.presentation.create, {});
    await b.mutation(api.presentation.pair, {
      code: pairing.code,
      approvedTopicIds: [],
    });
    await b.mutation(api.social.setStageSharing, { enabled: true });
    const invite = await a.mutation(api.social.createInvite, {});
    await b.mutation(api.social.requestConnection, { code: invite.code });
    expect(
      (await d.query(api.social.stage, { sessionId: pairing.sessionId }))?.kind,
    ).toBe("none");
    const c = (await a.query(api.social.mine, {}))!.connections[0];
    await a.mutation(api.social.respondConnection, {
      connectionId: c.id,
      accept: true,
    });
    expect(
      await d.query(api.social.stage, { sessionId: pairing.sessionId }),
    ).toMatchObject({ kind: "connection", networkCount: 1, proof: null });
  });
});
describe("Returned path fidelity", () => {
  it("keeps exact edge IDs, traversal order and direction and rejects malformed paths", () => {
    const input: SocialInput = {
      scope: crypto.randomUUID(),
      revision: 1,
      me: { name: "B", skillIds: ["ai"] },
      connections: [{ id: "c", name: "A", headline: "", color: "#ffffff" }],
      memories: [
        { id: "m", connectionId: "c", summary: "Agents", topicIds: ["ai"] },
      ],
      posts: [
        {
          id: "p",
          connectionId: "c",
          excerpt: "Build agents",
          topicIds: ["ai"],
          provenance: "simulation",
          sourceUrl: null,
          createdAt: 1,
        },
      ],
    };
    const expected = answer(input)[0].proof;
    const raw = {
      nodes: expected.nodes.map((n, i) => ({
        id: 100 + i,
        properties: { key: n.id, name: "private raw value" },
        labels: [n.kind],
      })),
      edges: expected.edges.map((e, i) => ({
        id: 500 + i,
        sourceId: 100 + expected.traversalNodeIds.indexOf(e.source),
        destinationId: 100 + expected.traversalNodeIds.indexOf(e.target),
        relationshipType: e.kind,
      })),
    };
    const actual = socialProof(raw, socialSnapshot(input))!;
    expect(actual.traversalNodeIds).toEqual(expected.traversalNodeIds);
    expect(actual.edges.map((e) => e.id)).toEqual([
      "falkor:500",
      "falkor:501",
      "falkor:502",
      "falkor:503",
    ]);
    expect(actual.edges[1].source).toBe("memory:m");
    expect(actual.nodes).toEqual(expected.nodes);
    expect(isRedactedSocialProof(redactSocialProof(actual))).toBe(true);
    raw.edges[0].destinationId = 999;
    expect(socialProof(raw, socialSnapshot(input))).toBe(null);
  });
});
