import React, { useState } from 'react';
import { MediaUploader } from './components/MediaUploader';
import { FrameGallery } from './components/FrameGallery';
import { ResultsTable } from './components/ResultsTable';
import { AppStep, ProcessedFrame } from './types';
import { extractCardData, getExtractionPreflightError } from './services/geminiService';
import { Loader2 } from 'lucide-react';
import { Settings } from 'lucide-react';
import { SettingsModal } from './components/SettingsModal';
import { PrivacyNotice } from './components/PrivacyNotice';
import { AIProvider, getStoredAIProvider, getStoredProcessingMode, ProcessingMode } from './utils/settings';

const BATCH_SIZE = 3; // Number of concurrent requests

function normalizeErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) {
    const msg = err.message.trim();
    if (/RESOURCE_EXHAUSTED|quota exceeded|rate limit|too many requests|429/i.test(msg)) {
      const m = msg.match(/retry(?:\s+in)?\s*([\d.]+)\s*s/i) || msg.match(/"retryDelay":"(\d+)s"/i);
      const sec = m ? Math.max(1, Math.ceil(Number(m[1] || "0"))) : null;
      return sec
        ? `Rate limit reached. Retry in about ${sec}s, or process fewer cards at once.`
        : "Rate limit reached. Please wait a bit and retry.";
    }
    return msg;
  }
  if (typeof err === 'string' && err.trim()) return err;
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = String((err as { message?: unknown }).message || '').trim();
    if (msg) return msg;
  }
  try {
    const raw = JSON.stringify(err);
    if (raw && raw !== '{}') return raw;
  } catch {
    // ignore
  }
  return 'Unknown processing error';
}

