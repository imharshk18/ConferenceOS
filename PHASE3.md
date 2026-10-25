# ConferenceOS — relationships that keep working

Implemented October 24, 2026. The existing Convex development deployment has the new relationship backend. The native app remains Expo SDK 58 / React Native and works with Expo Go. No new native dependency was added.

## What now works

- A dark gradient mobile design, drag-rotatable projected 3D globe, Conference/Personal scopes, official speaker photos, soft animated transitions, arrival effects, and a floating Orbit / Discover / Network / Feed navigation bar. Astra implemented the mobile redesign.
- Independent named profiles with a headline, private goal, and selected skills. Authentication remains an anonymous installation/session identity; the name is not a verified identity.
- Eight-character, ten-minute, single-use connection invitations. Entering the code creates a request; its recipient must accept. Either participant can disconnect. Unknown users cannot inspect the relationship.
- Editable conversation notes. The writer approves their revision; the other participant reviews it. Editing resets approval. Approval includes the exact revision, so an outdated screen cannot approve an unseen edit. These are reviewed notes, not recordings or transcripts.
- A simulated post by one connected person triggers a server-owned FalkorDB calculation for the other. Eligibility requires an accepted connection, a note both approved, matching stored skills, and a matching post topic. Convex subscriptions update the recipient feed automatically.
- A feed card with the post, the actual shared memory, an unsent follow-up draft, and the returned ordered graph path. Graph errors clear live cards; offline status is identified. New revisions reject older calculations.
- An optional replay of the one real X excerpt already imported with Bright Data. It is explicitly labeled with the original author, July 9 date, source link, and unverified vacancy. It does not claim the connection authored Sagar Shah’s post or that Sagar attended/joined the app. It performs no new paid scraper call.
- Desktop opens directly into the globe. There is no dashboard/sidebar. Phone pairing, scope selection, rotation, fullscreen and a compact path explanation remain.
- After pairing, the phone can opt into anonymous connection-count/pulse sharing. Accepting a connection then updates the desktop without a refresh. Each opportunity path needs a separate explicit “Present a redacted path” action. Names, personal IDs, specific interests, goals, post text and conversation text are not sent to desktop.

## The real graph query

FalkorDB receives an opaque, revision-specific projection of authorized records. It stores keys and relationships, not conversation or post text. Convex owns the original text and all access decisions.

```text
You ──HAS_SKILL──▶ Topic ◀──DISCUSSED── Memory ◀──REMEMBERS── Connection ──WROTE──▶ Post
```

The query also checks that you actually have a `MET` edge to the author, that you share this memory, and that the post is about this topic. A Bright Data source replay uses `SHARED_SOURCE`, never `WROTE`. The actual Cypher is in `packages/core/social.ts`; `packages/core/socialGraph.ts` writes the authorized projection and retrieves `p`. Edge IDs, direction and traversal order come from FalkorDB. The commit rechecks current consent-derived inputs before publishing.

Desktop receives aliases (`You`, `Shared topic`, `Approved memory`, `A connection`, `New opportunity`) preserving the path topology and direction. It receives neither underlying record IDs nor raw labels. The personal mobile globe shows only the viewer’s accepted connections; it does not invent relationships between their contacts.

## Run on your Mac and iPhone

The development servers may already be running. Reuse the existing terminals and reload instead of starting duplicate listeners.

```sh
cd /Users/kadodwala/Documents/Codex/2026-10-24/referenced-chatgpt-conversation-this-is-an/outputs/conferenceos
export PATH="/Users/kadodwala/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
npm run dev
```

Open `http://localhost:5173` for the desktop globe. In a second terminal, run:

```sh
cd /Users/kadodwala/Documents/Codex/2026-10-24/referenced-chatgpt-conversation-this-is-an/outputs/conferenceos
export PATH="/Users/kadodwala/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
npm run mobile -- --go --lan
```

Put your iPhone on the same Wi-Fi, open a compatible Expo Go, and scan the terminal QR code with Camera. If already open, reload the app. Xcode is not required. Press `w` in the Expo terminal to open the mobile app in a Mac browser as a second, independent demo participant. The exported mobile QA preview is also currently available at `http://127.0.0.1:8083`; this static server is temporary.

## Demonstrate the complete loop

Use Aarnav on the iPhone and Maya in a separate browser/mobile session. The desktop globe has its own identity. Enter illustrative notes and clearly simulated posts; these identities do not claim a real conference meeting occurred.

