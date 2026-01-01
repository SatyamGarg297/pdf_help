
import React, { useRef, useState } from 'react';
import { Upload, Plus, ShieldCheck, Sparkles } from 'lucide-react';

interface FileUploaderProps {
  onFilesAdded: (files: File[]) => void;
  accept?: string;
}

const FileUploader: React.FC<FileUploaderProps> = ({ onFilesAdded, accept = ".pdf,application/pdf" }) => {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedItems = Array.from(e.dataTransfer.files) as File[];
    if (droppedItems.length > 0) {
      onFilesAdded(droppedItems);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files) as File[];
      onFilesAdded(selectedFiles);
    }
  };

  const isImageAccept = accept.includes('image');

  return (
    <div 
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative rounded-[2rem] transition-all duration-500 flex flex-col items-center justify-center p-12 gap-6 border-4 border-transparent overflow-hidden ${
        isDragging 
          ? 'bg-blue-50/80 border-blue-400 border-dashed scale-[0.98]' 
          : 'bg-white/60 hover:bg-white'
      }`}
    >
      <input type="file" multiple accept={accept} className="hidden" ref={inputRef} onChange={handleFileChange}/>
      
      {/* Dynamic Background Elements */}
      <div className={`absolute -top-10 -right-10 w-40 h-40 bg-blue-400/5 rounded-full blur-3xl transition-opacity duration-700 ${isDragging ? 'opacity-100' : 'opacity-0'}`}></div>
      <div className={`absolute -bottom-10 -left-10 w-40 h-40 bg-indigo-400/5 rounded-full blur-3xl transition-opacity duration-700 ${isDragging ? 'opacity-100' : 'opacity-0'}`}></div>

      <div className={`relative p-8 rounded-[2.5rem] transition-all duration-500 ${
        isDragging 
          ? 'bg-blue-600 text-white shadow-[0_20px_50px_rgba(37,99,235,0.3)] rotate-12 scale-110' 
          : 'bg-slate-100 text-slate-400 group-hover:bg-blue-100 group-hover:text-blue-600 group-hover:rotate-6'
      }`}>
        <Upload size={48} strokeWidth={2.5}/>
        {isDragging && <Sparkles className="absolute -top-2 -right-2 text-amber-400 animate-bounce" size={24}/>}
      </div>
      
      <div className="text-center space-y-2 relative">
        <h3 className="text-xl font-extrabold text-slate-800 tracking-tight">
          {isDragging 
            ? `Release to transform ${isImageAccept ? 'images' : 'PDFs'}` 
            : `Add your ${isImageAccept ? 'images' : 'PDF files'}`}
        </h3>
        <p className="text-sm font-medium text-slate-400 max-w-xs mx-auto">
          Securely handled within your browser. <br/>
          Files never touch our servers.
        </p>
      </div>

      <div className="flex flex-col items-center gap-4 relative">
        <button 
          onClick={() => inputRef.current?.click()}
          className="bg-slate-900 hover:bg-black text-white px-10 py-3.5 rounded-2xl text-sm font-black flex items-center gap-3 transition-all shadow-2xl hover:shadow-slate-300 hover:-translate-y-1 active:scale-95"
        >
          <Plus size={20} strokeWidth={3}/> Select {isImageAccept ? 'Images' : 'Files'}
        </button>
        <div className="flex items-center gap-2.5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
          <ShieldCheck size={14} className="text-emerald-500"/> Privacy Guaranteed
        </div>
      </div>
    </div>
  );
};

export default FileUploader;