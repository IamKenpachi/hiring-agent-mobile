# Hiring Agent Mobile

Cross-platform career command center built with **Expo (React Native + Expo Router + TypeScript + NativeWind v4)**, **FastAPI**, **Google ADK**, **python-jobspy**, **Playwright Chromium** (with **fpdf2** fallback), and **Supabase** (with local SQLite fallback for offline/development runs).

---

## Architecture Overview

```text
+-------------------------------------------------------------------------+
|                    EXPO CROSS-PLATFORM APP (mobile/)                    |
|  Android-First • iOS • Web (Expo Router + NativeWind v4 + Dark/Light)   |
|                                                                         |
|  • (auth)/welcome     Welcome Screen ("Get Started" / "Sign In")        |
|  • (auth)/login       Email/Password & Continue with Google (PKCE OAuth) |
|  • (auth)/onboarding  Step 1: Gemini Key / Starter Mode + Privacy Link  |
|                       Step 2: Pre-Auth PDF CV Parser (4-Section Review) |
|                               OR 4-Step Questionnaire Wizard            |
|  • home               Post-Login Home Hub (Theme Toggle, Live Pill,     |
|                       Hunter, Studio, Outputs & Account Menu)           |
|  • (tabs)/hunt        3-Stage JobSpy Hunter (Config -> Live -> Results)   |
|  • job/[id]           4-Score Fit Audit + Formatted JD + Copy + Tailor  |
|  • (tabs)/studio      Instant Tailor Studio + Auto-Extract JD + Tone    |
|  • tailoring          Animated Tailoring Wait Screen (7s Min + Quips)   |
|  • (tabs)/outputs     Saved Outputs + Fit/ATS Badges + Delete Modal     |
|  • output/[id]        3-Slide Carousel (CV / Cover Letter / Keywords)   |
|                       + Revision Studio + A4 PDF Download/Share         |
|  • (tabs)/settings    Profiles, Key/Starter Status, Appearance,         |
|                       Privacy Policy, Delete Account & Telemetry        |
+------------------------------------+------------------------------------+
                                     | HTTP / SSE + Bearer JWT
                                     | + X-Gemini-Api-Key + X-Gemini-Model
                                     v
+-------------------------------------------------------------------------+
|                 FASTAPI + GOOGLE ADK DOCKER (backend/)                  |
|                                                                         |
|  • /api/auth          Signup, Login, /me, Live Key Check, Delete Account|
|  • /api/profiles      Multi-Profile CRUD + /parse-preview + ParserAgent |
|  • /api/hunt          8-Board JobSpy Scraper + 4-Stage SSE + Matcher    |
|  • /api/studio        JDExtractorAgent + ApplicationTailorPipeline      |
|  • /api/outputs       Saved Outputs + Supabase Storage PDFs + PDF Gen   |
|  • /api/telemetry     Real-Time Token I/O & USD Cost Telemetry          |
|  • /legal/*           Play / App Store Privacy & Account Deletion HTML  |
+------------------------------------+------------------------------------+
                                     | SQLAlchemy 2.0 ORM + Supavisor TLS
                                     v
+-------------------------------------------------------------------------+
|                 SUPABASE POSTGRESQL / LOCAL SQLITE (supabase/)          |
|  • profiles • search_runs • ranked_jobs • tailored_outputs • token_usage|
|  • Optimized (select auth.uid()) RLS policies & private outputs-pdfs    |
+-------------------------------------------------------------------------+
```

---

## Supported JobSpy Boards (8 Platforms)

| Tier | Platforms | Notes |
| :--- | :--- | :--- |
| **Primary (5)** | `linkedin`, `indeed`, `glassdoor`, `google`, `zip_recruiter` | Multi-select chips; per-board fault isolation with non-blocking rate-limit warnings |
| **Regional (3)** | `bayt`, `naukri`, `bdjobs` | Expandable regional drawer for MENA, India, and Bangladesh job markets |

---

## Tailoring Modes (Supported Gemini Models)

| Mode Name | Model Handle | Badge | Pricing (In / Out per 1M) | Best For |
| :--- | :--- | :--- | :--- | :--- |
| **Rapid Job Scanner** | `gemini-3.5-flash-lite` | `Fast Scan ⚡` | $0.30 / $2.50 | High-speed bulk job screening and quick keyword checks |
| **Daily Application Tailor** *(Default)* | `gemini-3.8-flash` | `Recommended ⭐` | $0.75 / $3.75 | Balanced everyday role matching and full CV & cover letter tailoring |
| **Career Strategist** | `gemini-4-hydrogen` | `Deep Fit 🎯` | $1.50 / $7.50 | Deep role analysis, impact bullet rewriting, and positioning |
| **Executive Headhunter** | `gemini-4-argon` | `Frontier 🏆` | $2.00 / $10.00 | Maximum reasoning depth for competitive, technical, and leadership roles |