1. On each mobile session, open **Network** and create a profile. Give Aarnav **AI & agents** as a skill.
2. On desktop, click **Pair phone → Create pairing code**. On Aarnav’s phone, open the avatar/settings and **Share to desktop**. Enter the six-digit presentation code and approve any public conference topics you want to show. This is separate from the eight-character people-connection code.
3. In Aarnav’s **Network**, enable anonymous connection pulses for the paired display. It is off by default.
4. Maya creates a connection code. Aarnav enters it and sends a request. Maya accepts. Aarnav’s Personal globe gains the contact; the paired desktop switches to Personal and animates the new anonymous connection.
5. Maya opens the accepted connection, writes a note such as “We discussed reliable AI agents. Maya is building a team; Aarnav works on agent tooling,” selects **AI & agents**, and saves it for approval. Aarnav reviews and approves that exact note.
6. Maya publishes a simulated update: “Looking for an AI engineer to help ship production agents,” selecting **AI & agents**. Aarnav opens **Feed**. A new contextual card appears after the live graph calculation.
7. Open **A thoughtful way to reach out**, then **Why this connects**. Inspect the memory, draft and actual directed path. Nothing is sent to anyone.
8. Tap **Present a redacted path**. Desktop traces the same topology in order, with generic labels. Private details stay on the phone.
9. Optionally use **Try the Bright Data source replay** on Maya’s session. Aarnav receives a separately labeled replay card. This demonstrates collection provenance, not verified ownership of that external account.
10. Revoke the note, disconnect the relationship, clear sharing, or end pairing. Applicable cards/highlights disappear automatically. A late graph result cannot restore revoked access.

## Evidence

- `npm test`: 33 deterministic tests pass, covering existing Phase 2, social ingestion, and the new relationship/privacy/revision/path cases.
- `phase3-cloud-verification.json`: 13 live checks pass with separate authenticated identities, real FalkorDB recommendations, direct verification of returned relationship IDs in the database, approval/revision checks, replay provenance, isolation and revocation.
- `phase3-desktop-verification.json`: 8 browser checks pass for public paths, connection animation, actual ordered redacted traversal, direction, privacy, offline clearing, revocation and no browser exceptions.
- Mobile browser evidence: `apps/mobile/work/mobile-social-ui-verification.json`; 11 checks in separate mobile contexts exercise the actual profile, connection, note, post and feed UI against Convex, including arrival animations, globe dragging and edge direction. The maintained verifier is `apps/mobile/scripts/phase3-smoke.mjs` (`npm run test:phase3:mobile`, with the mobile web preview running at port 8083).
- Root/mobile TypeScript, Vite production build, iOS Hermes export and mobile web export pass. Physical-iPhone validation of this redesigned build remains a manual final check; a successful bundle/browser test is not a physical-device test.

## Still to build

- Voice onboarding and consented recording/transcription. Current onboarding is a short form; memories are manually reviewed notes.
- Verified social-account ownership, import consent and recurring LinkedIn/X monitoring. The Bright Data key remains only in ignored local `.env`; no new secret was uploaded to Convex. One X import is confirmed. The earlier LinkedIn trigger remains unconfirmed and is not blindly retried.
- Semantic extraction/ranking across unrestricted skills, goals and posts. Current matching uses the six selected topic/skill categories and actual graph relationships; drafting is deterministic and not an LLM-generated semantic match.
- Recoverable sign-in and cross-device account access. Current identities persist per app installation/browser, but have no account recovery flow.
- Permission-based introductions through third parties, multiple conferences, background notifications, private-only notes, and editing/sending a follow-up inside a connected messaging service.
- Production-scale pagination, abuse controls and retention operations. The demo bounds active connections to 20 and reads up to 20 notes/posts per relationship/author. Superseded graph scopes are removed with bounded retries; an extended graph outage can require operator cleanup after recovery. No raw conversation text is duplicated there.

FalkorDB’s [official Browser](https://github.com/FalkorDB/falkordb-browser/blob/staging/readme-browser.md) is an interactive graph-query and management UI. The app keeps its custom globe for visual identity, reactive phone events and the restricted presentation payload. Desktop uses the dedicated `graph.publicSnapshot` endpoint, which excludes legacy demo profile metadata. Database credentials are never put into a browser bundle.
