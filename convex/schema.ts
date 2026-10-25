import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";
import {
  proofValidator,
  sessionRecommendation,
  personRecommendation,
  recommendationStatus,
  recommendationSource,
  presentationStatus,
} from "./validators";
import { feedItemValidator, provenance } from "./socialValidators";
import { captureKind, captureStatus, contextDraft, sourcePlatform, sourceStatus } from "./journeyValidators";
import { networkGraph, sharedContextGraph } from "./networkValidators";
import { onboardingProfile, onboardingStatus } from './onboardingValidators';
export default defineSchema({
  ...authTables,
  preferences: defineTable({
    userId: v.id("users"),
    bookmarks: v.array(v.string()),
    topicIds: v.array(v.string()),
    met: v.array(v.string()),
    revision: v.optional(v.number()),
  }).index("by_userId", ["userId"]),
  recommendations: defineTable({
    userId: v.id("users"),
    revision: v.number(),
    status: recommendationStatus,
    source: recommendationSource,
    talks: v.array(sessionRecommendation),
    people: v.array(personRecommendation),
    error: v.union(v.string(), v.null()),
    updatedAt: v.union(v.number(), v.null()),
  }).index("by_userId", ["userId"]),
  presentations: defineTable({
    desktopUserId: v.id("users"),
    mobileUserId: v.optional(v.id("users")),
    codeHash: v.optional(v.string()),
    codeExpiresAt: v.number(),
    expiresAt: v.number(),
    status: presentationStatus,
    approvedTopicIds: v.array(v.string()),
    consentRevision: v.number(),
    revision: v.union(v.number(), v.null()),
    proof: v.union(proofValidator, v.null()),
    updatedAt: v.union(v.number(), v.null()),
  })
    .index("by_codeHash", ["codeHash"])
    .index("by_desktop", ["desktopUserId"])
    .index("by_mobile", ["mobileUserId"]),
  pairingAttempts: defineTable({
    userId: v.id("users"),
    windowStart: v.number(),
    count: v.number(),
  }).index("by_userId", ["userId"]),
  profiles: defineTable({
    userId: v.id("users"),
    name: v.string(),
    headline: v.string(),
    goal: v.string(),
    skillIds: v.array(v.string()),
    networkAreas: v.optional(v.array(v.string())),
    color: v.string(),
    context: v.optional(v.string()),
    contextRevision: v.optional(v.number()),
    source: v.optional(v.union(v.literal('manual'),v.literal('bland'),v.literal('demo'))),
  }).index("by_userId", ["userId"]),
  connections: defineTable({
    demo: v.optional(v.boolean()),
    requestorId: v.id("users"),
    recipientId: v.id("users"),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("revoked"),
    ),
    createdAt: v.number(),
    acceptedAt: v.union(v.number(), v.null()),
  })
    .index("by_requestor", ["requestorId"])
    .index("by_recipient", ["recipientId"]),
  connectionInvites: defineTable({
    userId: v.id("users"),
    codeHash: v.string(),
    expiresAt: v.number(),
    consumed: v.boolean(),
  })
    .index("by_codeHash", ["codeHash"])
    .index("by_userId", ["userId"]),
  connectionAttempts: defineTable({
    userId: v.id("users"),
    windowStart: v.number(),
    count: v.number(),
  }).index("by_userId", ["userId"]),
  memories: defineTable({
    autoSaved: v.optional(v.boolean()),
    connectionId: v.id("connections"),
    createdBy: v.id("users"),
    summary: v.string(),
    topicIds: v.array(v.string()),
    networkAreas: v.optional(v.array(v.string())),
    status: v.union(
      v.literal("draft"),
      v.literal("shared"),
      v.literal("revoked"),
    ),
    approvedBy: v.array(v.id("users")),
    revision: v.number(),
    updatedAt: v.number(),
  }).index("by_connection", ["connectionId"]),
  socialPosts: defineTable({
    authorId: v.id("users"),
    excerpt: v.string(),
    topicIds: v.array(v.string()),
    platform: v.union(v.literal("demo"), v.literal("x"), v.literal("linkedin")),
    provenance,
    sourceId: v.optional(v.id("publicSources")),
    sourceUrl: v.union(v.string(), v.null()),
    createdAt: v.number(),
    retracted: v.boolean(),
  }).index("by_author", ["authorId"]).index("by_source", ["sourceId"]),
  captures: defineTable({
    autoSaveDemo: v.optional(v.boolean()),
    userId: v.id("users"), kind: captureKind, title: v.string(), notes: v.string(),
    talkId: v.optional(v.string()), connectionId: v.optional(v.id("connections")),
    revision: v.number(), status: captureStatus, agentStage: v.string(),
    consentAt: v.number(), files: v.array(v.object({ storageId: v.id("_storage"), mime: v.string(), size: v.number(), uploadKey: v.optional(v.string()) })),
    transcript: v.string(), draft: v.union(contextDraft, v.null()), error: v.union(v.string(), v.null()),
    draftOrigin: v.optional(v.union(v.literal("openai"), v.literal("manual"), v.null())),
    memoryId: v.optional(v.id("memories")), attended: v.boolean(),
    createdAt: v.number(), updatedAt: v.number(), attempts: v.number(),
  }).index("by_user", ["userId"]),
  publicSources: defineTable({
    userId: v.id("users"), connectionId: v.id("connections"), profileUrl: v.string(), platform: sourcePlatform,
    status: sourceStatus, revision: v.number(), deleted: v.boolean(), confirmedAt: v.number(),
    error: v.union(v.string(), v.null()), postCount: v.number(), lastCheckedAt: v.union(v.number(), v.null()),
    lastStartedAt: v.union(v.number(), v.null()), jobId: v.optional(v.id("sourceJobs")),
  }).index("by_user", ["userId"]),
  sourceJobs: defineTable({
    userId: v.id("users"), sourceId: v.id("publicSources"), revision: v.number(),
    status: sourceStatus, snapshotId: v.optional(v.string()), createdAt: v.number(), triggeredAt: v.optional(v.number()),
    startDate: v.string(), endDate: v.string(), pollCount: v.number(), lastPolledAt: v.number(),
  }).index("by_user", ["userId"]),
  socialIntelligence: defineTable({
    userId: v.id("users"),
    scope: v.string(),
    revision: v.number(),
    status: recommendationStatus,
    items: v.array(feedItemValidator),
    error: v.union(v.string(), v.null()),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),
  socialPresentation: defineTable({
    sessionId: v.id("presentations"),
    allowNetwork: v.boolean(),
    revision: v.number(),
    kind: v.union(
      v.literal("connection"),
      v.literal("opportunity"),
      v.literal("none"),
    ),
    proof: v.union(proofValidator, v.null()),
    updatedAt: v.number(),
  }).index("by_session", ["sessionId"]),
  networkIntelligence: defineTable({ userId: v.id("users"), scope: v.string(), revision: v.number(), status: recommendationStatus,
    graph: networkGraph, error: v.union(v.string(), v.null()), updatedAt: v.number(), generatedAt: v.union(v.number(), v.null()) }).index("by_user", ["userId"]),
  networkPresentation: defineTable({ sessionId: v.id("presentations"), enabled: v.boolean(), salt: v.string(), revision: v.number(), graph: v.union(sharedContextGraph, v.null()), updatedAt: v.number() }).index("by_session", ["sessionId"]),
  onboardingCalls: defineTable({userId:v.id('users'),phone:v.string(),externalId:v.string(),callbackToken:v.string(),callId:v.optional(v.string()),dispatchedAt:v.optional(v.number()),leaseId:v.optional(v.string()),status:onboardingStatus,createdAt:v.number(),updatedAt:v.number(),polls:v.number(),leaseUntil:v.number(),baseProfileRevision:v.number(),basePreferenceRevision:v.number(),applyWhenReady:v.optional(v.boolean()),draft:v.union(onboardingProfile,v.null()),error:v.union(v.string(),v.null())}).index('by_user',['userId']).index('by_call',['callId']).index('by_token',['callbackToken']).index('by_created',['createdAt']),
});
