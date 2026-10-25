export type PublicPlatform = "x" | "linkedin";
export const DATASETS = { x: "gd_lwxkxvnf1cynvib9co", linkedin: "gd_lyy3tktm25m4avu764" };
export function publicProfile(value: string): { platform: PublicPlatform; url: string } {
  const input = value.trim();
  const u = new URL(input.startsWith("@") ? `https://x.com/${input.slice(1)}` : input);
  if (u.protocol !== "https:" || u.username || u.password || u.port) throw new Error("Use a public HTTPS LinkedIn or X profile URL");
  if (["linkedin.com", "www.linkedin.com"].includes(u.hostname) && /^\/in\/[a-zA-Z0-9_-]+\/?$/.test(u.pathname)) return { platform: "linkedin", url: `https://www.linkedin.com${u.pathname.replace(/\/$/, "").toLowerCase()}` };
  if (["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(u.hostname) && /^\/[A-Za-z0-9_]{1,15}\/?$/.test(u.pathname)) {
    const handle = u.pathname.replaceAll("/", "").toLowerCase();
    if (["home", "search", "explore", "messages", "settings", "intent", "i", "compose"].includes(handle)) throw new Error("Use a person's profile, not an X navigation page");
    return { platform: "x", url: `https://x.com/${handle}` };
  }
  throw new Error("Use linkedin.com/in/name or x.com/handle");
}
export function discoveryRequest(profileUrl: string, startDate: string, endDate: string) {
  const profile = publicProfile(profileUrl);
  const url = new URL("https://api.brightdata.com/datasets/v3/trigger");
  url.search = new URLSearchParams({ dataset_id: DATASETS[profile.platform], type: "discover_new", discover_by: "profile_url", notify: "false", include_errors: "true", format: "json" }).toString();
  url.searchParams.set("custom_output_fields", profile.platform === "x" ? "url|description|date_posted|is_repost" : "url|use_url|user_url|post_text|date_posted|repost");
  const dates = { start_date: startDate, end_date: endDate };
  return { url: url.toString(), body: { input: [{ url: profile.url, ...dates, ...(profile.platform === "x" ? { num_of_posts: 3, include_reposts: false } : { only_authored_posts: true }) }], limit_per_input: 3 } };
}
/** Conservative topic hints, not semantic skill inference. Users' stored skills stay authoritative. */
export function postTopics(text: string) {
  const rules: [string, RegExp][] = [["ai", /\b(ai|agents?|llms?|machine learning|artificial intelligence)\b/i], ["opensource", /open[- ]source|\bmaintainers?\b/i], ["platform", /\b(platform|kubernetes|infrastructure|cloud)\b/i], ["security", /\b(security|authorization|authentication|vulnerabilit\w*)\b/i], ["graph", /\b(graph|falkordb|cypher)\b/i], ["devex", /developer experience|\b(devex|dx|copilot|tooling)\b/i]];
  rules.push(['content',/\b(creators?|ugc|storytelling|influencers?|content creation)\b/i],['product',/\b(consumer apps?|consumer products?|product design|product builders?)\b/i],['founders',/\b(founders?|startups?|cofounders?)\b/i],['growth',/\b(community|distribution|growth|marketing|audiences?)\b/i],['design',/\b(designers?|design|ux)\b/i],['research',/\b(research|researchers?)\b/i]);
  return rules.filter(([, re]) => re.test(text)).map(([id]) => id);
}
export type ImportedPost = { url: string; excerpt: string; topicIds: string[]; publishedAt: number };
export function normalizePublicPost(raw: any, profileUrl: string, startDate: string, endDate: string, now = Date.now()): ImportedPost | null {
  if (!raw || raw.error || raw.error_code || typeof raw.url !== "string") return null;
  const profile = publicProfile(profileUrl);
  let url: URL; try { url = new URL(raw.url); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  let canonical = "";
  if (profile.platform === "x") {
    if (!["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(url.hostname) || !/^\/[A-Za-z0-9_]+\/status\/\d+\/?$/.test(url.pathname)) return null;
    if (url.pathname.split("/")[1].toLowerCase() !== new URL(profile.url).pathname.slice(1)) return null;
    if (raw.is_repost === true || raw.is_retweet === true) return null;
    canonical = `${profile.url}/status/${url.pathname.split("/")[3]}`;
  } else {
    if (!["linkedin.com", "www.linkedin.com"].includes(url.hostname) || !/^\/(posts\/[^/]+|feed\/update\/urn:li:activity:\d+)\/?$/.test(url.pathname)) return null;
    // The provider must return an author profile matching the requested source. Never infer from the slug.
    const authorUrl = raw.user_url ?? raw.use_url ?? raw.author_url ?? raw.author?.url;
    try { if (publicProfile(authorUrl).url !== profile.url) return null; } catch { return null; }
    if (raw.reshared_post || raw.reposted_post || raw.repost === true) return null;
    canonical = `https://www.linkedin.com${url.pathname.replace(/\/$/, "")}`;
  }
  const text = profile.platform === "x" ? raw.description : raw.post_text;
  const publishedAt = Date.parse(raw.date_posted ?? raw.posted_at ?? "");
  if (typeof text !== "string" || !text.trim() || !Number.isFinite(publishedAt) || publishedAt > now || publishedAt < Date.parse(startDate) || publishedAt > Date.parse(endDate) + 86_400_000) return null;
  const words = text.trim().replace(/\s+/g, " ").split(" ");
  return { url: canonical, excerpt: (words.slice(0, 22).join(" ") + (words.length > 22 ? "…" : "")).slice(0, 500), topicIds: postTopics(text), publishedAt };
}
