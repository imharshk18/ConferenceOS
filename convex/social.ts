import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  query,
  mutation,
  internalQuery,
  internalMutation,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { validTopicIds } from "../packages/core/intelligence";
import {
  feedItem,
  redactSocialProof,
  type FeedItem,
  type SocialInput,
} from "../packages/core/social";
import { feedItemValidator } from "./socialValidators";
import {
  profileFor,
  intelligenceFor,
  connectionsFor,
  participant,
  peerId,
  activeStage,
  recalculate,
  recalculatePair,
  connectionPulse,
  socialInput,
} from "./socialState";
import brightData from "../data/brightdata-demo-posts.json";
import { validNetworkAreas } from "../packages/core/network";
import { applyProfile } from './profileState';

async function requireUser(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Sign in to your private space");
  return userId;
}
function clean(text: string, max: number, required = false) {
  const result = text.trim().replace(/[\u0000-\u001f\u007f]/g, " ");
  if ((required && !result) || result.length > max)
    throw new Error(`Use ${required ? "1–" : ""}${max} characters or fewer`);
  return result;
}
function topicList(ids: string[]) {
  const valid = validTopicIds(ids);
  if (ids.length > 6 || new Set(ids).size !== valid.length)
    throw new Error("Choose available topics");
  return valid;
}
async function connectionFor(
  ctx: QueryCtx | MutationCtx,
  id: Id<"connections">,
  userId: Id<"users">,
  accepted = true,
) {
  const c = await ctx.db.get(id);
  if (!c || !participant(c, userId) || (accepted && c.status !== "accepted"))
    throw new Error("Connection not available");
  return c;
}
async function hash(code: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`conferenceos-contact:${code}`),
  );
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const profile = await profileFor(ctx, userId),
      state = await intelligenceFor(ctx, userId);
    const connections = [];
    const memories = [];
    const sources=await ctx.db.query('publicSources').withIndex('by_user',q=>q.eq('userId',userId)).take(20);
    for (const c of await connectionsFor(ctx, userId)) {
      if (c.status === "revoked") continue;
      const peer = await profileFor(ctx, peerId(c, userId));
      connections.push({
        id: c._id,
        name: peer?.name ?? "Conference attendee",
        headline: peer?.headline ?? "",
        color: peer?.color ?? "#bd9cff",
        status: c.status,
        incoming: c.recipientId === userId,
        acceptedAt: c.acceptedAt,
        demo: c.demo ?? false,
        networkAreas: peer?.networkAreas ?? peer?.skillIds ?? [],
        publicLinks: c.status==='accepted'?sources.filter(s=>s.connectionId===c._id&&!s.deleted).map(s=>({platform:s.platform,url:s.profileUrl})):[],
      });
      if (c.status === "accepted")
        for (const m of await ctx.db
          .query("memories")
          .withIndex("by_connection", (q) => q.eq("connectionId", c._id))
          .order("desc")
          .take(20)) {
          if (m.status !== "revoked")
            memories.push({
              id: m._id,
              connectionId: c._id,
              name: peer?.name ?? "Your connection",
              summary: m.summary,
              topicIds: m.topicIds,
              networkAreas: m.networkAreas ?? m.topicIds,
              status: m.status,
              approvedByMe: m.approvedBy.includes(userId),
              revision: m.revision,
              autoSaved: m.autoSaved ?? false,
            });
        }
    }
    const posts = (
      await ctx.db
        .query("socialPosts")
        .withIndex("by_author", (q) => q.eq("authorId", userId))
        .order("desc")
        .take(20)
    )
      .filter((p) => !p.retracted && !p.sourceId)
      .map((p) => ({
        id: p._id,
        excerpt: p.excerpt,
        platform: p.platform,
        provenance: p.provenance,
        sourceUrl: p.sourceUrl,
        createdAt: p.createdAt,
      }));
    const sessions = await activeStage(ctx, userId);
    const stage = sessions[0]
      ? await ctx.db
          .query("socialPresentation")
          .withIndex("by_session", (q) => q.eq("sessionId", sessions[0]._id))
          .unique()
      : null;
    return {
      profile: profile
        ? {
            name: profile.name,
            headline: profile.headline,
            goal: profile.goal,
            skillIds: profile.skillIds,
            networkAreas: profile.networkAreas ?? profile.skillIds,
            color: profile.color,
            context: profile.context ?? '',
            source: profile.source ?? 'manual',
          }
        : null,
      connections,
      memories,
      posts,
      feed: {
        status: state?.status ?? "idle",
        revision: state?.revision ?? 0,
        items: state?.status === "ready" ? state.items : [],
        error: state?.error ?? null,
      },
      networkRevision: connections.reduce((n, c) => n + (c.acceptedAt ?? 0), 0),
      stageSharing: stage?.allowNetwork ?? false,
    };
  },
});
export const saveProfile = mutation({
  args: {
    name: v.string(),
    headline: v.string(),
    goal: v.string(),
    skillIds: v.array(v.string()),
    networkAreas: v.optional(v.array(v.string())),
    color: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx),
      old = await profileFor(ctx, userId);
    const value = {
      userId,
      name: clean(args.name, 60, true),
      headline: clean(args.headline, 120),
      goal: clean(args.goal, 500),
      skillIds: topicList(args.skillIds),
      networkAreas: validNetworkAreas(args.networkAreas ?? args.skillIds),
      color: /^#[0-9a-f]{6}$/i.test(args.color) ? args.color : "#bd9cff",
    };
    await applyProfile(ctx,userId,{name:value.name,headline:value.headline,goal:value.goal,context:old?.context??'',skillIds:value.skillIds,networkAreas:value.networkAreas},value.color,'manual');
    return null;
  },
});
export const createInvite = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    if (!(await profileFor(ctx, userId)))
      throw new Error("Create your profile first");
    if (
      (await connectionsFor(ctx, userId)).filter((c) => c.status !== "revoked")
        .length >= 20
    )
      throw new Error("This demo supports 20 active connections");
    for (const old of await ctx.db
      .query("connectionInvites")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(20))
      if (!old.consumed) await ctx.db.patch(old._id, { consumed: true });
    let code = "",
      codeHash = "";
    for (let i = 0; i < 8; i++) {
      code = Array.from(
        crypto.getRandomValues(new Uint8Array(8)),
        (n) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[n % 32],
      ).join("");
      codeHash = await hash(code);
      if (
        !(await ctx.db
          .query("connectionInvites")
          .withIndex("by_codeHash", (q) => q.eq("codeHash", codeHash))
          .first())
      )
        break;
      codeHash = "";
    }
    if (!codeHash) throw new Error("Try creating a new code");
    const expiresAt = Date.now() + 10 * 60_000;
    await ctx.db.insert("connectionInvites", {
      userId,
      codeHash,
      expiresAt,
      consumed: false,
    });
    return { code, expiresAt };
  },
});
export const requestConnection = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const userId = await requireUser(ctx);
    if (!(await profileFor(ctx, userId)))
      return { ok: false, error: "Create your profile first" };
    const now = Date.now(),
      attempt = await ctx.db
        .query("connectionAttempts")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .unique();
    if (attempt && now - attempt.windowStart < 60_000 && attempt.count >= 5)
      return { ok: false, error: "Too many attempts. Try again in a minute." };
    if (attempt)
      await ctx.db.patch(
        attempt._id,
        now - attempt.windowStart < 60_000
          ? { count: attempt.count + 1 }
          : { count: 1, windowStart: now },
      );
    else
      await ctx.db.insert("connectionAttempts", {
        userId,
        windowStart: now,
        count: 1,
      });
    const normalized = code.toUpperCase().replace(/[\s-]/g, "");
    if (!/^[A-Z2-9]{8}$/.test(normalized))
      return { ok: false, error: "Enter the eight-character connection code" };
    const codeHash = await hash(normalized),
      invite = await ctx.db
        .query("connectionInvites")
        .withIndex("by_codeHash", (q) => q.eq("codeHash", codeHash))
        .unique();
    if (
      !invite ||
      invite.consumed ||
      invite.expiresAt <= now ||
      invite.userId === userId
    )
      return { ok: false, error: "This code is unavailable or expired" };
    const existing = await connectionsFor(ctx, userId),
      other = await connectionsFor(ctx, invite.userId);
    if (
      existing.some(
        (c) => participant(c, invite.userId) && c.status !== "revoked",
      )
    )
      return {
        ok: false,
        error: "You already have a connection or pending request",
      };
    if (
      existing.filter((c) => c.status !== "revoked").length >= 20 ||
      other.filter((c) => c.status !== "revoked").length >= 20
    )
      return { ok: false, error: "This demo supports 20 active connections" };
    await ctx.db.insert("connections", {
      requestorId: userId,
      recipientId: invite.userId,
      status: "pending",
      createdAt: now,
      acceptedAt: null,
    });
    await ctx.db.patch(invite._id, { consumed: true });
    return { ok: true };
  },
});
export const respondConnection = mutation({
  args: { connectionId: v.id("connections"), accept: v.boolean() },
  handler: async (ctx, { connectionId, accept }) => {
    const userId = await requireUser(ctx),
      c = await connectionFor(ctx, connectionId, userId, false);
    if (c.recipientId !== userId || c.status !== "pending")
      throw new Error("This request is no longer available");
    await ctx.db.patch(c._id, {
      status: accept ? "accepted" : "revoked",
      acceptedAt: accept ? Date.now() : null,
    });
    await recalculatePair(ctx, c);
    if (accept) {
      await connectionPulse(ctx, c.requestorId);
      await connectionPulse(ctx, c.recipientId);
    }
    return null;
  },
});
export const revokeConnection = mutation({
  args: { connectionId: v.id("connections") },
  handler: async (ctx, { connectionId }) => {
    const userId = await requireUser(ctx),
      c = await connectionFor(ctx, connectionId, userId, false);
    await ctx.db.patch(c._id, { status: "revoked" });
    await recalculatePair(ctx, c);
    return null;
  },
});
export const saveMemory = mutation({
  args: {
    connectionId: v.id("connections"),
    summary: v.string(),
    topicIds: v.array(v.string()),
    memoryId: v.optional(v.id("memories")),
    networkAreas: v.optional(v.array(v.string())),
    revision: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx),
      c = await connectionFor(ctx, args.connectionId, userId);
    const summary = clean(args.summary, 1600, true),
      topicIds = topicList(args.topicIds);
    const networkAreas = validNetworkAreas(args.networkAreas ?? topicIds);
    if (!topicIds.length && !networkAreas.length) throw new Error("Choose a conversation area");
    const old = args.memoryId ? await ctx.db.get(args.memoryId) : null;
    if (
      args.memoryId &&
      (!old || old.connectionId !== c._id || old.status === "revoked")
    )
      throw new Error("Memory not available");
    if (old && args.revision !== old.revision)
      throw new Error(
        "This memory changed. Review the latest version before saving.",
      );
    if (
      !old &&
      (
        await ctx.db
          .query("memories")
          .withIndex("by_connection", (q) => q.eq("connectionId", c._id))
          .take(21)
      ).length >= 20
    )
      throw new Error("This demo supports 20 memories per connection");
    const value = {
      connectionId: c._id,
      createdBy: userId,
      summary,
      topicIds,
      networkAreas,
      status: c.demo ? "shared" as const : "draft" as const,
      approvedBy: [userId],
      revision: (old?.revision ?? 0) + 1,
      updatedAt: Date.now(),
    };
    if (old) await ctx.db.patch(old._id, value);
    else await ctx.db.insert("memories", value);
    await recalculatePair(ctx, c);
    return null;
  },
});
export const approveMemory = mutation({
  args: { memoryId: v.id("memories"), revision: v.number() },
  handler: async (ctx, { memoryId, revision }) => {
    const userId = await requireUser(ctx),
      m = await ctx.db.get(memoryId);
    if (!m || m.status === "revoked") throw new Error("Memory not available");
    const c = await connectionFor(ctx, m.connectionId, userId);
    if (m.revision !== revision)
      throw new Error(
        "This memory changed. Review the latest version before approving.",
      );
    const approvedBy = [...new Set([...m.approvedBy, userId])];
    await ctx.db.patch(m._id, {
      approvedBy,
      status:
        approvedBy.includes(c.requestorId) && approvedBy.includes(c.recipientId)
          ? "shared"
          : "draft",
      updatedAt: Date.now(),
    });
    await recalculatePair(ctx, c);
    return null;
  },
});
export const revokeMemory = mutation({
  args: { memoryId: v.id("memories") },
  handler: async (ctx, { memoryId }) => {
    const userId = await requireUser(ctx),
      m = await ctx.db.get(memoryId);
    if (!m) throw new Error("Memory not available");
    const c = await connectionFor(ctx, m.connectionId, userId);
    await ctx.db.patch(m._id, {
      status: "revoked",
      approvedBy: [],
      revision: m.revision + 1,
      updatedAt: Date.now(),
    });
    await recalculatePair(ctx, c);
    return null;
  },
});
async function postChanged(ctx: MutationCtx, userId: Id<"users">) {
  await recalculate(ctx, userId);
  for (const c of await connectionsFor(ctx, userId))
    if (c.status === "accepted") await recalculate(ctx, peerId(c, userId));
}
export const publishDemoPost = mutation({
  args: { excerpt: v.string(), topicIds: v.array(v.string()) },
  handler: async (ctx, { excerpt, topicIds }) => {
    const userId = await requireUser(ctx);
    if (!(await profileFor(ctx, userId)))
      throw new Error("Create your profile first");
    const recent = await ctx.db
      .query("socialPosts")
      .withIndex("by_author", (q) => q.eq("authorId", userId))
      .order("desc")
      .first();
    if (recent && Date.now() - recent.createdAt < 2000)
      throw new Error("Please wait a moment before posting again");
    const id = await ctx.db.insert("socialPosts", {
      authorId: userId,
      excerpt: clean(excerpt, 500, true),
      topicIds: topicList(topicIds),
      platform: "demo",
      provenance: "simulation",
      sourceUrl: null,
      createdAt: Date.now(),
      retracted: false,
    });
    await postChanged(ctx, userId);
    return id;
  },
});
export const loadBrightDataDemo = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    if (!(await profileFor(ctx, userId)))
      throw new Error("Create your profile first");
    // A controlled replay, not an identity assertion or a new paid scraper call.
    const source = brightData.posts[0];
    const existing = await ctx.db
      .query("socialPosts")
      .withIndex("by_author", (q) => q.eq("authorId", userId))
      .order("desc")
      .take(20);
    if (
      existing.some((p) => p.provenance === "brightdata-demo" && !p.retracted)
    )
      return null;
    await ctx.db.insert("socialPosts", {
      authorId: userId,
      excerpt: source.excerpt,
      topicIds: ["ai"],
      platform: "x",
      provenance: "brightdata-demo",
      sourceUrl: source.url,
      createdAt: Date.now(),
      retracted: false,
    });
    await postChanged(ctx, userId);
    return null;
  },
});
export const retractPost = mutation({
  args: { postId: v.id("socialPosts") },
  handler: async (ctx, { postId }) => {
    const userId = await requireUser(ctx),
      p = await ctx.db.get(postId);
    if (!p || p.authorId !== userId) throw new Error("Post not available");
    await ctx.db.patch(p._id, { retracted: true });
    await postChanged(ctx, userId);
    return null;
  },
});
export const retryFeed = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    if (!(await profileFor(ctx, userId)))
      throw new Error("Create your profile first");
    await recalculate(ctx, userId);
    return null;
  },
});

