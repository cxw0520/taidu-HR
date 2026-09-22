import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

/**
 * 將指定 DOM 元素轉換為 PDF Blob。
 * @param element 要轉換的 DOM 元素
 * @param multiPage 針對有 .page-break 類別的子元素進行分頁處理 (適用於薪資單等)
 */
export const generatePDFBlob = async (element: HTMLElement, multiPage: boolean = false): Promise<Blob> => {
  if (multiPage) {
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pages = Array.from(element.querySelectorAll('.pdf-page')) as HTMLElement[];
    
    if (pages.length === 0) {
      // 萬一沒有分頁標籤，整個當作一頁
      pages.push(element);
    }

    for (let i = 0; i < pages.length; i++) {
      const pageEl = pages[i];
      const canvas = await html2canvas(pageEl, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      if (i > 0) {
        pdf.addPage();
      }
      
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
    }
    return pdf.output('blob');
  } else {
    // 單頁長截圖模式 (自訂 PDF 尺寸以容納完整內容)
    const canvas = await html2canvas(element, { scale: 2, useCORS: true });
    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    
    const imgWidth = canvas.width;
    const imgHeight = canvas.height;
    
    // 將像素轉換為 mm (假設 96 DPI)
    const pxToMm = 0.264583;
    const pdfWidth = imgWidth * pxToMm;
    const pdfHeight = imgHeight * pxToMm;
    
    // 如果畫面很小，至少給個 A4 寬度
    const finalWidth = Math.max(pdfWidth, 210);
    const finalHeight = Math.max(pdfHeight, 297);

    const pdf = new jsPDF(pdfWidth > pdfHeight ? 'l' : 'p', 'mm', [finalWidth, finalHeight]);
    pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
    
    return pdf.output('blob');
  }
};

/**
 * 將多個 Blob 打包為 ZIP 並下載
 * @param files 包含檔名與 blob 的陣列
 * @param zipFilename 下載的 zip 檔名
 */
export const downloadZip = async (files: { filename: string; blob: Blob }[], zipFilename: string) => {
  const zip = new JSZip();
  
  files.forEach(file => {
    zip.file(file.filename, file.blob);
  });
  
  const content = await zip.generateAsync({ type: 'blob' });
  saveAs(content, zipFilename);
};
