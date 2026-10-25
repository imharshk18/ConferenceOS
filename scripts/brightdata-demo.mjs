/** Server/local-only, two-URL Bright Data smoke import. No cloud secret transfer or app publication. */
import { config } from 'dotenv';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(resolve(root, 'data/social-demo-sources.json'), 'utf8'));
const stateFile = resolve(root, 'work/brightdata-demo/jobs.json');
const outputFile = resolve(root, 'data/brightdata-demo-posts.json');
const reportFile = resolve(root, 'brightdata-verification.json');
const API = 'https://api.brightdata.com';
const allowedDatasets = new Set(['gd_lyy3tktm25m4avu764', 'gd_lwxkxvnf1cynvib9co']);

export function canonicalPost(value, platform) {
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.username || u.password || u.port) throw new Error('Unsafe post URL');
  const host = u.hostname.toLowerCase();
  if (platform === 'linkedin' && ['www.linkedin.com', 'linkedin.com'].includes(host) && /^\/posts\/[^/]+\/?$/.test(u.pathname)) {
    return `https://www.linkedin.com${u.pathname.replace(/\/$/, '')}`;
  }
  if (platform === 'x' && ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(host) && /^\/[A-Za-z0-9_]+\/status\/\d+\/?$/.test(u.pathname)) {
    return `https://x.com${u.pathname.replace(/\/$/, '')}`;
  }
  throw new Error('Only explicit public LinkedIn/X post URLs are allowed');
}

export function triggerRequest(input) {
  if (!allowedDatasets.has(input.datasetId)) throw new Error('Dataset not allowed');
  if ((input.platform === 'x') !== (input.datasetId === 'gd_lwxkxvnf1cynvib9co')) throw new Error('Dataset/platform mismatch');
  const url = canonicalPost(input.url, input.platform);
  const endpoint = new URL('/datasets/v3/trigger', API);
  endpoint.search = new URLSearchParams({ dataset_id: input.datasetId, include_errors: 'true', notify: 'false', format: 'json' });
  // No discovery, no follower traversal, one known URL, a hard per-input result cap.
  return { endpoint, body: { input: [{ url }], limit_per_input: 1 } };
}

export function normalizePost(raw, input, fetchedAt = new Date().toISOString()) {
  if (!raw || raw.error || raw.error_code) return null;
  let url;
  try { url = canonicalPost(raw.url || '', input.platform); } catch { return null; }
  if (url !== canonicalPost(input.url, input.platform)) return null;
  const source = manifest.sources.find(s => s.id === input.sourceId);
  const text = input.platform === 'linkedin' ? raw.post_text : raw.description;
  if (!source || typeof text !== 'string' || !text.trim()) return null;
  const expectedHandle = new URL(source.x).pathname.slice(1).toLowerCase();
  if (input.platform === 'x' && new URL(url).pathname.split('/')[1].toLowerCase() !== expectedHandle) return null;
  const date = raw.date_posted;
  const publishedAt = typeof date === 'string' && Number.isFinite(Date.parse(date)) ? new Date(date).toISOString() : null;
  if (publishedAt && Date.parse(publishedAt) > Date.parse(fetchedAt)) return null;
  const topics = [];
  if (/\bmcp\b|model context protocol/i.test(text)) topics.push('mcp');
  if (/auth(?:orization|entication)|zero.?trust|secur(?:e|ity)/i.test(text)) topics.push('security');
  if (/\bagents?\b|\bai\b|artificial intelligence/i.test(text)) topics.push('ai');
  if (/hir(?:e|ing)|founding engineer|software engineer|\bjobs?\b|vacanc|\b(?:looking for|seeking)\s+(?:an?\s+)?(?:[\w-]+\s+){0,5}(?:engineer|developer|designer)\b/i.test(text)) topics.push('hiring');
  const words = text.trim().replace(/\s+/g, ' ').split(' ');
  return {
    id: createHash('sha256').update(url).digest('hex').slice(0, 20),
    platform: input.platform, url, author: source.name, authorSourceId: source.id,
    authorProfileUrl: input.platform === 'linkedin' ? source.linkedin : source.x,
    publishedAt, fetchedAt, excerpt: words.slice(0, 22).join(' ') + (words.length > 22 ? '…' : ''),
    topicSignals: topics.map(topic => ({ topic, basis: 'deterministic-keyword-match-not-user-preference' })),
    kind: topics.includes('hiring') ? 'public-hiring-lead' : 'public-resource',
    availability: topics.includes('hiring') ? 'unverified' : 'not-applicable',
    provider: 'brightdata', datasetId: input.datasetId, demoContext: true,
    attendanceVerified: false, conferenceMember: false, sourcePurpose: input.purpose,
  };
}

