import React, { useCallback, useState } from 'react';
import { Upload, FileVideo, Loader2 } from 'lucide-react';
import { extractFramesFromVideo } from '../utils/videoUtils';
import { ProcessedFrame } from '../types';

interface VideoUploaderProps {
  onFramesExtracted: (frames: ProcessedFrame[]) => void;
}

export const VideoUploader: React.FC<VideoUploaderProps> = ({ onFramesExtracted }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  const processVideo = async (file: File) => {
    setIsProcessing(true);
    setProgress(0);
    try {
      // Extract frame every 2 seconds. Ideally this is configurable.
      // For 300 cards, if user spends 2 sec per card, video is 10 mins (600s).
      // 600s / 2s = 300 frames. Perfect.
      const rawFrames = await extractFramesFromVideo(file, 2.0, (p) => setProgress(Math.round(p)));
      
      const processedFrames: ProcessedFrame[] = rawFrames.map((f) => ({
        id: crypto.randomUUID(),
        imageUrl: f.imageUrl,
        timestamp: f.timestamp,
        isSelected: true, // Default to selected
        status: 'pending'
      }));
      
      onFramesExtracted(processedFrames);
    } catch (err) {
      console.error(err);
      alert("Video processing error. Please try another file.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('video/')) {
      processVideo(file);
    } else {
      alert("Please upload a video file.");
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processVideo(file);
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-6">
      <div
        className={`relative border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
          isDragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-slate-400 bg-white'
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        {isProcessing ? (
          <div className="flex flex-col items-center justify-center space-y-4">
            <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
            <div className="text-lg font-medium text-slate-700">Processing video...</div>
            <div className="w-full max-w-xs bg-slate-200 rounded-full h-2.5">
              <div 
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <p className="text-sm text-slate-500">{progress}% complete</p>
          </div>
        ) : (
          <>
            <div className="flex justify-center mb-4">
              <div className="p-4 bg-blue-100 rounded-full">
                <FileVideo className="w-8 h-8 text-blue-600" />
              </div>
            </div>
            <h3 className="text-xl font-semibold text-slate-900 mb-2">
              Upload Business Card Video
            </h3>
            <p className="text-slate-500 mb-6">
              Drag and drop file here or click to select.
              <br />
              <span className="text-sm text-slate-400">Recommended: Record 2-3 seconds per card.</span>
            </p>
            <input
              type="file"
              accept="video/*"
              className="hidden"
              id="video-upload"
              onChange={handleFileChange}
            />
            <label
              htmlFor="video-upload"
              className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <Upload className="w-5 h-5 mr-2" />
              Select Video
            </label>
          </>
        )}
      </div>
    </div>
  );
};