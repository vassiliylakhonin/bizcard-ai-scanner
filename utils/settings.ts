export const STORAGE_KEYS = {
  geminiApiKey: "bizcard_gemini_api_key",
  processingMode: "bizcard_processing_mode",
  ocrLangs: "bizcard_ocr_langs",
  aiProvider: "bizcard_ai_provider",
  aiApiKey: "bizcard_ai_api_key",
  aiModel: "bizcard_ai_model",
  aiBaseUrl: "bizcard_ai_base_url",
} as const;

export type ProcessingMode = "ai" | "on_device_ocr";
export type AIProvider = "gemini" | "openai" | "anthropic" | "openai_compatible";

export type OcrLangs = "eng" | "eng+rus";

const DEFAULT_MODEL_BY_PROVIDER: Record<AIProvider, string> = {
  gemini: "gemini-3-flash-preview",
  openai: "gpt-4.1-mini",
  anthropic: "claude-3-5-sonnet-latest",
  openai_compatible: "gpt-4o-mini",
};

const DEFAULT_BASE_URL_BY_PROVIDER: Partial<Record<AIProvider, string>> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com",
};

export function getDefaultModel(provider: AIProvider): string {
  return DEFAULT_MODEL_BY_PROVIDER[provider];
}

export function getDefaultBaseUrl(provider: AIProvider): string {
  return DEFAULT_BASE_URL_BY_PROVIDER[provider] || "";
}

export function getStoredProcessingMode(): ProcessingMode {
  if (typeof window === "undefined") return "ai";
  try {
    const raw = (window.localStorage.getItem(STORAGE_KEYS.processingMode) || "").trim();
    if (raw === "on_device_ocr") return "on_device_ocr";
    return "ai";
  } catch {
    return "ai";
  }
}

export function setStoredProcessingMode(mode: ProcessingMode) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEYS.processingMode, mode);
  } catch {
    // ignore
  }
}

export function getStoredAIProvider(): AIProvider {
  if (typeof window === "undefined") return "gemini";
  try {
    const raw = (window.localStorage.getItem(STORAGE_KEYS.aiProvider) || "").trim();
    if (raw === "openai" || raw === "anthropic" || raw === "openai_compatible" || raw === "gemini") return raw;
    return "gemini";
  } catch {
    return "gemini";
  }
}

export function setStoredAIProvider(provider: AIProvider) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEYS.aiProvider, provider);
  } catch {
    // ignore
  }
}

export function getStoredAIApiKey(): string {
  if (typeof window === "undefined") return "";
  try {
    const raw = (window.localStorage.getItem(STORAGE_KEYS.aiApiKey) || "").trim();
    if (raw) return raw;
    // Backward compatibility with old Gemini-only key.
    return (window.localStorage.getItem(STORAGE_KEYS.geminiApiKey) || "").trim();
  } catch {
    return "";
  }
}

export function setStoredAIApiKey(key: string) {
  if (typeof window === "undefined") return;
  try {
    const trimmed = key.trim();
    window.localStorage.setItem(STORAGE_KEYS.aiApiKey, trimmed);
    // Keep legacy key in sync for older code paths.
    window.localStorage.setItem(STORAGE_KEYS.geminiApiKey, trimmed);
  } catch {
    // ignore
  }
}

export function clearStoredAIApiKey() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEYS.aiApiKey);
    window.localStorage.removeItem(STORAGE_KEYS.geminiApiKey);
  } catch {
    // ignore
  }
}

export function getStoredAIModel(provider?: AIProvider): string {
  const resolvedProvider = provider || getStoredAIProvider();
  if (typeof window === "undefined") return getDefaultModel(resolvedProvider);
  try {
    const raw = (window.localStorage.getItem(STORAGE_KEYS.aiModel) || "").trim();
    return raw || getDefaultModel(resolvedProvider);
  } catch {
    return getDefaultModel(resolvedProvider);
  }
}

export function setStoredAIModel(model: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEYS.aiModel, model.trim());
  } catch {
    // ignore
  }
}

export function getStoredAIBaseUrl(provider?: AIProvider): string {
  const resolvedProvider = provider || getStoredAIProvider();
  if (typeof window === "undefined") return getDefaultBaseUrl(resolvedProvider);
  try {
    const raw = (window.localStorage.getItem(STORAGE_KEYS.aiBaseUrl) || "").trim();
    return raw || getDefaultBaseUrl(resolvedProvider);
  } catch {
    return getDefaultBaseUrl(resolvedProvider);
  }
}

export function setStoredAIBaseUrl(url: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEYS.aiBaseUrl, url.trim());
  } catch {
    // ignore
  }
}

export function getStoredGeminiApiKey(): string {
  return getStoredAIApiKey();
}

export function setStoredGeminiApiKey(key: string) {
  setStoredAIApiKey(key);
}

export function clearStoredGeminiApiKey() {
  clearStoredAIApiKey();
}

export function getStoredOcrLangs(): OcrLangs {
  if (typeof window === "undefined") return "eng";
  try {
    const raw = (window.localStorage.getItem(STORAGE_KEYS.ocrLangs) || "").trim();
    if (raw === "eng+rus") return "eng+rus";
    return "eng";
  } catch {
    return "eng";
  }
}

export function setStoredOcrLangs(langs: OcrLangs) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEYS.ocrLangs, langs);
  } catch {
    // ignore
  }
}

export function clearAllLocalSettings() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEYS.geminiApiKey);
    window.localStorage.removeItem(STORAGE_KEYS.aiProvider);
    window.localStorage.removeItem(STORAGE_KEYS.aiApiKey);
    window.localStorage.removeItem(STORAGE_KEYS.aiModel);
    window.localStorage.removeItem(STORAGE_KEYS.aiBaseUrl);
    window.localStorage.removeItem(STORAGE_KEYS.processingMode);
    window.localStorage.removeItem(STORAGE_KEYS.ocrLangs);
  } catch {
    // ignore
  }
}
