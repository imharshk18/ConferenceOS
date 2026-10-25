import { chromium } from "playwright";
import { ConvexHttpClient } from "convex/browser";
import { anyApi as api } from "convex/server";
import { config } from "dotenv";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
config({ path: ".env.local", quiet: true });
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--enable-webgl", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), page = await context.newPage();
const errors = [], checks = {};
page.on("pageerror", e => errors.push(e.message));
const a = new ConvexHttpClient(process.env.CONVEX_URL), b = new ConvexHttpClient(process.env.CONVEX_URL);
let connectionId, sessionId;
async function until(read, accept) { for (let i = 0; i < 100; i++) { const v = await read(); if (accept(v)) return v; await new Promise(r => setTimeout(r, 500)); } throw new Error("State did not converge"); }
try {
  for (const c of [a,b]) { const auth = await c.action(api.auth.signIn, { provider: "anonymous" }); c.setAuth(auth.tokens.token); }
  await a.mutation(api.social.saveProfile, { name: "Private gallery viewer", headline: "Private observer", goal: "Private ambition", skillIds: [], networkAreas: [], color: "#bda4ff" });
  await b.mutation(api.social.saveProfile, { name: "Private creator", headline: "Private storytelling", goal: "Secret goal", skillIds: [], networkAreas: ["content", "design"], color: "#ffb4d5" });
  await page.goto("http://localhost:5173");
  await page.getByRole("button", { name: "Pair phone", exact: true }).click();
  await until(() => page.getByTestId("pair-phone").isEnabled(), Boolean);
  await page.getByTestId("pair-phone").click();
  const code = await until(() => page.getByTestId("pairing-code").textContent().catch(() => ""), v => /^\d{6}$/.test(v?.trim() ?? ""));
  const pairing = await a.mutation(api.presentation.pair, { code: code.trim(), approvedTopicIds: [] }); assert.equal(pairing.ok, true); sessionId = pairing.sessionId;
  await page.getByLabel("Close pairing").click();
  const graph = page.getByTestId("graph-explorer");
  assert.equal(await graph.getAttribute("data-context-nodes"), "0"); checks.contextSharingOffByDefault = true;
  const invite = await a.mutation(api.social.createInvite, {}); assert.equal((await b.mutation(api.social.requestConnection, { code: invite.code })).ok, true);
  connectionId = (await a.query(api.social.mine, {})).connections[0].id; await a.mutation(api.social.respondConnection, { connectionId, accept: true });
  const first = await until(() => a.query(api.network.mine, {}), v => v?.status === "ready" && v.stats.connections === 1);
  assert.equal(first.graph.edges.length, 3); assert.ok(first.graph.edges.every(e => /^falkor:\d+$/.test(e.id)));
  assert.equal(first.stats.areas.find(a => a.id === "content").score, 15); checks.realFalkorIdsAndCoverage = true;
  await a.mutation(api.network.setPresentation, { enabled: true });
  await until(() => graph.getAttribute("data-context-edges"), v => v === "3");
  assert.equal(await graph.getAttribute("data-scope"), "personal");
  await page.screenshot({ path: "phase5-desktop-initial.png" });
  await a.mutation(api.social.saveMemory, { connectionId, summary: "Private discussion of creative storytelling", topicIds: [], networkAreas: ["content"] });
  const memory = (await b.query(api.social.mine, {})).memories[0];
  assert.equal((await a.query(api.network.mine, {})).stats.sharedMemories, 0);
  await b.mutation(api.social.approveMemory, { memoryId: memory.id, revision: memory.revision });
  const grown = await until(() => a.query(api.network.mine, {}), v => v?.status === "ready" && v.stats.sharedMemories === 1);
  assert.equal(grown.graph.edges.length, 6); assert.equal(grown.stats.areas.find(a => a.id === "content").score, 25);
  await until(() => graph.getAttribute("data-context-edges"), v => v === "6"); checks.reviewedContextGrowsDesktopWithoutRefresh = true;
  await page.waitForTimeout(1200); await page.screenshot({ path: "phase5-desktop-growing.png" });
  const body = await page.locator("body").innerText();
  for (const privateText of ["Private gallery", "Private creator", "Private discussion", "storytelling", connectionId, memory.id, "Secret goal"]) assert.ok(!body.includes(privateText));
  assert.equal(await page.locator(".sidebar,.topbar,.person-card").count(), 0); checks.globeOnlyNoRawPersonalData = true;
  await context.setOffline(true); await until(() => graph.getAttribute("data-context-nodes"), v => v === "0"); checks.offlineClearsContext = true;
  await context.setOffline(false); await until(() => graph.getAttribute("data-context-edges"), v => v === "6");
  await a.mutation(api.network.setPresentation, { enabled: false }); await until(() => graph.getAttribute("data-context-nodes"), v => v === "0"); checks.optOutClearsImmediately = true;
  await a.mutation(api.network.setPresentation, { enabled: true }); await until(() => graph.getAttribute("data-context-edges"), v => v === "6");
  await a.mutation(api.presentation.revoke, { sessionId }); await until(() => graph.getAttribute("data-context-nodes"), v => v === "0"); checks.sessionRevocationClearsImmediately = true;
  assert.deepEqual(errors, []); checks.noBrowserExceptions = true;
  console.log(JSON.stringify(checks, null, 2));
} catch (error) { await page.screenshot({ path: "work/phase5-desktop-failure.png" }); console.error(checks, errors); throw error; }
finally {
  if (sessionId) await a.mutation(api.presentation.revoke, { sessionId }).catch(() => {});
  if (connectionId) await a.mutation(api.social.revokeConnection, { connectionId }).catch(() => {});
  for (const c of [a,b]) await c.action(api.auth.signOut, {}).catch(() => {});
  await writeFile("phase5-desktop-verification.json", JSON.stringify({ checkedAt: new Date().toISOString(), checks, errors, note: "Real Convex/FalkorDB; independent synthetic mobile identities; no scraping jobs or real personal data." }, null, 2));
  await browser.close();
}
