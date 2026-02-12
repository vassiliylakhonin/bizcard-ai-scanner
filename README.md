# Privacy-First Business Card Scanner

![CI](https://github.com/vassiliylakhonin/bizcard-ai-scanner/actions/workflows/ci.yml/badge.svg)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

Scan business cards from photos or video frames, extract structured contacts, review/edit results, and export to Excel/CSV/vCard.

## Live Demo

[https://vassiliylakhonin.github.io/bizcard-ai-scanner/](https://vassiliylakhonin.github.io/bizcard-ai-scanner/)

## About

This project is a privacy-focused contact extraction app with two processing paths:

- `On-device OCR`: images stay in the browser and are processed with Tesseract.js.
- `AI mode`: use your preferred provider (`Gemini`, `OpenAI`, `Anthropic`, or `OpenAI-compatible`) to improve extraction quality.

## Core Features

- Upload multiple photos (default flow) or a short video
- Video frame extraction + manual frame selection
- Structured extraction to: `name`, `company`, `title`, `email`, `phone`, `website`, `address`
- Configurable AI provider in Settings
- On-device OCR mode (no card-image uploads)
- AI rate-limit handling with automatic retries (where retry hints are available)
- Review/edit table before export
- Dedupe toggle + basic merge strategy
- Validation highlighting for email/phone/URL
- Export to `.xlsx`, `.csv`, `.vcf`
- Sequential export IDs (`1, 2, 3...`) instead of random UUIDs
- Clickable app logo/title in header to return to the main upload page

## Tech Stack

- React + TypeScript
- Vite + Tailwind CSS (local build)
- Tesseract.js (on-device OCR)
- `@google/genai` (Gemini SDK)
- Provider-agnostic HTTP integrations for OpenAI/Anthropic/OpenAI-compatible APIs
- `xlsx` for Excel export
- Optional Node backend proxy (`server/index.js`)

## Quick Start

Prerequisite: Node.js 18+

```bash
npm install
npm run dev
```

Open the URL shown by Vite (usually `http://localhost:5173`).

In the app, open `Settings` and choose:

- `AI` mode (provider configurable), or
- `On-device OCR` mode.

## Configuration

### Option A: In-app settings (fastest)

Set provider, model, base URL (if needed), and API key in `Settings`.

Stored locally in browser `localStorage` on that device.

### Option B: `.env.local`

```bash
# Provider keys
VITE_GEMINI_API_KEY=
VITE_OPENAI_API_KEY=
VITE_ANTHROPIC_API_KEY=
VITE_OPENAI_COMPAT_API_KEY=
VITE_OPENAI_COMPAT_BASE_URL=https://api.example.com/v1

# Optional provider model/base overrides
VITE_GEMINI_MODEL=
VITE_OPENAI_MODEL=
VITE_OPENAI_BASE_URL=
VITE_ANTHROPIC_MODEL=
VITE_ANTHROPIC_BASE_URL=
VITE_OPENAI_COMPAT_MODEL=

# Optional backend proxy (Gemini path in this repo)
VITE_USE_BACKEND=false
VITE_BACKEND_URL=

# Backend proxy env (server/index.js)
GEMINI_API_KEY=
PORT=8787
```

### Backend Proxy

Start proxy locally:

```bash
npm run dev:server
```

Important: the included backend proxy currently supports Gemini extraction. Other providers currently run browser-direct via configured keys.

## Privacy and Data Handling

Business cards contain PII. Current behavior:

- No app-controlled server storage by default
- Uploaded images/results remain in browser memory for current session
- Settings (mode/provider/key/model/base URL/OCR language) are stored in browser `localStorage`
- OCR assets are cached by the browser after first load

If AI mode is enabled, selected images are sent to your configured provider (or to backend proxy when configured).

For production/public deployments, keep real provider keys server-side.

See `PRIVACY.md` for details.

## Export Behavior

- Excel/CSV include deterministic sequential `id` values
- vCard export includes standard contact fields
- Validate and edit rows before export for best quality

## Scripts

```bash
npm run dev
npm run dev:server
npm run build
npm run preview
npm run lint
npm run format
```

## Deployment Notes

- Static deployment (GitHub Pages) works out of the box
- Public static demos should rely on user-provided keys in Settings (not hardcoded keys)
- For production, use a backend proxy with auth/rate limiting and no request-body logging

## Known Limitations

- On-device OCR is heuristic-based and can misplace fields on noisy/complex layouts
- If local OCR worker asset loading fails, the app can fall back to Tesseract default asset sources (third-party CDNs) to keep OCR working
- AI provider quality varies by model and image quality
- Gemini free-tier quotas can still throttle large batches; app retries, but hard quota exhaustion will still fail until limits reset
- `xlsx` currently has an upstream high-severity advisory with no fix available; this app uses it for export (write) only

## Roadmap

- Stronger normalization and fix-suggestions for phone/email/URL
- Better fuzzy dedupe + conflict-resolution UI
- More export templates (Google Contacts, CRM-specific)
- Provider-aware backend deployment recipes with auth + rate limiting

## License

MIT
