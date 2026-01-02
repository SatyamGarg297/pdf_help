
import { PDFDocument, degrees, rgb, StandardFonts } from 'pdf-lib';
import JSZip from 'jszip';
import * as pdfjsLib from 'pdfjs-dist';

// Configure worker for pdfjs-dist
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export const getPageCount = async (file: File): Promise<number> => {
  if (file.type.startsWith('image/')) return 1;
  const bytes = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return pdfDoc.getPageCount();
};

/**
 * Renders each page of a PDF to a small image (thumbnail)
 */
export const getPageThumbnails = async (
  file: File,
  onProgress?: (current: number, total: number) => void
): Promise<string[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const numPages = pdf.numPages;
  const thumbnails: string[] = [];

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 0.4 }); // Low scale for thumbnails
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not create canvas context');

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({ canvasContext: context, viewport }).promise;
    thumbnails.push(canvas.toDataURL('image/jpeg', 0.7));
    
    if (onProgress) onProgress(i, numPages);
    
    canvas.width = 0;
    canvas.height = 0;
  }

  return thumbnails;
};

/**
 * Creates a new PDF using pages from the source in a specific order
 */
export const reorderPDFPages = async (file: File, newIndices: number[]): Promise<Uint8Array> => {
  const bytes = await file.arrayBuffer();
  const srcPdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const newPdf = await PDFDocument.create();
  
  const copiedPages = await newPdf.copyPages(srcPdf, newIndices);
  copiedPages.forEach((page) => newPdf.addPage(page));
  
  return await newPdf.save();
};

/**
 * Creates a new PDF excluding specific indices
 */
export const removePagesFromPDF = async (file: File, indicesToRemove: number[]): Promise<Uint8Array> => {
  const bytes = await file.arrayBuffer();
  const srcPdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const newPdf = await PDFDocument.create();
  
  const totalPages = srcPdf.getPageCount();
  const indicesToKeep = [];
  for (let i = 0; i < totalPages; i++) {
    if (!indicesToRemove.includes(i)) {
      indicesToKeep.push(i);
    }
  }

  if (indicesToKeep.length === 0) {
    throw new Error("Cannot delete all pages. At least one page must remain.");
  }
  
  const copiedPages = await newPdf.copyPages(srcPdf, indicesToKeep);
  copiedPages.forEach((page) => newPdf.addPage(page));
  
  return await newPdf.save();
};

/**
 * Overlays a text watermark on every page of the PDF
 */
export const applyWatermarkToPDF = async (
  file: File, 
  text: string, 
  config: { fontSize: number; opacity: number; rotation: number; color: string }
): Promise<Uint8Array> => {
  const bytes = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Convert hex color to RGB (0-1)
  const hex = config.color.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;

  for (const page of pages) {
    const { width, height } = page.getSize();
    const textWidth = helveticaFont.widthOfTextAtSize(text, config.fontSize);
    const textHeight = helveticaFont.heightAtSize(config.fontSize);

    page.drawText(text, {
      x: width / 2 - textWidth / 2,
      y: height / 2 - textHeight / 2,
      size: config.fontSize,
      font: helveticaFont,
      color: rgb(r, g, b),
      opacity: config.opacity,
      rotate: degrees(config.rotation),
    });
  }

  return await pdfDoc.save();
};

/**
 * Adds page numbering to the PDF
 */
export const addPageNumbersToPDF = async (
  file: File,
  config: { position: 'top' | 'bottom'; alignment: 'left' | 'center' | 'right'; fontSize: number; color: string }
): Promise<Uint8Array> => {
  const bytes = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  
  const hex = config.color.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;

  const margin = 30;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const { width, height } = page.getSize();
    const text = `${i + 1} / ${pages.length}`;
    const textWidth = font.widthOfTextAtSize(text, config.fontSize);
    
    let x = margin;
    if (config.alignment === 'center') x = width / 2 - textWidth / 2;
    else if (config.alignment === 'right') x = width - textWidth - margin;

    let y = margin;
    if (config.position === 'top') y = height - margin - config.fontSize;

    page.drawText(text, {
      x,
      y,
      size: config.fontSize,
      font,
      color: rgb(r, g, b),
    });
  }

  return await pdfDoc.save();
};

export const mergePDFs = async (files: File[]): Promise<Uint8Array> => {
  const mergedPdf = await PDFDocument.create();
  
  for (const file of files) {
    const bytes = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const copiedPages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
    copiedPages.forEach((page) => mergedPdf.addPage(page));
  }
  
  return await mergedPdf.save();
};