Users supply their own Gemini API key during onboarding (`expo-secure-store` on iOS/Android, `localStorage` on Web), transmitted per request via `X-Gemini-Api-Key` and `X-Gemini-Model`. Both the backend (`resolve_gemini_model`) and mobile app (`normalizeModelId` / `resolveModelDisplayName`) map legacy model IDs (`gemini-3.7-flash`, `gemini-3.6-flash`, `gemini-3.5-flash`, `gemini-2.5-flash`, `gemini-3.1-pro-preview`, `gemini-2.5-pro`, `gemini-3.1-flash-lite`, `gemini-2.5-flash-lite`) seamlessly to these 4 tiers for stored sessions, saved outputs, and telemetry.

---

## Key Features & Recent Updates

### 3-Screen JobSpy Hunt Flow (`(tabs)/hunt`)
1. **Hunt Configuration**: Choose role query, location, search radius, work type, posting recency, Top-N results count, and multi-select primary/regional JobSpy platforms.
2. **Live Execution Progress**: Streams live backend progress (SSE on Web, polling fallback on native) across 4 distinct stages — **Multi-Board JobSpy Scraping**, **Deduplication & Normalization**, **Role Match & ATS Scoring**, and **Ranking Top Matches** — with partial-board warnings, failure recovery controls, and a **Show Results →** transition CTA upon completion.
3. **Top Ranked Matches**: Displays sorted job match cards with `Overall Fit`, `Skills`, `Experience`, and `ATS` score badges linking straight to `job/[id]`.

### Executive CV & Cover Letter Generation + Vector PDFs
- **Strict Markdown Templates & Typed Schemas (`app/templates/cv_templates.py`, `app/agents/adk_agents.py`)**: Ported executive Data Analyst, Generic, and Cover Letter Markdown templates with strongly typed `ExperienceSchema`, `ProjectSchema`, and `EducationSchema` Pydantic models for Gemini `response_schema` compatibility.
- **Honest Tailoring & Resilient Fallbacks**: Reframes real experience, projects, and education using Job Description terminology without fabricating unverified tools; includes direct `google.genai` template synthesis fallback and section-aware deterministic parsing if live ADK orchestration errors.
- **Playwright Chromium Vector A4 PDF Export (`app/services/pdf_service.py`)**: Renders `Plus Jakarta Sans` executive HTML (SVG contact icons, 2-column CSS skills grid, justified bullets and prose) into vector A4 PDFs via headless Chromium, with an improved `fpdf2` fallback.

### Job Description Reader, Waiting Screen & Saved Outputs Delete
- **Formatted JD Reader & Copy (`mobile/src/lib/descriptionParser.ts`, `job/[id]`)**: Normalizes JobSpy scraping whitespace/escapes and wrapped bullets into clean headings, bullet lists, and inline bold/italic spans, with a top-right **Copy** button (`expo-clipboard` + web fallback) and `"Copied!"` check feedback.
- **Animated Tailoring Waiting Page (`mobile/app/tailoring.tsx`, `tailorSession.ts`)**: Shared dedicated screen for both Instant Tailor Studio and Job Match Analysis featuring orbital ring animations, a 7-second minimum display timer, rotating witty status quips, `AbortSignal` cancellation, and retry/back error handling.
- **Saved Outputs Delete (`(tabs)/outputs`, `DELETE /api/outputs/{output_id}`)**: Per-card trash button and dark confirmation modal removing both the saved `TailoredOutput` record and its generated PDF directory on disk.

### Tailoring Modes, Natural Career UX & Session Persistence
- **4 Job-Hunting Tailoring Tiers (`backend/app/core/config.py`, `mobile/src/lib/api.ts`, `profileHelpers.ts`)**: Replaced raw technical model names with job-hunting tiers (**Rapid Job Scanner**, **Daily Application Tailor**, **Career Strategist**, **Executive Headhunter**) backed by `gemini-3.5-flash-lite`, `gemini-3.8-flash` (default), `gemini-4-hydrogen`, and `gemini-4-argon`, plus automatic legacy ID normalization across Home, Onboarding, Hunt, Studio, Tailoring, Saved Outputs, Revision Studio, and Telemetry.
- **Natural Career & Job-Hunting Copy (`mobile/app/`, `mobile/src/components/`)**: Removed technical buzzwords (`"AI"`, `"Agent"`, `"Copilot"`, `"Intelligence"`) across user-facing headings, buttons, and descriptions (`"Hiring Agent"`, `"4-Dimension Fit Breakdown"`, `"Match Rationale & Strategy"`, `"Quick Revise"`, `"Revision Studio"`), retaining `"Gemini API Key"` only on API key input and validation flows.
- **Live Active Profile & Mode Pill (`mobile/app/home.tsx`, `profileHelpers.ts`)**: `formatHomeActiveStatus` and `resolveModelDisplayName` dynamically render the user's active career profile and friendly tailoring mode (`Active Profile: <Profile> • <Mode>`).
- **Optimistic Instant Mode Switching (`AuthContext.tsx`, `(tabs)/settings`)**: `setSelectedModel` updates API headers and React state before persisting to device storage, paired with an active-mode pill badge, helper copy, and inline confirmation banner in Settings so changes apply immediately without re-validating the API key.
- **Key & Mode Preservation on Sign-Out (`mobile/src/lib/storage.ts`)**: `clearAuthSession()` clears only `auth_token` and `pending_onboarding_draft`, keeping `gemini_api_key` and `selected_model` intact across sign-outs.

