# BizCard AI Scanner

![CI](https://github.com/vassiliylakhonin/bizcard-ai-scanner/actions/workflows/ci.yml/badge.svg)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

Upload photos or a short video of business cards, extract contact details with Google Gemini, then export everything to an Excel file.

## Features

- Upload multiple images or a video
- Video frame extraction and manual frame selection
- Structured extraction (name, title, company, email, phone, website, address)
- On-device OCR mode (no image uploads)
- Batch processing with concurrency
- Export results to `.xlsx`, `.csv`, `.vcf` (vCard)

## Tech Stack

- React + TypeScript
- Vite
- Google Gemini via `@google/genai`
- `xlsx` for Excel export

## Run Locally

**Prerequisites:** Node.js (recommended: 18+)

1. Install dependencies:
   ```bash
   npm install
   ```
2. Choose a processing mode in the in-app **Settings**:
   - AI (Gemini)
   - On-device OCR (no uploads)

3. Create `.env.local`:
   ```bash
   # AI (Gemini) local-only mode (not recommended for public deployments)
   VITE_GEMINI_API_KEY=YOUR_GEMINI_API_KEY

   # Backend proxy mode (recommended)
   VITE_USE_BACKEND=true
   GEMINI_API_KEY=YOUR_GEMINI_API_KEY
   ```
4. (Optional, backend proxy mode) Start the backend proxy:
   ```bash
   npm run dev:server
   ```
5. Run the app:
   ```bash
   npm run dev
   ```
6. Open http://localhost:3000

## Demo (No Key In Repo)

If you host this app publicly (or just want a quick try), you can paste your own Gemini API key in the in-app **Settings** modal. The key is stored in your browser localStorage on that device.

## Live Demo

This repo is set up to deploy to GitHub Pages. Once enabled, the URL will be:

https://vassiliylakhonin.github.io/bizcard-ai-scanner/

## Build

```bash
npm run build
npm run preview
```

## How It Works (High Level)

1. You upload photos or a video.
2. For videos, the app extracts JPEG frames in the browser.
3. Selected frames/images are processed with either:
   - Gemini (AI mode), or
   - on-device OCR (no uploads)
4. Results are shown in a table and can be exported to Excel.

## Configuration Notes

- `.env.local` is ignored by Git by default (via `*.local` and `.env*` in `.gitignore`).
- For backend proxy mode, set `GEMINI_API_KEY` for `server/index.js` (you can also put it in `.env.local` locally).

## Security / Privacy

Business cards contain PII (names, emails, phone numbers).

This is a client-side app. If you deploy it publicly with an API key bundled, the key can be extracted from the built assets.

If you plan to deploy this publicly, move Gemini calls to a backend (proxy) and keep the key server-side.

See `PRIVACY.md` for details and tradeoffs.

On-device OCR mode uses Tesseract.js and self-hosted worker/core/language assets (same origin, no third-party CDNs). First use may download ~60MB of OCR assets and cache them in the browser.

## Dependency Notes

- `npm audit` currently reports a high severity advisory for `xlsx` with no fix available.
- This app uses `xlsx` for export (write) only and does not parse untrusted spreadsheets, but you should still review advisories for your threat model.

## Roadmap

Shipped:
- Export formats: Excel, CSV, vCard
- Dedupe toggle + basic merge strategy
- Basic validation highlighting in the results table
- On-device OCR mode (no uploads)
- Minimal backend proxy option (server-side API key)

Next:
- Stronger validation + normalization for phone/email/URLs (and “fix suggestions” UI)
- Better dedupe (fuzzy matching) + conflict resolution UI
- More export templates (Google Contacts CSV, HubSpot/Salesforce-friendly CSV)
- Deployment recipes for the backend proxy (Vercel/Cloudflare/Netlify) with rate limiting and auth
