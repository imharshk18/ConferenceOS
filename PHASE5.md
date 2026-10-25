# ConferenceOS — context graph + Network Wrapped

October 24, 2026. Implemented in the existing Expo mobile app and globe-only desktop; backend deployed to the existing `resilient-llama-452` development deployment. This is a development demo, not an App Store release.

## What is now implemented

- **Expo Go shared invitations.** Network → Share an invite uses the platform share sheet. Expo Linking generates an `exp://…/--/connect?invite=…` URL for the running Expo Go project, a web-root URL for web, and the app scheme for an installed build. The dedicated `invite` parameter avoids a collision with the authentication callback's `code`. Opening a recognized link preserves the existing identity and pre-fills a connection request; it never accepts a connection automatically. The recipient explicitly sends the request and the inviter accepts it. Invitations expire after ten minutes and are single-use. QR and code entry remain secondary options. No NFC module or phone-to-phone NFC claim.
- **Private context globe.** Orbit → Personal draws the actual returned FalkorDB nodes and directed edges, with projected 3D rotation, growing curves, traveling mint lights, depth and selectable nodes. Detail sheets explain the source and let users follow a returned relationship. Reduced motion and app-background pausing are supported.
- **Twelve network areas.** Profiles and reviewed captures support AI, content, design, product, founders, growth, research, open source, platforms, security, graphs and developer experience. A content creator no longer has to claim an AI interest. Existing six-topic session recommendations remain separate.
- **Review before context becomes shared.** Audio, photos and notes go through OpenAI transcription/context extraction into an editable draft. Users review the summary, tags, learning and suggested actions. A conversation memory contributes to the shared graph only after both participants approve; editing invalidates approvals. Session learning and goals remain private. Suggested actions are not automatically sent or executed.
- **Network Wrapped.** Five full-screen stories show accepted connections, shared memories, areas of network coverage, reviewed session learning and recent growth. Gradients, animated counters and context visuals use saved data, not fabricated scores.
- **Live desktop growth.** Pair a phone, then explicitly enable anonymized context sharing. Convex subscriptions deliver verified graph topology; the desktop draws new relationships without refreshing. It stays a globe with small pairing/inspection controls.

## Where the data comes from

`convex/networkState.ts` reads the authenticated owner's accepted connections, peers' explicitly selected profile areas, mutually approved memories, and that owner's reviewed session/goal captures. It excludes pending/revoked connections, unapproved memories, peer goals and peer private learning.

Each change advances a revision and clears the old live projection. `networkJobs.ts` writes an isolated `CONetworkRecord` snapshot to FalkorDB, reads its actual nodes and relationship IDs back, and verifies exact topology against the current authorized input before committing. Late jobs cannot replace newer revisions. The existing recommendation/feed jobs still perform their own multi-hop Cypher queries and return ordered paths; the new full context graph is a verified topology snapshot, not a claim that every arbitrary pair has a recommendation path.

Names, conversation text and recordings are not written into these FalkorDB network records. Convex retains private metadata; mobile receives only the requesting user's authorized view. Server-generated graph records use opaque scopes and record keys. Superseded scopes receive bounded cleanup attempts; repeated cleanup failure is logged without private values.

Wrapped statistics are deterministic **Convex aggregates of authorized records**, not model-rated talent. Per-area context index:

`min(100, 15 × distinct connected people in this area + 10 × mutually approved memories about this area)`

It is labeled a demo context index. Meeting an AI content creator broadens network coverage; it does not make the viewer an AI expert. Private learning counts separately and does not boost this index. Attendance is explicitly self-reported, deduplicated by official session ID. “Recent” means the last seven days, not a fabricated improvement baseline.

## Privacy and presentation

An existing phone/desktop pairing does **not** imply permission to share the context graph. Network has a separate **Share anonymized context graph with paired desktop** switch, off by default. A presentation has a five-minute pairing code and expires after thirty minutes; either device can end it.

The desktop gets session-salted aliases, generic labels and directed relationship kinds only. It does not receive names, raw user/connection/memory IDs, specific area labels, notes, goals, media, contact details or public-profile associations. Topology and counts are still information, so this explicit consent is required. Rich personal details remain on mobile; desktop inspection shows generic kind, degree and relationships. Turning sharing off, disconnecting or ending the session clears the display.

On FalkorDB failure, the live graph clears, stored records remain, and the app labels saved statistics/offline data honestly. Nothing is fabricated to fill the globe. The faint background sphere grid is decorative, not an inferred social relationship.

## Evidence

