# Mobile capture and public sources

The Phase3 Orbit / Discover / Network / Feed identity is retained.

- Network: create an expiring invitation QR, scan an exact ConferenceOS invitation, or type a code. A request still needs acceptance.
- Open an accepted connection: associate a public LinkedIn/X URL without OAuth, import/check/remove its public posts, or capture a conversation.
- Discover → session → Capture this session: notes, up to 90 seconds of audio, and up to three photos. Attendance is explicitly self-reported.
- Network → Shape my conference goal: notes-only capture prefilled from the profile goal.
- Review every AI/manual draft before approval. Conversation memory also needs the other person's approval. Removing a capture removes raw media and revokes its attached memory.
- Demo post tools are collapsed under Demo controls. Public source association does not verify account ownership. Public feed dates refer to original posts.

## Verification

From this directory:

```sh
npm run check
npm run test:invite
npx expo export --platform ios --platform web --output-dir work/phase4-build
python3 -m http.server 8084 --bind 127.0.0.1 --directory work/phase4-build
```

With that preview served, use a second terminal:

```sh
npm run test:phase4
npm run test:media
MOBILE_TEST_URL=http://127.0.0.1:8084 npm run test:phase3
```

These smoke tests use real deployed Convex identities and mutations. They do not initiate paid Bright Data imports. `test:media` uses Chromium's synthetic microphone, not the computer's real microphone; it uploads test media and deletes that capture afterward. Chrome and Playwright must be installed. Evidence is written under `work/`.

Verified: 7 capture/source/invitation scenarios, 11 existing graph-flow checks, 4 synthetic-media checks, 4 parser/error tests, TypeScript, and Expo iOS/web export. The deployment had no OpenAI key during testing, so manual review fallback—not a generated AI draft—was exercised. Parent/backend verification covers live Bright Data imports separately.

Still required on a physical Expo Go device: camera QR recognition, native microphone permission denial/grant and background/close behavior, native photo picker/HEIC conversion, and the full 90-second automatic stop. The code bounds recording both through Expo duration and an app timer; browser smoke verifies manual stop and close release all microphone tracks.

## SDK references

Expo Go compatible packages were installed with `expo install`: [audio](https://docs.expo.dev/versions/latest/sdk/audio/), [camera](https://docs.expo.dev/versions/latest/sdk/camera/), [image picker](https://docs.expo.dev/versions/latest/sdk/imagepicker/). Native picked photos request a compatible representation and use the picker’s documented JPEG base64 output. No background recording is enabled. Camera/microphone permissions are requested only after the relevant user action and capture consent.
