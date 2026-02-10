import React from 'react';
import { CheckCircle, XCircle } from 'lucide-react';
import { ProcessedFrame } from '../types';

interface FrameGalleryProps {
  frames: ProcessedFrame[];
  onToggleFrame: (id: string) => void;
  onConfirm: () => void;
}

export const FrameGallery: React.FC<FrameGalleryProps> = ({ frames, onToggleFrame, onConfirm }) => {
  const selectedCount = frames.filter(f => f.isSelected).length;

  return (
    <div className="w-full max-w-7xl mx-auto p-4">
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 sticky top-0 z-10 bg-slate-50 py-4 border-b border-slate-200">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Select Frames</h2>
          <p className="text-slate-500">
            Frames found: {frames.length}. Selected: <span className="font-bold text-blue-600">{selectedCount}</span>.
            <br/>
            Deselect blurry or duplicate frames.
          </p>
        </div>
        <button
          onClick={onConfirm}
          disabled={selectedCount === 0}
          className="mt-4 md:mt-0 px-6 py-3 bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Process ({selectedCount})
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {frames.map((frame) => (
          <div
            key={frame.id}
            onClick={() => onToggleFrame(frame.id)}
            className={`relative group cursor-pointer rounded-lg overflow-hidden border-2 transition-all duration-200 aspect-[3/2] ${
              frame.isSelected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-200 opacity-60 grayscale'
            }`}
          >
            <img
              src={frame.imageUrl}
              alt={`Frame at ${frame.timestamp}s`}
              className="w-full h-full object-cover"
            />
            <div className="absolute top-2 right-2">
              {frame.isSelected ? (
                <CheckCircle className="w-6 h-6 text-blue-600 bg-white rounded-full fill-white" />
              ) : (
                <XCircle className="w-6 h-6 text-slate-400 bg-white rounded-full" />
              )}
            </div>
            <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs p-1 text-center opacity-0 group-hover:opacity-100 transition-opacity">
              {frame.timestamp.toFixed(1)} sec
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};