# Phase 2: Live Graph Intelligence

Implemented and deployed to the existing ConferenceOS Convex development deployment on October 24, 2026. The native five-tab interface and desktop constellation visual identity are preserved.

## Implemented

- Mobile interest changes persist in Convex and increment the authenticated owner's revision. Scheduled server actions read stored preferences and calculate FalkorDB recommendations; clients cannot supply recommendation query topics.
- A calculation can commit only while its revision is current and still loading. Old results, duplicate completions, and late failures cannot overwrite newer results.
- Actual FalkorDB paths preserve ordered traversal nodes, relationship IDs, and directed source/target relationships. Mobile explanations show those paths, with private preference context explicitly separated from graph nodes.
- Pending offline edits, loading, unavailable graph results, and disconnected state are not labeled live. Saved program previews are explicitly labeled previews.
- Desktop pairing uses a five-minute single-use code and a thirty-minute session, measured from creation. A separately authenticated phone explicitly approves topics, starting with no approval. Either device can revoke sharing.
- Convex publishes only a sanitized approved public traversal, not the phone owner's ID, private meetings, contact information, or unapproved interests. Stage mode removes private operator panels and demo attendee cards from the DOM.
- Desktop subscriptions animate the exact returned traversal without refreshing, preserving relationship direction even when traversing an edge in reverse. Pending revisions, disconnect, expiry, and revocation clear the proof.
- Deployed default interests match the repository (`ai`, `security`), without overwriting existing preferences. The repaired isolation check compares a second identity before and after the first identity's edits rather than assuming particular defaults.

Example public program traversal:

```text
Topic ← ABOUT — Talk ← PRESENTS — Speaker
```

This is not an attendee-to-attendee relationship. The desktop background is the public catalog; a background topic does not indicate the phone owner selected it.

## Test evidence

| Verification | Result | Evidence |
| --- | --- | --- |
| Revision isolation, stale/duplicate completions, simulated FalkorDB failure, consent races, revocation, private-label rejection | PASS | 15 tests in `tests/phase2.test.ts`; `phase2-unit-verification.json` |
| Single-use/owner-scoped pairing, throttling, exact five-minute code and thirty-minute session expiry | PASS | Same deterministic Convex tests, using fake time |
| Actual deployed preferences, independent identities, live FalkorDB paths, sanitized publication, rapid interest edits | PASS | 15 checks in `phase2-cloud-verification.json` |
| Mobile UI → desktop UI without refresh, exact node/edge IDs and direction, ordered animation, disconnect and revoke | PASS | 9 checks in `phase2-ui-verification.json`; no browser exceptions |
| Mobile explanations, consent scope/clear/replacement, offline pending edits, both-device revoke, empty results | PASS | 25 checks in `apps/mobile/evidence/phase2-smoke.json`; no browser exceptions |
| Authentication isolation regression | PASS | 6 checks in `auth-verification.json` |
| Root/mobile TypeScript, desktop production build, native iOS Hermes bundle, Expo web export | PASS | Build/type-check command output |
| Physical iPhone → desktop using this final build | MANUAL CHECK NEEDED | Automated interactions used isolated Chrome desktop/mobile viewports, not a physical iPhone |

The live public graph check returned 376 nodes and 656 directed relationships. Failure handling was tested with a simulated database failure; we did not take the real graph offline. Expiration tests use fake time, not thirty minutes of real waiting.

## Launch on this Mac and physical iPhone

The desktop uses the existing configured `.env.local`; native mobile uses the same public Convex deployment. No backend redeployment is needed to run the demo. Never put FalkorDB, OpenAI, or scraper secrets in `EXPO_PUBLIC_` or `VITE_` variables.

Use Node 24.19.0 as below. This Mac's system Node 24.2 is below the installed Expo SDK's engine range.

Terminal 1 — desktop:

```sh
cd "/Users/kadodwala/Documents/Codex/2026-10-24/referenced-chatgpt-conversation-this-is-an/outputs/conferenceos"
export PATH="/Users/kadodwala/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
npm run dev
```