export default function App() {
  const [step, setStep] = useState<AppStep>(AppStep.UPLOAD);
  const [frames, setFrames] = useState<ProcessedFrame[]>([]);
  const [processedCount, setProcessedCount] = useState(0);
  const selectedCount = frames.filter((f) => f.isSelected).length;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [processingMode, setProcessingMode] = useState<ProcessingMode>(() => getStoredProcessingMode());
  const [aiProvider, setAiProvider] = useState<AIProvider>(() => getStoredAIProvider());
  const isAiMode = processingMode === "ai";
  const aiProviderLabel = aiProvider === "openai_compatible"
    ? "OpenAI-compatible provider"
    : aiProvider.charAt(0).toUpperCase() + aiProvider.slice(1);

  const handleFramesExtracted = (extractedFrames: ProcessedFrame[]) => {
    setFrames(extractedFrames);
    setStep(AppStep.FRAME_SELECTION);
  };

  const toggleFrameSelection = (id: string) => {
    setFrames(prev => prev.map(f => f.id === id ? { ...f, isSelected: !f.isSelected } : f));
  };

  const processBatch = async (itemsToProcess: ProcessedFrame[]) => {
    // A simple semaphore/batch queue implementation
    const queue = [...itemsToProcess];
    const batchSize = processingMode === "on_device_ocr"
      ? 1
      : aiProvider === "gemini"
        ? 1
        : BATCH_SIZE;
    
    const worker = async () => {
      while (queue.length > 0) {
        const frame = queue.shift();
        if (!frame) break;

        // Update status to processing
        setFrames(prev => prev.map(f => f.id === frame.id ? { ...f, status: 'processing', errorMessage: undefined } : f));

        try {
          const data = await extractCardData(frame.imageUrl, { mode: processingMode });
          setFrames(prev => prev.map(f => f.id === frame.id ? { ...f, status: 'completed', data, errorMessage: undefined } : f));
        } catch (err) {
          console.error("Frame processing error:", err);
          const errorMessage = normalizeErrorMessage(err);
          setFrames(prev => prev.map(f => f.id === frame.id ? { ...f, status: 'error', errorMessage } : f));
        } finally {
          setProcessedCount(c => c + 1);
        }
      }
    };

    // Start workers
    const workers = Array(batchSize).fill(null).map(() => worker());
    await Promise.all(workers);
  };

  const startProcessing = async () => {
    const preflightError = getExtractionPreflightError(processingMode);
    if (preflightError) {
      alert(preflightError);
      setSettingsOpen(true);
      return;
    }

    setStep(AppStep.PROCESSING);
    setProcessedCount(0);
    const selectedFrames = frames.filter(f => f.isSelected);
    await processBatch(selectedFrames);
    setStep(AppStep.RESULTS);
  };

  const resetApp = () => {
    setFrames([]);
    setStep(AppStep.UPLOAD);
    setProcessedCount(0);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={() => {
          setProcessingMode(getStoredProcessingMode());
          setAiProvider(getStoredAIProvider());
        }}
      />
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <button
            onClick={resetApp}
            className="flex items-center space-x-2 rounded-lg px-2 py-1 -ml-2 hover:bg-slate-100 transition-colors"
            title="Back to main page"
            aria-label="Back to main page"
          >
            <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center text-white font-bold">
              PF
            </div>
            <h1 className="text-xl font-bold text-slate-900">Privacy-First Card Scanner</h1>
          </button>
          <div className="flex items-center space-x-3">
            <div className="text-sm text-slate-500 hidden sm:block">
              {step === AppStep.UPLOAD && "Step 1: Upload Media"}
              {step === AppStep.FRAME_SELECTION && "Step 2: Select Items"}
              {step === AppStep.PROCESSING && `Step 3: ${isAiMode ? "AI Extraction" : "OCR Extraction"}`}
              {step === AppStep.RESULTS && "Step 4: Export"}
            </div>
            <button
              onClick={() => setSettingsOpen(true)}
              className="inline-flex items-center px-3 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
              title="Settings"
            >
              <Settings className="w-4 h-4 mr-2" />
              <span className="text-sm font-medium">Settings</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center">
        {step === AppStep.UPLOAD && (
          <div className="w-full">
            <div className="text-center mb-10 mt-10 px-4">
              <h1 className="text-4xl font-extrabold text-slate-900 mb-4 tracking-tight">
                Digitize Your Business Cards
              </h1>
              <p className="text-lg text-slate-600 max-w-2xl mx-auto">
                Upload a video or photos of your business cards. Extract contacts with your chosen AI provider (optional) or run fully on-device OCR (no uploads), then export to Excel/CSV/vCard.
              </p>
            </div>
            <PrivacyNotice mode={processingMode} aiProvider={aiProvider} onOpenSettings={() => setSettingsOpen(true)} />
            <MediaUploader onFramesExtracted={handleFramesExtracted} />
          </div>
        )}

        {step === AppStep.FRAME_SELECTION && (
          <FrameGallery 
            frames={frames} 
            onToggleFrame={toggleFrameSelection} 
            onConfirm={startProcessing} 
          />
        )}

        {step === AppStep.PROCESSING && (
          <div className="text-center p-8 bg-white rounded-2xl shadow-xl max-w-md w-full mx-4">
            <div className="relative mb-6">
              <div className="absolute inset-0 bg-blue-100 rounded-full animate-pulse opacity-50"></div>
              <Loader2 className="w-16 h-16 text-blue-600 animate-spin relative z-10 mx-auto" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Processing Images</h2>
            <p className="text-slate-500 mb-6">
              {isAiMode
                ? `${aiProviderLabel} is extracting contact details from your selected cards. This may take a moment.`
                : "On-device OCR is extracting contact details from your selected cards. This may take a moment."}
            </p>
            
            <div className="w-full bg-slate-100 rounded-full h-4 mb-2 overflow-hidden">
              <div 
                className="bg-blue-600 h-full transition-all duration-300 ease-out"
                style={{ width: `${selectedCount === 0 ? 0 : (processedCount / selectedCount) * 100}%` }}
              ></div>
            </div>
            <div className="flex justify-between text-sm text-slate-500 font-medium">
              <span>Processed</span>
              <span>{processedCount} / {selectedCount}</span>
            </div>
          </div>
        )}

        {step === AppStep.RESULTS && (
          <ResultsTable
            frames={frames}
            onRetry={resetApp}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        )}
      </main>

      <footer className="bg-white border-t border-slate-200 py-6 mt-auto">
        <div className="max-w-7xl mx-auto px-4 text-center text-slate-400 text-sm">
          Configurable AI providers (optional), Tesseract.js (optional) & React
        </div>
      </footer>
    </div>
  );
}
