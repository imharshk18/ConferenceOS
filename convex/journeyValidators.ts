import { v } from "convex/values";
export const captureKind = v.union(v.literal("goal"), v.literal("session"), v.literal("conversation"));
export const captureStatus = v.union(v.literal("collecting"), v.literal("processing"), v.literal("review"), v.literal("approved"), v.literal("error"));
export const contextDraft = v.object({ summary: v.string(), topicIds: v.array(v.string()), networkAreas: v.optional(v.array(v.string())), takeaways: v.array(v.string()), actions: v.array(v.string()) });
export const sourcePlatform = v.union(v.literal("x"), v.literal("linkedin"));
export const sourceStatus = v.union(v.literal("idle"), v.literal("starting"), v.literal("running"), v.literal("ready"), v.literal("error"), v.literal("uncertain"));
export const importedPost = v.object({ url: v.string(), excerpt: v.string(), topicIds: v.array(v.string()), publishedAt: v.number() });
