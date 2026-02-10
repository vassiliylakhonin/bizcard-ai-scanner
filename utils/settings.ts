export const STORAGE_KEYS = {
  geminiApiKey: "bizcard_gemini_api_key",
  processingMode: "bizcard_processing_mode",
  ocrLangs: "bizcard_ocr_langs",
} as const;

export type ProcessingMode = "ai" | "on_device_ocr";

export type OcrLangs = "eng" | "eng+rus";

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

export function getStoredGeminiApiKey(): string {
  if (typeof window === "undefined") return "";
  try {
    return (window.localStorage.getItem(STORAGE_KEYS.geminiApiKey) || "").trim();
  } catch {
    return "";
  }
}

export function setStoredGeminiApiKey(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEYS.geminiApiKey, key.trim());
  } catch {
    // ignore
  }
}

export function clearStoredGeminiApiKey() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEYS.geminiApiKey);
  } catch {
    // ignore
  }
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
    window.localStorage.removeItem(STORAGE_KEYS.processingMode);
    window.localStorage.removeItem(STORAGE_KEYS.ocrLangs);
  } catch {
    // ignore
  }
}

