import { GoogleGenAI, Type } from "@google/genai";
import { BusinessCard } from "../types";
import {
  AIProvider,
  getStoredAIBaseUrl,
  getStoredAIApiKey,
  getStoredAIModel,
  getStoredAIProvider,
  getStoredOcrLangs,
  getStoredProcessingMode,
  OcrLangs,
  ProcessingMode,
} from "../utils/settings";
import { extractCardDataOnDeviceOcr } from "./onDeviceOcrService";

const CARD_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING, description: "Full name of the person" },
    title: { type: Type.STRING, description: "Job title or position" },
    company: { type: Type.STRING, description: "Company name" },
    email: { type: Type.STRING, description: "Email address" },
    phone: { type: Type.STRING, description: "Phone number" },
    website: { type: Type.STRING, description: "Website URL" },
    address: { type: Type.STRING, description: "Physical address" },
  },
  required: ["name", "company"],
};

const SYSTEM_PROMPT =
  "You are an expert OCR assistant specialized in digitizing business cards. Output only JSON and keep unknown fields as empty strings.";

const EXTRACTION_PROMPT =
  "Analyze this business card image and extract contact details into JSON with keys: name, title, company, email, phone, website, address. Be precise with Cyrillic and Latin characters. If a field is missing, use an empty string.";

type ExtractOptions = {
  mode?: ProcessingMode;
  ocrLangs?: OcrLangs;
};

type ProviderConfig = {
  provider: AIProvider;
  apiKey: string;
  model: string;
  baseUrl: string;
};

class ProviderRateLimitError extends Error {
  retryMs: number;

  constructor(message: string, retryMs: number) {
    super(message);
    this.name = "ProviderRateLimitError";
    this.retryMs = Math.max(1000, Math.min(retryMs, 120000));
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err || "");
  }
}

function parseRetryDelayMsFromText(text: string): number | null {
  if (!text) return null;
  const m1 = text.match(/retry(?:\s+in)?\s*([\d.]+)\s*s/i);
  if (m1) {
    const secs = Number(m1[1]);
    if (Number.isFinite(secs) && secs > 0) return Math.ceil(secs * 1000);
  }
  const m2 = text.match(/"retryDelay"\s*:\s*"(\d+)s"/i);
  if (m2) {
    const secs = Number(m2[1]);
    if (Number.isFinite(secs) && secs > 0) return secs * 1000;
  }
  return null;
}

function parseRetryDelayMsFromPayload(payload: Record<string, unknown>, fallbackText = ""): number | null {
  const details = Array.isArray(payload?.error && (payload.error as Record<string, unknown>).details)
    ? ((payload.error as Record<string, unknown>).details as Array<Record<string, unknown>>)
    : [];
  for (const d of details) {
    const retry = String(d?.retryDelay || "").trim();
    const fromDetail = parseRetryDelayMsFromText(retry);
    if (fromDetail) return fromDetail;
  }

  const errMsg = String(
    (payload?.error && (payload.error as Record<string, unknown>).message) ||
    payload?.message ||
    "",
  );
  return parseRetryDelayMsFromText(errMsg) || parseRetryDelayMsFromText(fallbackText);
}

function isRateLimitedMessage(text: string): boolean {
  return /429|resource_exhausted|quota exceeded|rate limit|too many requests/i.test(text || "");
}

function normalizeRateLimitError(provider: AIProvider, err: unknown): ProviderRateLimitError | null {
  if (err instanceof ProviderRateLimitError) return err;

  const text = toMessage(err);
  if (!isRateLimitedMessage(text)) return null;

  const retryMs = parseRetryDelayMsFromText(text) || 30000;
  return new ProviderRateLimitError(
    `${providerLabel(provider)} rate limit reached. Retry in about ${Math.ceil(retryMs / 1000)}s or process fewer cards at once.`,
    retryMs,
  );
}

async function withRateLimitRetries<T>(
  provider: AIProvider,
  fn: () => Promise<T>,
  maxRetries = 3,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const rateErr = normalizeRateLimitError(provider, err);
      if (!rateErr) throw err;
      if (attempt >= maxRetries) throw rateErr;
      await sleep(rateErr.retryMs + attempt * 500);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("AI request failed.");
}

