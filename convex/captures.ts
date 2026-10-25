import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation, internalQuery, internalMutation, type QueryCtx, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { captureKind, contextDraft } from "./journeyValidators";
import { cleanDraft, mediaType, memoryText } from "../packages/core/capture";
import { talks } from "../packages/core/data";
import { participant, profileFor, recalculate, recalculatePair } from "./socialState";
import { ensurePreferences, startCalculation } from "./state";
import { refreshNetwork } from "./networkState";

type ReadCtx = QueryCtx | MutationCtx;
async function user(ctx: ReadCtx) {
  const id = await getAuthUserId(ctx);
  if (!id) throw new Error("Sign in to your private space");
  return id;
}
async function owned(ctx: ReadCtx, captureId: Id<"captures">, userId: Id<"users">) {
  const capture = await ctx.db.get(captureId);
  if (!capture || capture.userId !== userId) throw new Error("Capture not available");
  return capture;
}
async function accepted(ctx: ReadCtx, connectionId: Id<"connections">, userId: Id<"users">) {
  const c = await ctx.db.get(connectionId);
  if (!c || !participant(c, userId) || c.status !== "accepted") throw new Error("Connect and accept before saving a conversation");
  return c;
}
export const mine = query({ args: {}, handler: async ctx => {
  const userId = await getAuthUserId(ctx);
  if (!userId) return [];
  const rows = await ctx.db.query("captures").withIndex("by_user", q => q.eq("userId", userId)).order("desc").take(30);
  return rows.map(({ _id, userId: _, files, consentAt, attempts, _creationTime, ...c }) => ({ id: _id, ...c, attachmentCount: files.length }));
} });
export const create = mutation({
  args: { kind: captureKind, title: v.string(), notes: v.string(), talkId: v.optional(v.string()), connectionId: v.optional(v.id("connections")), consentConfirmed: v.boolean(), autoSaveDemo: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const userId = await user(ctx);
    if (!args.consentConfirmed) throw new Error("Confirm permission to capture and process this content first");
    if (!args.title.trim() || args.title.length > 120 || args.notes.length > 8000) throw new Error("Use a short title and notes under 8,000 characters");
    if (args.kind === "conversation") {
      if (!args.connectionId || args.talkId) throw new Error("Choose your connection");
      const connection = await accepted(ctx, args.connectionId, userId);
      if(args.autoSaveDemo && !connection.demo) throw new Error('Automatic saving is only enabled for simulated demo connections. Real shared memories need review.');
    } else if (args.connectionId) throw new Error("Only conversations can have a connection");
    if(args.autoSaveDemo && args.kind!=='conversation')throw new Error('Automatic saving is only enabled for demo conversations.');
    if (args.kind === "session" && !talks.some(t => t.id === args.talkId)) throw new Error("Choose an official conference session");
    if (args.kind !== "session" && args.talkId) throw new Error("Only sessions can have a session ID");
    const existing = await ctx.db.query("captures").withIndex("by_user", q => q.eq("userId", userId)).take(30);
    if (existing.length >= 30) throw new Error("This demo supports 30 captures. Delete an old capture first.");
    if (existing.some(c => Date.now() - c.createdAt < 2000)) throw new Error("Wait a moment before creating another capture");
    return await ctx.db.insert("captures", { userId, kind: args.kind, title: args.title.trim(), notes: args.notes.trim(), talkId: args.talkId,
      connectionId: args.connectionId, autoSaveDemo: args.autoSaveDemo ?? false, revision: 1, status: "collecting", agentStage: "Ready to capture", consentAt: Date.now(),
      files: [], transcript: "", draft: null, draftOrigin: null, error: null, attended: false, createdAt: Date.now(), updatedAt: Date.now(), attempts: 0 });
  },
});
export const analyze = mutation({
  args: { captureId: v.id("captures"), revision: v.number() },
  handler: async (ctx, { captureId, revision }) => {
    const c = await owned(ctx, captureId, await user(ctx));
    if (c.revision !== revision || !["collecting", "error", "review"].includes(c.status)) throw new Error("Review the latest capture before continuing");
    if (c.connectionId) await accepted(ctx, c.connectionId, c.userId);
    if (!c.notes && !c.files.length) throw new Error("Add notes, a photo or an audio clip first");
    if (c.attempts >= 3) throw new Error("Three analysis attempts used. You can still review and save manually.");
    await ctx.db.patch(captureId, { revision: revision + 1, status: "processing", agentStage: "Preparing context", draft: null, draftOrigin: null, error: null, updatedAt: Date.now(), attempts: c.attempts + 1 });
    await ctx.scheduler.runAfter(0, internal.captureJobs.analyze, { captureId, revision: revision + 1 });
    await ctx.scheduler.runAfter(180_000, internal.captures.timeout, { captureId, revision: revision + 1 });
    return null;
  },
});
export const approve = mutation({
  args: { captureId: v.id("captures"), revision: v.number(), summary: v.string(), topicIds: v.array(v.string()), networkAreas: v.optional(v.array(v.string())), takeaways: v.array(v.string()), actions: v.array(v.string()), attended: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const userId = await user(ctx), c = await owned(ctx, args.captureId, userId);
    if (c.revision !== args.revision || !["review", "error", "collecting"].includes(c.status)) throw new Error("Review the latest draft before approving");
    const draft = cleanDraft(args);
    if (!draft.topicIds.length && !draft.networkAreas?.length && c.kind !== "session") throw new Error("Choose at least one relevant area");
    let memoryId: Id<"memories"> | undefined;
    if (c.kind === "conversation" && c.connectionId) {
      const connection = await accepted(ctx, c.connectionId, userId);
      if ((await ctx.db.query("memories").withIndex("by_connection", q => q.eq("connectionId", connection._id)).take(20)).length >= 20) throw new Error("This demo supports 20 memories per connection");
      memoryId = await ctx.db.insert("memories", { connectionId: connection._id, createdBy: userId, summary: memoryText(draft), topicIds: draft.topicIds,
        networkAreas: draft.networkAreas, status: connection.demo ? "shared" : "draft", approvedBy: [userId], revision: 1, updatedAt: Date.now() });
      await recalculatePair(ctx, connection);
    }
    if (c.kind === "goal") {
      const preferences = await ensurePreferences(ctx, userId), profile = await profileFor(ctx, userId);
      const revision = (preferences.revision ?? 0) + 1;
      await ctx.db.patch(preferences._id, { topicIds: draft.topicIds, revision });
      if (profile) await ctx.db.patch(profile._id, { goal: draft.summary.slice(0, 500), skillIds: draft.topicIds, networkAreas: draft.networkAreas ?? draft.topicIds, contextRevision: (profile.contextRevision ?? 0) + 1 });
      await startCalculation(ctx, userId, revision);
    }
    await ctx.db.patch(c._id, { status: "approved", agentStage: "Reviewed by you", draft, draftOrigin: c.draftOrigin === "openai" ? "openai" : "manual", memoryId,
      attended: c.kind === "session" && args.attended === true, revision: c.revision + 1, error: null, updatedAt: Date.now() });
    if (c.kind === "goal") await recalculate(ctx, userId);
    else if (c.kind !== "conversation") await refreshNetwork(ctx, userId);
    return null;
  },
});
export const remove = mutation({ args: { captureId: v.id("captures") }, handler: async (ctx, { captureId }) => {
  const c = await owned(ctx, captureId, await user(ctx));
  if (c.memoryId) {
    const memory = await ctx.db.get(c.memoryId), connection = c.connectionId ? await ctx.db.get(c.connectionId) : null;
    if (memory) await ctx.db.patch(memory._id, { status: "revoked", summary: "Removed by capture owner", topicIds: [], approvedBy: [], revision: memory.revision + 1 });
    if (connection) await recalculatePair(ctx, connection);
  }
  for (const file of c.files) await ctx.storage.delete(file.storageId);
  await ctx.db.delete(c._id);
  if (c.kind !== "conversation") await refreshNetwork(ctx, c.userId);
  return null;
} });

