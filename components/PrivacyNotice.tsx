import React from "react";
import { ShieldAlert } from "lucide-react";
import { AIProvider, ProcessingMode } from "../utils/settings";

interface PrivacyNoticeProps {
  mode: ProcessingMode;
  aiProvider: AIProvider;
  onOpenSettings: () => void;
}

const providerLabels: Record<AIProvider, string> = {
  gemini: "Gemini",
  openai: "OpenAI",
  anthropic: "Anthropic",
  openai_compatible: "OpenAI-compatible provider",
};

export const PrivacyNotice: React.FC<PrivacyNoticeProps> = ({ mode, aiProvider, onOpenSettings }) => {
  const isOnDevice = mode === "on_device_ocr";

  return (
    <div className="max-w-2xl mx-auto px-6">
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-3">
            <div className="mt-0.5 text-slate-700">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold text-slate-900">Privacy Notice</div>
              <div className="text-sm text-slate-600 mt-1">
                Business cards contain personal data (PII). Your processing mode controls where images go.
              </div>
            </div>
          </div>
          <button
            onClick={onOpenSettings}
            className="px-3 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-medium"
          >
            Settings
          </button>
        </div>

        <div className="mt-4 text-sm text-slate-700">
          {isOnDevice ? (
            <div>
              <span className="font-medium">On-device OCR:</span> images are processed locally in your browser. No card
              images are uploaded. The OCR engine may download language assets on first use (to your browser cache).
            </div>
          ) : (
            <div>
              <span className="font-medium">AI ({providerLabels[aiProvider]}):</span> selected images are sent to your
              configured AI provider for extraction. (Included backend proxy currently supports Gemini.) Switch to On-device OCR for maximum privacy.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
