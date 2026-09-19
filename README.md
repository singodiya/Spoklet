# Spoklet

A spoken-English practice app with Vashu: natural voice onboarding, a personal six-stage roadmap, friendly conversations, and corrections you can revisit.

Built with **Next.js 14 App Router, TypeScript, Tailwind CSS, Supabase Auth/Postgres, Groq Whisper, and Sarvam chat/Bulbul TTS**. Deploy the app to Vercel and the database to Supabase Cloud.

## Quick start

Use Node.js **22 or 24** and pnpm 11. The checked-in lockfile makes installation reproducible.

```sh
corepack enable
pnpm install --frozen-lockfile
cp .env.local.example .env.local
```

On Windows PowerShell, use `Copy-Item .env.local.example .env.local` for the last command. Fill in the six environment values privately. The project includes placeholders only.

### 1. Install the database

1. Open your Supabase project's **SQL Editor**.
2. Paste and run **`supabase/schema.sql`** once, in a new database without an existing Spoklet schema.
3. Confirm the tables and the `on_auth_user_created` trigger exist.

The SQL is transactional. It creates the requested five tables, a bounded rate-limit table, constraints, ownership policies, indexes, the signup trigger, and transactional session functions. It also creates profiles for existing Auth users. Do not rerun this initial schema against an existing installation; use reviewed migrations for later changes.

The supplied project's schema has now been installed. Its tables, existing-account profiles, and required session functions were verified. For a new Supabase project, apply this schema before using the app. A Supabase publishable/secret API key cannot run arbitrary SQL or replace a Postgres connection password.

### 2. Configure environment variables

| Variable | Where used |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser and server; your project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser and server; Supabase publishable key or legacy anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only**; Supabase secret key or legacy service-role key |
| `GROQ_API_KEY` | **Server only**; Whisper transcription |
| `SARVAM_API_KEY` | **Server only**; chat and speech synthesis |
| `NEXT_PUBLIC_SITE_URL` | App origin, initially `http://localhost:3000` |

The two public Supabase variables intentionally reach the browser. The site origin contains no credential. Never prefix the three private keys with `NEXT_PUBLIC_`, put them in `next.config.mjs`'s `env` property, or commit them. `.gitignore` excludes all environment files except the placeholder example. Rotate credentials that have been shared in chat before a production launch.

### 3. Configure email/password authentication

In Supabase **Authentication → Providers**, enable email/password. Under **URL Configuration**:

- Set Site URL to `http://localhost:3000` for local development, then to your production origin when deploying.
- Add `http://localhost:3000/auth/callback` and the production `/auth/callback` URL to the redirect allowlist.
- Leave email confirmation enabled if you want users to verify their address. The signup page handles both confirmation-required and immediate-session configurations.

The default confirmation email works with the PKCE `/auth/callback` flow when opened in the same browser. For confirmation links that also work in a different browser, set the **Confirm signup** email link to:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Confirm your email</a>
```

Use your production origin as Site URL before sending production emails. This server endpoint verifies the token directly and only redirects to the app's own root.

### Google sign-in

The login page includes **Continue with Google**, using Supabase OAuth with PKCE and the same server-side callback as email authentication. The supplied Supabase project reports that Google is enabled. No JWT signing key or Google client secret belongs in this app.

In Google Cloud, the authorized redirect URI must be your **Supabase** callback: `https://YOUR_PROJECT.supabase.co/auth/v1/callback`. In Supabase URL Configuration, allow the **app** callback: `http://localhost:3000/auth/callback` and the deployed app's `/auth/callback` URL. These are two different callback addresses. Keep the Google client ID/secret configured in Supabase.

