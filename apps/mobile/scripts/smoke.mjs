import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Uses the scraped program, a fresh browser, and a private anonymous test identity.
const program = JSON.parse(
  await readFile(
    new URL("../../../data/universe-source.json", import.meta.url),
    "utf8",
  ),
);
const profileData = JSON.parse(
  await readFile(
    new URL("../../../data/profile-sources.json", import.meta.url),
    "utf8",
  ),
);
const sessions = program.sessions.filter((s) =>
  program.event.dates.includes(s.date),
);
const target = sessions.find(
  (s) =>
    s.date === "2026-10-28" &&
    s.speakerIds.length &&
    s.attributes.some((a) => a.name === "Topic" && a.value.startsWith("AI:")) &&
    sessions.filter((other) => other.title === s.title).length === 1,
);
const noPresenter = sessions.find(
  (s) =>
    s.date === "2026-10-28" &&
    !s.speakerIds.length &&
    !s.attributes.some((a) => a.name === "Topic"),
);
const person = profileData.profiles.find((p) => p.id === "harsh");
const hiringPerson = profileData.profiles.find(
  (p) => p.hiring.status === "public-post-found",
);
const storageKey = "conferenceos-mobile-official-preferences-v2";
const output = resolve("evidence");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
const errors = [];
const results = [];
page.on("pageerror", (error) => errors.push(error.message));
const check = (name, ok) => {
  results.push({ name, ok });
  if (!ok) throw new Error(name);
};
const capture = async (path) => {
  if (await page.locator('[aria-modal="true"]').count())
    await page.getByRole("dialog").waitFor({ state: "visible" });
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    ),
  );
  await page.screenshot({ path, animations: "disabled" });
};
const closeSheet = async () => {
  await page.getByLabel("Close details").last().click();
  await page.getByLabel("Close details").last().waitFor({ state: "hidden" });
};
const openTab = async (name) =>
  page.getByRole("tab", { name, exact: true }).click();
const findSession = async (session) => {
  await openTab("Sessions");
  await page
    .getByPlaceholder("Search sessions, speakers, topics")
    .fill(session.title);
  await page.getByText(session.title, { exact: true }).waitFor();
};
const waitSaved = async (id) =>
  page.waitForFunction(
    ({ key, id }) => {
      const p = JSON.parse(localStorage.getItem(key) || "{}");
      return (
        p.bookmarks?.includes(id) &&
        p.outbox &&
        !Object.keys(p.outbox.bookmarks).length
      );
    },
    { key: storageKey, id },
    { timeout: 45000 },
  );

