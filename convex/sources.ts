import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation, internalQuery, internalMutation, type QueryCtx, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { participant, peerId, recalculate } from "./socialState";
import { publicProfile } from "../packages/core/publicSources";
import { sourceStatus, importedPost } from "./journeyValidators";
type ReadCtx = QueryCtx | MutationCtx;
async function user(ctx: ReadCtx) { const id = await getAuthUserId(ctx); if (!id) throw new Error("Sign in first"); return id; }
async function connection(ctx: ReadCtx, id: Id<"connections">, userId: Id<"users">) { const c = await ctx.db.get(id); if (!c || !participant(c, userId) || c.status !== "accepted") throw new Error("Choose an accepted connection"); return c; }
async function owned(ctx: ReadCtx, id: Id<"publicSources">, userId: Id<"users">) { const s = await ctx.db.get(id); if (!s || s.userId !== userId || s.deleted) throw new Error("Source unavailable"); return s; }
export const mine = query({ args: {}, handler: async ctx => {
  const userId = await getAuthUserId(ctx); if (!userId) return [];
  const sources = await ctx.db.query("publicSources").withIndex("by_user", q => q.eq("userId", userId)).take(20), result = [];
  for (const s of sources) {
    const c = await ctx.db.get(s.connectionId);
    if (!s.deleted && c?.status === "accepted" && participant(c, userId)) result.push({ id: s._id, connectionId: s.connectionId, profileUrl: s.profileUrl, platform: s.platform, status: s.status, error: s.error, postCount: s.postCount, lastCheckedAt: s.lastCheckedAt });
  }
  return result;
} });
export const add = mutation({ args: { connectionId: v.id("connections"), profileUrl: v.string(), confirmed: v.boolean() }, handler: async (ctx, args) => {
  const userId = await user(ctx); await connection(ctx, args.connectionId, userId);
  if (!args.confirmed) throw new Error("Confirm this public profile is the source you want associated with this connection");
  const profile = publicProfile(args.profileUrl);
  const existing = await ctx.db.query("publicSources").withIndex("by_user", q => q.eq("userId", userId)).take(20);
  const duplicate = existing.find(s => !s.deleted && s.profileUrl === profile.url);
  if (duplicate) { if (duplicate.connectionId !== args.connectionId) throw new Error("That source is already associated with another connection"); return duplicate._id; }
  if (existing.length >= 20 || existing.filter(s => !s.deleted && s.connectionId === args.connectionId).length >= 2) throw new Error("Use up to two sources per connection, 20 total in this demo");
  return ctx.db.insert("publicSources", { userId, connectionId: args.connectionId, profileUrl: profile.url, platform: profile.platform, confirmedAt: Date.now(), status: "idle", revision: 0, deleted: false, error: null, postCount: 0, lastCheckedAt: null, lastStartedAt: null });
} });
export const refresh = mutation({ args: { sourceId: v.id("publicSources") }, handler: async (ctx, { sourceId }) => {
  const userId = await user(ctx), s = await owned(ctx, sourceId, userId); await connection(ctx, s.connectionId, userId);
  const previous = s.jobId ? await ctx.db.get(s.jobId) : null;
  if (previous?.snapshotId && previous.status !== "ready") throw new Error("This source already has a snapshot. Use Check status; a failed status read must not trigger another paid scrape.");
  if (["starting", "running", "uncertain"].includes(s.status)) throw new Error("A scrape already exists. Check its status instead of starting another paid request.");
  if (s.lastStartedAt && Date.now() - s.lastStartedAt < 600_000) throw new Error("Refresh at most once every ten minutes");
  const recent = await ctx.db.query("sourceJobs").withIndex("by_user", q => q.eq("userId", userId)).order("desc").take(5);
  if (recent.filter(j => Date.now() - j.createdAt < 86_400_000).length >= 5) throw new Error("Demo limit: five three-post refreshes per day");
  const revision = s.revision + 1, now = Date.now();
  const jobId = await ctx.db.insert("sourceJobs", { userId, sourceId, revision, status: "starting", createdAt: now,
    startDate: new Date(now - 180 * 86_400_000).toISOString().slice(0, 10), endDate: new Date(now).toISOString().slice(0, 10), pollCount: 0, lastPolledAt: 0 });
  await ctx.db.patch(sourceId, { revision, jobId, status: "starting", error: null, lastStartedAt: now });
  await ctx.scheduler.runAfter(0, internal.sourceJobs.start, { jobId });
  await ctx.scheduler.runAfter(90_000, internal.sources.unconfirmed, { jobId });
  return null;
} });
export const check = mutation({ args: { sourceId: v.id("publicSources") }, handler: async (ctx, { sourceId }) => {
  const s = await owned(ctx, sourceId, await user(ctx)); await connection(ctx, s.connectionId, s.userId);
  const job = s.jobId ? await ctx.db.get(s.jobId) : null;
  if (!job?.snapshotId) throw new Error("No confirmed snapshot. An uncertain trigger needs provider-dashboard verification; it will not be retried automatically.");
  if (s.status === "ready") return null;
  if (Date.now() - job.lastPolledAt < 15_000) throw new Error("Wait a few seconds before checking again");
  await ctx.db.patch(job._id, { lastPolledAt: Date.now() });
  await ctx.scheduler.runAfter(0, internal.sourceJobs.poll, { jobId: job._id, automatic: false });
  return null;
} });
export const remove = mutation({ args: { sourceId: v.id("publicSources") }, handler: async (ctx, { sourceId }) => {
  const s = await owned(ctx, sourceId, await user(ctx));
  await ctx.db.patch(s._id, { deleted: true, revision: s.revision + 1, profileUrl: "", postCount: 0 });
  for (const p of await ctx.db.query("socialPosts").withIndex("by_source", q => q.eq("sourceId", sourceId)).take(100)) await ctx.db.delete(p._id);
  await recalculate(ctx, s.userId); return null;
} });
export const claim = internalMutation({ args: { jobId: v.id("sourceJobs") }, handler: async (ctx, { jobId }) => {
  const job = await ctx.db.get(jobId); if (!job || job.triggeredAt || job.status !== "starting") return null;
  const s = await ctx.db.get(job.sourceId), c = s ? await ctx.db.get(s.connectionId) : null;
  if (!s || s.deleted || s.revision !== job.revision || c?.status !== "accepted") return null;
  await ctx.db.patch(jobId, { triggeredAt: Date.now() });
  return { ...job, profileUrl: s.profileUrl };
} });
export const job = internalQuery({ args: { jobId: v.id("sourceJobs") }, handler: async (ctx, { jobId }) => {
  const job = await ctx.db.get(jobId); if (!job) return null;
  const source = await ctx.db.get(job.sourceId), c = source ? await ctx.db.get(source.connectionId) : null;
  if (!source || source.deleted || source.revision !== job.revision || c?.status !== "accepted") return null;
  return { ...job, profileUrl: source.profileUrl };
} });
export const update = internalMutation({ args: { jobId: v.id("sourceJobs"), status: sourceStatus, snapshotId: v.optional(v.string()), error: v.union(v.string(), v.null()), poll: v.optional(v.boolean()) }, handler: async (ctx, args) => {
  const job = await ctx.db.get(args.jobId); if (!job) return false;
  const source = await ctx.db.get(job.sourceId); if (!source || source.deleted || source.revision !== job.revision || source.status === "ready") return false;
  await ctx.db.patch(job._id, { status: args.status, ...(args.snapshotId ? { snapshotId: args.snapshotId } : {}), ...(args.poll ? { pollCount: job.pollCount + 1, lastPolledAt: Date.now() } : {}) });
  await ctx.db.patch(source._id, { status: args.status, error: args.error }); return true;
} });
export const unconfirmed = internalMutation({ args: { jobId: v.id("sourceJobs") }, handler: async (ctx, { jobId }) => {
  const job = await ctx.db.get(jobId); if (!job || job.snapshotId || job.status !== "starting") return null;
  const s = await ctx.db.get(job.sourceId); if (!s || s.deleted || s.revision !== job.revision) return null;
  await ctx.db.patch(job._id, { status: "uncertain" });
  await ctx.db.patch(s._id, { status: "uncertain", error: "Trigger not confirmed. Check Bright Data before another paid request; automatic retrigger is blocked." });
  return null;
} });
export const finish = internalMutation({ args: { jobId: v.id("sourceJobs"), posts: v.array(importedPost) }, handler: async (ctx, { jobId, posts }) => {
  const job = await ctx.db.get(jobId); if (!job || job.status === "ready") return false;
  const s = await ctx.db.get(job.sourceId), c = s ? await ctx.db.get(s.connectionId) : null;
  if (!s || s.deleted || s.revision !== job.revision || !c || c.status !== "accepted" || !participant(c, s.userId)) return false;
  if (posts.length > 3) throw new Error("Provider result exceeded the three-post cap");
  const existing = await ctx.db.query("socialPosts").withIndex("by_source", q => q.eq("sourceId", s._id)).take(100);
  const urls = new Set(existing.map(p => p.sourceUrl));
  for (const p of posts) {
    if (urls.has(p.url)) continue;
    await ctx.db.insert("socialPosts", { authorId: peerId(c, s.userId), sourceId: s._id, excerpt: p.excerpt, topicIds: p.topicIds,
      platform: s.platform, provenance: "brightdata-public", sourceUrl: p.url, createdAt: p.publishedAt, retracted: false });
    urls.add(p.url);
  }
  await ctx.db.patch(jobId, { status: "ready" });
  await ctx.db.patch(s._id, { status: "ready", error: null, lastCheckedAt: Date.now(), postCount: urls.size });
  await recalculate(ctx, s.userId); return true;
} });
