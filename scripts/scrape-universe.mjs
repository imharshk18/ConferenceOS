#!/usr/bin/env node
/**
 * Refresh the public GitHub Universe 2026 program, without an account or API key.
 * Run from the repository root: node scripts/scrape-universe.mjs
 * Validate the saved snapshot offline: node scripts/scrape-universe.mjs --check
 *
 * This follows the same anonymous Rainfocus page-config and sessions requests
 * as the official catalog. Public widget identifiers are discovered each run;
 * no user credentials, browser storage, .env files, or private APIs are used.
 * The complete paginated result is validated before replacing the snapshot.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'data/universe-source.json');
const homeUrl = 'https://githubuniverse.com/';
const catalogUrl = 'https://reg.githubuniverse.com/flow/github/universe26/attendee-portal/page/sessioncatalog';
const allowedHosts = new Set(['githubuniverse.com', 'reg.githubuniverse.com', 'events.githubuniverse.com']);
const requests = [];
const maxRetries = 3;

export function retryDelayMs(retryAfter, retryIndex, now = Date.now()) {
  const seconds = Number(retryAfter);
  const requested = retryAfter === null || retryAfter === '' ? 0
    : Number.isFinite(seconds) ? Math.max(0, seconds * 1000)
      : Math.max(0, Date.parse(retryAfter) - now) || 0;
  return Math.min(10_000, Math.max(1000 * (2 ** retryIndex), requested));
}

/** Dependency injection keeps retry behavior testable without network or delays. */
export async function request(url, options = {}, parameters = {}, transport = {}) {
  if (!allowedHosts.has(new URL(url).hostname)) throw new Error(`Unexpected source host: ${url}`);
  const fetchSource = transport.fetch || fetch;
  const wait = transport.wait || ((ms) => new Promise((done) => setTimeout(done, ms)));
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let response;
    try {
      response = await fetchSource(url, { ...options, signal: AbortSignal.timeout(30_000) });
    } catch (error) {
      if (attempt === maxRetries || !['TypeError', 'TimeoutError', 'AbortError'].includes(error.name)) throw error;
      const delay = retryDelayMs(null, attempt);
      console.warn(`Official source network error; retry ${attempt + 1}/${maxRetries} in ${delay}ms.`);
      await wait(delay);
      continue;
    }
    if (!allowedHosts.has(new URL(response.url).hostname)) throw new Error(`Unexpected redirect: ${response.url}`);
    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500 && response.status <= 599;
      if (!retryable || attempt === maxRetries) {
        throw new Error(`Official source returned ${response.status}: ${url}${response.status === 401 || response.status === 403 ? ' (public access unavailable; authentication is not attempted)' : ''}`);
      }
      const delay = retryDelayMs(response.headers.get('Retry-After'), attempt);
      await response.body?.cancel();
      console.warn(`Official source returned ${response.status}; retry ${attempt + 1}/${maxRetries} in ${delay}ms.`);
      await wait(delay);
      continue;
    }
    let body;
    try {
      body = await response.text();
    } catch (error) {
      if (attempt === maxRetries || !['TypeError', 'TimeoutError', 'AbortError'].includes(error.name)) throw error;
      await wait(retryDelayMs(null, attempt));
      continue;
    }
    requests.push({
      url: response.url,
      method: options.method || 'GET',
      parameters,
      fetchedAt: new Date().toISOString(),
      sha256: createHash('sha256').update(body).digest('hex'),
    });
    return body;
  }
  throw new Error('Official source retry limit exceeded.');
}

const plain = (value = '') => String(value)
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n) => String.fromCodePoint(n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n)))
  .replace(/&(?:amp|nbsp|quot|apos|lt|gt|ndash|mdash|rsquo|lsquo|rdquo|ldquo);/g, (entity) => ({
    '&amp;': '&', '&nbsp;': ' ', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>',
    '&ndash;': '–', '&mdash;': '—', '&rsquo;': '’', '&lsquo;': '‘', '&rdquo;': '”', '&ldquo;': '“',
  })[entity])
  .replace(/\s+/g, ' ').trim();
