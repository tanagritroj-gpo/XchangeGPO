import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { promises as fs } from 'fs';
import path from 'path';

export async function generateReturnFormFromDB(requestId: number, supabase: any) {
  // 1. ดึงข้อมูล request พร้อม drug_items
  const { data: request, error: dbError } = await supabase
    .from('requests')
    .select('*, drug_items(*)')
    .eq('id', requestId)
    .single();

  if (dbError) throw new Error(`Supabase query failed: ${dbError.message}`);
  if (!request) throw new Error(`ไม่พบ request id: ${requestId}`);

  // 2. โหลด Template และ Font
  const templatePath = path.join(process.cwd(), 'public', 'forms', 'FM-AJJ0-008_Return_rev.02.pdf');
  const fontPath = path.join(process.cwd(), 'public', 'font', 'THSarabunNew.ttf');
  const [existingPdfBytes, fontBytes] = await Promise.all([
    fs.readFile(templatePath),
    fs.readFile(fontPath),
  ]);

  // 3. สร้างและวาดข้อมูลลง PDF
  const pdfDoc = await PDFDocument.load(existingPdfBytes);
  pdfDoc.registerFontkit(fontkit);
  const customFont = await pdfDoc.embedFont(fontBytes);
  const page = pdfDoc.getPages()[0];

  const drawText = (text: string | null | undefined, x: number, y: number, size = 14) => {
    if (text) page.drawText(text, { x, y, size, font: customFont, color: rgb(0, 0, 0) });
  };

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

  const pdfBuffer = await pdfDoc.save();

  // 4. อัปโหลดและเก็บ Record ลง DB (ส่ง requestId และ refId ครบถ้วน)
  await uploadPdfToStorage(supabase, requestId, request.ref_id, Buffer.from(pdfBuffer));

  return pdfBuffer;
}

export async function uploadPdfToStorage(
  supabase: any,
  requestId: number,
  refId: string,
  pdfBuffer: Buffer
) {
  const filePath = `requests/${refId}/form-${Date.now()}.pdf`;

  // อัปโหลดไฟล์
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('FM-AJJ0-008-form')
    .upload(filePath, pdfBuffer, { contentType: 'application/pdf', upsert: true });

  if (uploadError) throw new Error(`อัปโหลดไฟล์ไม่สำเร็จ: ${uploadError.message}`);

  // บันทึก Path ลงตาราง ตาม Schema ที่กิตวางไว้
  const { error: dbError } = await supabase
    .from('document_attachments')
    .insert({
      request_id: requestId, // ผูกกับ ID
      ref_id: refId,         // ผูกกับ REF_ID
      file_path: uploadData.path,
    });

  if (dbError) {
    await supabase.storage.from('FM-AJJ0-008-form').remove([uploadData.path]);
    throw new Error(`บันทึกข้อมูลไฟล์ลงตารางไม่สำเร็จ: ${dbError.message}`);
  }

  return uploadData.path;
}