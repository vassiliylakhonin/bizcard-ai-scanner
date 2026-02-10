/**
 * Extracts frames from a video file at a specified interval.
 * Returns an array of base64 strings (JPEG).
 */
export const extractFramesFromVideo = async (
  videoFile: File,
  intervalSeconds: number = 2.0,
  onProgress: (progress: number) => void
): Promise<{ timestamp: number; imageUrl: string }[]> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const frames: { timestamp: number; imageUrl: string }[] = [];
    
    if (!ctx) {
      reject(new Error("Could not create canvas context"));
      return;
    }

    const videoUrl = URL.createObjectURL(videoFile);
    video.src = videoUrl;
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";

    let currentTime = 0;
    
    video.onloadedmetadata = () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      // Start processing
      video.currentTime = currentTime;
    };

    video.onseeked = async () => {
      // Draw frame
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageUrl = canvas.toDataURL('image/jpeg', 0.8); // 0.8 quality to save size
      
      frames.push({ timestamp: currentTime, imageUrl });
      
      onProgress(Math.min((currentTime / video.duration) * 100, 100));

      currentTime += intervalSeconds;

      if (currentTime < video.duration) {
        video.currentTime = currentTime;
      } else {
        // Done
        onProgress(100);
        URL.revokeObjectURL(videoUrl);
        resolve(frames);
      }
    };

    video.onerror = (e) => {
      URL.revokeObjectURL(videoUrl);
      reject(e);
    };
  });
};
