# Hiring Agent Mobile

Cross-platform AI career command center built with **Expo (React Native + Expo Router + TypeScript + NativeWind v4)**, **FastAPI**, **Google ADK**, **python-jobspy**, **fpdf2**, and **Supabase** (with local SQLite fallback for offline/development runs).

---

## Architecture Overview

```text
+-------------------------------------------------------------------------+
|                    EXPO CROSS-PLATFORM APP (mobile/)                    |
|  iOS • Android • Web (Expo Router + NativeWind v4 + Dark Executive Theme)|
|                                                                         |
|  • (auth)/welcome     Welcome Screen ("Get Started" / "Sign In")        |
|  • (auth)/login       Email/Password & Continue with Google (PKCE OAuth) |
|  • (auth)/onboarding  Step 1: Gemini Key (SecureStore) + AI Engine Grid |
|                       Step 2: Pre-Auth PDF CV Parser (4-Section Review) |
|                               OR 4-Step Questionnaire Wizard            |
|  • home               Post-Login Home Hub (Hunter, Studio, History,     |
|                       Master Profiles, & Account Menu)                  |
|  • (tabs)/hunt        3-Stage JobSpy Hunter (Config -> Live -> Results)   |
|  • job/[id]           4-Score Fit Audit + Skills + "Yes, Tailor" CTA    |
|  • (tabs)/studio      Instant Tailor Studio + Auto-Extract JD + Tone    |
|  • (tabs)/outputs     Saved Tailored Applications & Fit/ATS Badges      |
|  • output/[id]        3-Slide Carousel (CV / Cover Letter / Keywords)   |
|                       + AI Revision Copilot + A4 PDF Download/Share     |
|  • (tabs)/settings    Multi-Profile Manager, Live Key Check & Telemetry |
+------------------------------------+------------------------------------+
                                     | HTTP / SSE + Bearer JWT
                                     | + X-Gemini-Api-Key + X-Gemini-Model
                                     v
+-------------------------------------------------------------------------+
|                      FASTAPI + GOOGLE ADK (backend/)                    |
|                                                                         |
|  • /api/auth          Signup, Login, /me, Live Gemini Key validation    |
|  • /api/profiles      Multi-Profile CRUD + /parse-preview + ParserAgent |
|  • /api/hunt          8-Board JobSpy Scraper + 4-Stage SSE + Matcher    |
|  • /api/studio        JDExtractorAgent + ApplicationTailorPipeline      |
|  • /api/outputs       Saved Outputs + RevisionCopilotAgent + fpdf2 PDFs |
|  • /api/telemetry     Real-Time Token I/O & USD Cost Telemetry          |
+------------------------------------+------------------------------------+
                                     | SQLAlchemy 2.0 ORM
                                     v
+-------------------------------------------------------------------------+
|                 SUPABASE POSTGRESQL / LOCAL SQLITE (supabase/)          |
|  • profiles • search_runs • ranked_jobs • tailored_outputs • token_usage|
|  • Row-Level Security (auth.uid() = user_id) & outputs-pdfs bucket      |
+-------------------------------------------------------------------------+
```

---

## Supported JobSpy Boards (8 Platforms)

| Tier | Platforms | Notes |
| :--- | :--- | :--- |
| **Primary (5)** | `linkedin`, `indeed`, `glassdoor`, `google`, `zip_recruiter` | Multi-select chips; per-board fault isolation with non-blocking rate-limit warnings |
| **Regional (3)** | `bayt`, `naukri`, `bdjobs` | Expandable regional drawer for MENA, India, and Bangladesh job markets |

---

## Supported Gemini Models

- `gemini-3.7-flash` *(Default — Flagship)*
- `gemini-3.6-flash` *(Agentic)*
- `gemini-3.5-flash` *(Fast)*
- `gemini-3.5-flash-lite` *(Budget)*
- `gemini-3.1-pro-preview` *(Frontier)*
- `gemini-2.5-flash` *(Stable)*

Users supply their own Gemini API key during onboarding (`expo-secure-store` on iOS/Android, `localStorage` on Web), transmitted per request via `X-Gemini-Api-Key` and `X-Gemini-Model`.

---

## Key Features & Recent Updates

### 3-Screen JobSpy Hunt Flow (`(tabs)/hunt`)
1. **Hunt Configuration**: Choose role query, location, search radius, work type, posting recency, Top-N results count, and multi-select primary/regional JobSpy platforms.
2. **Live Execution Progress**: Streams live backend progress (SSE on Web, polling fallback on native) across 4 distinct stages — **Multi-Board JobSpy Scraping**, **Deduplication & Normalization**, **AI Match & ATS Scoring**, and **Ranking Top Matches** — with partial-board warnings, failure recovery controls, and a **Show Results →** transition CTA upon completion.
3. **Top Ranked Matches**: Displays sorted job match cards with `Overall Fit`, `Skills`, `Experience`, and `ATS` score badges linking straight to `job/[id]`.

### Live Key Verification, Error Handling & Telemetry Accuracy
- **Live Gemini Key Validation**: `/api/auth/validate-gemini-key` defaults to `verify_live=True`, rejecting placeholders and invalid keys (`API_KEY_INVALID`) against Google Gemini before saving in Onboarding or Settings (with inline error banners in both screens).
- **Explicit Auth Errors (`401`) & Clean Fallbacks**: Invalid/expired Gemini API keys raise `GeminiAuthError` rather than falling back silently; interactive routes return HTTP `401` JSON with CORS headers intact, and background hunts surface failure details on the Progress screen. Transient non-auth live fallbacks log zero phantom tokens (`record_token_usage` skipped when `0` tokens are returned).
- **Safe Resume Parsing & PostgreSQL Integrity**: `CatchAllExceptionMiddleware` preserves `Access-Control-Allow-Origin` headers on unexpected `500` JSON responses, `/api/profiles/upload-pdf` and `/api/profiles/parse-preview` strip `\x00` NUL bytes and execute synchronously off the event loop, and profile creation + token telemetry commit atomically.

---

## Setup Instructions

### 1. Supabase Auth, Database & Storage
1. Create a Supabase project.
2. Open the **SQL Editor** and run `supabase/migrations/001_initial_schema.sql` to create `profiles`, `search_runs`, `ranked_jobs`, `tailored_outputs`, `token_usage`, RLS policies (`auth.uid() = user_id`), and the private `outputs-pdfs` storage bucket.
3. Configure `DATABASE_URL` (Session Pooler URI, percent-encoding any special characters in the password), `SUPABASE_URL`, `SUPABASE_KEY` (secret/service key), `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_JWT_SECRET` in `backend/.env`.
   - When `SUPABASE_URL` and `SUPABASE_KEY` are set, `/api/auth/signup`, `/api/auth/login`, and `/api/auth/me` proxy directly to **Supabase Auth** (with immediate post-signup login and `ES256`/`HS256` JWT validation).
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
Edit `mobile/.env` if running on an emulator or physical device:
- Web / iOS Simulator: `EXPO_PUBLIC_API_URL=http://localhost:8001`
- Android Emulator: `EXPO_PUBLIC_API_URL=http://10.0.2.2:8001`
- Physical Device (Expo Go): `EXPO_PUBLIC_API_URL=http://<YOUR_LAN_IP>:8001`

Start Expo:
```bash
npx expo start
# Or launch directly on Web / Android / iOS:
npm run web
npm run android
npm run ios
```

---

## Testing & Verification Commands

### Backend (`pytest`)
```bash
cd backend
pytest -v
```

### Mobile TypeScript Verification
```bash
cd mobile
npx tsc --noEmit
```