Open [the desktop app](http://localhost:5173/). If already running, keep that server and reload once to receive the new code.

Terminal 2 — native Expo app:

```sh
cd "/Users/kadodwala/Documents/Codex/2026-10-24/referenced-chatgpt-conversation-this-is-an/outputs/conferenceos"
export PATH="/Users/kadodwala/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
npm run mobile -- --go --clear
```

Keep Mac and iPhone on the same Wi-Fi and allow local-network access. Scan the terminal QR code with iPhone Camera and open it in Expo Go compatible with SDK 58. Xcode is not required for this Expo Go flow. If the project is already open, reload it after starting Metro. Both devices need internet for the backend.

The native app is the Expo Go project, not the web QA preview at port 8082. Reuse an existing Metro server on 8081 rather than starting another on the occupied port. If LAN routing fails, retry with `--tunnel`; Expo may request its tunnel dependency.

## Exact demo sequence

1. Desktop: open **The constellation**, enter **Stage mode**, then select **Pair phone**. Keep the six-digit code visible; it expires in five minutes.
2. iPhone: open **Orbit** and tap the **Present a public path** sharing card. Enter the code. Explicitly approve **AI & agents** and **Open source**, then tap **Share approved topics**.
3. Phone: use **Edit your interests**, select only **AI & agents**, and tap **Find my connections**. Wait for live recommendations and the desktop animation.
4. Change interests to only **Open source**, then tap **Find my connections** again. Without refreshing either interface, the desktop should briefly show calculation state and then trace the new actual public topic/session/speaker traversal.
5. Mobile: open a recommended session's **Why this connects** explanation to show the same returned graph structure. The personal context is labeled **PRIVATE CONTEXT · NOT A GRAPH NODE**.
6. Privacy demonstration: change interests to only **Security**, without approving it for presentation. Private recommendations recalculate, but no Security traversal is published. To present it, explicitly update the sharing approval.
7. Clear approvals to pause sharing, or tap **Revoke presentation sharing** on mobile. The desktop automatically clears the path. **End sharing** on desktop does the same. A new pairing requires new approval.

## Remaining limitations and safety

- Authentication is anonymous per installation/browser profile. Two phones have isolated private preferences, bookmarks, and meeting state, but named attendee onboarding, account recovery, and syncing one person's account across devices are not implemented. The visual profile/demo personas are not verified signed-in attendee identities.
- People/Orbit contains explicitly labeled sourced demo profiles with synthetic interests; attendance is not verified. No consented attendee-to-attendee network or private attendee edges are published on stage.
- One approved public session path is selected per calculation. The official program snapshot is not a continuously running scraper. This phase adds no OpenAI conversational concierge: recommendations and paths come from FalkorDB.
- An offline phone cannot immediately deliver a revoke request. The previous approved desktop session may remain active until reconnection, desktop revocation, or expiry; the phone warns about this. A disconnected desktop hides its cached proof.
- Codes are hashed, single-use, short-lived, and limited to five attempts per authenticated identity per minute. Anonymous demo auth is not production-grade anti-abuse protection; stronger identity, operational retention, and abuse controls remain production work.
- Rotate credentials previously pasted into chat before public use. No credential is included in presentation payloads or these documents.

## Rerun checks

From the repository root with supported Node:

```sh
npm test
npm run check
npm run check --workspace @conferenceos/mobile
npm run build
npm run auth:check
npm run test:cloud
```

Cloud tests use temporary anonymous identities and revoke their test presentations; they do not edit another attendee's preferences. With desktop 5173 and exported mobile web QA preview 8082 running, use `npm run test:ui`. The focused mobile test is `node scripts/smoke-phase2.mjs` from `apps/mobile`. Browser tests do not replace physical iPhone confirmation.

## Implementation map

- Private state and jobs: `convex/preferences.ts`, `convex/state.ts`, `convex/intelligence.ts`, `convex/intelligenceJobs.ts`.
- Exact graph paths and public allowlist: `packages/core/graph.ts`, `packages/core/intelligence.ts`.
- Pairing and safe publication: `convex/presentation.ts`, `convex/schema.ts`, `convex/validators.ts`.
- Native: `apps/mobile/App.tsx`, `apps/mobile/PresentationConsent.tsx`.
- Desktop: `apps/web/src/App.tsx`, `apps/web/src/PresentationPanel.tsx`, `apps/web/src/GraphScene.tsx`.
- Visual evidence: `phase2-desktop-preview.png`, `phase2-mobile-preview.png`, and `apps/mobile/evidence/`.
