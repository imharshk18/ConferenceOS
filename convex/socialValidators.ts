import { v } from "convex/values";
import { proofValidator } from "./validators";
export const provenance = v.union(
  v.literal("simulation"),
  v.literal("brightdata-demo"),
  v.literal("brightdata-public"),
);
export const feedItemValidator = v.object({
  id: v.string(),
  connectionId: v.string(),
  memoryId: v.string(),
  postId: v.string(),
  name: v.string(),
  color: v.string(),
  headline: v.string(),
  excerpt: v.string(),
  summary: v.string(),
  topicId: v.string(),
  reason: v.string(),
  draft: v.string(),
  proof: proofValidator,
  provenance,
  sourceUrl: v.union(v.string(), v.null()),
  publishedAt: v.optional(v.number()),
});
