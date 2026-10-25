# ConferenceOS

A conference companion for before, during, and after the event: discover relevant sessions, keep consented conversation context, and reconnect around useful public opportunities.

## The demo

- **Mobile:** native React Native / Expo app with a rotatable network globe, personalized discovery, conversation capture, people, social feed, and animated Wrapped.
- **Desktop:** interactive 3D conference and privacy-preserving shared network visualization.
- **Context:** Convex persists private profiles and revisions; FalkorDB calculates graph relationships and returns verifiable paths.
- **Voice onboarding:** Bland calls the number entered by the user after explicit consent. OpenAI turns verified call transcripts and consented recordings into structured context.
- **Public opportunities:** Bright Data ingestion for public LinkedIn/X sources; source attribution and demo provenance remain visible.

The six-digit code **123456** creates a synthetic demo connection, not a real NFC interaction. Default Wrapped numbers are fictional presentation data, separate from actual activity. Real shared conversation memories require participant review. Public posts do not establish conference attendance or current hiring availability.

## Project

```text
apps/mobile/    Expo native app
apps/web/       Vite desktop globe
convex/         Auth, storage, real-time functions and provider integrations
packages/core/  Graph models, Cypher, validation and shared data
tests/          Unit and backend isolation tests
scripts/        Ingestion and integration checks
```

## Run locally

Use Node.js 22 or newer.

```sh
npm ci
npx convex dev
```

Configure your own Convex deployment. Set backend secrets in Convex, never in mobile or web source:

- `FALKORDB_URL` — full TLS connection URL
- `OPENAI_API_KEY`
- `BLANDAI_API_KEY` (or `BLAND_API_KEY`) — configure the Bland persona for your account
- `BRIGHTDATA_API_KEY` — optional public-source ingestion
- Convex Auth signing settings as required by `scripts/configure-auth.ts`

Set `EXPO_PUBLIC_CONVEX_URL` for mobile and `VITE_CONVEX_URL` for web to your deployment URL. The checked-in demo uses development fallbacks; replace those when deploying your own instance. No secret values are included in this repository.

In separate terminals:

```sh
npm run mobile
npm run dev
```

For a physical iPhone with Expo Go:

```sh
cd apps/mobile
npx expo start --go --tunnel --clear --port 8081
```

Scan the terminal QR with the iPhone Camera and open Expo Go. Keep the development machine running. A custom native build is not required for this demo; physical NFC is not implemented.

## Checks

```sh
npm test
npm run check
npm run check -w @conferenceos/mobile
npm run build
cd apps/mobile
npx expo install --check
npx expo export --platform ios --platform web
```

Cloud integration checks can incur provider charges. They are not part of `npm test`. Do not run them against real attendee records without consent.

## Demo flow

Welcome → consented onboarding call → personal context graph → Discover → record a consented conversation → finish → demo code `123456` → saved demo context and graph update → Feed → Wrapped.

To record a clean onboarding walkthrough, avatar/settings → **Start fresh demo profile**. **Return to original profile** restores the original locally stored identity. These are device-local anonymous profiles, not verified identities or cross-device account login.
