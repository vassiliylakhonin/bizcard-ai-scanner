# Privacy & PII

Business cards often contain personally identifiable information (PII): names, company details, emails, phone numbers, and addresses.

This app provides multiple processing modes so users can choose the privacy/quality tradeoff.

## Processing Modes

## 1) AI Mode (Configurable Provider)

When AI mode is enabled, selected card images are sent to your configured AI provider:

- Gemini
- OpenAI
- Anthropic
- OpenAI-compatible endpoint

Or, if configured, requests can go through the backend proxy.

Note: the backend proxy included in this repository currently supports Gemini extraction.

## 2) On-device OCR Mode

When On-device OCR is enabled, images are processed locally in the browser with Tesseract.js.

- Card images are not uploaded to an AI provider in this mode.
- OCR assets are loaded and cached in the browser. The app prefers self-hosted local assets, but may fall back to Tesseract default asset sources if local worker loading fails.

## Data Retention

By default, this app:

- does not store uploaded images or extracted contacts on an app-controlled server
- keeps uploaded images/results in memory for the current browser session
- stores user settings in `localStorage` (mode/provider/key/model/base URL/OCR language)
- may cache OCR assets in browser cache for faster subsequent runs

## Security Guidance

For public/production deployments:

- do not ship real provider keys in client bundles
- prefer backend proxying with auth and rate limiting
- avoid logging request bodies containing card data
- define/document retention policy (prefer in-memory processing only)

## User Responsibility

Ensure you have permission to process/store scanned contact data and comply with applicable laws and internal policies.
