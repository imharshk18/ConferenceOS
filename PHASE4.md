# ConferenceOS — before, during and after

Implemented October 24, 2026. This extends Phase 3 without another redesign. Mobile remains native Expo SDK 58 / React Native; desktop remains the globe-only presentation. Astra implemented the mobile additions.

## The actual flow

| Moment | Implemented flow |
| --- | --- |
| Before | Profile goal → private goal capture → agent proposes context and topics → user edits/approves → stored preference revision → existing live FalkorDB session recommendations. |
| Meeting someone | Network → create expiring invitation QR → other phone scans inside ConferenceOS → reviews/sends request → recipient accepts → existing personal-globe arrival and opt-in anonymous desktop pulse. |
| During a session | Discover → open an official session → Capture this session → notes, one audio clip and/or photos → review → explicitly self-report attendance. Learning context remains private. |
| After a conversation | Open an accepted connection → capture with consent → transcription/context draft → owner edits/approves → other participant approves the exact shared-memory revision. Only then does it enter recommendation context. |
| After the conference | Open a connection → add their public LinkedIn/X URL → explicitly import up to three posts → source/date validation and deduplication → actual FalkorDB path against accepted connection, jointly approved conversation and stored skills → private Feed explanation + unsent follow-up draft. |

## Public posts, not social account linking

No LinkedIn/X password, OAuth or social login is needed. A user confirms a public profile URL associated with an existing accepted connection. This association is **not ownership-verified**. It belongs to the requesting user's private space, not to a global attendee record. Another connection cannot see the mapping or imported posts through that user's account.

Imports use the Bright Data API server-side. The user explicitly authorized storing the local key as `BRIGHTDATA_API_KEY` in the existing `resilient-llama-452` Convex deployment. Never put it in Expo environment variables. Only canonical HTTPS LinkedIn `/in/...` and X profile URLs are accepted; no arbitrary URLs, credentials, private-page bypass or follower crawling. Only the fields needed for post matching are requested. Original-post author/date checks are applied; rejected records are not published.

Each refresh covers the prior 180 days, capped at three original posts. Refresh is manual, limited to once per ten minutes per source and five jobs per day per installation identity. It is **not continuous background monitoring**. Up to two sources per connection and 20 source records per identity are supported in this demo. Removing a source removes its imported excerpts and invalidates the private graph revision.

A durable intent and an at-most-once trigger claim precede each potentially paid request. Unknown trigger outcomes become `uncertain`, and cannot silently retrigger. Confirmed jobs are polled with a bounded schedule; the UI can check that same snapshot later. A failed status read cannot start a second paid import. Uncertain jobs without a snapshot require provider-dashboard verification. Provider errors, empty data and unavailable profiles are explicit; no synthetic result is labeled live.

Feed cards show short excerpts and an original-source link. Topic extraction currently uses conservative keyword rules across the six conference topics; it is not a semantic hiring/fit classifier. Imported sources use `SHARED_SOURCE`, not a claimed `WROTE` edge by the app identity. The original source association is explicit and unverified. Demo posts and the old Bright Data replay are retained under **Demo controls**, separate from real imports.

## Capture and product agents

