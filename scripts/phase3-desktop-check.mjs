import { chromium } from "playwright";
import { ConvexHttpClient } from "convex/browser";
import { anyApi as api } from "convex/server";
import { config } from "dotenv";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
config({ path: ".env.local", quiet: true });
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: [
    "--enable-webgl",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  }),
  page = await context.newPage();
const errors = [],
  checks = {};
page.on("pageerror", (e) => errors.push(e.message));
const a = new ConvexHttpClient(process.env.CONVEX_URL),
  b = new ConvexHttpClient(process.env.CONVEX_URL);
let connectionId;
async function until(read, accept) {
  for (let i = 0; i < 70; i++) {
    const v = await read();
    if (accept(v)) return v;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("State did not converge");
}
try {
  await page.goto("http://localhost:5173");
  await page.getByRole("button", { name: "Pair phone", exact: true }).click();
  await page.getByTestId("pair-phone").waitFor();
  await until(() => page.getByTestId("pair-phone").isEnabled(), Boolean);
  await page.getByTestId("pair-phone").click();
  await page.getByTestId("pairing-code").waitFor();
  const code = (await page.getByTestId("pairing-code").innerText()).trim();
  assert.match(code, /^\d{6}$/);
  for (const client of [a, b]) {
    const result = await client.action(api.auth.signIn, {
      provider: "anonymous",
    });
    client.setAuth(result.tokens.token);
  }
  await a.mutation(api.social.saveProfile, {
    name: "Private Maya",
    headline: "Builder",
    goal: "Private hiring goal",
    skillIds: ["ai"],
    color: "#bfa2ff",
  });
  await b.mutation(api.social.saveProfile, {
    name: "Private Aarnav",
    headline: "Engineer",
    goal: "Private career goal",
    skillIds: ["ai"],
    color: "#9eedd2",
  });
  assert.equal(
    (
      await b.mutation(api.presentation.pair, {
        code,
        approvedTopicIds: ["ai"],
      })
    ).ok,
    true,
  );
  await b.mutation(api.social.setStageSharing, { enabled: true });
  await page.getByLabel("Close pairing").click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="graph-explorer"]')
        ?.getAttribute("data-proof-node-ids") !== "[]",
    null,
    { timeout: 40000 },
  );
  checks.publicPathStillWorks = true;
  await page.screenshot({ path: "phase3-desktop-conference.png" });
  const invite = await a.mutation(api.social.createInvite, {});
  assert.equal(
    (await b.mutation(api.social.requestConnection, { code: invite.code })).ok,
    true,
  );
  connectionId = (await a.query(api.social.mine, {})).connections[0].id;
  await a.mutation(api.social.respondConnection, {
    connectionId,
    accept: true,
  });
  await page.getByTestId("network-burst").waitFor();
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="graph-explorer"]')
        ?.getAttribute("data-network-count") === "1",
  );
  checks.acceptedConnectionAnimatesWithoutRefresh = true;
  await a.mutation(api.social.saveMemory, {
    connectionId,
    summary: "Private shared notes about production AI agents.",
    topicIds: ["ai"],
  });
  const memory = (await b.query(api.social.mine, {})).memories[0];
  await b.mutation(api.social.approveMemory, {
    memoryId: memory.id,
    revision: memory.revision,
  });
  await a.mutation(api.social.publishDemoPost, {
    excerpt: "Demo: Looking for an AI engineer.",
    topicIds: ["ai"],
  });
  const state = await until(
    () => b.query(api.social.mine, {}),
    (v) => v?.feed.status === "ready" && v.feed.items.length > 0,
  );
  const card = state.feed.items[0];
  await b.mutation(api.social.presentPath, { cardId: card.id });
  const graph = page.getByTestId("graph-explorer");
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="graph-explorer"]')
        ?.getAttribute("data-proof-node-ids")
        ?.includes("shared:n0"),
    null,
    { timeout: 15000 },
  );
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="graph-explorer"]')
        ?.getAttribute("data-animation-complete") === "true",
    null,
    { timeout: 20000 },
  );
  checks.actualSharedPathAnimatesInOrder = true;
  const trail = page.getByTestId("exact-proof");
  assert.deepEqual(JSON.parse(await trail.getAttribute("data-path-node-ids")), [
    "shared:n0",
    "shared:n1",
    "shared:n2",
    "shared:n3",
    "shared:n4",
  ]);
  const directions = await trail
    .locator("[data-edge-id]")
    .evaluateAll((elements) =>
      elements.map((e) => [
        e.getAttribute("data-source"),
        e.getAttribute("data-kind"),
        e.getAttribute("data-target"),
      ]),
    );
  assert.deepEqual(directions, [
    ["shared:n0", "HAS_SKILL", "shared:n1"],
    ["shared:n2", "DISCUSSED", "shared:n1"],
    ["shared:n3", "REMEMBERS", "shared:n2"],
    ["shared:n3", "WROTE", "shared:n4"],
  ]);
  checks.directedRelationshipsPreserved = true;
  const body = await page.locator("body").innerText();
  for (const privateValue of [
    "Private Maya",
    "Private Aarnav",
    "Private shared notes",
    card.excerpt,
    connectionId,
  ])
    assert.ok(!body.includes(privateValue));
  assert.equal(await page.locator(".sidebar,.topbar,.person-card").count(), 0);
  checks.globeOnlyAndNoRawPrivateData = true;
  await page.screenshot({ path: "phase3-desktop-personal.png" });
  await context.setOffline(true);
  await page
    .getByText("Disconnected · highlights paused", { exact: true })
    .waitFor();
  assert.equal(await graph.getAttribute("data-proof-node-ids"), "[]");
  assert.equal(await graph.getAttribute("data-network-count"), "0");
  checks.offlineClearsPersonalProjection = true;
  await context.setOffline(false);
  await page.getByTestId("exact-proof").waitFor({ timeout: 20000 });
  const presentation = await b.query(api.presentation.mine, {});
  await b.mutation(api.presentation.revoke, {
    sessionId: presentation.sessionId,
  });
  await page.getByText("Sharing ended", { exact: true }).waitFor();
  assert.equal(await graph.getAttribute("data-proof-node-ids"), "[]");
  checks.revocationClearsWithoutRefresh = true;
  assert.deepEqual(errors, []);
  checks.noBrowserExceptions = true;
  await writeFile(
    "phase3-desktop-verification.json",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        checks,
        errors,
        note: "Live desktop UI with independent simulated mobile identities using real Convex mutations and FalkorDB.",
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(checks, null, 2));
} catch (error) {
  await page.screenshot({ path: "work/phase3-desktop-failure.png" });
  console.error("Completed checks", checks, "browser errors", errors);
  throw error;
} finally {
  if (connectionId)
    await a
      .mutation(api.social.revokeConnection, { connectionId })
      .catch(() => {});
  for (const client of [a, b])
    await client.action(api.auth.signOut, {}).catch(() => {});
  await browser.close();
}
