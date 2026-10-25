import { describe, it, expect } from 'vitest';
import { canonicalPost, triggerRequest, normalizePost } from '../scripts/brightdata-demo.mjs';
import manifest from '../data/social-demo-sources.json';
const [linkedin, x] = manifest.smokeInputs;
describe('Bounded public social demo ingestion', () => {
  it('caps a direct post request and never starts discovery', () => {
    const r = triggerRequest(linkedin);
    expect(r.body.limit_per_input).toBe(1);
    expect(r.body.input).toHaveLength(1);
    expect(r.endpoint.origin).toBe('https://api.brightdata.com');
    expect(r.endpoint.searchParams.has('type')).toBe(false);
  });
  it('rejects arbitrary hosts, private routes and mismatched datasets', () => {
    for (const url of ['http://x.com/a/status/1', 'https://evil.test/a/status/1', 'https://x.com/messages', 'https://user:password@x.com/a/status/1']) {
      expect(() => canonicalPost(url, 'x')).toThrow();
    }
    expect(() => triggerRequest({ ...x, datasetId: linkedin.datasetId })).toThrow();
  });
  it('keeps source authors separate from demo members and drops unrelated fields', () => {
    const post = normalizePost({ url: x.url, description: 'Hiring a founding engineer for AI agents', date_posted: '2026-07-01', name: 'untrusted label', email: 'private@example.test', replies: [{ text: 'unrelated' }] }, x)!;
    expect(post.author).toBe('Sagar Shah');
    expect(post.conferenceMember).toBe(false);
    expect(post.attendanceVerified).toBe(false);
    expect(post.availability).toBe('unverified');
    expect(JSON.stringify(post)).not.toContain('private@example.test');
    expect(post).not.toHaveProperty('replies');
  });
  it('rejects source mismatch, error records and future timestamps', () => {
    expect(normalizePost({ url: 'https://x.com/other/status/42', description: 'Hiring' }, x)).toBe(null);
    expect(normalizePost({ url: x.url, description: 'Hiring', error: 'dead_page' }, x)).toBe(null);
    expect(normalizePost({ url: x.url, description: 'Hiring', date_posted: '2099-01-01' }, x)).toBe(null);
  });
  it('retains provenance and topic evidence without inventing personal preferences', () => {
    const post = normalizePost({ url: linkedin.url, post_text: 'MCP authorization and Zero Trust for AI agents', date_posted: '2026-08-01' }, linkedin)!;
    expect(post.provider).toBe('brightdata');
    expect(post.topicSignals.map(t => t.topic)).toEqual(['mcp', 'security', 'ai']);
    expect(post.topicSignals.every(t => t.basis.includes('not-user-preference'))).toBe(true);
    expect(post.url).toBe(linkedin.url);
  });
  it('recognizes an explicit looking-for-an-engineer post as an unverified lead', () => {
    const post = normalizePost({ url: x.url, description: 'Looking for an engineer to join Tano in London. AI-native team.', date_posted: '2026-07-09' }, x)!;
    expect(post.kind).toBe('public-hiring-lead');
    expect(post.availability).toBe('unverified');
    expect(post.publishedAt).toBe('2026-07-09T00:00:00.000Z');
  });
});