- One foreground audio clip up to **90 seconds / 8 MB**, up to **three JPEG/PNG/WebP photos / 4 MB each**, plus notes. This is a short-capture demo, not full-day or hour-long recording.
- Recording requires a visible consent confirmation and microphone permission. Camera scanning and photo capture require permission. Recording stops when leaving the screen or backgrounding the app. No background recording.
- The listening stage transcribes saved audio with OpenAI. The context stage reads notes, transcript and images and produces a structured draft: summary, topic tags, learning takeaways and suggested next steps. Progress is subscribed through Convex. These are bounded post-capture jobs, not a continuously listening autonomous agent.
- Source text/images are treated as untrusted data; no tools execute instructions found inside them. No messages are sent and no actions are executed automatically.
- `OPENAI_API_KEY` must be set in Convex by the user. Optional `OPENAI_TRANSCRIPTION_MODEL` defaults to `gpt-transcribe`; optional `OPENAI_CONTEXT_MODEL` defaults to `gpt-6-astra`. Account model access is still required. OpenAI calls use `store: false` for Responses. This does not claim end-to-end encryption or override provider retention policy.
- Without a working key/API, the capture remains saved and an explicit manual-review option is shown. Manual approvals are labeled manual, never as an AI result.
- Ordered state: collecting → processing → review → approved, or explicit error. Revision guards prevent late/duplicate results from overwriting changes. A three-minute watchdog surfaces a stuck analysis. At most three analysis attempts per capture; 30 captures per identity for this demo.
- Shared memory needs both participants' approval. Raw recordings, photos, transcript and unreviewed notes remain visible only to the capturing user. Session captures remain private; a recording does not prove attendance or automatically confer a skill.
- Deleting a capture deletes its stored media and revokes its attached shared conversation memory. App uploads and reads use authenticated HTTP handlers with ownership checks, not public media URLs. Desktop never receives raw captures, source mappings, contact details or unredacted private context.

## Try it on iPhone

Reuse the running Metro terminal if present; reload Expo Go. If dependencies or Metro cache need refreshing:

```sh
cd /Users/kadodwala/Documents/Codex/2026-10-24/referenced-chatgpt-conversation-this-is-an/outputs/conferenceos
export PATH="/Users/kadodwala/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
npm install
npm run mobile -- --go --lan --clear
```

Keep phone and Mac on the same Wi-Fi; scan **Metro's QR** with iPhone Camera to open Expo Go. This is different from the **connection QR inside Network**, which is scanned by another attendee inside ConferenceOS. Xcode is not required for these Expo Go-supported modules. Test physical permissions/camera/microphone before presenting; browser automation is not proof of iPhone hardware behavior.

1. Create profiles on two devices (or iPhone + a separate mobile-web browser context).
2. On one: Network → Create my invite code. On the other: Network → Scan an invite QR → send request. Accept it on the first.
3. Open the accepted connection → capture a conversation. Confirm permission, record a short clip or add notes/photo, then create a draft. Review it; the other person approves the shared note separately.
4. For a real public source, enter that contact's public profile URL and confirm the association. Use **Import up to 3 public posts**. This consumes Bright Data credits. No eligible posts means no fabricated feed card.
5. Open Feed. A card requires matching stored skills + approved memory + a validated imported post. Expand the actual returned graph path. The follow-up remains an unsent draft.
6. To demonstrate a predictable event without relying on a real person's latest post, use the explicitly labeled simulated update under Demo controls. Do not pass it off as a scrape.
7. Desktop stays at `http://localhost:5173`. Pair and opt into an anonymous pulse; present a redacted path separately. No additional private data is exposed by the new capture/source features.

## Verification and limitations

See `phase4-cloud-verification.json`, `phase4-mobile-verification.json` and the current combined suite in `phase5-unit-verification.json` for actual results. Provider configuration or availability failures are recorded as blocked, not passed. `phase5-ai-verification.json` supersedes the earlier missing-key/fixture failures with a passing real OpenAI test. Physical iPhone scanning/recording/photo picking remains a manual test. Authentication is still anonymous per installation, with no cross-device recovery; demo quotas are not production abuse protection.

The existing conference dataset is GitHub Universe, not general event discovery. Goals map into known conference topics. Session learning is retained privately but is not automatically treated as a professional skill. Network matching uses consented direct connections, not unapproved friends-of-friends. Full conversational onboarding, long recordings, semantic opportunity ranking, continuous source monitoring, automatic intros and action-taking agents remain future work.

Relevant API references: [OpenAI file transcription](https://developers.openai.com/api/docs/guides/speech-to-text), [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Bright Data asynchronous jobs](https://docs.brightdata.com/api-reference/rest-api/scraper/asynchronous-requests), [authenticated Convex file serving](https://docs.convex.dev/file-storage/serve-files).
