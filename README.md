<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# BizCard AI Scanner

![CI](https://github.com/vassiliylakhonin/bizcard-ai-scanner/actions/workflows/ci.yml/badge.svg)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

Upload photos or a short video of business cards, extract contact details with Google Gemini, then export everything to an Excel file.

## Features

- Upload multiple images or a video
- Video frame extraction and manual frame selection
- Structured extraction (name, title, company, email, phone, website, address)
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
2. Choose a mode:
   - Local-only mode (Gemini called directly from the browser)
   - Backend proxy mode (recommended if you plan to deploy publicly)

3. Create `.env.local`:
   ```bash
   # Local-only mode (not recommended for public deployments)
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

## Build

```bash
npm run build
npm run preview
```

## How It Works (High Level)

1. You upload photos or a video.
2. For videos, the app extracts JPEG frames in the browser.
3. Selected frames/images are sent to Gemini with a JSON schema, returning structured contact fields.
4. Results are shown in a table and can be exported to Excel.

## Configuration Notes

- `.env.local` is ignored by Git by default (via `*.local` and `.env*` in `.gitignore`).
- For backend proxy mode, set `GEMINI_API_KEY` for `server/index.js` (you can also put it in `.env.local` locally).

## Security / Privacy

This is a client-side app. If you deploy it publicly with an API key bundled, the key can be extracted from the built assets.

If you plan to deploy this publicly, move Gemini calls to a backend (proxy) and keep the key server-side.

## Dependency Notes

- `npm audit` currently reports a high severity advisory for `xlsx` with no fix available.
- This app uses `xlsx` for export (write) only and does not parse untrusted spreadsheets, but you should still review advisories for your threat model.

## Roadmap

- Better validation and normalization for phone/email/URLs
- Auto-dedupe improvements and conflict resolution UI
- More export formats (Google Contacts CSV template, CRM-specific exports)
- Optional server deployment recipe (Vercel/Cloudflare/Netlify)
