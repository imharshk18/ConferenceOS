import { chromium } from "playwright";
import { ConvexHttpClient } from "convex/browser";
import { anyApi as api } from "convex/server";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const deployment = "https://resilient-llama-452.convex.cloud";
const storageKey = "conferenceos-mobile-official-preferences-v2";
const source = JSON.parse(
  await readFile(
    new URL("../../../data/universe-source.json", import.meta.url),
    "utf8",
  ),
);
const sessions = source.sessions.filter((session) =>
  source.event.dates.includes(session.date),
);
const output = resolve("evidence");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
const desktop = new ConvexHttpClient(deployment);
const mobile = new ConvexHttpClient(deployment);
const results = [],
  errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const check = (name, ok) => {
  results.push({ name, ok });
  if (!ok) throw new Error(name);
};
const until = async (fetch, accept) => {
  for (let i = 0; i < 90; i++) {
    const value = await fetch();
    if (accept(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("State did not converge");
};
const capture = async (name) => {
  if (await page.locator('[aria-modal="true"]').count())
    await page.getByRole("dialog").waitFor();
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    ),
  );
  await page.screenshot({
    path: `${output}/phase2-${name}.png`,
    animations: "disabled",
  });
};
const tab = async (name) =>
  page.getByRole("tab", { name, exact: true }).click();
const close = async () => {
  await page.getByLabel("Close details").last().click();
  await page.getByLabel("Close details").last().waitFor({ state: "hidden" });
};
const setTopics = async (selected) => {
  await page.getByLabel("Edit your interests", { exact: true }).click();
  for (const [id, label] of [
    ["ai", "AI & agents"],
    ["opensource", "Open source"],
    ["platform", "Platform engineering"],
    ["security", "Security"],
    ["graph", "Knowledge graphs"],
    ["devex", "Developer experience"],
  ]) {
    const option = page.getByRole("checkbox", { name: label, exact: true });
    if (
      ((await option.getAttribute("aria-checked")) === "true") !==
      selected.includes(id)
    )
      await option.click();
  }
  await page.getByText("Find my connections", { exact: true }).click();
  await page.getByLabel("Close details").last().waitFor({ state: "hidden" });
};
const ready = async () =>
  until(
    async () => ({
      prefs: await mobile.query(api.preferences.mine, {}),
      state: await mobile.query(api.intelligence.mine, {}),
    }),
    (value) =>
      value.state.status === "ready" &&
      value.state.revision === value.prefs.revision,
  );
let desktopSession;

try {
  const auth = await desktop.action(api.auth.signIn, { provider: "anonymous" });
  desktop.setAuth(auth.tokens.token);
  await page.goto(process.env.MOBILE_URL || "http://localhost:8082");
  await page
    .getByText("Live graph", { exact: false })
    .waitFor({ timeout: 45000 });
  const mobileToken = await page.evaluate(() =>
    localStorage.getItem(
      Object.keys(localStorage).find((key) =>
        key.startsWith("__convexAuthJWT_"),
      ),
    ),
  );
  if (!mobileToken) throw new Error("Test identity was not initialized");
  mobile.setAuth(mobileToken);
  const initial = await ready();
  check(
    "Server initializes persisted recommendations after app auth",
    initial.state.status === "ready",
  );
  await capture("today");

  const record = initial.state.talks.find(
    (record) =>
      sessions.filter(
        (session) =>
          session.title ===
          sessions.find((session) => session.id === record.talkId)?.title,
      ).length === 1,
  );
  const talk = sessions.find((session) => session.id === record.talkId);
  await tab("Sessions");
  if (talk.date === "2026-10-29")
    await page.getByText("DAY 02", { exact: true }).click();
  await page
    .getByPlaceholder("Search sessions, speakers, topics")
    .fill(talk.title);
  await page.getByText("Why this connects", { exact: true }).click();
  await page.getByRole("dialog").waitFor();
  const proofDialog = page.getByRole("dialog");
  check(
    "Private preference context is separate from graph nodes",
    await proofDialog
      .getByText("PRIVATE CONTEXT · NOT A GRAPH NODE")
      .isVisible(),
  );
  const expected = initial.state.talks.find(
    (item) => item.talkId === talk.id,
  ).proof;
  const positions = [];
  for (const id of expected.traversalNodeIds) {
    const node = expected.nodes.find((node) => node.id === id);
    const locator = proofDialog.getByText(node.label, { exact: true });
    check(
      `Returned ${node.kind} node appears unchanged`,
      await locator.isVisible(),
    );
    positions.push((await locator.boundingBox()).y);
  }
  check(
    "Server traversal order is preserved",
    positions.every((y, i) => !i || y > positions[i - 1]),
  );
  for (const edge of expected.edges) {
    const from = expected.nodes.find((node) => node.id === edge.source),
      to = expected.nodes.find((node) => node.id === edge.target);
    check(
      `Returned ${edge.kind} direction is preserved`,
      (await proofDialog
        .getByLabel(`${from.label} ${edge.kind} ${to.label}`, { exact: true })
        .count()) === 1,
    );
  }
  await capture("proof");
  await close();

  desktopSession = await desktop.mutation(api.presentation.create, {});
  await tab("Orbit");
  await page.getByLabel("Manage desktop presentation sharing").click();
  await page.getByRole("dialog").waitFor();
  const consent = page.getByRole("dialog");
  check(
    "Pairing starts with no topic approval",
    (await consent
      .getByRole("checkbox", { name: "Share AI & agents", exact: true })
      .getAttribute("aria-checked")) === "false",
  );
  check(
    "Sharing requires explicit scope and code",
    (await consent
      .getByRole("button", { name: "Share approved topics", exact: true })
      .getAttribute("aria-disabled")) === "true",
  );
  await consent.getByLabel("Desktop pairing code").fill(desktopSession.code);
  await consent
    .getByRole("checkbox", { name: "Share AI & agents", exact: true })
    .click();
  await consent
    .getByRole("button", { name: "Share approved topics", exact: true })
    .click();
  const stage = await until(
    () =>
      desktop.query(api.presentation.desktop, {
        sessionId: desktopSession.sessionId,
      }),
    (value) => value?.status === "live" && value.proof,
  );
  check(
    "Approved public path reaches separate desktop identity",
    stage.proof.nodes.some((node) => node.kind === "Topic" && node.id === "ai"),
  );
  check(
    "Presentation excludes people and private profile names",
    stage.proof.nodes.every((node) =>
      ["Topic", "Talk", "Speaker"].includes(node.kind),
    ),
  );
  check(
    "Presentation includes only approved topic nodes",
    stage.proof.nodes
      .filter((node) => node.kind === "Topic")
      .every((node) => node.id === "ai"),
  );
  await capture("consent");
  await consent
    .getByRole("button", {
      name: "Clear approval and pause sharing",
      exact: true,
    })
    .click();
  const paused = await until(
    () =>
      desktop.query(api.presentation.desktop, {
        sessionId: desktopSession.sessionId,
      }),
    (value) => value?.status === "paired" && !value.proof,
  );
  check("Clearing consent removes desktop proof", paused.proof === null);
  await consent
    .getByRole("checkbox", { name: "Share Security", exact: true })
    .click();
  await consent
    .getByRole("button", { name: "Update approved topics", exact: true })
    .click();
  const updated = await until(
    () =>
      desktop.query(api.presentation.desktop, {
        sessionId: desktopSession.sessionId,
      }),
    (value) =>
      value?.status === "live" &&
      value.proof?.nodes.some(
        (node) => node.kind === "Topic" && node.id === "security",
      ),
  );
  check(
    "Scope update replaces the displayed topic path",
    updated.proof.nodes
      .filter((node) => node.kind === "Topic")
      .every((node) => node.id === "security"),
  );
  await close();

  await context.setOffline(true);
  await setTopics(["opensource"]);
  await tab("Orbit");
  await page.getByLabel("Manage desktop presentation sharing").click();
  await page
    .getByRole("dialog")
    .getByText("This phone is disconnected.", { exact: false })
    .waitFor();
  check(
    "Disconnected sharing warns that previous approval may remain active",
    true,
  );
  check(
    "Offline revoke never claims an unsent mutation succeeded",
    (await page
      .getByRole("dialog")
      .getByRole("button", { name: "Revoke presentation sharing", exact: true })
      .getAttribute("aria-disabled")) === "true",
  );
  await capture("disconnected-sharing");
  await close();
  await tab("Today");
  await page.getByText("Preview", { exact: false }).first().waitFor();
  check(
    "Pending offline interests never label stale results live",
    (await page.getByText("Live graph", { exact: false }).count()) === 0,
  );
  await capture("offline");
  await context.setOffline(false);
  await page.waitForFunction(
    (key) => {
      const p = JSON.parse(localStorage.getItem(key) || "{}");
      return (
        p.topicIds?.length === 1 &&
        p.topicIds[0] === "opensource" &&
        p.outbox?.topicIds === null
      );
    },
    storageKey,
    { timeout: 45000 },
  );
  const changed = await ready();
  check(
    "Interest mutation automatically schedules matching server revision",
    changed.prefs.revision > initial.prefs.revision &&
      changed.state.revision === changed.prefs.revision,
  );
  const noScopeMatch = await until(
    () =>
      desktop.query(api.presentation.desktop, {
        sessionId: desktopSession.sessionId,
      }),
    (value) =>
      value?.revision === changed.prefs.revision && value.proof === null,
  );
  check(
    "New interests cannot publish outside approved scope",
    noScopeMatch.proof === null,
  );

  await desktop.mutation(api.presentation.revoke, {
    sessionId: desktopSession.sessionId,
  });
  await tab("Orbit");
  await page.getByLabel("Manage desktop presentation sharing").click();
  await page
    .getByRole("dialog")
    .getByText("Revoked · sharing stopped", { exact: true })
    .waitFor();
  check("Desktop revocation is visible on mobile", true);
  check(
    "Ended approval is not inherited by a new desktop",
    (await page
      .getByRole("dialog")
      .getByRole("checkbox", { name: "Share Security", exact: true })
      .getAttribute("aria-checked")) === "false",
  );
  await capture("revoked");
  desktopSession = await desktop.mutation(api.presentation.create, {});
  await page
    .getByRole("dialog")
    .getByLabel("Desktop pairing code")
    .fill(desktopSession.code);
  await page
    .getByRole("dialog")
    .getByRole("checkbox", { name: "Share Open source", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Share approved topics", exact: true })
    .click();
  await until(
    () =>
      desktop.query(api.presentation.desktop, {
        sessionId: desktopSession.sessionId,
      }),
    (value) =>
      value && !["waiting", "expired", "revoked"].includes(value.status),
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Revoke presentation sharing", exact: true })
    .click();
  const stopped = await until(
    () =>
      desktop.query(api.presentation.desktop, {
        sessionId: desktopSession.sessionId,
      }),
    (value) => value?.status === "revoked" && !value.proof,
  );
  check(
    "Mobile revoke clears the paired desktop payload",
    stopped.proof === null,
  );
  await close();

  await setTopics([]);
  const empty = await ready();
  await tab("Today");
  await page
    .getByText("No sessions for these interests", { exact: true })
    .waitFor();
  check(
    "Ready empty results do not fabricate a featured session",
    empty.state.talks.length === 0 &&
      (await page.getByText("Opening Keynote", { exact: true }).count()) === 0,
  );
  await capture("empty");
  check("No uncaught mobile web exceptions", errors.length === 0);
} finally {
  if (desktopSession)
    await desktop
      .mutation(api.presentation.revoke, {
        sessionId: desktopSession.sessionId,
      })
      .catch(() => {});
  await writeFile(
    `${output}/phase2-smoke.json`,
    JSON.stringify(
      { viewport: { width: 390, height: 844 }, results, errors },
      null,
      2,
    ),
  );
  await browser.close();
}
console.log(JSON.stringify({ results, errors }, null, 2));