- `phase5-unit-verification.json`: **56 passing tests**, including isolation, mutual approval, stale results, graph direction/topology, anonymous projection, expiry/revocation, failure states and attendance deduplication.
- `apps/mobile/work/phase5-mobile-verification.json`: **7 passing checks** with two independent browser-mobile identities against real Convex/FalkorDB; opening the shared invite preserves the existing profile, node details, actual 3→6 relationship growth, index 15→25 only after mutual approval, separate learning/attendance, reduced motion and default-off consent. Read the report for its latest run and limitations.
- `phase5-desktop-verification.json`: **8 passing live checks** for opt-in, real FalkorDB IDs, no-refresh growth, no raw personal data, offline clearing, opt-out, revocation and browser exceptions.
- `phase3-desktop-verification.json`: **8 existing desktop regression checks pass**, including ordered opportunity paths.
- `apps/mobile/work/mobile-social-ui-verification.json`: **11 existing mobile regression checks pass** on the final preview, including feed matching, unsent suggested follow-up, directed proof details and memory revocation.
- `phase5-ai-verification.json`: **real OpenAI audio + image + notes analysis passes**, transcript returned; private upload/read isolation, review-before-sharing, attendance and deletion pass. Initial failures were invalid synthetic test fixtures (empty WAV and corrupt PNG); the corrected fixtures are nonempty audio and a generated/decoded valid PNG. No user recording was used for this test.
- Root/mobile TypeScript, iOS Hermes export, web export, Expo SDK dependency validation and five invite parser/error-display tests pass.
- Prior `phase4-cloud-verification.json` preserves real bounded Bright Data LinkedIn/X ingestion evidence. This phase did not start additional paid scraping jobs.

The OpenAI integration was checked against the official speech-to-text and Structured Outputs documentation. The app defaults to `gpt-transcribe` and `gpt-6-astra` with server overrides available; the configured key successfully completed the synthetic flow. The documentation-guided change uses structured draft output, `store: false`, bounded requests and manual review—not autonomous execution.

## Demo on two iPhones and one desktop

1. Keep the Mac and both iPhones on the same Wi-Fi. Use Expo Go compatible with SDK 58. No Xcode/custom native build is required for this flow.
2. If Metro is already running on 8081, reload ConferenceOS in Expo Go. Otherwise, in a Mac terminal:

```sh
cd /Users/kadodwala/Documents/Codex/2026-10-24/referenced-chatgpt-conversation-this-is-an/outputs/conferenceos
export PATH="/Users/kadodwala/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
npm run start -w @conferenceos/mobile -- --lan
```

3. Open the Metro project in Expo Go on both phones. Each installation has an independent anonymous identity; create different names. On phone B, choose Content & storytelling and AI if those describe the simulated persona.
4. Phone A → Network → **Share an invite** → send to B. Open the link on B, send the request, then accept on A. Do not use a localhost link on another physical device. The Mac/Metro address must remain reachable. If the receiving messaging app does not make the custom URL tappable, copy the link into Network → More connection options → the invite-link field, or use the code.
5. On the Mac, run `npm run dev` in a second terminal and open `http://localhost:5173`. Choose **Pair phone → Create pairing code**. On A, open the profile → Share to desktop, pair using the code, then in Network enable anonymized context graph sharing. Desktop switches to Personal when its graph arrives.
6. On A → Orbit → Personal, rotate the graph and tap B's node. On A → Network → B, add a note or capture a short conversation with everyone's permission. Review the draft and its area tags. On B approve that conversation memory. The actual graph gains context edges and the desktop animates its anonymous projection.
7. Open **Your network, Wrapped** from Orbit or Network. With one content connection and one approved content memory, the index is 25 (15 + 10). Capture/review session learning in Discover; learning increases separately. Attendance increases only if explicitly marked, once per session.
8. Turn anonymized sharing off or end the pairing to demonstrate immediate removal. The private phone records remain.

For the post-conference feed, open a connection's Public sources and associate their public LinkedIn/X URL with confirmation; refresh is bounded/rate-limited. No social login is required. Imported posts keep source attribution and unverified-association labels. The existing FalkorDB feed matches relevant posts to the recipient's stored supported topics and mutually reviewed conversation context; it never claims that an imported author has verified account ownership.

## Remaining limitations / release work

- Physical iPhone share-sheet/deep-link opening, real microphone and camera interactions still require an on-device smoke test. Browser tests spy only the share-sheet boundary; they do not certify physical hardware.
- No NFC; that was deliberately deferred in favor of Expo Go shared links. No always-on/background recording or autonomous messages.
- Accounts are anonymous per installation/browser, with named profiles. Account recovery and identity verification are not implemented.
- A pasted LinkedIn/X profile is an explicitly unverified association, not proof of account ownership. Imports are manually initiated and bounded, not an always-on social monitor. The opportunity matcher currently uses the existing six conference-topic categories; the twelve-area taxonomy extends the context globe and Wrapped.
- Per-demo limits remain: twenty active connections, twenty memories per connection, thirty private captures. Provider access, IP restrictions, missing/unsupported posts or quota can still cause honest recoverable failures.
- `npm audit --omit=dev` reports five high-severity entries in the Expo CLI tooling chain (`expo`, `@expo/cli`, `@expo/code-signing-certificates`, `node-forge`, `zod`). The suggested aggregate fix would downgrade Expo to 44, so it was not blindly applied. Review compatible upstream patches before production distribution.
- Credentials previously pasted in chat should be rotated before public use. No key is bundled in either client.

Sources: [Expo Go deep links](https://docs.expo.dev/linking/into-your-app/), [Expo Linking](https://docs.expo.dev/versions/latest/sdk/linking/), [OpenAI speech-to-text](https://developers.openai.com/api/docs/guides/speech-to-text), [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
