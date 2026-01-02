
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { 
  FileText, 
  Layers, 
  Scissors, 
  RefreshCw, 
  Trash2, 
  Download, 
  ArrowRight,
  Loader2,
  AlertCircle,
  X,
  ChevronUp,
  ChevronDown,
  Image as ImageIcon,
  ImagePlus,
  Type,
  RotateCw,
  RotateCcw,
  LayoutGrid,
  GripHorizontal,
  Eraser,
  Stamp,
  Hash,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ArrowUpRight,
  Settings2,
  History,
  LayoutTemplate,
  HelpCircle,
  ShieldCheck,
  Maximize2
} from 'lucide-react';
import { PDFFile, AppTool } from './types';
import { 
  getPageCount, mergePDFs, splitPDF, rotatePDF, downloadBlob, 
  splitToIndividualFiles, pdfToImagesZip, imagesToPDF, 
  extractTextFromPdf, getPageThumbnails, reorderPDFPages, 
  removePagesFromPDF, applyWatermarkToPDF, addPageNumbersToPDF,
  ImageToPdfLayout 
} from './services/pdfService';
import FileUploader from './components/FileUploader';

const MAX_FILE_SIZE = 50 * 1024 * 1024;

interface ConversionProgress {
  fileId: string;
  current: number;
  total: number;
}

interface PageInteractionState {
  fileId: string;
  pageIndices: number[];
  thumbnails: string[];
  selectedIndices?: Set<number>;
}

interface WatermarkConfig {
  text: string;
  fontSize: number;
  opacity: number;
  rotation: number;
  color: string;
}

interface PageNumberConfig {
  position: 'top' | 'bottom';
  alignment: 'left' | 'center' | 'right';
  fontSize: number;
  color: string;
}

const TOOL_CATEGORIES = {
  Assemble: ['merge', 'split', 'reorder', 'delete-pages'],
  Modify: ['rotate', 'watermark', 'page-numbering'],
  Convert: ['pdf-to-image', 'image-to-pdf', 'pdf-to-text']
} as const;