function envForProvider(provider: AIProvider) {
  if (provider === "gemini") {
    return {
      apiKey: (import.meta.env.VITE_GEMINI_API_KEY || "").trim(),
      model: (import.meta.env.VITE_GEMINI_MODEL || "").trim(),
      baseUrl: "",
    };
  }

  if (provider === "openai") {
    return {
      apiKey: (import.meta.env.VITE_OPENAI_API_KEY || "").trim(),
      model: (import.meta.env.VITE_OPENAI_MODEL || "").trim(),
      baseUrl: (import.meta.env.VITE_OPENAI_BASE_URL || "https://api.openai.com/v1").trim(),
    };
  }

  if (provider === "anthropic") {
    return {
      apiKey: (import.meta.env.VITE_ANTHROPIC_API_KEY || "").trim(),
      model: (import.meta.env.VITE_ANTHROPIC_MODEL || "").trim(),
      baseUrl: (import.meta.env.VITE_ANTHROPIC_BASE_URL || "https://api.anthropic.com").trim(),
    };
  }

  return {
    apiKey: ((import.meta.env.VITE_OPENAI_COMPAT_API_KEY || "").trim() || (import.meta.env.VITE_OPENAI_API_KEY || "").trim()),
    model: (import.meta.env.VITE_OPENAI_COMPAT_MODEL || "").trim(),
    baseUrl: (import.meta.env.VITE_OPENAI_COMPAT_BASE_URL || "").trim(),
  };
}

function getProviderConfig(): ProviderConfig {
  const provider = getStoredAIProvider();
  const env = envForProvider(provider);

  const storedKey = getStoredAIApiKey();
  const storedModel = getStoredAIModel(provider);
  const storedBaseUrl = getStoredAIBaseUrl(provider);

  return {
    provider,
    apiKey: storedKey || env.apiKey,
    model: storedModel || env.model,
    baseUrl: (storedBaseUrl || env.baseUrl || "").replace(/\/$/, ""),
  };
}

function providerLabel(provider: AIProvider): string {
  if (provider === "openai") return "OpenAI";
  if (provider === "anthropic") return "Anthropic";
  if (provider === "openai_compatible") return "OpenAI-compatible";
  return "Gemini";
}

function parseJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("AI returned an empty response.");

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    const first = candidate.indexOf("{");
    const last = candidate.lastIndexOf("}");
    if (first >= 0 && last > first) {
      return JSON.parse(candidate.slice(first, last + 1));
    }
    throw new Error("AI response was not valid JSON.");
  }
}

function toBusinessCard(data: Record<string, unknown>): BusinessCard {
  const get = (key: string) => String(data[key] || "").trim();
  return {
    id: crypto.randomUUID(),
    name: get("name"),
    title: get("title"),
    company: get("company"),
    email: get("email"),
    phone: get("phone"),
    website: get("website"),
    address: get("address"),
  };
}

async function extractViaGemini(cleanBase64: string, config: ProviderConfig): Promise<BusinessCard> {
  const ai = new GoogleGenAI({ apiKey: config.apiKey });
  const response = await ai.models.generateContent({
    model: config.model,
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: cleanBase64,
          },
        },
        {
          text: EXTRACTION_PROMPT,
        },
      ],
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: CARD_SCHEMA,
      systemInstruction: SYSTEM_PROMPT,
    },
  });

  const text = response.text;
  if (!text) throw new Error("No response from Gemini.");
  return toBusinessCard(parseJsonObject(text));
}

async function extractViaOpenAICompatible(base64Image: string, config: ProviderConfig): Promise<BusinessCard> {
  if (!config.baseUrl) {
    throw new Error("Missing base URL for OpenAI-compatible provider.");
  }

  const endpoint = `${config.baseUrl}/chat/completions`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: `${EXTRACTION_PROMPT} Return only JSON.` },
            {
              type: "image_url",
              image_url: { url: base64Image },
            },
          ],
        },
      ],
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 429) {
      const retryMs = parseRetryDelayMsFromPayload(payload) || 30000;
      throw new ProviderRateLimitError(
        `${providerLabel(config.provider)} rate limit reached. Retry in about ${Math.ceil(retryMs / 1000)}s.`,
        retryMs,
      );
    }
    throw new Error(
      payload?.error?.message || payload?.error || `Provider error (${response.status})`,
    );
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Provider returned no content.");

  const text = typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content.map((block) => block?.text || "").join("\n")
      : "";

  return toBusinessCard(parseJsonObject(text));
}

