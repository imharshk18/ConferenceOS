import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../convex/schema';
import { api, internal } from '../convex/_generated/api';
import { BLAND_PERSONA, cleanOnboarding, phoneNumber, verifiedBlandCall } from '../packages/core/onboarding';
import { topicFocus } from '../packages/core/graphFocus';
vi.mock('../packages/core/socialGraph', () => ({ calculateSocialGraph: vi.fn(async () => []), deleteSocialSnapshot: vi.fn(async () => {}) }));
vi.mock('../packages/core/graph', () => ({ recommend: vi.fn(async () => ({ talks: [], people: [] })) }));
const modules = import.meta.glob('../convex/**/*.ts');
const phone = '+14155550100', callId = 'test-call-owned-123456';
const draft = { name: 'Demo founder', headline: 'Building a creator app', goal: 'Meet consumer-app founders', context: 'Building coCreatr; seeking creators for community-led growth.', skillIds: [], networkAreas: ['content', 'product', 'growth'] };
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-24T20:00:00Z')); vi.stubEnv('BLANDAI_API_KEY', 'test-only-key'); vi.stubEnv('CONVEX_SITE_URL', 'https://test.convex.site'); vi.stubEnv('OPENAI_API_KEY', 'test-openai-key'); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => ({ a: await ctx.db.insert('users', {}), b: await ctx.db.insert('users', {}) }));
  return { t, ids, a: t.withIdentity({ subject: `${ids.a}|a` }), b: t.withIdentity({ subject: `${ids.b}|b` }) };
}
async function start() {
  const s = await setup();
  const id = await s.a.mutation(api.onboarding.begin, { phone, consent: true });
  const intent = (await s.t.mutation(internal.onboarding.claimStart, { id }))!;
  await s.t.mutation(internal.onboarding.started, { id, callId });
  return { ...s, id, intent };
}
function provider(intent: { externalId: string }, overrides = {}) {
  return { call_id: callId, external_id: intent.externalId, to: phone, completed: true, answered_by: 'human', transcripts: [{ user: 'user', text: 'I am a founder building a creator community app. I want to meet consumer product founders and creators.' }], ...overrides };
}
function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status }); }
function mockAnalysis(body: unknown) {
  const fetcher = vi.fn(async (url: string | URL | Request) => String(url).startsWith('https://api.bland.ai/') ? response(body) : response({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(draft) }] }] }));
  vi.stubGlobal('fetch', fetcher); return fetcher;
}
it('validates E.164 and structured context without defaulting creators to AI', () => {
  expect(phoneNumber('+1 (415) 555-0100')).toBe(phone);
  for (const p of ['4155550100', '+00012', '+14155550100x3', 'https://invalid']) expect(() => phoneNumber(p)).toThrow();
  expect(cleanOnboarding(draft)).toEqual(draft);
  expect(() => cleanOnboarding({ ...draft, name: 'x'.repeat(61) })).toThrow();
  expect(() => cleanOnboarding({ ...draft, skillIds: ['invented'] })).toThrow();
});
it('binds authoritative call results to all three server-owned identifiers', () => {
  const intent = { externalId: 'ours', callId, phone }, body = provider(intent);
  expect(verifiedBlandCall(body, intent)).toBe(true);
  for (const bad of [{ ...body, external_id: 'other-user' }, { ...body, call_id: 'other-call' }, { ...body, to: '+14155550101' }, { ...body, external_id: undefined, metadata: { attendeeId: 'ours' } }]) expect(verifiedBlandCall(bad, intent)).toBe(false);
});
it('requires authentication, a configured key, valid number and explicit call consent', async () => {
  const s = await setup();
  await expect(s.t.mutation(api.onboarding.begin, { phone, consent: true })).rejects.toThrow();
  await expect(s.a.mutation(api.onboarding.begin, { phone, consent: false })).rejects.toThrow();
  await expect(s.a.mutation(api.onboarding.begin, { phone: '4155550100', consent: true })).rejects.toThrow();
  vi.stubEnv('BLANDAI_API_KEY', ''); vi.stubEnv('BLAND_API_KEY', '');
  await expect(s.a.mutation(api.onboarding.begin, { phone, consent: true })).rejects.toThrow();
});
it('makes one persona request even with duplicate starts and an immediate Done tap', async () => {
  const s = await setup(), fetcher = vi.fn(async () => response({ call_id: callId })); vi.stubGlobal('fetch', fetcher);
  const id = await s.a.mutation(api.onboarding.begin, { phone, consent: true });
  expect(await s.a.mutation(api.onboarding.begin, { phone, consent: true })).toBe(id);
  await expect(s.a.mutation(api.onboarding.begin, { phone: '+14155550101', consent: true })).rejects.toThrow();
  await s.a.mutation(api.onboarding.done, { id });
  await s.t.action(internal.onboardingJobs.start, { id }); await s.t.action(internal.onboardingJobs.start, { id });
  expect(fetcher).toHaveBeenCalledTimes(1);
  const args = fetcher.mock.calls[0] as unknown as [string, RequestInit], body = JSON.parse(args[1].body as string);
  expect(args[0]).toBe('https://api.bland.ai/v1/calls');
  expect(body).toMatchObject({ persona_id: BLAND_PERSONA, persona_version: 'production', phone_number: phone, max_duration: 5, record: false });
  expect(body.external_id).not.toBe(s.ids.a); expect(body.webhook).toMatch(/^https:\/\/test.convex.site\/bland\/webhook\?token=.{72}$/);
  expect(await s.a.query(api.onboarding.mine, {})).toMatchObject({ call: { status: 'calling', building: true } });
});
it('Done imports only this caller’s verified context and updates all profile consumers once', async () => {
  const s = await start(); const fetcher = mockAnalysis(provider(s.intent));
  await s.a.mutation(api.onboarding.done, { id: s.id }); await s.t.action(internal.onboardingJobs.collect, { id: s.id });
  expect(await s.a.query(api.onboarding.mine, {})).toMatchObject({ call: { status: 'approved', draft: null } });
  expect((await s.a.query(api.social.mine, {}))!.profile).toMatchObject({ name: draft.name, context: draft.context, source: 'bland', networkAreas: draft.networkAreas });
  expect((await s.a.query(api.preferences.mine, {})).topicIds).toEqual([]);
  const network = (await s.a.query(api.network.mine, {}))!;
  const input = await s.t.query(internal.network.input, { userId: s.ids.a, revision: network.revision });
  expect(input?.me.areaIds).toEqual(draft.networkAreas); expect(input?.connections).toEqual([]);
  const stored = (await s.t.query(internal.onboarding.input, { id: s.id }))!;
  expect(stored.phone).toBe(''); expect(stored.callbackToken).toBe('');
  expect((await s.b.query(api.social.mine, {}))!.profile).toBeNull(); expect((await s.b.query(api.onboarding.mine, {}))!.call).toBeNull();
  await s.a.mutation(api.onboarding.done, { id: s.id }); await s.t.action(internal.onboardingJobs.collect, { id: s.id });
  expect(fetcher).toHaveBeenCalledTimes(2); // One provider read + one analysis; zero outbound calls.
});
it('rejects cross-user Done, retry, approval and discard', async () => {
  const s = await start();
  for (const fn of [api.onboarding.done, api.onboarding.retryStatus, api.onboarding.discard]) await expect(s.b.mutation(fn, { id: s.id })).rejects.toThrow();
  await expect(s.b.mutation(api.onboarding.approve, { id: s.id, draft })).rejects.toThrow();
  expect(await s.t.query(api.onboarding.mine, {})).toBeNull();
});
it('waits for the same in-progress call and does not redial or create fake context', async () => {
  const s = await start(), fetcher = mockAnalysis(provider(s.intent, { completed: false }));
  await s.a.mutation(api.onboarding.done, { id: s.id }); await s.t.action(internal.onboardingJobs.collect, { id: s.id });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(await s.a.query(api.onboarding.mine, {})).toMatchObject({ call: { status: 'calling', draft: null, building: true } });
  expect((await s.a.query(api.social.mine, {}))!.profile).toBeNull();
});
it('does not analyze forged provider data or voicemail as an attendee profile', async () => {
  for (const overrides of [{ to: '+14155550101' }, { answered_by: 'voicemail' }, { transcripts: [{ user: 'assistant', text: 'Please tell me about your goals and interests in consumer apps.' }] }]) {
    const s = await start(), fetcher = mockAnalysis(provider(s.intent, overrides));
    await s.t.action(internal.onboardingJobs.collect, { id: s.id });
    expect(fetcher).toHaveBeenCalledTimes(1); expect((await s.a.query(api.onboarding.mine, {}))!.call?.status).toBe('error');
    expect((await s.a.query(api.social.mine, {}))!.profile).toBeNull();
  }
});
it('keeps a draft for review until the owner explicitly applies it', async () => {
  const s = await start(); mockAnalysis(provider(s.intent));
  await s.t.action(internal.onboardingJobs.collect, { id: s.id });
  expect((await s.a.query(api.social.mine, {}))!.profile).toBeNull();
  expect((await s.a.query(api.onboarding.mine, {}))!.call?.status).toBe('review');
  await s.a.mutation(api.onboarding.approve, { id: s.id, draft });
  expect((await s.a.query(api.social.mine, {}))!.profile?.name).toBe(draft.name);
});
it('never overwrites newer manual context or interest revisions with a late call', async () => {
  const s = await start(); await s.a.mutation(api.onboarding.done, { id: s.id });
  await s.a.mutation(api.social.saveProfile, { name: 'Newer name', headline: '', goal: 'New goal', skillIds: ['security'], networkAreas: ['security'], color: '#aabbcc' });
  mockAnalysis(provider(s.intent)); await s.t.action(internal.onboardingJobs.collect, { id: s.id });
  expect((await s.a.query(api.social.mine, {}))!.profile?.name).toBe('Newer name');
  expect((await s.a.query(api.onboarding.mine, {}))!.call?.status).toBe('review');
  await expect(s.a.mutation(api.onboarding.approve, { id: s.id, draft })).rejects.toThrow(/changed/);
});
it('uses an exclusive analysis lease and rejects expired-worker results after takeover', async () => {
  const s = await start(), first = (await s.t.mutation(internal.onboarding.claim, { id: s.id }))!;
  expect(await s.t.mutation(internal.onboarding.claim, { id: s.id })).toBeNull();
  await s.a.mutation(api.onboarding.retryStatus, { id: s.id }); // Cannot release an active lease.
  expect(await s.t.mutation(internal.onboarding.claim, { id: s.id })).toBeNull();
  vi.setSystemTime(Date.now() + 91_000);
  const next = (await s.t.mutation(internal.onboarding.claim, { id: s.id }))!;
  expect(next.leaseId).not.toBe(first.leaseId);
  expect(await s.t.mutation(internal.onboarding.finish, { id: s.id, leaseId: first.leaseId!, draft })).toBe(false);
  expect(await s.t.mutation(internal.onboarding.finish, { id: s.id, leaseId: next.leaseId!, draft })).toBe(true);
  expect(await s.t.mutation(internal.onboarding.finish, { id: s.id, leaseId: next.leaseId!, draft })).toBe(false);
});
it('webhooks are bounded notifications, never an authority for identity or profile fields', async () => {
  const s = await start();
  expect((await s.t.fetch('/bland/webhook', { method: 'POST', body: JSON.stringify({ call_id: callId }) })).status).toBe(401);
  const body = JSON.stringify({ call_id: callId, external_id: s.ids.b, metadata: { attendeeId: s.ids.b }, profile: draft });
  expect((await s.t.fetch(`/bland/webhook?token=${s.intent.callbackToken}`, { method: 'POST', body })).status).toBe(202);
  expect((await s.a.query(api.social.mine, {}))!.profile).toBeNull(); expect((await s.b.query(api.social.mine, {}))!.profile).toBeNull();
  vi.stubEnv('BLAND_WEBHOOK_SECRET', 'test-signing-secret');
  expect((await s.t.fetch(`/bland/webhook?token=${s.intent.callbackToken}`, { method: 'POST', body })).status).toBe(401);
  expect((await s.t.fetch('/bland/webhook', { method: 'POST', body: 'x'.repeat(150_001) })).status).toBe(413);
});
it('discard/expiry purge pending phone and context, and reject late writes', async () => {
  const s = await start(), claim = (await s.t.mutation(internal.onboarding.claim, { id: s.id }))!;
  await s.a.mutation(api.onboarding.discard, { id: s.id });
  expect(await s.t.mutation(internal.onboarding.finish, { id: s.id, leaseId: claim.leaseId!, draft })).toBe(false);
  expect(await s.t.query(internal.onboarding.input, { id: s.id })).toMatchObject({ phone: '', callbackToken: '', draft: null });
  const second = await s.a.mutation(api.onboarding.begin, { phone, consent: true });
  vi.setSystemTime(Date.now() + 86_400_001); await s.t.mutation(internal.onboarding.expire, { id: second });
  expect(await s.t.query(internal.onboarding.input, { id: second })).toMatchObject({ phone: '', callbackToken: '', draft: null, status: 'discarded' });
});
it('category focus selects only exact public relationships, not nearby unrelated nodes', () => {
  const nodes = [{ id: 'topic', kind: 'Topic', label: 'Topic' }, { id: 'talk', kind: 'Talk', label: 'Talk' }, { id: 'speaker', kind: 'Speaker', label: 'Speaker' }, { id: 'room', kind: 'Room', label: 'Room' }, { id: 'other', kind: 'Talk', label: 'Other' }];
  const edges = [{ source: 'talk', target: 'topic', kind: 'ABOUT' }, { source: 'speaker', target: 'talk', kind: 'PRESENTS' }, { source: 'talk', target: 'room', kind: 'IN_ROOM' }, { source: 'speaker', target: 'other', kind: 'PRESENTS' }];
  expect(topicFocus(nodes, edges, 'topic').edges).toEqual(edges.slice(0, 3));
  expect(topicFocus(nodes, edges, 'other').ids).toEqual([]);
});
