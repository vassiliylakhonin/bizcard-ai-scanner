import React, { useEffect, useState } from "react";
import { X } from "lucide-react";

const STORAGE_KEY = "bizcard_gemini_api_key";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [apiKey, setApiKey] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    try {
      const existing = window.localStorage.getItem(STORAGE_KEY) || "";
      setApiKey(existing);
      setSaved(false);
    } catch {
      // ignore storage failures
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const save = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, apiKey.trim());
      setSaved(true);
    } catch {
      setSaved(false);
    }
  };

  const clear = () => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setApiKey("");
    setSaved(true);
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
            <div className="text-sm text-slate-600">
              For a public demo, you can paste your own Gemini API key here. It is stored in your browser
              localStorage on this device only.
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">Gemini API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setSaved(false);
                }}
                placeholder="AIza..."
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                autoComplete="off"
              />
              <div className="text-xs text-slate-500">
                This overrides <code className="font-mono">VITE_GEMINI_API_KEY</code> for this browser session.
              </div>
            </div>

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
              Clear
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

export const SETTINGS_STORAGE_KEY = STORAGE_KEY;

