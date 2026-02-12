export interface BusinessCard {
  id: string;
  name: string;
  title: string;
  company: string;
  email: string;
  phone: string;
  website: string;
  address: string;
}

export interface ProcessedFrame {
  id: string;
  imageUrl: string; // Base64 or Blob URL
  timestamp: number;
  isSelected: boolean;
  status: 'pending' | 'processing' | 'completed' | 'error';
  data?: BusinessCard;
  errorMessage?: string;
}

export enum AppStep {
  UPLOAD = 'UPLOAD',
  FRAME_SELECTION = 'FRAME_SELECTION',
  PROCESSING = 'PROCESSING',
  RESULTS = 'RESULTS'
}