export const imagesToPDF = async (imageFiles: File[]): Promise<Uint8Array> => {
  const pdfDoc = await PDFDocument.create();
  
  for (const file of imageFiles) {
    const arrayBuffer = await file.arrayBuffer();
    let image;
    
    try {
      if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
        image = await pdfDoc.embedJpg(arrayBuffer);
      } else if (file.type === 'image/png') {
        image = await pdfDoc.embedPng(arrayBuffer);
      } else {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.src = url;
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });
        
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas context failed');
        ctx.drawImage(img, 0, 0);
        
        const dataUrl = canvas.toDataURL('image/png');
        const response = await fetch(dataUrl);
        const pngBuffer = await response.arrayBuffer();
        image = await pdfDoc.embedPng(pngBuffer);
        URL.revokeObjectURL(url);
      }

      const { width, height } = image.scale(1);
      const page = pdfDoc.addPage([width, height]);
      page.drawImage(image, {
        x: 0,
        y: 0,
        width: width,
        height: height,
      });
    } catch (e) {
      console.error('Error embedding image:', file.name, e);
    }
  }
  
  return await pdfDoc.save();
};

export const splitPDF = async (file: File, pages: number[]): Promise<Uint8Array> => {
  const bytes = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const newPdf = await PDFDocument.create();
  
  const indices = pages.map(p => p - 1).filter(idx => idx >= 0 && idx < pdfDoc.getPageCount());
  const copiedPages = await newPdf.copyPages(pdfDoc, indices);
  copiedPages.forEach((page) => newPdf.addPage(page));
  
  return await newPdf.save();
};

export const splitToIndividualFiles = async (file: File): Promise<{ name: string, data: Uint8Array }[]> => {
  const bytes = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pageCount = pdfDoc.getPageCount();
  const results = [];

  for (let i = 0; i < pageCount; i++) {
    const newPdf = await PDFDocument.create();
    const [page] = await newPdf.copyPages(pdfDoc, [i]);
    newPdf.addPage(page);
    const pdfBytes = await newPdf.save();
    results.push({
      name: `${file.name.replace('.pdf', '')}_page_${i + 1}.pdf`,
      data: pdfBytes
    });
  }
  return results;
};

export const rotatePDF = async (file: File, rotation: number, pageNumbers?: number[]): Promise<Uint8Array> => {
  const bytes = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();
  
  const indicesToRotate = pageNumbers 
    ? pageNumbers.map(n => n - 1).filter(idx => idx >= 0 && idx < pages.length)
    : pages.map((_, i) => i);

  indicesToRotate.forEach((idx) => {
    const page = pages[idx];
    const currentRotation = page.getRotation().angle;
    page.setRotation(degrees((currentRotation + rotation) % 360));
  });
  
  return await pdfDoc.save();
};

export const extractTextFromPdf = async (
  file: File,
  onProgress?: (current: number, total: number) => void
): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const numPages = pdf.numPages;
  let fullText = '';

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(' ');
    
    fullText += `--- PAGE ${i} ---\n${pageText}\n\n`;
    
    if (onProgress) onProgress(i, numPages);
  }

  return fullText;
};

export const pdfToImagesZip = async (
  file: File, 
  format: 'png' | 'jpeg', 
  onProgress?: (current: number, total: number) => void
): Promise<Blob> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const zip = new JSZip();
  const numPages = pdf.numPages;

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 });
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not create canvas context');

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({ canvasContext: context, viewport }).promise;
    
    const mimeType = `image/${format}`;
    const imgData = canvas.toDataURL(mimeType, 0.9);
    const base64Data = imgData.split(',')[1];
    
    zip.file(`page_${i}.${format}`, base64Data, { base64: true });
    
    if (onProgress) onProgress(i, numPages);
    
    canvas.width = 0;
    canvas.height = 0;
  }

  return await zip.generateAsync({ type: 'blob' });
};

export const downloadBlob = (data: Uint8Array | Blob | string, fileName: string) => {
  let blob: Blob;
  if (typeof data === 'string') {
    blob = new Blob([data], { type: 'text/plain' });
  } else if (data instanceof Blob) {
    blob = data;
  } else {
    blob = new Blob([data], { type: 'application/pdf' });
  }
  
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