### Live Key Verification, Error Handling & Telemetry Accuracy
- **Live Gemini Key Validation**: `/api/auth/validate-gemini-key` defaults to `verify_live=True`, rejecting placeholders and invalid keys (`API_KEY_INVALID`) against Google Gemini before saving in Onboarding or Settings (with inline error banners in both screens).
- **Explicit Auth Errors (`401`) & Clean Fallbacks**: Invalid/expired Gemini API keys raise `GeminiAuthError` rather than falling back silently; interactive routes return HTTP `401` JSON with CORS headers intact, and background hunts surface failure details on the Progress screen. Transient non-auth live fallbacks log zero phantom tokens (`record_token_usage` skipped when `0` tokens are returned).
- **Safe Resume Parsing & PostgreSQL Integrity**: `CatchAllExceptionMiddleware` preserves `Access-Control-Allow-Origin` headers on unexpected `500` JSON responses, `/api/profiles/upload-pdf` and `/api/profiles/parse-preview` normalize PDF ligature glyphs (`fi`/`fl`/`ffi`), strip `\x00` NUL bytes, and execute synchronously off the event loop, and profile creation + token telemetry commit atomically.

### Dark & Light Theme System, Android UI & Revision Studio UX
- **Reactive Dark & Light Mode (`mobile/src/constants/theme.ts`, `ThemeContext.tsx`, `ThemeToggleButton.tsx`)**: Defaults to Dark Obsidian (`#090D16`) and switches cleanly in one tap to Tailwind Slate + Indigo Light Mode (`#F8FAFC` canvas, `#FFFFFF` cards, `#0F172A` ink) via the persistent top-bar toggle button or **Settings → Appearance**, preserved across sign-outs (`THEME_MODE` in device storage).
- **Android Edge-to-Edge Safe Areas & NativeWind v4 `<Pressable>` Fix**: Uses `useSafeAreaInsets()` so bottom tab bars (`(tabs)/_layout.tsx`) and sticky action bars (`job/[id]`, `output/[id]`) clear Android's system navigation bar, replaces all functional `style={({ pressed }) => ...}` callbacks on `<Pressable>` with static styles + `active:opacity-*` (`nativewindSafety.test.mjs`), and drops deprecated `StatusBar` `backgroundColor`.
- **Revision Studio Modal UX (`app/output/[id].tsx`, `mobile/src/lib/revisionChat.ts`)**: Measures Android `<Modal>` window insets via `computeAndroidModalKeyboardInset()` so the prompt bar stays cleanly above the software keyboard, shows your submitted prompt immediately via optimistic `buildDisplayedChatHistory()` above the progress indicator (restoring typed text on error), supports multiline expanding input, and renders `**bold**` / `*italic*` markdown cleanly via `parseChatMessageLines()`.