const unique = (values) => [...new Set(values.filter(Boolean))];
const isPublished = (value) => [true, 1, 'true', '1'].includes(value);

export function validateSnapshot(snapshot) {
  const fail = (message) => { throw new Error(`Invalid program snapshot: ${message}; existing snapshot was preserved.`); };
  if (snapshot?.schemaVersion !== 1 || !Array.isArray(snapshot.sessions) || !Array.isArray(snapshot.speakers)) fail('unsupported schema');
  if (!snapshot.sessions.length || !snapshot.speakers.length) fail('empty program');
  if (snapshot.event?.name !== 'GitHub Universe 2026' || JSON.stringify(snapshot.event.dates) !== JSON.stringify(['2026-10-28', '2026-10-29'])) fail('unexpected event');
  const speakers = new Set();
  for (const speaker of snapshot.speakers) {
    if (typeof speaker.id !== 'string' || !speaker.id.trim() || speakers.has(speaker.id)) fail('missing or repeated speaker ID');
    if (typeof speaker.name !== 'string' || !speaker.name.trim()) fail(`empty speaker name: ${speaker.id}`);
    speakers.add(speaker.id);
  }
  const ids = new Set();
  const rooms = new Map();
  const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  for (const session of snapshot.sessions) {
    if (typeof session.id !== 'string' || !session.id.trim() || ids.has(session.id)) fail('missing or repeated session occurrence ID');
    if (typeof session.sourceSessionId !== 'string' || !session.sourceSessionId.trim()) fail(`missing source session ID: ${session.id}`);
    ids.add(session.id);
    if (typeof session.title !== 'string' || !session.title.trim()) fail(`empty title: ${session.id}`);
    if (!/^2026-10-(?:0[1-9]|[12]\d|3[01])$/.test(session.date)) fail(`invalid date: ${session.id}`);
    if (!timePattern.test(session.time) || !timePattern.test(session.end) || session.end <= session.time) fail(`invalid start/end time: ${session.id}`);
    const minutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
    if (!Number.isInteger(session.duration) || session.duration !== minutes(session.end) - minutes(session.time)) fail(`duration mismatch: ${session.id}`);
    if (!Array.isArray(session.speakerIds) || new Set(session.speakerIds).size !== session.speakerIds.length || session.speakerIds.some((id) => !speakers.has(id))) fail(`invalid speaker references: ${session.id}`);
    if (typeof session.roomId !== 'string' || typeof session.room !== 'string' || Boolean(session.roomId) !== Boolean(session.room)) fail(`invalid room: ${session.id}`);
    if (session.roomId && rooms.has(session.roomId) && rooms.get(session.roomId) !== session.room) fail(`inconsistent room name: ${session.roomId}`);
    if (session.roomId) rooms.set(session.roomId, session.room);
    if (session.sourceUrl !== catalogUrl) fail(`unexpected source URL: ${session.id}`);
    if (!Array.isArray(session.attributes) || session.attributes.some((a) => typeof a.name !== 'string' || typeof a.value !== 'string')) fail(`invalid official tags: ${session.id}`);
  }
  const provenance = snapshot.provenance;
  if (!Number.isInteger(provenance?.reportedOccurrences) || provenance.reportedOccurrences < snapshot.sessions.length) fail('invalid reported page total');
  if (provenance.exportedOccurrences !== snapshot.sessions.length || provenance.speakerCount !== snapshot.speakers.length || provenance.uniqueSessions !== new Set(snapshot.sessions.map((s) => s.sourceSessionId)).size) fail('inconsistent source counts');
  if (!Number.isFinite(Date.parse(provenance.fetchedAt)) || !Array.isArray(provenance.requests) || !provenance.requests.length) fail('missing source provenance');
  for (const request of provenance.requests) {
    if (!allowedHosts.has(new URL(request.url).hostname) || !/^[0-9a-f]{64}$/.test(request.sha256) || !Number.isFinite(Date.parse(request.fetchedAt))) fail('invalid fetch provenance');
  }
  for (const date of snapshot.event.dates) if (!snapshot.sessions.some((s) => s.date === date)) fail(`missing conference day ${date}`);
  return { occurrences: ids.size, speakers: speakers.size, rooms: rooms.size };
}

