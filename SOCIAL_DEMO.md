# ConferenceOS: relationship-aware follow-up

> Historical source-research draft. The implemented product is described in [PHASE3.md](./PHASE3.md). The central flow is **a post by a person you already connected with**, matched to your mutually approved conversation memory and skills. This earlier draft overemphasized external authors; its “not yet implemented” statements are historical. Phase 3 now implements the relationship, reviewed-note and live graph feed loop. External source replay is an explicitly labeled supplemental demo, never an ownership or attendance claim.

## The demo's point

ConferenceOS remembers why two people connected, then helps that connection turn into something useful. This is a relationship-memory and follow-up tool, not a generic social-feed clone.

The demonstration combines three clearly distinguished layers:

1. Simulated attendees and simulated, mutually accepted conference connections.
2. A synthetic saved conversation, explicitly marked demo—not an actual transcript or a claim about a real person's goals.
3. Real public outside-world posts/resources/opportunities imported through Bright Data, preserving their actual author, source URL, timestamp, and collection status.

The real authors are external sources, not people we pretend signed up, checked in, or met the demo participants. Public social posts do not establish conference attendance. Universe 2026 is October 28–29, so pre-event material must remain labeled announcements/previews, not retrospective attendance evidence.

## Recommended external sources

| Source | LinkedIn | X | Why it fits |
| --- | --- | --- | --- |
| Nick Taylor | [nickytonline](https://www.linkedin.com/in/nickytonline/) | [@nickytonline](https://x.com/nickytonline) | MCP authorization/security. His public site and the saved official program list a Universe 2026 talk. Best first technical relevance example. |
| Kent C. Dodds | [kentcdodds](https://www.linkedin.com/in/kentcdodds/) | [@kentcdodds](https://x.com/kentcdodds) | Agent tooling, MCP, open-source/product engineering. Featured on the official Universe site. |
| Cassidy Williams | [cassidoo](https://www.linkedin.com/in/cassidoo/) | [@cassidoo](https://x.com/cassidoo) | Developer experience, community, practical resources, event previews. Listed in the saved official program; her October 11 newsletter discusses preparing for Universe. |
| Andrea Griffiths | [acolombiadev](https://www.linkedin.com/in/acolombiadev/) | [@acolombiadev](https://x.com/acolombiadev) | GitHub, agent workflows, open source and community follow-ups. Listed in the saved official program. |
| Sagar Shah | [sagarshahuk](https://www.linkedin.com/in/sagarshahuk/) | [@sa64r](https://x.com/sa64r) | Startup/founding-engineer hiring leads. His LinkedIn post explicitly cross-links the X account. Conference attendance and current vacancy availability remain unverified. |

Identity/source evidence:

- [Nick's own social links](https://www.nickyt.co/socials/) and [Universe announcement](https://www.linkedin.com/posts/nickytonline_mcp-ai-zerotrust-activity-7492936294847684609-8bK8).
- [Kent's own identity and social links](https://kentcdodds.com/info).
- [Cassidy's own social links](https://cassidoo.co/socials/) and [Universe preparation newsletter](https://cassidoo.co/newsletter/2026-10-11/).
- [Andrea's self-managed speaker profile](https://sessionize.com/acolombiadev/).
- [Sagar's own hiring discussion and cross-linked X post](https://www.linkedin.com/posts/sagarshahuk_one-tweet-10000-impressions-50-applications-activity-7481228151180840961-43Bt).
- [Official Universe site](https://githubuniverse.com/) and repository `data/universe-source.json` for program provenance.

The machine-readable shortlist is `data/social-demo-sources.json`. The two initial test inputs are one explicit public Nick Taylor LinkedIn announcement and one explicit public Sagar Shah X hiring post. These are source candidates, not registered demo identities.

## The story to demonstrate

Use **Aarnav (demo)** and **Maya (demo)**, with no real social account attached to either fictional identity by default.

1. They meet at the simulated conference and both accept the connection.
2. Save a synthetic memory: they discussed building MCP agents, controlling tool permissions, and exploring founding-engineer work at AI startups. They agreed to exchange relevant resources after the event.
3. Import a real public technical post and a real public hiring lead. Do not fabricate content when collection fails.
4. Show a follow-up card with an explanation such as: “Relevant to the MCP authorization discussion in your saved demo conversation.” Show the actual matching topic and original source link.
5. Offer **Share with Maya**, **Save**, or **Draft follow-up**. Drafting is not sending; require an explicit user action before messaging anyone.
6. A graph explanation returns the actual stored memory/topic/post traversal. “Public hiring lead—availability unverified” is distinct from a verified open job.

There are two different feed surfaces:

- **From your connections:** posts imported from accounts belonging to mutually connected demo/onboarded users. Only approved linked accounts qualify; a public author is not automatically a connection.
- **For your follow-up:** external resources/opportunities matched to the viewer's authorized relationship context. The author can be outside the conference. Explain why the item is relevant without disclosing someone else's private memory.

This distinction supports both parts of the product without inventing a meeting between an attendee and an external source author.

## Smallest next implementation slice (not yet implemented)

- **Convex owns access:** demo/named profiles, explicit social-link ownership/import consent, pending/accepted/revoked connections, memory visibility, import jobs, deduplicated source posts and feed subscriptions. A unilateral `preferences.met` flag is not mutual acceptance.
- **FalkorDB owns relationships:** separate attendee, authorized memory, discussed topic, public source, post, and opportunity nodes. Return the stored path behind a match. A keyword/AI-inferred topic must carry its extraction provenance and must not become an asserted personal preference.
- **Bright Data owns public collection:** bounded selected-account/date-window jobs with checkpoints, retry/backoff for safe reads, no automatic re-trigger after an ambiguous paid POST, and provenance-preserving normalization.
- **Mobile owns review/actions:** retain the existing visual identity; add a compact follow-up/feed area, synthetic memory review, and mutual connection confirmation. Server permission checks—not mobile hiding—protect every query.
- **Private versus shared memories:** private notes default to their owner's visibility. Shared memory requires both participants' approval. Recording, if later added, requires explicit participant consent; no automatic recording or scraping private messages.
- **Onboarding later:** prove ownership before linking GitHub/LinkedIn/X/Instagram accounts; a pasted public URL alone is not identity verification. Import and audience consent are separate from sign-in. Do not add every public account to a user's identity graph by name matching.
- **Desktop remains public-only:** the Phase 2 stage must not receive conversation text, participant IDs, raw transcripts or relationship details. A separately approved, redacted traversal is the only candidate for stage publication.

Suggested new graph relationships below are a design, not claims about today's database:

```text
Demo attendee → authorized demo memory → discussed topic ← public post ← public source
```

Feed eligibility requires an accepted connection and authorized memory before graph relevance/ranking is considered. Revoking the connection or memory sharing removes access; cached recommendations cannot override that boundary.

## What was actually changed in this research/import step

- Added the source shortlist, a root `.env.example` placeholder, and `scripts/brightdata-demo.mjs`.
- The new CLI imports at most two explicit posts (one per platform) with a one-record-per-input cap. It neither crawls followers nor performs profile discovery. It stores only a short excerpt, provenance, public author identity, and conservative keyword topic signals; no comments, contact details or raw profile dump is retained.
- The secret is read from the ignored root `.env`, sent only to the intended Bright Data API, never printed, and not uploaded to Convex.
- Added six deterministic ingestion tests; the existing fifteen Phase 2 tests remain passing. Root TypeScript passes.
- No mobile/desktop UI, authentication, live graph, mutual connections, recording, conversation-memory storage or feed delivery was changed in this step. Those are the next feature, not already working functionality.

## Commands and evidence

```sh
node scripts/brightdata-demo.mjs plan
node scripts/brightdata-demo.mjs check
node scripts/brightdata-demo.mjs start --allow-paid-test
node scripts/brightdata-demo.mjs poll
```

`start` requires an explicit flag because it may spend credits. Repeating it skips existing intents, including an unconfirmed trigger, rather than silently billing again. `poll` only reads existing job status and results. Job checkpoints are in ignored `work/brightdata-demo/jobs.json`; do not delete/reset them to force a retry.

Read `brightdata-verification.json` for the latest actual provider status, and `data/brightdata-demo-posts.json` for successfully normalized excerpts. An empty file or unconfirmed job is not a successful scrape. Raw provider results are not published into the app.

Official API references: [bounded async collection](https://docs.brightdata.com/api-reference/rest-api/scraper/asynchronous-requests), [scraper metadata](https://docs.brightdata.com/api-reference/scrapers/management-apis/get-scrapers), and [snapshot recovery/status](https://docs.brightdata.com/api-reference/scrapers/management-apis/get-snapshots).
