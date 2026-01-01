
export interface PDFFile {
  id: string;
  file: File;
  name: string;
  size: number;
  pageCount: number;
  rotation: number;
  type: 'pdf' | 'image';
  previewUrl?: string;
}

export type AppTool = 'merge' | 'split' | 'reorder' | 'delete-pages' | 'rotate' | 'watermark' | 'page-numbering' | 'protect' | 'unlock' | 'compress' | 'pdf-to-image' | 'image-to-pdf' | 'pdf-to-text' | 'ai-chat';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