function pageItems(page) {
  return Array.isArray(page.items) ? page.items : (page.sectionList || []).flatMap((section) => section.items || []);
}

function normalizeSpeaker(person) {
  const handle = person.attributevalues?.find((a) => a.attribute === 'GitHub Handle')?.value || '';
  return {
    id: person.speakerId,
    name: plain(person.fullName || person.globalFullName || `${person.firstName || ''} ${person.lastName || ''}`),
    role: plain(person.jobTitle || person.globalJobtitle),
    company: plain(person.companyName || person.globalCompany),
    bio: plain(person.bio || person.globalBio),
    photoUrl: person.photoURL || '',
    githubHandle: /^(?:n\/?a|none)$/i.test(handle.trim()) ? '' : handle.trim(),
    sourceUrl: catalogUrl,
    modifiedAt: person.modified || null,
  };
}

async function main() {
  if (process.argv.includes('--check')) {
    const summary = validateSnapshot(JSON.parse(await readFile(output, 'utf8')));
    console.log(`Valid saved official program: ${summary.occurrences} occurrences, ${summary.speakers} speakers, ${summary.rooms} rooms.`);
    return;
  }
  const [home, catalog] = await Promise.all([request(homeUrl), request(catalogUrl)]);
  if (!home.includes('GitHub Universe 2026') || !home.includes('fort mason')) {
    throw new Error('Homepage no longer describes the expected 2026 event; review source before changing dates or venue.');
  }
  const workflow = catalog.match(/var workflowApiToken\s*=\s*'([^']+)'/)?.[1];
  if (!workflow) throw new Error('Official catalog workflow configuration was not found.');
  const configUrl = new URL('https://reg.githubuniverse.com/flow/loadPage');
  configUrl.search = new URLSearchParams({ pageUri: 'sessioncatalog', workflowApiToken: workflow });
  const configResponse = JSON.parse(await request(configUrl.href));
  const config = configResponse.data;
  const widget = config?.widgetConf;
  if (config?.unauthorized || config?.responseCode !== '0' || !widget?.widgetToken || !widget?.apiProfileToken) {
    throw new Error('Official catalog is no longer publicly readable; existing snapshot was preserved.');
  }

  const endpoint = 'https://events.githubuniverse.com/api/sessions';
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    rfWidgetId: widget.widgetToken,
    rfApiProfileId: widget.apiProfileToken,
  };
  const raw = [];
  const pageOccurrenceIds = new Set();
  let expectedTotal = null;
  for (let from = 0; from < (expectedTotal ?? 1);) {
    const parameters = { from, size: 50 };
    const body = new URLSearchParams({ from: String(from), size: '50' });
    const page = JSON.parse(await request(endpoint, { method: 'POST', headers, body }, parameters));
    if (page.responseCode !== '0') throw new Error(`Catalog request failed: ${page.responseMessage}`);
    const items = pageItems(page);
    const total = page.totalSearchItems ?? page.total;
    if (!Number.isInteger(total) || total < 1 || total > 10_000) throw new Error('Invalid official catalog total.');
    if (expectedTotal !== null && total !== expectedTotal) throw new Error('Catalog changed during pagination; run the refresh again.');
    expectedTotal = total;
    if (!items.length) throw new Error(`Pagination ended early at ${from}/${total}.`);
    const returnedFrom = page.from ?? page.sectionList?.[0]?.from;
    if (returnedFrom !== from) throw new Error(`Catalog returned the wrong page (${returnedFrom}, expected ${from}); existing snapshot was preserved.`);
    for (const item of items) {
      if (!item.sessionTimeID || pageOccurrenceIds.has(item.sessionTimeID)) throw new Error('Catalog repeated or omitted an occurrence identifier during pagination; existing snapshot was preserved.');
      pageOccurrenceIds.add(item.sessionTimeID);
    }
    raw.push(...items);
    from += items.length;
  }
  if (raw.length !== expectedTotal) throw new Error('Incomplete catalog; existing snapshot was preserved.');

  const speakerMap = new Map();
  const sessionMap = new Map();
  for (const session of raw) {
    if (!isPublished(session.published) || session.testRecord || session.viewAccessPublic === false) continue;
    const participants = (session.participants || []).filter((p) => isPublished(p.published) && !p.testRecord && p.speakerId);
    for (const participant of participants) speakerMap.set(participant.speakerId, normalizeSpeaker(participant));
    for (const time of session.times || []) {
      if (time.isHidden || time.viewAccessPublic === false) continue;
      if (!time.sessionTimeID || !/^2026-10-\d{2}$/.test(time.date) || !/^\d{2}:\d{2}$/.test(time.startTime)) {
        throw new Error(`Unsupported official session time: ${session.sessionID}`);
      }
      const attributes = (session.attributevalues || []).filter((a) => ['Topic', 'Track', 'SessionTrackNotMulti', 'Level', 'Deliveryformat', 'GitHubproduct'].includes(a.attribute_id))
        .map((a) => ({ name: a.attribute_id, value: plain(a.value) }));
      const normalized = {
        id: time.sessionTimeID,
        sourceSessionId: session.sessionID,
        code: session.code || '',
        title: plain(session.title),
        description: plain(session.abstract),
        format: plain(session.type),
        date: time.date,
        time: time.startTime,
        end: time.endTime || '',
        duration: Number(time.length ?? session.length) || null,
        roomId: time.roomId || '',
        room: plain(time.room),
        speakerIds: unique(participants.map((p) => p.speakerId)),
        attributes,
        inPerson: Boolean(time.inPersonTime),
        virtual: Boolean(time.virtualTime),
        utcStartTime: time.utcStartTime || null,
        utcEndTime: time.utcEndTime || null,
        modifiedAt: session.modified || null,
        sourceUrl: catalogUrl,
      };
      const existing = sessionMap.get(normalized.id);
      if (existing && JSON.stringify(existing) !== JSON.stringify(normalized)) throw new Error(`Conflicting repeated session: ${normalized.id}`);
      sessionMap.set(normalized.id, normalized);
    }
  }
  const sessions = [...sessionMap.values()].sort((a, b) => `${a.date} ${a.time} ${a.id}`.localeCompare(`${b.date} ${b.time} ${b.id}`));
  const speakers = [...speakerMap.values()].sort((a, b) => a.name.localeCompare(b.name));
  const snapshot = {
    schemaVersion: 1,
    event: {
      name: 'GitHub Universe 2026',
      dates: ['2026-10-28', '2026-10-29'],
      timeZone: config.timeZone || 'US/Pacific',
      venue: 'Fort Mason Center, San Francisco, CA',
      sourceUrl: homeUrl,
    },
    provenance: {
      fetchedAt: new Date().toISOString(),
      catalogUrl,
      access: 'Anonymous public official catalog; no account, user token, or third-party scraping key.',
      requests: requests.sort((a, b) => a.url.localeCompare(b.url) || (a.parameters.from ?? -1) - (b.parameters.from ?? -1)),
      reportedOccurrences: expectedTotal,
      exportedOccurrences: sessions.length,
      uniqueSessions: new Set(sessions.map((s) => s.sourceSessionId)).size,
      speakerCount: speakers.length,
      note: 'The snapshot retains public program dates outside October 28–29; the app selects the two main conference days. Titles, descriptions, presenters, rooms, official tags, and exact times come from the official catalog. App topic groupings and colors are application metadata.',
    },
    speakers,
    sessions,
  };
  validateSnapshot(snapshot);
  await mkdir(dirname(output), { recursive: true });
  const temporary = `${output}.tmp`;
  await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`);
  await rename(temporary, output);
  console.log(`Saved ${sessions.length} official occurrences (${snapshot.provenance.uniqueSessions} sessions), ${speakers.length} speakers to data/universe-source.json`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