// Only authenticated HTTP handlers and server jobs can attach/read storage IDs.
export const uploadContext = internalQuery({ args: { captureId: v.id("captures"), userId: v.id("users") }, handler: async (ctx, args) => owned(ctx, args.captureId, args.userId) });
export const attach = internalMutation({ args: { captureId: v.id("captures"), userId: v.id("users"), storageId: v.id("_storage"), mime: v.string(), size: v.number(), uploadKey: v.optional(v.string()) }, handler: async (ctx, args) => {
  const c = await owned(ctx, args.captureId, args.userId), media = mediaType(args.mime);
  if (c.connectionId) await accepted(ctx, c.connectionId, args.userId);
  if(args.uploadKey && c.files.some(f=>f.uploadKey===args.uploadKey))return false;
  if (c.status !== "collecting" || args.size <= 0 || args.size > media.max) throw new Error("Upload no longer available or too large");
  if (c.files.filter(f => mediaType(f.mime).kind === media.kind).length >= (media.kind === "audio" ? 1 : 3)) throw new Error("Use one audio clip and up to three photos per capture");
  await ctx.db.patch(c._id, { files: [...c.files, { storageId: args.storageId, mime: media.mime, size: args.size, ...(args.uploadKey?{uploadKey:args.uploadKey}:{}) }], updatedAt: Date.now() });
  return true;
} });
export const input = internalQuery({ args: { captureId: v.id("captures"), revision: v.number() }, handler: async (ctx, { captureId, revision }) => {
  const c = await ctx.db.get(captureId);
  if (!c || c.revision !== revision || c.status !== "processing") return null;
  if (c.connectionId) { const conn = await ctx.db.get(c.connectionId); if (!conn || conn.status !== "accepted") return null; }
  return c;
} });
export const progress = internalMutation({ args: { captureId: v.id("captures"), revision: v.number(), stage: v.string() }, handler: async (ctx, args) => {
  const c = await ctx.db.get(args.captureId);
  if (!c || c.revision !== args.revision || c.status !== "processing") return false;
  await ctx.db.patch(c._id, { agentStage: args.stage, updatedAt: Date.now() }); return true;
} });
export const finish = internalMutation({ args: { captureId: v.id("captures"), revision: v.number(), transcript: v.string(), draft: v.union(contextDraft, v.null()), error: v.union(v.string(), v.null()) }, handler: async (ctx, args) => {
  const c = await ctx.db.get(args.captureId);
  if (!c || c.revision !== args.revision || c.status !== "processing") return false;
  if (c.connectionId) { const conn = await ctx.db.get(c.connectionId); if (!conn || conn.status !== "accepted") { await ctx.db.patch(c._id, { status: "error", agentStage: "Connection unavailable", error: "This connection is no longer active", updatedAt: Date.now() }); return false; } }
  const draft=args.draft?cleanDraft(args.draft):null;
  if(!args.error&&draft&&c.autoSaveDemo&&c.connectionId){
    const connection=await accepted(ctx,c.connectionId,c.userId);
    if(!connection.demo)throw new Error('Demo connection required');
    const count=await ctx.db.query('memories').withIndex('by_connection',q=>q.eq('connectionId',connection._id)).take(20);
    if(count.length<20){
      const memoryId=await ctx.db.insert('memories',{connectionId:connection._id,createdBy:c.userId,summary:memoryText(draft),topicIds:draft.topicIds,networkAreas:draft.networkAreas,status:'shared',approvedBy:[],autoSaved:true,revision:1,updatedAt:Date.now()});
      await ctx.db.patch(c._id,{status:'approved',agentStage:'Saved automatically · demo context',transcript:args.transcript.slice(0,30_000),draft,draftOrigin:'openai',memoryId,revision:c.revision+1,error:null,updatedAt:Date.now()});
      await recalculate(ctx,c.userId);return true;
    }
  }
  await ctx.db.patch(c._id, { status: args.error ? "error" : "review", agentStage: args.error ? "Needs attention" : "Ready for your review",
    transcript: args.transcript.slice(0, 30_000), draft: args.draft ? cleanDraft(args.draft) : null, draftOrigin: args.draft ? "openai" : null, error: args.error, updatedAt: Date.now() });
  return true;
} });
export const timeout = internalMutation({ args: { captureId: v.id("captures"), revision: v.number() }, handler: async (ctx, args) => {
  const c = await ctx.db.get(args.captureId);
  if (c?.status === "processing" && c.revision === args.revision) await ctx.db.patch(c._id, { status: "error", agentStage: "Analysis timed out", error: "Your capture is saved. Review manually or retry analysis.", updatedAt: Date.now() });
  return null;
} });