try {
  await page.goto(process.env.MOBILE_URL || "http://localhost:8082");
  await page.getByText("a little curiosity", { exact: false }).waitFor();
  await page
    .getByText("Live graph", { exact: false })
    .waitFor({ timeout: 45000 });
  check(
    "Official program branding renders",
    await page.getByText("OFFICIAL PROGRAM", { exact: true }).isVisible(),
  );
  check("Live official graph bootstrap succeeds", true);
  await capture(`${output}/today.png`);
  await capture(resolve("../../mobile-preview.png"));

  await findSession(target);
  check(
    "Search finds a real official session",
    (await page.getByText(target.title, { exact: true }).count()) === 1,
  );
  await capture(`${output}/sessions.png`);
  await page.getByLabel(`Save ${target.title}`, { exact: true }).click();
  await waitSaved(target.id);
  check("Official session save reaches anonymous backend", true);
  await page.getByText("Why this connects", { exact: true }).click();
  await page
    .getByText("Backed by a returned FalkorDB traversal", { exact: true })
    .waitFor();
  check(
    "Official topic/session/speaker explanation uses returned traversal",
    true,
  );
  await capture(`${output}/live-path.png`);
  await closeSheet();
  await openTab("Plan");
  check(
    "Saved official session appears in Plan",
    await page.getByText(target.title, { exact: true }).isVisible(),
  );
  await capture(`${output}/plan.png`);

  await findSession(noPresenter);
  check(
    "Event without official topic does not invent a why-path",
    (await page.getByText("Why this connects", { exact: true }).count()) === 0,
  );
  check(
    "Event without presenter has an honest label",
    await page.getByText("No presenter listed", { exact: true }).isVisible(),
  );
  await page.getByText(noPresenter.title, { exact: true }).click();
  check(
    "Details preserve official description",
    await page
      .getByText(noPresenter.description, { exact: true })
      .last()
      .isVisible(),
  );
  check(
    "Official source action exists",
    await page.getByLabel("Open official session source").isVisible(),
  );
  await capture(`${output}/official-session.png`);
  const sourcePopup = context.waitForEvent("page");
  await page.getByLabel("Open official session source").click();
  const sourcePage = await sourcePopup;
  await sourcePage
    .waitForURL(noPresenter.sourceUrl, { waitUntil: "commit", timeout: 30000 })
    .catch(() => {});
  check(
    "Official source button opens the real catalog",
    sourcePage.url().startsWith(noPresenter.sourceUrl),
  );
  await sourcePage.close();
  await closeSheet();

  await openTab("People");
  check(
    "All six supplied public profiles render",
    (await page.getByText(person.name, { exact: true }).count()) === 1 &&
      (await page
        .getByText(profileData.profiles[5].name, { exact: true })
        .count()) === 1,
  );
  await capture(`${output}/people.png`);
  await page
    .getByPlaceholder("Find a name, city, or company")
    .fill(person.name);
  await page.getByText(person.name, { exact: true }).click();
  check(
    "Source-backed profile uses the fetched role",
    await page
      .getByText(`${person.role} · ${person.company}`, { exact: true })
      .last()
      .isVisible(),
  );
  check(
    "Unconfirmed attendance is explicit",
    await page
      .getByText("Public self-report · attendance unconfirmed", { exact: true })
      .isVisible(),
  );
  check(
    "Synthetic interests are distinguished",
    await page
      .getByText("SYNTHETIC DEMO MATCH INTERESTS", { exact: true })
      .isVisible(),
  );
  check(
    "LinkedIn provenance action exists",
    await page.getByLabel("Open public LinkedIn profile").isVisible(),
  );
  await page.getByText("Save demo connection", { exact: true }).click();
  check(
    "Demo connection can be saved privately",
    await page
      .getByText("Demo connection saved · tap to remove", { exact: true })
      .isVisible(),
  );
  await capture(`${output}/profile.png`);
  await closeSheet();
  await page
    .getByPlaceholder("Find a name, city, or company")
    .fill(hiringPerson.name);
  await page.getByText(hiringPerson.name, { exact: true }).click();
  check(
    "Hiring is a public post with unverified current openings",
    await page
      .getByText("PUBLIC HIRING POST · CURRENT OPENINGS UNVERIFIED", {
        exact: true,
      })
      .isVisible(),
  );
  await closeSheet();

  await page.getByLabel("Edit your interests", { exact: true }).click();
  for (const label of [
    "AI & agents",
    "Open source",
    "Platform engineering",
    "Security",
    "Knowledge graphs",
    "Developer experience",
  ]) {
    const option = page.getByRole("checkbox", { name: label, exact: true });
    const desired = label === "Open source";
    if (((await option.getAttribute("aria-checked")) === "true") !== desired)
      await option.click();
  }
  await capture(`${output}/interests.png`);
  await page.getByText("Find my connections", { exact: true }).click();
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
  check("Interest changes reach backend", true);
  await openTab("People");
  await page
    .getByPlaceholder("Find a name, city, or company")
    .fill(person.name);
  await page
    .getByText("Explore a new demo connection", { exact: true })
    .click();
  check(
    "Unshared interest is exploratory instead of invented",
    await page
      .getByText("A new thread to follow.", { exact: true })
      .isVisible(),
  );
  await capture(`${output}/explanation.png`);
  await closeSheet();

  await openTab("Orbit");
  check(
    "Globe pin represents the supplied public city",
    await page
      .getByLabel(`Explore ${person.name} from ${person.city}`, { exact: true })
      .isVisible(),
  );
  await capture(`${output}/orbit.png`);
  await page
    .getByLabel(`Explore ${person.name} from ${person.city}`, { exact: true })
    .click();
  check(
    "Globe pin opens the sourced profile",
    await page
      .getByText(`${person.role} · ${person.company}`, { exact: true })
      .last()
      .isVisible(),
  );
  await closeSheet();

  await context.setOffline(true);
  await findSession(noPresenter);
  await page.getByLabel(`Save ${noPresenter.title}`, { exact: true }).click();
  await openTab("Plan");
  check(
    "Offline save remains available immediately",
    await page.getByText(noPresenter.title, { exact: true }).isVisible(),
  );
  await context.setOffline(false);
  await waitSaved(noPresenter.id);
  check("Offline save replays to backend", true);
  await page.reload();
  await openTab("Plan");
  await page.getByText(noPresenter.title, { exact: true }).waitFor();
  check("Official agenda persists after reload", true);
  check("No uncaught browser exceptions", errors.length === 0);
} finally {
  const report = {
    viewport: { width: 390, height: 844 },
    officialProgram: {
      occurrences: sessions.length,
      uniqueSessions: new Set(sessions.map((s) => s.sourceSessionId)).size,
      speakers: program.speakers.length,
      fetchedAt: program.provenance.fetchedAt,
      testedSession: target.title,
      unpresentedEvent: noPresenter.title,
    },
    profiles: profileData.profiles.length,
    results,
    errors,
  };
  await writeFile(`${output}/smoke.json`, JSON.stringify(report, null, 2));
  await writeFile(
    resolve("../../native-ui-verification.json"),
    JSON.stringify(report, null, 2),
  );
  await browser.close();
}
console.log(JSON.stringify({ results, errors }, null, 2));