export const calculationInput = internalQuery({
  args: { userId: v.id("users"), revision: v.number() },
  handler: async (ctx, args): Promise<SocialInput | null> =>
    socialInput(ctx, args.userId, args.revision),
});
export const commit = internalMutation({
  args: {
    userId: v.id("users"),
    revision: v.number(),
    items: v.array(feedItemValidator),
    failed: v.boolean(),
  },
  handler: async (ctx, { userId, revision, items, failed }) => {
    const state = await intelligenceFor(ctx, userId);
    if (!state || state.revision !== revision || state.status !== "loading")
      return false;
    const input = await socialInput(ctx, userId, revision);
    const safe: FeedItem[] = [];
    const seen = new Set<string>();
    if (input && !failed)
      for (const item of items) {
        const verified = feedItem(
          input,
          item.proof,
          item.postId,
          item.memoryId,
        );
        if (verified && !seen.has(verified.id)) {
          seen.add(verified.id);
          safe.push(verified);
        }
      }
    await ctx.db.patch(state._id, {
      status: failed ? "error" : "ready",
      items: failed ? [] : safe,
      error: failed
        ? "The graph is unavailable. Your connections and memories are saved. Try again shortly."
        : null,
      updatedAt: Date.now(),
    });
    return true;
  },
});
export const setStageSharing = mutation({
  args: { enabled: v.boolean() },
  handler: async (ctx, { enabled }) => {
    const userId = await requireUser(ctx),
      session = (await activeStage(ctx, userId))[0];
    if (!session) throw new Error("Pair your phone with a desktop first");
    const old = await ctx.db
      .query("socialPresentation")
      .withIndex("by_session", (q) => q.eq("sessionId", session._id))
      .unique();
    const value = {
      sessionId: session._id,
      allowNetwork: enabled,
      revision: (old?.revision ?? 0) + 1,
      kind: "none" as const,
      proof: null,
      updatedAt: Date.now(),
    };
    if (old) await ctx.db.patch(old._id, value);
    else await ctx.db.insert("socialPresentation", value);
    return null;
  },
});
export const presentPath = mutation({
  args: { cardId: v.string() },
  handler: async (ctx, { cardId }) => {
    const userId = await requireUser(ctx),
      session = (await activeStage(ctx, userId))[0];
    if (!session) throw new Error("Pair your phone with a desktop first");
    const state = await intelligenceFor(ctx, userId),
      card =
        state?.status === "ready"
          ? state.items.find((i) => i.id === cardId)
          : null;
    if (!card) throw new Error("This path is no longer available");
    const input = await socialInput(ctx, userId, state!.revision);
    if (!input || !feedItem(input, card.proof, card.postId, card.memoryId))
      throw new Error("This path is no longer shared");
    const old = await ctx.db
      .query("socialPresentation")
      .withIndex("by_session", (q) => q.eq("sessionId", session._id))
      .unique();
    const value = {
      sessionId: session._id,
      allowNetwork: old?.allowNetwork ?? false,
      revision: (old?.revision ?? 0) + 1,
      kind: "opportunity" as const,
      proof: redactSocialProof(card.proof),
      updatedAt: Date.now(),
    };
    if (old) await ctx.db.patch(old._id, value);
    else await ctx.db.insert("socialPresentation", value);
    return null;
  },
});
export const stage = query({
  args: { sessionId: v.id("presentations") },
  handler: async (ctx, { sessionId }) => {
    const userId = await getAuthUserId(ctx),
      session = await ctx.db.get(sessionId);
    if (
      !userId ||
      !session ||
      session.desktopUserId !== userId ||
      session.expiresAt <= Date.now() ||
      ["waiting", "expired", "revoked"].includes(session.status)
    )
      return null;
    const stage = await ctx.db
      .query("socialPresentation")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .unique();
    const networkCount =
      stage?.allowNetwork && session.mobileUserId
        ? (await connectionsFor(ctx, session.mobileUserId)).filter(
            (c) => c.status === "accepted",
          ).length
        : 0;
    return stage
      ? {
          kind: stage.kind,
          revision: stage.revision,
          proof: stage.proof,
          updatedAt: stage.updatedAt,
          networkCount,
        }
      : null;
  },
});