### Production Hardening, Store Compliance & Cloud Delivery
- **Backend Security, Quotas & Rate Limiting (`config.py`, `security.py`, `rate_limit.py`, `main.py`)**: Enforces strong `JWT_SECRET` and explicit `CORS_ORIGINS` (`validate_production_config()`) under `ENVIRONMENT=production`, disables unauthenticated dev fallback in prod, verifies Supabase `ES256`/`RS256` JWKS tokens alongside HS256, applies `SlowAPIMiddleware` (`120/minute` default, `10/minute` signup/login, `15/hour` hunts), adds security headers + request IDs, and recovers stale in-flight `SearchRun` rows on startup.
- **Starter Mode, Account Deletion & Legal Pages (`auth.py`, `legal.py`, `AuthContext.tsx`)**: Supports both personal **Gemini API Key (BYOK)** and rate-limited **Starter Mode (No Key Required)** (`DEMO_TRIAL_MAX_CALLS_PER_USER=15`, HTTP `402` on exhaustion), refreshes Supabase JWTs automatically via `onAuthStateChange`, serves Play/App Store compliance HTML at `GET /legal/privacy` and `GET /legal/account-deletion`, and cascades user/PDF/Supabase Auth & Storage deletion via `DELETE /api/auth/account` (`Settings → Delete Account`).
- **Cloud Container, Supavisor Pooler & Persistent PDFs (`Dockerfile`, `railway.toml`, `session.py`, `outputs.py`, `jobspy_service.py`)**: Runs non-root `python:3.11-slim-bookworm` with Playwright Chromium (`--no-sandbox`, `--disable-dev-shm-usage`, `--disable-gpu`), optional `JOBSPY_PROXY_URL`, PostgreSQL `prepare_threshold=None` for Supavisor/PgBouncer, and best-effort `outputs-pdfs` Supabase Storage upload/restore/delete across container restarts.
- **Android Build, EAS Update & CI (`app.json`, `eas.json`, `.github/workflows/ci.yml`)**: Configures `com.hiringagent.mobile` store PNG assets, EAS `development` / `preview` (APK) / `production` (AAB) profiles with `expo-updates` OTA channels (`preview`, `production`), Sentry crash reporting hooks, and GitHub Actions CI for backend `pytest` + mobile lint/typecheck/tests/Android export.

---

## Setup Instructions

### 1. Supabase Auth, Database & Storage
1. Create a Supabase project.
2. Open the **SQL Editor** and run `supabase/migrations/001_initial_schema.sql` followed by `supabase/migrations/002_production_hardening.sql` to create `profiles`, `search_runs`, `ranked_jobs`, `tailored_outputs`, `token_usage`, optimized `(select auth.uid())` RLS policies, covering FK indexes, and the private `outputs-pdfs` storage bucket.
3. Configure `DATABASE_URL` (Supabase Session/Transaction Pooler URI, percent-encoding any special characters in the password), `SUPABASE_URL`, `SUPABASE_KEY` (secret/service key), `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_JWT_SECRET` in `backend/.env`.
   - When `SUPABASE_URL` and `SUPABASE_KEY` are set, `/api/auth/signup`, `/api/auth/login`, and `/api/auth/me` proxy directly to **Supabase Auth** (with `ES256`/`RS256` JWKS and `HS256` JWT validation).
   - If `DATABASE_URL` or Supabase keys are omitted (and in `pytest`), the backend falls back to local SQLite (`sqlite:///./data/hiring_mobile.db`) and local JWTs.

### 2. FastAPI + Google ADK Backend (`backend/`)
```bash
cd backend
python -m venv .venv

# Windows PowerShell:
.venv\Scripts\Activate.ps1
# macOS/Linux:
# source .venv/bin/activate

pip install -r requirements.txt
playwright install chromium   # one-time browser setup for vector A4 PDFs
cp .env.example .env
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```
Verify liveness at `http://localhost:8001/health`.

### 3. Expo Mobile & Web App (`mobile/`)
```bash
cd mobile
npm install
cp .env.example .env
```
Edit `mobile/.env` to set your backend and Supabase URLs:
- Production / Cloud Backend: `EXPO_PUBLIC_API_URL=https://<your-railway-domain>`
- Web / iOS Simulator: `EXPO_PUBLIC_API_URL=http://localhost:8001`
- Android Emulator: `EXPO_PUBLIC_API_URL=http://10.0.2.2:8001`
- Physical Device (Expo Go): `EXPO_PUBLIC_API_URL=http://<YOUR_LAN_IP>:8001`

Start Expo:
```bash
npx expo start --tunnel   # recommended on LAN-isolated Wi-Fi
# Or launch directly on Web / Android / iOS:
npm run web
npm run android
npm run ios
```

### 4. Production Deployment (Railway + Expo EAS)
- **Backend (Railway)**: Deploy `backend/` using [Dockerfile](backend/Dockerfile) and [railway.toml](backend/railway.toml) (`ENVIRONMENT=production`, strong `JWT_SECRET`, explicit `CORS_ORIGINS`, `ALLOWED_HOSTS` including your Railway domain & `healthcheck.railway.app`, Supabase pooler `DATABASE_URL`, and `SUPABASE_*` vars).
- **Android Builds & OTA Updates (`mobile/`)**:
  ```bash
  cd mobile
  npx eas build --platform android --profile preview     # installable internal test APK
  npx eas build --platform android --profile production  # Play Store AAB
  npx eas update --channel preview --platform android --environment preview -m "<summary>"
  ```

---

## Testing & Verification Commands

### Backend (`pytest`)
```bash
cd backend
pytest -q
```

### Mobile Unit Tests, Lint, TypeScript & Android Bundle
```bash
cd mobile
node --test "src/lib/__tests__/*.test.mjs"
npx tsc --noEmit
npx expo lint
npx expo-doctor
npx expo export --platform android --output-dir ./dist-android-check
```