async function savedState() {
  try { return JSON.parse(await readFile(stateFile, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return { schemaVersion: 1, jobs: [] }; throw e; }
}
async function saveState(state) {
  await mkdir(dirname(stateFile), { recursive: true });
  await writeFile(stateFile, JSON.stringify(state, null, 2));
}
async function request(path, options = {}) {
  const key = process.env.BRIGHTDATA_API_KEY?.trim();
  if (!key) throw new Error('BRIGHTDATA_API_KEY is missing from the ignored root .env');
  const url = new URL(path, API);
  if (url.origin !== API) throw new Error('Unexpected API host');
  const response = await fetch(url, {
    ...options, redirect: 'error', signal: AbortSignal.timeout(30000),
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...options.headers },
  });
  if (!response.ok) {
    const body = await response.text();
    const category = /insufficient|payment|balance|credit|billing/i.test(body) ? 'account-credit-or-payment'
      : /whitelist|allowlist|ip.{0,25}(block|restrict)/i.test(body) ? 'ip-restriction'
      : /input|validation|schema|array/i.test(body) ? 'request-validation'
      : response.status === 401 || response.status === 403 ? 'authentication-or-permission' : 'provider-error';
    throw Object.assign(new Error(`Bright Data HTTP ${response.status} (${category}); raw response omitted`), { status: response.status, category });
  }
  return response.json();
}
async function main() {
  config({ path: resolve(root, '.env'), quiet: true });
  const command = process.argv[2] || 'plan';
  if (command === 'plan') {
    console.log(JSON.stringify({ maxInputs: 2, maxRecords: 2, cloudPublication: false, inputs: manifest.smokeInputs }, null, 2));
    return;
  }
  if (command === 'check') {
    const results = [];
    for (const input of manifest.smokeInputs) {
      const data = await request(`/datasets/v3/scrapers?dataset_id=${input.datasetId}`);
      const rows = Array.isArray(data) ? data : [];
      if (!rows.some(s => s.id === input.datasetId && s.scrapers?.collect_by_url)) throw new Error('Expected post scraper not available');
      results.push({ platform: input.platform, datasetId: input.datasetId, authenticated: true, collectionSupported: true });
    }
    console.log(JSON.stringify({ checks: results, noScrapesStarted: true }, null, 2));
    return;
  }
  if (!['start', 'poll'].includes(command)) throw new Error('Use plan, check, start --allow-paid-test, or poll');
  const state = await savedState();
  if (command === 'start') {
    if (!process.argv.includes('--allow-paid-test')) throw new Error('A scrape may use credits: pass --allow-paid-test for this fixed two-record test');
    for (const input of manifest.smokeInputs) {
      if (state.jobs.some(j => j.inputId === input.id)) continue;
      const job = { inputId: input.id, state: 'starting', startedAt: new Date().toISOString() };
      state.jobs.push(job);
      // Persist intent first: a timeout or crash must not silently cause a second billed trigger.
      await saveState(state);
      const spec = triggerRequest(input);
      try {
        const result = await request(spec.endpoint, { method: 'POST', body: JSON.stringify(spec.body) });
        if (typeof result.snapshot_id !== 'string' || !/^s[d]?_[A-Za-z0-9]+$/.test(result.snapshot_id)) throw new Error('Unexpected snapshot response');
        Object.assign(job, { state: 'running', snapshotId: result.snapshot_id });
      } catch (error) {
        job.state = error.status ? 'trigger-rejected' : 'trigger-uncertain';
        job.failure = error.status ? { httpStatus: error.status, category: error.category } : { category: 'transport-or-unconfirmed-response' };
        await saveState(state);
        throw new Error(`${error.status ? `Trigger rejected: HTTP ${error.status} (${error.category}).` : 'Trigger was not confirmed.'} Intent retained: do not blindly retry a potentially billed request.`);
      }
      await saveState(state);
    }
  }
  const posts = [], results = [];
  for (const job of state.jobs) {
    const input = manifest.smokeInputs.find(i => i.id === job.inputId);
    if (!input) continue;
    if (!job.snapshotId || !/^s[d]?_[A-Za-z0-9]+$/.test(job.snapshotId)) {
      results.push({ inputId: input.id, platform: input.platform, status: job.state, validPosts: 0 });
      continue;
    }
    const progress = await request(`/datasets/v3/progress/${job.snapshotId}`);
    job.state = progress.status;
    if (progress.status === 'ready') {
      const raw = await request(`/datasets/v3/snapshot/${job.snapshotId}?format=json`);
      if (!Array.isArray(raw) || raw.length > 1) throw new Error('Unexpected record count; no extra records retained');
      const post = raw.length ? normalizePost(raw[0], input) : null;
      if (post) posts.push(post);
      results.push({ inputId: input.id, platform: input.platform, status: 'ready', returnedRecords: raw.length, validPosts: Number(!!post), errorRecord: !!raw[0]?.error || !!raw[0]?.error_code });
    } else {
      results.push({ inputId: input.id, platform: input.platform, status: progress.status, validPosts: 0 });
    }
  }
  await saveState(state);
  const report = { checkedAt: new Date().toISOString(), provider: 'brightdata', maxInputs: 2, maxRecords: 2, results, validPosts: posts.length, cloudPublication: false, secretUploadedToCloud: false };
  await writeFile(reportFile, JSON.stringify(report, null, 2));
  await writeFile(outputFile, JSON.stringify({ schemaVersion: 1, disclosure: 'Real public source excerpts for a simulated networking demo. No real attendee relationships, current vacancy availability, or conference attendance asserted.', posts }, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message.replaceAll(process.env.BRIGHTDATA_API_KEY || '\u0000', '[redacted]')); process.exitCode = 1; });
}
