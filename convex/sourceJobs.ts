"use node";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { discoveryRequest, normalizePublicPost } from "../packages/core/publicSources";
import type { Doc } from "./_generated/dataModel";
type Job = Doc<"sourceJobs"> & { profileUrl: string };
class ProviderError extends Error { constructor(message: string, readonly rejected: boolean) { super(message); } }
async function request(path: string, body?: unknown) {
  const key = process.env.BRIGHTDATA_API_KEY?.trim();
  if (!key) throw new ProviderError("Bright Data is not configured in the backend yet.", true);
  const url = new URL(path, "https://api.brightdata.com");
  if (url.origin !== "https://api.brightdata.com") throw new ProviderError("Provider endpoint rejected", true);
  const response = await fetch(url, { method: body ? "POST" : "GET", redirect: "error", signal: AbortSignal.timeout(25_000),
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!response.ok) {
    // Only stable rejection codes prove a trigger did not run. 5xx/timeouts remain uncertain.
    throw new ProviderError(response.status === 401 || response.status === 403 ? "Bright Data rejected the key or backend IP. Check the key's allowed-IP settings." : response.status === 402 ? "Bright Data needs available credits." : `Bright Data returned HTTP ${response.status}.`, [400, 401, 402, 403, 404, 422, 429].includes(response.status));
  }
  const text = await response.text();
  if (text.length > 2_000_000) throw new ProviderError("Provider response exceeded the demo limit", false);
  return JSON.parse(text);
}
export const start = internalAction({ args: { jobId: v.id("sourceJobs") }, returns: v.null(), handler: async (ctx, { jobId }) => {
  const job: Job | null = await ctx.runMutation(internal.sources.claim, { jobId }); if (!job) return null;
  try {
    const spec = discoveryRequest(job.profileUrl, job.startDate, job.endDate);
    const result = await request(spec.url, spec.body);
    if (typeof result.snapshot_id !== "string" || !/^sd_[a-zA-Z0-9]+$/.test(result.snapshot_id)) throw new Error("Unconfirmed response");
    if (await ctx.runMutation(internal.sources.update, { jobId, status: "running", snapshotId: result.snapshot_id, error: null })) await ctx.scheduler.runAfter(10_000, internal.sourceJobs.poll, { jobId, automatic: true });
  } catch (error) {
    const rejected = error instanceof ProviderError && error.rejected;
    await ctx.runMutation(internal.sources.update, { jobId, status: rejected ? "error" : "uncertain", error: rejected ? error.message : "Scrape trigger was not confirmed. Check Bright Data before retrying; no duplicate paid request will be sent." });
  }
  return null;
} });
export const poll = internalAction({ args: { jobId: v.id("sourceJobs"), automatic: v.boolean() }, returns: v.null(), handler: async (ctx, { jobId, automatic }) => {
  const job: Job | null = await ctx.runQuery(internal.sources.job, { jobId });
  if (!job?.snapshotId || job.status === "ready" || !/^sd_[a-zA-Z0-9]+$/.test(job.snapshotId)) return null;
  try {
    const progress = await request(`/datasets/v3/progress/${job.snapshotId}`);
    if (progress.status === "ready") {
      const raw = await request(`/datasets/v3/snapshot/${job.snapshotId}?format=json`);
      if (!Array.isArray(raw) || raw.length > 3) throw new ProviderError("Provider returned more than the agreed three-post limit. No results imported.", true);
      const posts = raw.map(r => normalizePublicPost(r, job.profileUrl, job.startDate, job.endDate)).filter(p => p !== null);
      if (raw.length && !posts.length) throw new ProviderError("No posts passed source/date validation. The profile may be unavailable, private, or have no matching original posts.", true);
      await ctx.runMutation(internal.sources.finish, { jobId, posts });
    } else if (["failed", "error"].includes(progress.status)) throw new ProviderError("Bright Data could not complete this public-source scrape.", true);
    else {
      await ctx.runMutation(internal.sources.update, { jobId, status: "running", error: job.pollCount >= 11 ? "Still running at Bright Data. Check status later; no new scrape will be started." : null, poll: true });
      if (automatic && job.pollCount < 11) await ctx.scheduler.runAfter(20_000, internal.sourceJobs.poll, { jobId, automatic: true });
    }
  } catch (error) {
    await ctx.runMutation(internal.sources.update, { jobId, status: "error", error: error instanceof ProviderError ? error.message : "Unable to read the existing scrape. Check status later; no new request is required." });
  }
  return null;
} });
