import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { promises as fs } from 'fs';
import path from 'path';
import { drawThaiText } from '@/lib/pdf-thai-text';

export async function buildReturnFormPdf(request: any) {
  
  // 1. โหลด Template และ Font
  const templatePath = path.join(process.cwd(), 'public', 'forms', 'FM-AJJ0-008_Return_rev.02.pdf');
  const fontPath = path.join(process.cwd(), 'public', 'font', 'Sarabun-Regular.ttf');
  
  const [existingPdfBytes, fontBytes] = await Promise.all([
    fs.readFile(templatePath),
    fs.readFile(fontPath),
  ]);

  // 2. สร้างและเตรียม PDF
  const pdfDoc = await PDFDocument.load(existingPdfBytes);
  pdfDoc.registerFontkit(fontkit);
  const customFont = await pdfDoc.embedFont(fontBytes);
  const page = pdfDoc.getPages()[0];

  const drawText = (text: string | null | undefined, x: number, y: number, size = 14) => {
    if (text) drawThaiText(page, text, { x, y, size, font: customFont, color: rgb(0, 0, 0) });
  };


  // วาดข้อมูลเดิมที่กิตทำไว้แล้ว
  drawText(request.doc_number, 122.55, 591.24, 12);
  drawText(request.hospital_name, 225.99, 573.29, 12);
  drawText(request.province, 424.44, 574.06, 12);

  const formattedDate = request.request_date ? new Date(request.request_date).toLocaleDateString('th-TH') : '';
  drawText(formattedDate, 407.1, 628.07, 12);

  let currentY = 497.31;
  if (request.drug_items) {
    request.drug_items.forEach((item: any, index: number) => {
      drawText((index + 1).toString(), 50, currentY, 12);
      drawText(item.drug_name, 97.5, currentY, 12);
      drawText(item.qty?.toString(), 223, currentY, 12);
      drawText(item.lot_number, 292, currentY, 12);
      const expDate = item.exp_date ? new Date(item.exp_date).toLocaleDateString('th-TH') : '';
      drawText(expDate, 385, currentY, 12);
      drawText(item.invoice_number, 480, currentY, 12);
      currentY -= 25;
    });
  }

  drawText(request.total_value?.toLocaleString('th-TH', { minimumFractionDigits: 2 }), 465, 320, 12);

  // วาดลายเซ็น
  if (request.signature_url) {
    try {
      const sigRes = await fetch(request.signature_url);
      if (sigRes.ok) {
        const sigBytes = new Uint8Array(await sigRes.arrayBuffer());
        const sigImage = await pdfDoc.embedPng(sigBytes);
        const sigDims = sigImage.scale(0.25);
        const sigX = 350; 
        const sigY = 150; 

        page.drawImage(sigImage, { x: sigX, y: sigY, width: sigDims.width, height: sigDims.height });
        drawText(`(${request.signer_name ?? ''})`, sigX, sigY - 15, 10);
        drawText(request.signer_position ?? '', sigX, sigY - 30, 9);
      }
    } catch (err) {
      console.warn('Embed signature image failed:', err);
    }
  }

  // 3. คืนค่าไฟล์ PDF ที่มีตารางพิกัด
  return await pdfDoc.save();
}