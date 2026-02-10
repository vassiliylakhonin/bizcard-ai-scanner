<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# BizCard AI Scanner

Upload photos or a short video of business cards, extract contact details with Google Gemini, then export everything to an Excel file.

## Features

- Upload multiple images or a video
- Video frame extraction and manual frame selection
- Structured extraction (name, title, company, email, phone, website, address)
- Batch processing with concurrency
- Export results to `.xlsx`

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
2. Create `.env.local`:
   ```bash
   GEMINI_API_KEY=YOUR_GEMINI_API_KEY
   ```
3. Run the app:
   ```bash
   npm run dev
   ```
4. Open http://localhost:3000

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

- The app reads `GEMINI_API_KEY` from `.env.local` and injects it at build time (see `vite.config.ts`).
- `.env.local` is ignored by Git by default (via `*.local` in `.gitignore`).

## Security / Privacy

This is a client-side app. If you deploy it publicly with an API key bundled, the key can be extracted from the built assets.

If you plan to deploy this publicly, move Gemini calls to a backend (proxy) and keep the key server-side.