const App: React.FC = () => {
  const [files, setFiles] = useState<PDFFile[]>([]);
  const [activeTool, setActiveTool] = useState<AppTool>('merge');
  const [isProcessing, setIsProcessing] = useState(false);
  const [splitRanges, setSplitRanges] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [imageFormat, setImageFormat] = useState<'png' | 'jpeg'>('png');
  const [imagePdfLayout, setImagePdfLayout] = useState<ImageToPdfLayout>('original');
  const [conversionProgress, setConversionProgress] = useState<Record<string, ConversionProgress>>({});
  const [extractedTexts, setExtractedTexts] = useState<Record<string, string>>({});
  const [interactionState, setInteractionState] = useState<PageInteractionState | null>(null);
  const [draggingPageIndex, setDraggingPageIndex] = useState<number | null>(null);
  
  const [watermarkConfig, setWatermarkConfig] = useState<WatermarkConfig>({
    text: 'CONFIDENTIAL',
    fontSize: 50,
    opacity: 0.3,
    rotation: -45,
    color: '#000000'
  });
  
  const [pageNumberConfig, setPageNumberConfig] = useState<PageNumberConfig>({
    position: 'bottom',
    alignment: 'center',
    fontSize: 12,
    color: '#000000'
  });

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const handleFilesAdded = useCallback(async (newFiles: File[]) => {
    const validFiles: File[] = [];
    const isImageTool = activeTool === 'image-to-pdf';

    for (const file of newFiles) {
      if (!isImageTool && file.type !== 'application/pdf') {
        setError(`"${file.name}" is not a PDF file.`);
      } else if (isImageTool && !file.type.startsWith('image/')) {
        setError(`"${file.name}" is not an image file.`);
      } else if (file.size > MAX_FILE_SIZE) {
        setError(`"${file.name}" exceeds the 50MB limit.`);
      } else {
        validFiles.push(file);
      }
    }

    if (validFiles.length === 0) return;

    setIsProcessing(true);
    try {
      const processedFiles: PDFFile[] = await Promise.all(
        validFiles.map(async (f) => {
          const type = f.type === 'application/pdf' ? 'pdf' : 'image';
          let previewUrl: string | undefined;
          if (type === 'image') {
            previewUrl = URL.createObjectURL(f);
          }
          return {
            id: Math.random().toString(36).substr(2, 9),
            file: f,
            name: f.name,
            size: f.size,
            pageCount: await getPageCount(f),
            rotation: 0,
            type,
            previewUrl
          };
        })
      );
      setFiles((prev) => [...prev, ...processedFiles]);
    } catch (err) {
      setError("Failed to process some files.");
    } finally {
      setIsProcessing(false);
    }
  }, [activeTool]);

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const target = prev.find(f => f.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((f) => f.id !== id);
    });
    if (interactionState?.fileId === id) setInteractionState(null);
  };

  const moveFile = (index: number, direction: 'up' | 'down') => {
    const newFiles = [...files];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= files.length) return;
    [newFiles[index], newFiles[targetIndex]] = [newFiles[targetIndex], newFiles[index]];
    setFiles(newFiles);
  };

  const clearFiles = () => {
    files.forEach(f => f.previewUrl && URL.revokeObjectURL(f.previewUrl));
    setFiles([]);
    setConversionProgress({});
    setExtractedTexts({});
    setInteractionState(null);
  };

  const handleMerge = async () => {
    if (files.length < 2) return;
    setIsProcessing(true);
    try {
      const result = await mergePDFs(files.map(f => f.file));
      downloadBlob(result, `merged_help_${Date.now()}.pdf`);
    } catch (error) {
      setError('Failed to merge PDFs.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImagesToPDF = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);
    try {
      const result = await imagesToPDF(files.map(f => f.file), imagePdfLayout);
      downloadBlob(result, `compiled_images_${Date.now()}.pdf`);
    } catch (error) {
      setError('Failed to convert images.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStartThumbnailOperation = async (fileId: string) => {
    const target = files.find(f => f.id === fileId);
    if (!target) return;
    setIsProcessing(true);
    try {
      const thumbnails = await getPageThumbnails(target.file, (current, total) => {
        setConversionProgress(prev => ({ ...prev, [fileId]: { fileId, current, total } }));
      });
      setInteractionState({ fileId, pageIndices: Array.from({ length: target.pageCount }, (_, i) => i), thumbnails, selectedIndices: new Set() });
    } catch (error) {
      setError('Thumbnail generation failed.');
    } finally {
      setIsProcessing(false);
      setConversionProgress(prev => { const next = { ...prev }; delete next[fileId]; return next; });
    }
  };

  const handleFinishReorder = async () => {
    if (!interactionState) return;
    const target = files.find(f => f.id === interactionState.fileId);
    if (!target) return;
    setIsProcessing(true);
    try {
      const result = await reorderPDFPages(target.file, interactionState.pageIndices);
      downloadBlob(result, `reordered_${target.name}`);
    } catch (error) {
      setError('Failed to reorder PDF pages.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFinishDelete = async () => {
    if (!interactionState || !interactionState.selectedIndices) return;
    const target = files.find(f => f.id === interactionState.fileId);
    if (!target) return;
    if (interactionState.selectedIndices.size === 0) { setError('Select pages to delete.'); return; }
    if (interactionState.selectedIndices.size === target.pageCount) { setError('Cannot delete all pages.'); return; }
    setIsProcessing(true);
    try {
      const result = await removePagesFromPDF(target.file, Array.from(interactionState.selectedIndices));
      downloadBlob(result, `trimmed_${target.name}`);
      setInteractionState(null);
    } catch (error) {
      setError('Failed to remove pages.');
    } finally {
      setIsProcessing(false);
    }
  };

  const togglePageSelection = (index: number) => {
    if (!interactionState || !interactionState.selectedIndices) return;
    const next = new Set(interactionState.selectedIndices);
    next.has(index) ? next.delete(index) : next.add(index);
    setInteractionState({ ...interactionState, selectedIndices: next });
  };

  const handleReorderDrop = (dropIndex: number) => {
    if (draggingPageIndex === null || !interactionState) return;
    const newIndices = [...interactionState.pageIndices];
    const [movedItem] = newIndices.splice(draggingPageIndex, 1);
    newIndices.splice(dropIndex, 0, movedItem);
    setInteractionState({ ...interactionState, pageIndices: newIndices });
    setDraggingPageIndex(null);
  };

  const handleConvertToImages = async (fileId: string) => {
    const target = files.find(f => f.id === fileId);
    if (!target) return;
    setIsProcessing(true);
    try {
      const zipBlob = await pdfToImagesZip(target.file, imageFormat, (current, total) => {
        setConversionProgress(prev => ({ ...prev, [fileId]: { fileId, current, total } }));
      });
      downloadBlob(zipBlob, `${target.name.replace('.pdf', '')}_images.zip`);
    } catch (error) { setError(`Failed to convert "${target.name}".`); } finally { 
      setIsProcessing(false); 
      setConversionProgress(prev => { const next = { ...prev }; delete next[fileId]; return next; });
    }
  };

  const handleExtractText = async (fileId: string) => {
    const target = files.find(f => f.id === fileId);
    if (!target) return;
    setIsProcessing(true);
    try {
      const text = await extractTextFromPdf(target.file, (current, total) => {
        setConversionProgress(prev => ({ ...prev, [fileId]: { fileId, current, total } }));
      });
      setExtractedTexts(prev => ({ ...prev, [fileId]: text }));
    } catch (error) { setError(`Extraction failed for "${target.name}".`); } finally {
      setIsProcessing(false);
      setConversionProgress(prev => { const next = { ...prev }; delete next[fileId]; return next; });
    }
  };

  const parsedPages = useMemo(() => {
    const pages: number[] = [];
    if (!splitRanges.trim()) return pages;
    splitRanges.split(',').forEach(part => {
      const range = part.trim().split('-');
      if (range.length === 2) {
        const start = parseInt(range[0]), end = parseInt(range[1]);
        if (!isNaN(start) && !isNaN(end)) for (let i = Math.min(start, end); i <= Math.max(start, end); i++) pages.push(i);
      } else {
        const p = parseInt(part); if (!isNaN(p)) pages.push(p);
      }
    });
    return Array.from(new Set(pages)).sort((a, b) => a - b);
  }, [splitRanges]);

  const handleSplit = async (fileId: string) => {
    const target = files.find(f => f.id === fileId);
    if (!target) return;
    if (parsedPages.length === 0) { setError('Enter page ranges.'); return; }
    setIsProcessing(true);
    try {
      const result = await splitPDF(target.file, parsedPages);
      downloadBlob(result, `extracted_${target.name}`);
    } catch (error) { setError('Extraction failed.'); } finally { setIsProcessing(false); }
  };

  const handleSplitAll = async (fileId: string) => {
    const target = files.find(f => f.id === fileId);
    if (!target) return;
    setIsProcessing(true);
    try {
      const results = await splitToIndividualFiles(target.file);
      results.forEach(res => downloadBlob(res.data, res.name));
    } catch (error) { setError('Split failed.'); } finally { setIsProcessing(false); }
  };

  const handleRotate = async (fileId: string, deg: number) => {
    const target = files.find(f => f.id === fileId);
    if (!target) return;
    setIsProcessing(true);
    try {
      const result = await rotatePDF(target.file, deg, parsedPages.length > 0 ? parsedPages : undefined);
      downloadBlob(result, `rotated_${target.name}`);
    } catch (error) { setError('Rotation failed.'); } finally { setIsProcessing(false); }
  };

  const handleApplyWatermark = async (fileId: string) => {
    const target = files.find(f => f.id === fileId);
    if (!target || !watermarkConfig.text.trim()) return;
    setIsProcessing(true);
    try {
      const result = await applyWatermarkToPDF(target.file, watermarkConfig.text, watermarkConfig);
      downloadBlob(result, `watermarked_${target.name}`);
    } catch (error) { setError('Watermark failed.'); } finally { setIsProcessing(false); }
  };

  const handleApplyPageNumbers = async (fileId: string) => {
    const target = files.find(f => f.id === fileId);
    if (!target) return;
    setIsProcessing(true);
    try {
      const result = await addPageNumbersToPDF(target.file, pageNumberConfig);
      downloadBlob(result, `numbered_${target.name}`);
    } catch (error) { setError('Numbering failed.'); } finally { setIsProcessing(false); }
  };

  return (
    <div className="flex flex-col min-h-screen">
      <header className="sticky top-0 z-50 glass-panel border-b border-slate-200/50 px-8 py-3">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 group cursor-pointer">
            <div className="bg-gradient-to-br from-indigo-600 to-blue-700 p-2.5 rounded-2xl shadow-lg shadow-indigo-100 transition-transform group-hover:scale-110">
              <div className="relative">
                <FileText className="text-white w-6 h-6" />
                <HelpCircle className="text-white w-3 h-3 absolute -bottom-1 -right-1 bg-indigo-600 rounded-full" />
              </div>
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900 tracking-tight leading-tight italic">pdf_help</h1>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-tight">Secure PDF Workbench</p>
            </div>
          </div>
          
          <div className="hidden md:flex items-center gap-6">
            <div className="flex items-center gap-2 px-4 py-1.5 bg-slate-100/50 border border-slate-200/50 rounded-full">
              <ShieldCheck size={14} className="text-emerald-500" />
              <span className="text-xs font-bold text-slate-600 tracking-wide uppercase">Private Mode</span>
            </div>
            <div className="w-px h-8 bg-slate-200"></div>
            <button className="text-slate-400 hover:text-slate-900 transition-colors"><Settings2 size={20}/></button>
            <button className="text-slate-400 hover:text-slate-900 transition-colors"><History size={20}/></button>
          </div>
        </div>
      </header>

      {isProcessing && files.length > 0 && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/10 backdrop-blur-[2px]">
          <div className="bg-white p-8 rounded-3xl shadow-2xl flex flex-col items-center gap-4 animate-in zoom-in duration-300 border border-slate-200">
            <Loader2 className="animate-spin text-indigo-600" size={48} strokeWidth={2.5}/>
            <div className="text-center">
              <p className="font-extrabold text-slate-900 text-lg">Optimizing...</p>
              <p className="text-sm font-medium text-slate-500">Executing local browser operations</p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[60] w-full max-w-xl px-4 animate-in slide-in-from-top duration-500">
          <div className="bg-rose-50 border-l-4 border-rose-500 text-rose-800 px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4">
            <AlertCircle className="text-rose-500" size={18} />
            <div className="flex-1 text-sm font-bold">{error}</div>
            <button onClick={() => setError(null)} className="text-rose-300 hover:text-rose-600"><X size={20} /></button>
          </div>
        </div>
      )}

      <main className="flex-1 flex flex-col lg:flex-row max-w-[1600px] mx-auto w-full p-8 gap-8">
        <aside className="w-full lg:w-72 shrink-0 space-y-8">
          <div className="space-y-6">
            {Object.entries(TOOL_CATEGORIES).map(([cat, tools]) => (
              <div key={cat} className="space-y-2">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-4">{cat}</h3>
                <div className="space-y-1">
                  {tools.map(tool => (
                    <NavButton 
                      key={tool}
                      active={activeTool === tool}
                      onClick={() => { setActiveTool(tool as AppTool); clearFiles(); }}
                      icon={getToolIcon(tool as AppTool)}
                      label={tool.replace(/-/g, ' ')}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="pt-6 border-t border-slate-200/50">
             <div className="glass-panel p-5 rounded-2xl space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Workspace</span>
                  <span className="bg-indigo-100 text-indigo-600 text-[10px] font-black px-2 py-0.5 rounded-full">{files.length} Files</span>
                </div>
                {files.length > 0 && (
                  <button onClick={clearFiles} className="w-full py-2.5 rounded-xl border border-rose-200 text-rose-500 hover:bg-rose-50 text-xs font-bold transition-all flex items-center justify-center gap-2">
                    <Trash2 size={14}/> Clear Workspace
                  </button>
                )}
             </div>
          </div>
        </aside>

        <div className="flex-1 flex flex-col gap-6">
          {!interactionState && (
            <div className="bg-white/40 border-2 border-dashed border-slate-300/50 rounded-[2.5rem] p-3 shadow-sm hover:border-indigo-400 transition-all group overflow-hidden">
               <FileUploader 
                onFilesAdded={handleFilesAdded} 
                accept={activeTool === 'image-to-pdf' ? "image/*" : "application/pdf"}
              />
            </div>
          )}

          <section className="bg-white rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-200/40 overflow-hidden flex flex-col min-h-[600px] flex-1">
            <div className="border-b border-slate-100 px-8 py-6 flex items-center justify-between bg-slate-50/30">
              <div className="flex items-center gap-4">
                <div className={`p-2.5 rounded-xl bg-indigo-50 text-indigo-600`}>
                   {getToolIcon(activeTool, 22)}
                </div>
                <div>
                  <h2 className="text-xl font-extrabold text-slate-800 capitalize tracking-tight">{activeTool.replace(/-/g, ' ')}</h2>
                  <p className="text-xs font-medium text-slate-400">Configure parameters for local execution</p>
                </div>
              </div>
              <ToolHeaderActions 
                tool={activeTool} 
                files={files} 
                isProcessing={isProcessing} 
                onExecute={() => {
                  if (activeTool === 'merge') handleMerge();
                  if (activeTool === 'image-to-pdf') handleImagesToPDF();
                }}
                interactionState={interactionState}
                onSaveInteraction={() => {
                  if (activeTool === 'reorder') handleFinishReorder();
                  if (activeTool === 'delete-pages') handleFinishDelete();
                }}
                onCancelInteraction={() => setInteractionState(null)}
              />
            </div>

            <div className="flex-1 p-8 overflow-y-auto custom-scrollbar relative">
              {files.length === 0 ? (
                <EmptyState tool={activeTool} />
              ) : (
                <div className="space-y-6 max-w-5xl mx-auto">
                   {activeTool === 'image-to-pdf' && (
                     <div className="space-y-6">
                        <ToolHint icon={<Maximize2 size={18}/>} title="Page Layout Config" description="Specify the target paper size. Images will be automatically scaled to fit within these bounds." />
                        <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-200 flex items-center justify-between">
                           <p className="text-sm font-bold text-slate-700">Target PDF Layout</p>
                           <div className="flex bg-slate-200/50 p-1 rounded-2xl w-fit">
                              {[
                                { id: 'original', label: 'Fit to Image' },
                                { id: 'A4_PORTRAIT', label: 'A4 Portrait' },
                                { id: 'A4_LANDSCAPE', label: 'A4 Landscape' }
                              ].map(layout => (
                                <button 
                                  key={layout.id} 
                                  onClick={() => setImagePdfLayout(layout.id as ImageToPdfLayout)} 
                                  className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${imagePdfLayout === layout.id ? 'bg-white shadow-lg text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                  {layout.label}
                                </button>
                              ))}
                           </div>
                        </div>
                        <div className="grid grid-cols-1 gap-3">
                          {files.map((f, i) => (
                            <FileCard 
                              key={f.id} 
                              file={f} 
                              index={i} 
                              total={files.length}
                              onRemove={() => removeFile(f.id)}
                              onUp={() => moveFile(i, 'up')}
                              onDown={() => moveFile(i, 'down')}
                            />
                          ))}
                        </div>
                     </div>
                   )}

                   {activeTool === 'merge' && (
                     <div className="space-y-4">
                        <ToolHint icon={<LayoutTemplate size={18}/>} title="Execution Sequence" description="Adjust file priority. Processing occurs from top to bottom." />
                        <div className="grid grid-cols-1 gap-3">
                          {files.map((f, i) => (
                            <FileCard 
                              key={f.id} 
                              file={f} 
                              index={i} 
                              total={files.length}
                              onRemove={() => removeFile(f.id)}
                              onUp={() => moveFile(i, 'up')}
                              onDown={() => moveFile(i, 'down')}
                            />
                          ))}
                        </div>
                     </div>
                   )}

                   {activeTool === 'reorder' && (
                     <PageGridInteraction 
                        interactionState={interactionState} 
                        files={files} 
                        onStart={handleStartThumbnailOperation}
                        onDrop={handleReorderDrop}
                        draggingIndex={draggingPageIndex}
                        setDraggingIndex={setDraggingPageIndex}
                        mode="reorder"
                     />
                   )}

                   {activeTool === 'delete-pages' && (
                     <PageGridInteraction 
                        interactionState={interactionState} 
                        files={files} 
                        onStart={handleStartThumbnailOperation}
                        onToggle={togglePageSelection}
                        mode="delete"
                     />
                   )}

                   {activeTool === 'split' && (
                     <SplitView files={files} splitRanges={splitRanges} setSplitRanges={setSplitRanges} parsedPages={parsedPages} onSplit={handleSplit} onSplitAll={handleSplitAll} />
                   )}

                   {activeTool === 'rotate' && (
                     <RotateView files={files} splitRanges={splitRanges} setSplitRanges={setSplitRanges} onRotate={handleRotate} />
                   )}

                   {activeTool === 'watermark' && (
                     <WatermarkView files={files} config={watermarkConfig} setConfig={setWatermarkConfig} onApply={handleApplyWatermark} />
                   )}

                   {activeTool === 'page-numbering' && (
                     <PageNumberView files={files} config={pageNumberConfig} setConfig={setPageNumberConfig} onApply={handleApplyPageNumbers} />
                   )}

                   {activeTool === 'pdf-to-image' && (
                     <PdfToImageView files={files} format={imageFormat} setFormat={setImageFormat} progress={conversionProgress} onConvert={handleConvertToImages} />
                   )}

                   {activeTool === 'pdf-to-text' && (
                     <PdfToTextView files={files} texts={extractedTexts} progress={conversionProgress} onExtract={handleExtractText} />
                   )}
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      <footer className="p-8 border-t bg-white flex justify-center items-center">
         <div className="flex items-center gap-2 opacity-40 grayscale group hover:grayscale-0 hover:opacity-100 transition-all">
            <div className="bg-indigo-600 p-1 rounded-lg">
              <FileText size={14} className="text-white"/>
            </div>
            <span className="text-[11px] font-black uppercase tracking-widest text-slate-800 italic">pdf_help utility</span>
         </div>
      </footer>
    </div>
  );
};

const NavButton: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; label: string }> = ({ active, onClick, icon, label }) => (
  <button 
    onClick={onClick}
    className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl transition-all group ${
      active 
        ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-200'
        : 'text-slate-500 hover:bg-white hover:shadow-md hover:text-slate-900'
    }`}
  >
    <span className={`${active ? 'text-white' : 'text-slate-400 group-hover:text-indigo-500'} transition-colors`}>{icon}</span>
    <span className="text-sm font-bold capitalize">{label}</span>
    {active && <ArrowRight size={14} className="ml-auto animate-in slide-in-from-left-2"/>}
  </button>
);

const ToolHeaderActions: React.FC<any> = ({ tool, files, isProcessing, onExecute, interactionState, onSaveInteraction, onCancelInteraction }) => {
  if (interactionState) {
    return (
      <div className="flex gap-2">
        <button onClick={onCancelInteraction} className="px-5 py-2.5 rounded-xl text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all">Cancel</button>
        <button onClick={onSaveInteraction} className="px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-100 flex items-center gap-2">
          <Download size={14}/> {tool === 'reorder' ? 'Commit Layout' : 'Commit Deletion'}
        </button>
      </div>
    );
  }

  if (tool === 'merge' || tool === 'image-to-pdf') {
    const disabled = files.length < (tool === 'merge' ? 2 : 1);
    return (
      <button 
        disabled={disabled || isProcessing}
        onClick={onExecute}
        className="px-6 py-2.5 rounded-2xl text-sm font-black bg-slate-900 text-white hover:bg-black disabled:opacity-50 disabled:bg-slate-200 disabled:text-slate-400 shadow-xl shadow-slate-200 flex items-center gap-2 transition-all active:scale-95"
      >
        {isProcessing ? <Loader2 className="animate-spin" size={16}/> : <ArrowUpRight size={16} className="text-white"/>}
        {tool === 'merge' ? 'Merge Sequence' : 'Compile PDF'}
      </button>
    );
  }
  return null;
};

const EmptyState: React.FC<{ tool: string }> = ({ tool }) => (
  <div className="h-full flex flex-col items-center justify-center text-center space-y-6 animate-in fade-in zoom-in duration-700">
    <div className="relative group">
       <div className="absolute inset-0 bg-indigo-200/50 rounded-full blur-3xl group-hover:bg-indigo-300/50 transition-all"></div>
       <div className="relative bg-white p-10 rounded-full border border-slate-100 shadow-2xl float-animation">
          <FileText size={64} strokeWidth={1} className="text-slate-300"/>
       </div>
    </div>
    <div className="max-w-sm space-y-2">
      <h3 className="text-2xl font-extrabold text-slate-800 italic tracking-tight">Workbench Ready</h3>
      <p className="text-slate-500 font-medium text-sm leading-relaxed">Drop your target {tool === 'image-to-pdf' ? 'images' : 'PDF files'}</p>
    </div>
  </div>
);

const FileCard: React.FC<any> = ({ file, index, total, onRemove, onUp, onDown }) => (
  <div className="group flex items-center justify-between p-5 bg-white border border-slate-100 rounded-3xl tool-card-hover shadow-sm">
    <div className="flex items-center gap-5 overflow-hidden">
      <div className="flex flex-col items-center gap-1.5 shrink-0">
        <button onClick={onUp} disabled={index === 0} className="text-slate-300 hover:text-indigo-500 disabled:opacity-0 transition-all p-1"><ChevronUp size={16}/></button>
        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-500">#{index+1}</div>
        <button onClick={onDown} disabled={index === total - 1} className="text-slate-300 hover:text-indigo-500 disabled:opacity-0 transition-all p-1"><ChevronDown size={16}/></button>
      </div>
      <div className="w-16 h-16 bg-slate-50 rounded-2xl shadow-inner border border-slate-100 shrink-0 overflow-hidden flex items-center justify-center transition-transform group-hover:scale-105">
        {file.previewUrl ? <img src={file.previewUrl} className="w-full h-full object-cover"/> : <FileText size={28} className="text-slate-300"/>}
      </div>
      <div className="truncate">
        <p className="text-sm font-extrabold text-slate-800 truncate">{file.name}</p>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
          {(file.size/1024/1024).toFixed(2)} MB • {file.pageCount} Pages
        </p>
      </div>
    </div>
    <div className="flex items-center gap-2">
      <button onClick={onRemove} className="p-3 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-2xl transition-all">
        <Trash2 size={20}/>
      </button>
    </div>
  </div>
);

const ToolHint: React.FC<any> = ({ icon, title, description }) => (
  <div className="flex items-start gap-4 p-5 bg-indigo-50/50 border border-indigo-100 rounded-3xl">
    <div className="bg-white p-2 rounded-xl text-indigo-600 shadow-sm">{icon}</div>
    <div className="space-y-0.5">
      <h4 className="text-sm font-black text-indigo-900 uppercase tracking-tight">{title}</h4>
      <p className="text-xs font-medium text-indigo-700 leading-relaxed">{description}</p>
    </div>
  </div>
);

const SplitView: React.FC<any> = ({ files, splitRanges, setSplitRanges, parsedPages, onSplit, onSplitAll }) => (
  <div className="space-y-8">
     <ToolHint icon={<Scissors size={18}/>} title="Extraction Config" description="Define ranges (e.g. 1, 3-5). The system will carve out these specific pages into a new document." />
     <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-200 space-y-4">
        <label className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Defined Range</label>
        <input 
          type="text" 
          value={splitRanges} 
          onChange={(e) => setSplitRanges(e.target.value)} 
          placeholder="e.g. 1, 3, 5-10"
          className="w-full bg-white border border-slate-200 px-6 py-4 rounded-2xl text-lg font-bold focus:ring-4 focus:ring-indigo-100 focus:outline-none transition-all placeholder:text-slate-300"
        />
        {parsedPages.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {parsedPages.map((p: number) => <span key={p} className="bg-indigo-600 text-white text-[9px] font-black px-2 py-0.5 rounded shadow-sm">P{p}</span>)}
          </div>
        )}
     </div>
     <div className="grid grid-cols-1 gap-4">
        {files.map((f: any) => (
          <div key={f.id} className="p-5 bg-white border border-slate-100 rounded-3xl flex items-center justify-between shadow-sm">
             <div className="flex items-center gap-4">
               <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-500"><FileText size={24}/></div>
               <div className="truncate max-w-xs"><p className="text-sm font-bold text-slate-800 truncate">{f.name}</p><p className="text-xs text-slate-400">{f.pageCount} Pages</p></div>
             </div>
             <div className="flex gap-2">
                <button onClick={() => onSplit(f.id)} disabled={parsedPages.length === 0} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-100 disabled:bg-slate-200">Extract</button>
                <button onClick={() => onSplitAll(f.id)} className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold">Split All</button>
             </div>
          </div>
        ))}
     </div>
  </div>
);

const RotateView: React.FC<any> = ({ files, splitRanges, setSplitRanges, onRotate }) => (
  <div className="space-y-6">
     <ToolHint icon={<RefreshCw size={18}/>} title="Orientation Adjust" description="Apply rotation to the entire document or a specific subset of pages." />
     <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200">
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Target Range (Leave empty for All)</label>
        <input type="text" value={splitRanges} onChange={(e) => setSplitRanges(e.target.value)} placeholder="e.g. 1-2, 5" className="w-full bg-white border border-slate-200 px-4 py-2.5 rounded-xl font-bold focus:ring-2 focus:ring-indigo-100 focus:outline-none"/>
     </div>
     {files.map((f: any) => (
       <div key={f.id} className="p-6 bg-white border border-slate-100 rounded-3xl space-y-4 shadow-sm">
         <div className="flex items-center justify-between"><h4 className="font-bold text-slate-800 truncate max-w-xs">{f.name}</h4><span className="text-xs text-slate-400">{f.pageCount} pgs</span></div>
         <div className="grid grid-cols-3 gap-3">
            <RotateBtn icon={<RotateCw size={18}/>} label="+90°" onClick={() => onRotate(f.id, 90)} />
            <RotateBtn icon={<RefreshCw size={18}/>} label="180°" onClick={() => onRotate(f.id, 180)} />
            <RotateBtn icon={<RotateCcw size={18}/>} label="-90°" onClick={() => onRotate(f.id, 270)} />
         </div>
       </div>
     ))}
  </div>
);

const RotateBtn: React.FC<any> = ({ icon, label, onClick }) => (
  <button onClick={onClick} className="flex flex-col items-center gap-2 py-4 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 rounded-2xl transition-all group">
    <div className="text-slate-400 group-hover:text-indigo-600 group-hover:rotate-12 transition-transform">{icon}</div>
    <span className="text-[10px] font-black text-slate-500 group-hover:text-indigo-700 uppercase tracking-widest">{label}</span>
  </button>
);

const WatermarkView: React.FC<any> = ({ files, config, setConfig, onApply }) => (
  <div className="space-y-6">
    <ToolHint icon={<Stamp size={18}/>} title="Stamping Logic" description="Overlays text for DRAFT or CONFIDENTIAL labels across all pages." />
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-8 bg-slate-50 rounded-[2.5rem] border border-slate-200">
      <div className="space-y-4">
        <div><label className="text-[10px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Stamp Text</label><input value={config.text} onChange={e => setConfig({...config, text: e.target.value})} className="w-full px-5 py-3 rounded-2xl border border-slate-200 font-bold focus:ring-4 focus:ring-indigo-100 outline-none"/></div>
        <div className="flex gap-4">
          <div className="flex-1"><label className="text-[10px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Size ({config.fontSize})</label><input type="range" min="10" max="200" value={config.fontSize} onChange={e => setConfig({...config, fontSize: parseInt(e.target.value)})} className="w-full accent-indigo-600"/></div>
          <div className="flex-1"><label className="text-[10px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Opacity ({Math.round(config.opacity*100)}%)</label><input type="range" min="0" max="1" step="0.1" value={config.opacity} onChange={e => setConfig({...config, opacity: parseFloat(e.target.value)})} className="w-full accent-indigo-600"/></div>
        </div>
      </div>
      <div className="space-y-4">
        <div><label className="text-[10px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Rotation ({config.rotation}°)</label><input type="range" min="-180" max="180" value={config.rotation} onChange={e => setConfig({...config, rotation: parseInt(e.target.value)})} className="w-full accent-indigo-600"/></div>
        <div><label className="text-[10px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Color</label><input type="color" value={config.color} onChange={e => setConfig({...config, color: e.target.value})} className="w-full h-12 rounded-xl border-none cursor-pointer p-0"/></div>
      </div>
    </div>
    {files.map((f: any) => (
      <div key={f.id} className="p-6 bg-white border border-slate-100 rounded-3xl flex items-center justify-between shadow-sm">
        <h4 className="font-bold text-slate-800 truncate max-w-sm">{f.name}</h4>
        <button onClick={() => onApply(f.id)} className="px-6 py-2.5 bg-indigo-600 text-white rounded-2xl text-xs font-black shadow-lg">Apply Stamp</button>
      </div>
    ))}
  </div>
);

const PageNumberView: React.FC<any> = ({ files, config, setConfig, onApply }) => (
  <div className="space-y-6">
    <ToolHint icon={<Hash size={18}/>} title="Pagination Engine" description="Insert incrementing page numbers into your document." />
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 p-8 bg-slate-50 rounded-[2.5rem] border border-slate-200">
      <div className="space-y-5">
        <div>
          <label className="text-[10px] font-black text-slate-400 uppercase mb-3 block tracking-widest">Vertical Position</label>
          <div className="flex bg-slate-200/50 p-1 rounded-2xl">
            {['top', 'bottom'].map(p => <button key={p} onClick={() => setConfig({...config, position: p as 'top'|'bottom'})} className={`flex-1 py-3 rounded-xl text-xs font-black capitalize transition-all ${config.position === p ? 'bg-white shadow-lg text-indigo-600' : 'text-slate-500'}`}>{p}</button>)}
          </div>
        </div>
        <div>
          <label className="text-[10px] font-black text-slate-400 uppercase mb-3 block tracking-widest">Alignment</label>
          <div className="flex bg-slate-200/50 p-1 rounded-2xl">
            {['left', 'center', 'right'].map(a => <button key={a} onClick={() => setConfig({...config, alignment: a as any})} className={`flex-1 py-3 rounded-xl flex justify-center transition-all ${config.alignment === a ? 'bg-white shadow-lg text-indigo-600' : 'text-slate-400'}`}>{a === 'left' ? <AlignLeft size={18}/> : a === 'center' ? <AlignCenter size={18}/> : <AlignRight size={18}/>}</button>)}
          </div>
        </div>
      </div>
      <div className="space-y-5">
        <div><label className="text-[10px] font-black text-slate-400 uppercase mb-3 block tracking-widest">Font Size ({config.fontSize})</label><input type="range" min="8" max="32" value={config.fontSize} onChange={e => setConfig({...config, fontSize: parseInt(e.target.value)})} className="w-full accent-indigo-600"/></div>
        <div><label className="text-[10px] font-black text-slate-400 uppercase mb-3 block tracking-widest">Text Color</label><input type="color" value={config.color} onChange={e => setConfig({...config, color: e.target.value})} className="w-full h-14 rounded-2xl border-none cursor-pointer p-0 shadow-inner"/></div>
      </div>
    </div>
    {files.map((f: any) => (
       <div key={f.id} className="p-6 bg-white border border-slate-100 rounded-3xl flex items-center justify-between shadow-sm">
        <h4 className="font-bold text-slate-800 truncate max-w-sm">{f.name}</h4>
        <button onClick={() => onApply(f.id)} className="px-6 py-2.5 bg-slate-900 text-white rounded-2xl text-xs font-black">Add Numbers</button>
      </div>
    ))}
  </div>
);

const PdfToImageView: React.FC<any> = ({ files, format, setFormat, progress, onConvert }) => (
  <div className="space-y-6">
    <ToolHint icon={<ImageIcon size={18}/>} title="Raster Export" description="Converts PDF pages into static images." />
    <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-200 flex items-center justify-between">
       <p className="text-sm font-bold text-slate-700">Output Encoding</p>
       <div className="flex bg-slate-200/50 p-1 rounded-2xl w-64">
          {['png', 'jpeg'].map(f => <button key={f} onClick={() => setFormat(f as any)} className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${format === f ? 'bg-white shadow-lg text-indigo-600' : 'text-slate-500'}`}>{f}</button>)}
       </div>
    </div>
    {files.map((f: any) => (
      <div key={f.id} className="p-6 bg-white border border-slate-100 rounded-3xl space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h4 className="font-bold text-slate-800 truncate max-w-sm">{f.name}</h4>
          <button onClick={() => onConvert(f.id)} className="px-6 py-2.5 bg-indigo-600 text-white rounded-2xl text-xs font-black shadow-lg">Package ZIP</button>
        </div>
        {progress[f.id] && (
           <div className="space-y-2 pt-2 animate-in fade-in">
              <div className="flex justify-between text-[9px] font-black text-indigo-600 uppercase tracking-widest"><span>Rendering Page {progress[f.id].current}</span><span>{Math.round((progress[f.id].current/progress[f.id].total)*100)}%</span></div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-50"><div className="h-full bg-indigo-600 transition-all duration-300" style={{width:`${(progress[f.id].current/progress[f.id].total)*100}%`}}></div></div>
           </div>
        )}
      </div>
    ))}
  </div>
);

const PdfToTextView: React.FC<any> = ({ files, texts, progress, onExtract }) => (
  <div className="space-y-6">
    <ToolHint icon={<Type size={18}/>} title="Deep Text Extraction" description="Scans document content layers to reconstruct plaintext." />
    {files.map((f: any) => {
      const text = texts[f.id];
      const prog = progress[f.id];
      return (
        <div key={f.id} className="p-6 bg-white border border-slate-100 rounded-[2rem] space-y-5 shadow-sm">
           <div className="flex items-center justify-between">
             <h4 className="font-bold text-slate-800 truncate max-w-sm">{f.name}</h4>
             <div className="flex gap-2">
               {!text ? <button onClick={() => onExtract(f.id)} className="px-6 py-2.5 bg-indigo-600 text-white rounded-2xl text-xs font-black">Extract Text</button> : <><button onClick={() => navigator.clipboard.writeText(text)} className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold">Copy</button><button onClick={() => downloadBlob(text, `${f.name}.txt`)} className="px-6 py-2.5 bg-slate-900 text-white rounded-2xl text-xs font-black shadow-xl">Save .txt</button></>}
             </div>
           </div>
           {prog && <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-indigo-500 transition-all" style={{width:`${(prog.current/prog.total)*100}%`}}></div></div>}
           {text && <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 max-h-60 overflow-y-auto shadow-inner"><pre className="text-[11px] font-mono text-slate-600 leading-relaxed whitespace-pre-wrap">{text.substring(0, 1500)}...</pre></div>}
        </div>
      );
    })}
  </div>
);

const PageGridInteraction: React.FC<any> = ({ interactionState, files, onStart, onDrop, draggingIndex, setDraggingIndex, onToggle, mode }) => {
  if (!interactionState) {
    return (
      <div className="grid grid-cols-1 gap-4">
        {files.map((f: any) => (
          <div key={f.id} className="p-6 bg-white border border-slate-100 rounded-3xl flex items-center justify-between shadow-sm tool-card-hover group">
            <div className="flex items-center gap-4 shrink-0">
               <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${mode === 'reorder' ? 'bg-indigo-50 text-indigo-500' : 'bg-rose-50 text-rose-500'}`}><FileText size={28}/></div>
               <div><p className="font-extrabold text-slate-800 truncate max-w-xs">{f.name}</p><p className="text-xs text-slate-400">{f.pageCount} Pages Available</p></div>
            </div>
            <button onClick={() => onStart(f.id)} className={`px-8 py-3 rounded-2xl text-xs font-black shadow-lg transition-all flex items-center gap-2 ${mode === 'reorder' ? 'bg-indigo-600 text-white shadow-indigo-100' : 'bg-rose-600 text-white shadow-rose-100'}`}>{mode === 'reorder' ? <LayoutGrid size={16}/> : <Eraser size={16}/>} Load Grid View</button>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
       <ToolHint icon={mode === 'reorder' ? <LayoutGrid size={18}/> : <Eraser size={18}/>} title={mode === 'reorder' ? 'Interactive Reorder' : 'Selection Trimmer'} description={mode === 'reorder' ? 'Drag and drop cards to change page positions.' : 'Click to mark pages for deletion.'} />
       <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
          {interactionState.pageIndices.map((origIdx: number, currIdx: number) => {
            const isSelected = interactionState.selectedIndices?.has(origIdx);
            return (
              <div 
                key={origIdx} 
                draggable={mode === 'reorder'}
                onDragStart={() => setDraggingIndex(currIdx)}
                onDragOver={e => e.preventDefault()}
                onDrop={() => mode === 'reorder' && onDrop(currIdx)}
                onClick={() => mode === 'delete' && onToggle(origIdx)}
                className={`relative aspect-[1/1.4] rounded-3xl border-4 overflow-hidden transition-all duration-300 cursor-pointer ${draggingIndex === currIdx ? 'opacity-30 scale-90 border-indigo-500 border-dashed' : isSelected ? 'border-rose-500 shadow-2xl scale-95' : 'border-slate-100 bg-white hover:border-indigo-400 hover:shadow-2xl hover:z-10 hover:-translate-y-2'}`}
              >
                <img src={interactionState.thumbnails[origIdx]} className={`w-full h-full object-cover transition-all ${isSelected ? 'grayscale opacity-30' : ''}`}/>
                <div className="absolute top-3 left-3 bg-slate-900/90 text-white text-[10px] font-black px-2.5 py-1 rounded-full shadow-lg">P{mode === 'reorder' ? currIdx + 1 : origIdx + 1}</div>
                {isSelected && <div className="absolute inset-0 flex items-center justify-center"><div className="bg-rose-600 text-white p-3 rounded-full shadow-2xl animate-in zoom-in"><Trash2 size={24}/></div></div>}
                {mode === 'reorder' && <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity"><div className="bg-white/90 p-1.5 rounded-lg shadow-xl border border-slate-200"><GripHorizontal size={16} className="text-slate-400"/></div></div>}
              </div>
            );
          })}
       </div>
    </div>
  );
};

const getToolIcon = (tool: AppTool, size = 18) => {
  switch(tool) {
    case 'merge': return <Layers size={size}/>;
    case 'split': return <Scissors size={size}/>;
    case 'reorder': return <LayoutGrid size={size}/>;
    case 'delete-pages': return <Eraser size={size}/>;
    case 'rotate': return <RefreshCw size={size}/>;
    case 'watermark': return <Stamp size={size}/>;
    case 'page-numbering': return <Hash size={size}/>;
    case 'pdf-to-image': return <ImageIcon size={size}/>;
    case 'image-to-pdf': return <ImagePlus size={size}/>;
    case 'pdf-to-text': return <Type size={size}/>;
    default: return <FileText size={size}/>;
  }
};

export default App;
