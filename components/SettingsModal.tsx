import React, { useEffect, useState } from "react";
import { Shield, X } from "lucide-react";
import {
  AIProvider,
  clearAllLocalSettings,
  clearStoredAIApiKey,
  getDefaultBaseUrl,
  getDefaultModel,
  getStoredAIBaseUrl,
  getStoredAIApiKey,
  getStoredAIModel,
  getStoredAIProvider,
  getStoredOcrLangs,
  getStoredProcessingMode,
  OcrLangs,
  ProcessingMode,
  setStoredAIBaseUrl,
  setStoredAIApiKey,
  setStoredAIModel,
  setStoredAIProvider,
  setStoredOcrLangs,
  setStoredProcessingMode,
} from "../utils/settings";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onSaved }) => {
  const [apiKey, setApiKey] = useState("");
  const [provider, setProvider] = useState<AIProvider>("gemini");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [mode, setMode] = useState<ProcessingMode>("ai");
  const [ocrLangs, setOcrLangs] = useState<OcrLangs>("eng");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    try {
      const p = getStoredAIProvider();
      setProvider(p);
      setApiKey(getStoredAIApiKey());
      setModel(getStoredAIModel(p));
      setBaseUrl(getStoredAIBaseUrl(p));
      setMode(getStoredProcessingMode());
      setOcrLangs(getStoredOcrLangs());
      setSaved(false);
    } catch {
      // ignore storage failures
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const save = () => {
    setStoredProcessingMode(mode);
    setStoredOcrLangs(ocrLangs);
    setStoredAIProvider(provider);
    setStoredAIApiKey(apiKey);
    setStoredAIModel(model);
    setStoredAIBaseUrl(baseUrl);
    setSaved(true);
    onSaved?.();
  };

  const clear = () => {
    clearStoredAIApiKey();
    setApiKey("");
    setSaved(true);
    onSaved?.();
  };

  const clearAll = () => {
    clearAllLocalSettings();
    setApiKey("");
    setProvider("gemini");
    setModel(getDefaultModel("gemini"));
    setBaseUrl(getDefaultBaseUrl("gemini"));
    setMode("ai");
    setOcrLangs("eng");
    setSaved(true);
    onSaved?.();
  };

  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl border border-slate-200">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
            <div className="font-semibold text-slate-900">Settings</div>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-slate-100 text-slate-600"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="px-5 py-4 space-y-4">
            <div className="flex items-start space-x-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
              <div className="mt-0.5 text-slate-600">
                <Shield className="w-5 h-5" />
              </div>
              <div className="text-sm text-slate-700">
                <div className="font-medium text-slate-900">Privacy</div>
                <div className="text-slate-600">
                  Business cards contain PII (names, emails, phone numbers). Choose how you want your data processed.
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium text-slate-700">Processing Mode</div>
              <label className="flex items-start space-x-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "ai"}
                  onChange={() => {
                    setMode("ai");
                    setStoredProcessingMode("ai");
                    setSaved(true);
                    onSaved?.();
                  }}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium">AI (configurable provider)</span>
                  <span className="block text-xs text-slate-500">
                    Selected images are sent to your chosen provider for structured extraction. (Included backend proxy currently supports Gemini.)
                  </span>
                </span>
              </label>

              <label className="flex items-start space-x-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "on_device_ocr"}
                  onChange={() => {
                    setMode("on_device_ocr");
                    setStoredProcessingMode("on_device_ocr");
                    setSaved(true);
                    onSaved?.();
                  }}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium">On-device OCR (no uploads)</span>
                  <span className="block text-xs text-slate-500">
                    Images are processed locally in your browser. No card images are uploaded.
                  </span>
                </span>
              </label>
            </div>

            {mode === "on_device_ocr" && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">OCR Languages</label>
                <select
                  value={ocrLangs}
                  onChange={(e) => {
                    const next = e.target.value as OcrLangs;
                    setOcrLangs(next);
                    setStoredOcrLangs(next);
                    setSaved(true);
                    onSaved?.();
                  }}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white"
                >
                  <option value="eng">English</option>
                  <option value="eng+rus">English + Russian</option>
                </select>
                <div className="text-xs text-slate-500">
                  On first use, the OCR engine may download language/model assets from this site to your browser cache.
                </div>
              </div>
            )}

            {mode === "ai" && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">AI Provider</label>
                <select
                  value={provider}
                  onChange={(e) => {
                    const next = e.target.value as AIProvider;
                    setProvider(next);
                    setModel(getDefaultModel(next));
                    setBaseUrl(getDefaultBaseUrl(next));
                    setStoredAIProvider(next);
                    setStoredAIModel(getDefaultModel(next));
                    setStoredAIBaseUrl(getDefaultBaseUrl(next));
                    setSaved(true);
                    onSaved?.();
                  }}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white"
                >
                  <option value="gemini">Gemini</option>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="openai_compatible">OpenAI-compatible</option>
                </select>

                <label className="block text-sm font-medium text-slate-700">Model</label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => {
                    setModel(e.target.value);
                    setSaved(false);
                  }}
                  placeholder={getDefaultModel(provider)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                  autoComplete="off"
                />

                {(provider === "openai" || provider === "anthropic" || provider === "openai_compatible") && (
                  <>
                    <label className="block text-sm font-medium text-slate-700">
                      {provider === "openai_compatible" ? "Base URL (required)" : "Base URL (optional)"}
                    </label>
                    <input
                      type="text"
                      value={baseUrl}
                      onChange={(e) => {
                        setBaseUrl(e.target.value);
                        setSaved(false);
                      }}
                      placeholder={getDefaultBaseUrl(provider) || "https://api.example.com/v1"}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                      autoComplete="off"
                    />
                  </>
                )}

                <label className="block text-sm font-medium text-slate-700">API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setSaved(false);
                  }}
                  placeholder={provider === "gemini" ? "AIza..." : "sk-..."}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                  autoComplete="off"
                />
                <div className="text-xs text-slate-500">
                  Stored in your browser localStorage for this device only. You can also provide env vars for each provider.
                </div>
              </div>
            )}

            {saved && (
              <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                Saved.
              </div>
            )}
          </div>

          <div className="px-5 py-4 border-t border-slate-200 flex items-center justify-end space-x-2">
            <button
              onClick={clear}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              Clear Key
            </button>
            <button
              onClick={clearAll}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
              title="Clears key, mode, and OCR language settings"
            >
              Reset
            </button>
            <button
              onClick={save}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
