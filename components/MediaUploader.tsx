import React, { useCallback, useState } from 'react';
import { Upload, FileVideo, Image as ImageIcon, Loader2 } from 'lucide-react';
import { extractFramesFromVideo } from '../utils/videoUtils';
import { ProcessedFrame } from '../types';

interface MediaUploaderProps {
  onFramesExtracted: (frames: ProcessedFrame[]) => void;
}

export const MediaUploader: React.FC<MediaUploaderProps> = ({ onFramesExtracted }) => {
  const [activeTab, setActiveTab] = useState<'video' | 'photo'>('photo');
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  const readFileAsBase64 = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }, []);

  const processVideo = useCallback(async (file: File) => {
    setIsProcessing(true);
    setProgress(0);
    try {
      const rawFrames = await extractFramesFromVideo(file, 2.0, (p) => setProgress(Math.round(p)));
      
      const processedFrames: ProcessedFrame[] = rawFrames.map((f) => ({
        id: crypto.randomUUID(),
        imageUrl: f.imageUrl,
        timestamp: f.timestamp,
        isSelected: true,
        status: 'pending'
      }));
      
      onFramesExtracted(processedFrames);
    } catch (err) {
      console.error(err);
      alert("Video processing error. Please try another file.");
    } finally {
      setIsProcessing(false);
    }
  }, [onFramesExtracted]);

  const processPhotos = useCallback(async (files: File[]) => {
    setIsProcessing(true);
    setProgress(0);
    try {
      const processedFrames: ProcessedFrame[] = [];
      const total = files.length;
      
      for (let i = 0; i < total; i++) {
        const file = files[i];
        if (!file.type.startsWith('image/')) continue;
        
        const imageUrl = await readFileAsBase64(file);
        processedFrames.push({
          id: crypto.randomUUID(),
          imageUrl: imageUrl,
          timestamp: 0, // Photos don't have timestamps
          isSelected: true,
          status: 'pending'
        });
        setProgress(Math.round(((i + 1) / total) * 100));
      }
      
      onFramesExtracted(processedFrames);
    } catch (err) {
      console.error(err);
      alert("Error processing photos.");
    } finally {
      setIsProcessing(false);
    }
  }, [onFramesExtracted, readFileAsBase64]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files: File[] = Array.from(e.dataTransfer.files);
    
    if (files.length === 0) return;

    const firstType = files[0].type;
    
    // Auto-detect type based on first file
    if (firstType.startsWith('video/')) {
      setActiveTab('video');
      processVideo(files[0]);
    } else if (firstType.startsWith('image/')) {
      setActiveTab('photo');
      processPhotos(files);
    } else {
      alert("Please upload video or image files.");
    }
  }, [processPhotos, processVideo]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (activeTab === 'video') {
      processVideo(files[0]);
    } else {
      processPhotos(Array.from(files));
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-6">
      <div className="flex justify-center mb-6 space-x-4">
        <button
          onClick={() => setActiveTab('video')}
          className={`px-6 py-2 rounded-full font-medium transition-all ${
            activeTab === 'video' 
              ? 'bg-blue-600 text-white shadow-md' 
              : 'bg-white text-slate-600 hover:bg-slate-100'
          }`}
        >
          <div className="flex items-center space-x-2">
            <FileVideo className="w-4 h-4" />
            <span>Video Mode</span>
          </div>
        </button>
        <button
          onClick={() => setActiveTab('photo')}
          className={`px-6 py-2 rounded-full font-medium transition-all ${
            activeTab === 'photo' 
              ? 'bg-blue-600 text-white shadow-md' 
              : 'bg-white text-slate-600 hover:bg-slate-100'
          }`}
        >
          <div className="flex items-center space-x-2">
            <ImageIcon className="w-4 h-4" />
            <span>Photo Mode</span>
          </div>
        </button>
      </div>

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
            <div className="text-lg font-medium text-slate-700">
              Processing {activeTab === 'video' ? 'video' : 'photos'}...
            </div>
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
                {activeTab === 'video' ? (
                  <FileVideo className="w-8 h-8 text-blue-600" />
                ) : (
                  <ImageIcon className="w-8 h-8 text-blue-600" />
                )}
              </div>
            </div>
            <h3 className="text-xl font-semibold text-slate-900 mb-2">
              {activeTab === 'video' ? 'Upload Business Card Video' : 'Upload Business Card Photos'}
            </h3>
            <p className="text-slate-500 mb-6">
              {activeTab === 'video' ? (
                <>
                  Drag and drop a video file here.<br />
                  <span className="text-sm text-slate-400">Recommended: Record 2-3 seconds per card.</span>
                </>
              ) : (
                <>
                  Drag and drop one or multiple images.<br />
                  <span className="text-sm text-slate-400">Supports JPG, PNG, WEBP.</span>
                </>
              )}
            </p>
            <input
              type="file"
              accept={activeTab === 'video' ? "video/*" : "image/*"}
              multiple={activeTab === 'photo'}
              className="hidden"
              id="media-upload"
              onChange={handleFileChange}
            />
            <label
              htmlFor="media-upload"
              className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <Upload className="w-5 h-5 mr-2" />
              {activeTab === 'video' ? 'Select Video' : 'Select Photos'}
            </label>
          </>
        )}
      </div>
    </div>
  );
};
