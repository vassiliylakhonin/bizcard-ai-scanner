# Privacy & PII

Business cards often contain personally identifiable information (PII), such as:
- full name
- company
- email address
- phone number
- physical address

This project supports multiple processing modes so you can control where data goes.

## Processing Modes

### 1) AI (Gemini)

When "AI (Gemini)" mode is enabled, selected images are sent to:
- Google Gemini directly from the browser (if using a client-side API key), or
- your backend proxy (recommended for production deployments)

If you deploy this app publicly, do not ship a real API key to the browser. Use a backend proxy and keep secrets server-side.

### 2) On-device OCR (No Uploads)

When "On-device OCR" mode is enabled, business card images are processed locally in the user's browser using Tesseract.js.

Notes:
- Card images are not uploaded to an AI service.
- The OCR engine may download language/model assets on first use from the same origin (this app), and cache them in the browser for faster subsequent runs.
  - Self-hosting these assets avoids third-party CDNs, but increases initial download size (tens of MB).

## Data Retention

By default, this app:
- does not store business card images or extracted results on a server
- keeps uploaded images and extracted results in memory (the current browser session)

If you add a backend, make sure you:
- do not log request bodies
- apply rate limiting and authentication
- define and document retention (ideally: process in memory only)

## User Responsibility

Make sure you have permission to process and store the contact information you scan (e.g., consent and local laws).
