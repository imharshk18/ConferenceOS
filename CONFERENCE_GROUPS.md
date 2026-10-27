# Conference Groups

Conference Groups lives in **Network → Conference Groups**. Profile sharing controls are also in Network’s existing profile panel. There is no additional onboarding or identity. New groups normally have 3–5 places; creators can choose up to 12. Groups start with their creator, and other participating attendees join voluntarily.

## Existing systems reused

- Convex authentication and the existing `users` / `profiles` records, including the reviewed profile applied by Bland onboarding. Sharing is off for existing profiles until explicitly enabled.
- Existing professional `skillIds` / `networkAreas`, headline, and goal. Optional outside-work interests are additional fields on that same profile, not another identity or a questionnaire.
- The official program in `packages/core/data.ts`, the existing `universe2026` graph identifier, and the existing saved-session bookmarks. No event or session ingestion is added.
- Existing reviewed `captures` for session notes. Sharing creates an explicit copy of the reviewed summary and takeaways; raw notes, transcripts, recordings, and private captures remain private. Deleting a private capture does not erase the shared copy.
- The existing Network page, native modal conventions, colors, typography, and Conference Wrapped. Existing direct invites, accepted connections, network graphs, Feed, and capture workflows are retained.

There was no group messaging or conference membership table to extend. New tables represent conference participation, groups, memberships, persistent messages, session coverage, shared notes, blocks, and reports. All new profile fields are optional for compatibility with existing records.

## Matching and Common Ground

Discovery considers open groups in the same official conference. A deterministic scorer uses consented professional area/topic overlap, complementary area pairs (for example founders with growth, or content with product), identical explicitly shared goals, and shared saved sessions when both people opt to share those preferences. Professional evidence earns five points per explanation; casual overlap adds one. Casual overlap alone never generates a recommendation. This is a relevance ordering, not a compatibility percentage or an assessment of expertise.

Explanations come from the same evidence used by Common Ground. It separates Technical / Professional and Casual / Outside Work, names the people behind every overlap, and shows complementary pairs without claiming inferred expertise or a relationship. Group suggestions may include a prospective member’s overlap; joining is always a separate action. Simulated profiles are labeled.

FalkorDB’s current user-private snapshots are scoped to accepted connections, consented memories, or reviewed learning. They do not provide a consented cross-attendee directory. Group discovery therefore reads the authoritative, allowlisted Convex profile projection rather than expanding those private graph scopes or creating duplicate graph labels. Group membership creates no direct connection and no personal network graph edge.

## Privacy and authorization

`groups.setSharing` previews and explicitly enables sharing of name, headline, goal, professional areas, and optional casual interests. Saved session preferences require a separate opt-in. Enabling also self-reports participation in the named conference; the app does not infer or verify attendance. Existing private onboarding `context`, call drafts, transcripts, files, and conversation memories are never part of the shared projection.

`groups.details`, message/note history, sending, coverage, sharing notes, mute, report, and block enforce authenticated active membership on the server. Discovery returns only consented profile data and group summaries; it never returns messages or notes. Sharing withdrawal removes profile evidence immediately while retaining membership and authored messages. Leaving revokes workspace reads/writes; it does not erase history. Serializable indexed mutations prevent duplicate memberships, repeated creator/name group creation, and capacity races. Messages and notes have author-scoped retry keys. Histories are paginated and rendered chronologically.

Blocks hide each party’s profile, messages, notes, and session coverage from the other within Groups. New joins and recommendations cannot bring blocked parties together. Blocking does not modify existing direct connections. Reports persist privately in `groupReports`; there is no public report-reading endpoint. Mute is a persistent membership preference.

## Lifetime and conference completion

The existing actual Wrapped launcher now includes **End conference → see my Wrapped**. It invokes `groups.completeConference`, opens the actual Wrapped, and moves that attendee’s groups to **Past Conferences**. The official conference end also categorizes groups as past when queried. Completion only writes conference participation status; it has no group/message/note/connection deletion path.

Groups have no expiration field and no cleanup scheduler. Past groups retain membership, paginated chat, shared resources, and coverage; active members can continue writing months later. Profile/demo switching does not reset group records. The current demo helpers never delete them.

## Verification

- `npm test`: 83 tests passed across 8 suites, including 11 group tests. These cover voice-profile reuse without onboarding, truthful explanations, consent withdrawal, optional saved sessions, join/leave/rejoin, duplicate requests and capacity, server authorization, message pagination/reopening, coverage and owned reviewed notes, direct-connection independence, mute/report/block, demo switching, and messaging six months after End Conference and Wrapped reads.
- `npm run check` and `npm run check -w @conferenceos/mobile`: pass.
- `npm run build`: desktop production build passes.
- `npm run test:invite -w @conferenceos/mobile`: 5 existing invite/link tests pass.
- `npm run test:groups:ui`: actual Groups component at 390×844 with explicitly simulated Convex hook fixtures. Checks discovery, joining, visible professional/casual Common Ground, sending and reopening chat, session coverage, notes, mute, and leaving. Screenshots are written to ignored `work/groups-ui/`. This test does not claim live transport coverage; backend behavior is independently tested with `convex-test`. Requires local Chrome and permission to listen on localhost.
- `npx expo export --platform all --output-dir dist-groups`: iOS, Android, and web JavaScript exports pass; they do not replace signed native builds or device testing.

## Deployment and remaining verification

This checkout has no `CONVEX_DEPLOYMENT` configured, so `npx convex codegen` cannot contact a deployment. The generated API type registry includes the new module; the schema-derived model and generic runtime API already resolve it locally. Configure the intended development deployment, run `npx convex dev` to regenerate/deploy the schema and functions, and point `EXPO_PUBLIC_CONVEX_URL` at that deployment before running the updated mobile app. This implementation has not modified the hardcoded fallback cloud deployment.

Run two authenticated devices against that deployed backend to confirm live delivery, background/reconnect behavior, keyboard avoidance, native modal transitions, accessibility text scaling, and End Conference → Wrapped → Past Conferences. Native JS exports are not Xcode/Gradle builds.

Current product limits: one official conference catalog; discovery examines the first 200 conference groups and returns the 12 highest scoring relevant open groups; up to 10 created groups per owner; 4,000-character messages, 8,000-character notes, and 12 optional casual interests. Search narrows the official session list to 30 results at a time. Matching is deterministic and uses structured shared fields, not private transcript extraction or semantic role/industry inference. Mute is stored but push notifications are not implemented. Reports are recorded for operators; there is no moderation dashboard or automated escalation in this change. Blocks apply to Groups, with that scope stated in the UI.
