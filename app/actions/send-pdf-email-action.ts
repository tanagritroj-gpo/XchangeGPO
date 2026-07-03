'use server';

import { createClient } from '@/lib/supabase/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendPdfEmailAction(requestId: number) {
  try {
    const supabase = await createClient();

    // 🎯 1. เปลี่ยนมาใช้ RPC ตัวเดียวกับที่ใช้สร้าง PDF เพื่อทะลวง RLS
    const { data: rpcData, error: reqErr } = await supabase.rpc('get_request_data_for_pdf', { 
      p_request_id: requestId 
    });

    if (reqErr || !rpcData || rpcData.length === 0) {
      console.error('❌ Supabase RPC Error:', reqErr);
      return { success: false, error: 'ดึงข้อมูลไม่สำเร็จ หรือไม่พบคำร้องนี้' };
    }

    // ดึงข้อมูล request ออกมาจาก RPC
    const requestData = rpcData[0].request_data;

    if (!requestData?.customer_email) {
      return { success: false, error: 'คอลัมน์ customer_email ในฐานข้อมูลเป็นค่าว่าง (ยังไม่ได้เซฟอีเมล)' };
    }

    // 2. ดึงไฟล์ PDF จากตาราง document_attachments
    const { data: docData, error: docErr } = await supabase
      .from('document_attachments')
      .select('file_path')
      .eq('request_id', requestId)
      .maybeSingle();

    if (docErr || !docData?.file_path) {
      return { success: false, error: 'ไม่พบไฟล์เอกสาร กรุณาสร้างเอกสาร PDF ก่อนส่งอีเมล' };
    }

    // 3. สร้าง Signed URL เพื่อแนบเป็นลิงก์
    const { data: signed } = await supabase.storage
      .from('return-documents')
      .createSignedUrl(docData.file_path, 60 * 60 * 24 * 7); 

    // 4. ส่งอีเมลด้วย Resend
    const { data, error } = await resend.emails.send({
      from: 'Xchange Portal <onboarding@resend.dev>',
      to: [requestData.customer_email],
      subject: `เอกสารแบบฟอร์มรับคืน/แลกเปลี่ยนสินค้า (Ref: ${requestData.ref_id})`,
      html: `
        <h2>สวัสดีครับ, ตัวแทนจาก ${requestData.hospital_name}</h2>
        <p>ระบบได้ทำการสร้างเอกสารแบบฟอร์มรับคืน/แลกเปลี่ยนสินค้าเรียบร้อยแล้ว</p>
        <p>เลขอ้างอิงของคุณคือ: <strong>${requestData.ref_id}</strong></p>
        <p>
          <a href="${signed?.signedUrl}" target="_blank" style="padding: 10px 20px; background-color: #0f5132; color: white; text-decoration: none; border-radius: 5px;">
            คลิกที่นี่เพื่อดาวน์โหลดเอกสาร PDF
          </a>
        </p>
        <p>ลิงก์นี้มีอายุการใช้งาน 7 วัน</p>
      `,
    });

    if (error) {
      console.error('❌ Resend API Error:', error);
      return { success: false, error: `ส่งผ่าน Resend ไม่สำเร็จ: ${error.message}` };
    }

    // 5. บันทึก Log
    await supabase.rpc('insert_status_log', { 
        p_req_id: requestId, 
        p_remark: `ส่งเอกสารไปยังอีเมล ${requestData.customer_email} เรียบร้อยแล้ว` 
    });

    return { success: true, message: 'ส่งอีเมลสำเร็จแล้ว' };

  } catch (err: any) {
    console.error('❌ Send Email Catch Error:', err);
    return { success: false, error: `ระบบขัดข้อง: ${err.message}` };
  }
}