A first Google sign-in creates an Auth user; the database trigger creates their profile, then the app opens the dashboard with a starter roadmap. A first conversation personalizes that roadmap; navigation, settings, and logout remain available throughout. Provider cancellations return to login with a readable message. See [Supabase Google OAuth documentation](https://supabase.com/docs/guides/auth/social-login/auth-google).

### 4. Start the app

```sh
pnpm dev
```

Open `http://localhost:3000`, sign up, and have the first conversation. Voice recording works on HTTPS and localhost. Allow microphone access when you choose to record. If a browser blocks automatic playback, use the visible audio player.

## If login shows a setup screen

A successful Google or email login does not install the database. If Supabase reports `PGRST205` for `public.profiles`, run `supabase/schema.sql` in the project SQL Editor. It also creates profiles for people who signed in before the schema was installed. Return to Spoklet and click **Check again**; no new account or another Google login is needed. The app now distinguishes missing setup from a temporary database failure.

## Vercel deployment

1. Create a Git repository from this project and push it to your own repository. Keep `.env.local` out of Git.
2. Import it into Vercel. Select the **Next.js** preset and Node.js **22.x or 24.x**. Keep the project root at this folder.
3. Use install command `pnpm install --frozen-lockfile` and build command `pnpm build`. The default output directory is `.next`; do not configure a static export.
4. Add all six environment variables to the intended deployment environments. Set `NEXT_PUBLIC_SITE_URL` to the HTTPS origin. Never paste secrets into source files or client-side build settings.
5. Apply the Supabase SQL before testing authenticated flows. Add the deployed callback URL to the Supabase redirect allowlist and set Site URL to the deployed origin.
6. Deploy. New public environment values require a rebuild because Next.js embeds them in browser bundles.

The speech and chat handlers declare a 60-second maximum duration and use 45-second upstream timeouts. Ensure the Vercel plan supports this duration. Audio uploads are limited to **4 MB**, below Vercel's 4.5 MB request ceiling; the recorder stops after **90 seconds** and requests a 64 kbps audio bitrate.

The requested Next.js **14** major is preserved and locked to **14.2.35** in the lockfile. Review [Next.js security advisories](https://nextjs.org/blog/security-advisories) before public deployment; upgrading to a supported major is a separate stack decision.

## Routes and flow

| Route | Purpose |
| --- | --- |
| `/` | Animated landing; redirects signed-in users to the dashboard |
| `/signup`, `/login` | Email/password authentication, plus Google sign-in on login |
| `/onboarding` | Hindi/Hinglish/English first conversation, with typing, guided replies, help actions, navigation, and provisional placement |
| `/dashboard` | Expandable six-step starter preview before assessment; personal roadmap, statistics, corrections, and transcripts afterwards |
| `/practice` | First conversation for new learners; stage-based practice afterwards; speech and typed replies throughout |
| `/settings` | Support language, voice preview, pace, display name, and logout |

A provisional plan is available after **four nonempty learner replies**, including short Hindi or Hinglish answers. There is no word-count barrier. The visible Build my roadmap action explicitly requests completion. With insufficient English evidence, Vashu uses an honest provisional A1 starter placement rather than claiming an assessed level. Help/example/resume actions never count as learner replies. A valid completion creates exactly six personalized stages and updates the profile in the **same transaction** as the last conversation turn.

Each practice session needs **four user turns** to count. Three qualifying sessions complete the active stage and unlock the next. Short conversations are saved but do not increment counts or streaks. Streak boundaries use **UTC calendar days**, shown in the dashboard. After stage six, learners can keep practicing. CEFR remains the provisional onboarding estimate: completing a stage does not falsely claim a certified language-level improvement.

Every chat request loads the profile, current stage and focus skills, the entire current session transcript, and the three latest session summaries. Sessions are capped at 60 user turns to bound context size; users then finish and start another conversation. Final summaries are also generated with learner and stage context.

## Beginner language support

Existing and new accounts default to **Hinglish**. Learners can choose Hindi, Hinglish, or simple English in the conversation or Settings. Vashu explains in their selected language and introduces short English examples. Resuming an older English-only conversation generates a fresh reply in the current language instead of replaying an outdated English-only claim.

The preference is stored as Supabase Auth `user_metadata.support_language`, validated against three allowed values. It is only a display/coaching preference and grants no permissions. **No database migration or schema rerun is needed for this update.** Native language and learning goal remain separate profile fields.

Groq Whisper language detection is automatic in Hindi/Hinglish modes; explicit English mode supplies `en`. Sarvam Bulbul uses `hi-IN` for Hindi/Hinglish and `en-IN` for English. A Hindi help response uses Hindi speech even when English is selected. See [Groq transcription documentation](https://console.groq.com/docs/speech-to-text) and [Sarvam text-to-speech documentation](https://docs.sarvam.ai/api-reference/text-to-speech/convert).

The starter roadmap is clearly labelled as a preview and is not stored as earned progress. A valid personalized assessment replaces it with six saved stages. Roadmap, Practice, Settings, and logout are accessible before assessment on desktop and mobile.

## API

Every POST handler verifies **`supabase.auth.getUser()`** before database access or paid provider calls. Cross-origin browser requests are rejected. Ownership is checked independently of middleware and again by database functions. All user-state pages are dynamic and private.

| Endpoint | Request |
| --- | --- |
| `POST /api/session/start` | `{ "mode": "onboarding" \| "practice" }` → create or resume the user's open session |
| `POST /api/stt` | Multipart `file` and optional `support_language` → `{ "text": "..." }` |
| `POST /api/chat` | `{ "sessionId", "requestId", "message", "mode", "intent"?, "support_language"? }` → `{ "reply", "corrections", "done", "messageId", "userMessageId" }` |
| `POST /api/tts` | `{ "text", "speaker", "pace", "support_language"? }` → `{ "audios": ["base64 MP3"], "mimeType": "audio/mpeg" }` |
| `POST /api/session/end` | `{ "sessionId", "requestId" }` → summary, optional score, counted status, and stage advancement |
| `POST /api/settings` | `Any nonempty subset of { "full_name", "preferred_voice", "speech_pace", "support_language" }` |

`intent` defaults to `message`. Supported helper actions are `resume`, `explain`, `example`, `simplify`, and onboarding-only `finish`; these require an empty message and do not insert a learner turn. Finish requires four existing learner replies. An invalid generated plan cannot complete onboarding and the explicit finish action returns a retryable error.

`requestId` is a client-generated UUID. Retry a failed chat with the **same** UUID so an already-saved response can be returned without duplicate messages or corrections. A per-session database lease serializes turns and completion; abandoned leases expire after 120 seconds. Session completion is idempotent even across separate end-request UUIDs. The browser retains a failed transcription recording in memory for retry, but never uploads it to Supabase Storage.

Supported Bulbul v3 voices are `shubh`, `aditya`, `rahul`, `priya`, `ritu`, and `simran`; pace ranges from 0.5 to 2.0. This conservative list uses names verified against the current [Sarvam voice documentation](https://docs.sarvam.ai/api-reference-docs/api-guides-tutorials/text-to-speech/how-to/change-the-speaker-voice), which differs from older example lists. Chat replies use Sarvam’s strict JSON-schema response format, with separate schemas for conversation, roadmap, practice corrections, and summaries. Reasoning is disabled for these conversational requests so it cannot consume the entire visible-reply budget. The fourth learner reply requests the complete roadmap schema; invalid output never awards progress. See [Sarvam structured-output and reasoning documentation](https://docs.sarvam.ai/api/api-guides-tutorials/chat-completion/overview).

## Data security and resilience

- RLS on every table, with `auth.uid()` ownership policies for browser reads.
- Browser updates are granted only on `full_name`, `preferred_voice`, and `speech_pace`. Users cannot forge assessments, stage completion, transcripts, or counters through the Data API.
- Composite foreign keys prevent sessions, stages, messages, and corrections being linked across users.
- Security-definer session functions have a fixed empty search path and are executable only by the service role; the Next.js handlers authenticate and check ownership before invoking them.
- Atomic saves avoid orphaned corrections or half-built roadmaps. Unique constraints prevent duplicate open sessions and duplicate turns.
- Database-backed per-user minute limits protect provider routes across serverless instances: STT 20, chat 20, TTS 25, start 12, finish 6.
- Strict JSON parsing and validation; malformed model text still becomes a readable/spoken reply with zero corrections. Invalid assessment data never marks onboarding complete.
- Corrections are capped at two and must match the user's actual latest message. Pronunciation corrections are excluded because the model sees text, not the original audio.
- Provider errors and logs do not reveal private transcripts or credentials. Session summaries are coaching notes, not certified test results.
- Microphone tracks stop between turns and on unmount. Blob audio is transient; persisted data includes transcripts, summaries, preferences, progress, and corrections. Groq/Sarvam process the submitted audio or text under their own service policies.
- Keyboard focus, accessible names, native form controls, responsive layouts, reduced-motion support, and manual playback fallback are included.

## Validation

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Tests run the actual schema in an isolated **PostgreSQL WASM engine (PGlite)**. Only Supabase Auth's users/roles/`auth.uid()` are simulated, and the optional `pgcrypto` extension statement is skipped because the engine already provides `gen_random_uuid`. No cloud database or API keys are needed for tests. The suite verifies the trigger, atomic onboarding, session leases, idempotent saves/completion, real RLS and column grants, composite ownership, short-session handling, stage unlocking, UTC streak resets, rate limits, and defensive model parsing.

Validation: production build, TypeScript, lint, and ten automated tests passed. A temporary live QA account verified that dashboard, onboarding, practice, and settings render before assessment; language preferences persist; protected profile fields are rejected; the opening reply is in Hinglish; retries are idempotent; helper replies do not count as learner turns; Hindi TTS can be transcribed through multilingual STT; four short learner replies create exactly six saved stages; the personalized dashboard renders; and practice unlocks. The test account and its data were removed. Browser automation timed out, so final visual interaction and real microphone capture remain manual acceptance checks. No Vercel deployment is included.

After applying the schema, do one real acceptance run: sign up and confirm email; complete voice onboarding; reload to check the saved roadmap; finish three sessions with four user turns each; confirm the next stage unlocks; replay audio; change voice and pace; log out and back in; review the saved transcript and corrections. Test microphone denial and Safari playback behavior on a real device.

## Project structure

```text
app/                     App Router pages, layouts, API handlers, auth callbacks
components/              Landing, brand, authentication, voice room, dashboard shell, settings
hooks/use-recorder.ts     MediaRecorder, volume meter, duration/size limits, cleanup/retry
lib/ai/                  Prompts, defensive parser, server-only provider calls
lib/supabase/            Browser, authenticated server, and server-only admin clients
lib/                     Auth, API validation, types, constants
public/                  Custom waveform logo and original voice-orb artwork
supabase/schema.sql      Complete initial schema, policies, triggers, transactional functions
tests/                   Parser and isolated PostgreSQL integration tests
```

`SPOKLET_BUILD_DIR` optionally changes the local build directory for parallel development/build verification. Do not set it in Vercel; the default `.next` output is intended for deployment.