async function extractViaAnthropic(cleanBase64: string, config: ProviderConfig): Promise<BusinessCard> {
  if (!config.baseUrl) {
    throw new Error("Missing Anthropic base URL.");
  }

  const endpoint = `${config.baseUrl}/v1/messages`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 400,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: cleanBase64,
              },
            },
            {
              type: "text",
              text: `${EXTRACTION_PROMPT} Return only JSON.`,
            },
          ],
        },
      ],
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 429) {
      const retryMs = parseRetryDelayMsFromPayload(payload) || 30000;
      throw new ProviderRateLimitError(
        `${providerLabel(config.provider)} rate limit reached. Retry in about ${Math.ceil(retryMs / 1000)}s.`,
        retryMs,
      );
    }
    throw new Error(
      payload?.error?.message || payload?.error?.type || payload?.error || `Anthropic error (${response.status})`,
    );
  }

  const blocks = Array.isArray(payload?.content) ? payload.content : [];
  const text = blocks
    .filter((b) => b?.type === "text")
    .map((b) => String(b?.text || ""))
    .join("\n")
    .trim();

  if (!text) throw new Error("Anthropic returned no text content.");
  return toBusinessCard(parseJsonObject(text));
}

export const getExtractionPreflightError = (modeArg?: ProcessingMode): string | null => {
  const mode = modeArg || getStoredProcessingMode();
  if (mode === "on_device_ocr") return null;

  const config = getProviderConfig();
  const useBackend = (import.meta.env.VITE_USE_BACKEND || "").toLowerCase() === "true";
  const backendUrl = (import.meta.env.VITE_BACKEND_URL || "").trim().replace(/\/$/, "");
  const backendEnabled = config.provider === "gemini" && (useBackend || backendUrl);
  if (backendEnabled) return null;

  if (!config.apiKey) {
    return `Missing ${providerLabel(config.provider)} API key. Add it in Settings or configure env vars.`;
  }

  if (config.provider === "openai_compatible" && !config.baseUrl) {
    return "Missing base URL for OpenAI-compatible provider. Set it in Settings (example: https://api.openai.com/v1).";
  }

  return null;
};

export const extractCardData = async (base64Image: string, options?: ExtractOptions): Promise<BusinessCard> => {
  const mode = options?.mode || getStoredProcessingMode();
  if (mode === "on_device_ocr") {
    const langs = options?.ocrLangs || getStoredOcrLangs();
    return await extractCardDataOnDeviceOcr(base64Image, langs);
  }

  const cleanBase64 = base64Image.split(",")[1] || base64Image;
  const config = getProviderConfig();

  try {
    const useBackend = (import.meta.env.VITE_USE_BACKEND || "").toLowerCase() === "true";
    const backendUrl = (import.meta.env.VITE_BACKEND_URL || "").trim().replace(/\/$/, "");
    const backendEnabled = config.provider === "gemini" && (useBackend || backendUrl);

    if (backendEnabled) {
      return await withRateLimitRetries("gemini", async () => {
        const endpoint = backendUrl ? `${backendUrl}/api/extract` : "/api/extract";
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ base64Image }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          const retryMs = parseRetryDelayMsFromPayload(payload, String(payload?.error || ""));
          if (retryMs || res.status === 429 || isRateLimitedMessage(String(payload?.error || ""))) {
            throw new ProviderRateLimitError(
              `Gemini rate limit reached. Retry in about ${Math.ceil((retryMs || 30000) / 1000)}s.`,
              retryMs || 30000,
            );
          }
          throw new Error(payload?.error || `Backend error (${res.status})`);
        }
        return toBusinessCard(payload);
      });
    }

    if (config.provider === "gemini") {
      return await withRateLimitRetries(config.provider, async () => extractViaGemini(cleanBase64, config));
    }

    if (config.provider === "openai" || config.provider === "openai_compatible") {
      return await withRateLimitRetries(config.provider, async () => extractViaOpenAICompatible(base64Image, config));
    }

    return await withRateLimitRetries(config.provider, async () => extractViaAnthropic(cleanBase64, config));
  } catch (error) {
    console.error("AI Extraction Error:", error);
    throw error;
  }
};
