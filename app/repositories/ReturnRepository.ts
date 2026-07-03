import { createClient } from '@/lib/supabase/client';

// ฟังก์ชัน Helper สำหรับจัดการวันที่ (ป้องกัน Error เรื่อง Format)
const sanitizeDate = (dateStr: string) => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
};

export const ReturnRepository = {
  // ใช้ Logic ของกิตที่จัดการเรื่อง Error ได้แม่นยำขึ้น
  async getNextDocNumber() {
  const supabase = createClient();
  
  // เรียก RPC แทนการ Query ตรงๆ เพื่อข้าม RLS
  const { data, error } = await supabase.rpc('get_latest_doc_number');
  
  if (error || !data) {
    return "S001/2026";
  }

  // ใช้ logic เดิมของกิตได้เลย
  const lastNum = parseInt(data.split('/')[0].replace('S', ''));
  const nextNum = (lastNum + 1).toString().padStart(3, '0');
  return `S${nextNum}/2026`;
},

  createReturnRequest: async (formData: any) => {

    if (!formData.items || formData.items.length === 0) {
      throw new Error("ต้องมีรายการสินค้าอย่างน้อย 1 รายการครับ");
    }

    const supabase = createClient();
    const refId = `REF-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;

    // รวมข้อมูลให้เรียบร้อยในขั้นตอนเดียว
    const requestData = {
      ...formData.sender,
      ref_id: refId,
      doc_number: formData.sender.doc_number,
      request_type: formData.sender.request_type,
      hospital_name: formData.sender.hospital_name,
      contact_name: formData.sender.contact_name,
      phone: formData.sender.phone,
      customer_email: formData.sender.customer_email,
      b2b_customer_id: formData.sender.b2b_customer_id,
      return_reason: formData.return_reason,
      delivery_type: formData.delivery_type,
      addr_street: formData.addr_street,
      addr_sub: formData.addr_sub,
      addr_district: formData.addr_district,
      addr_province: formData.addr_province,
      agent_info: formData.agent_info,
      exchange_product_type: formData.exchange_product_type,
      exchange_product_list: formData.exchange_product_list,
      exchange_product_other: formData.exchange_product_other,
      signature_url: formData.signature_url,
      signer_name: formData.signer_name,
      signer_position: formData.signer_position,
      total_value: formData.totalValue,
      request_date: new Date().toISOString()
    };

    const items = formData.items.map((item: any) => ({
      drug_name: item.drugName,
      qty: Number(item.qty) || 0,
      unit: item.unit || 'ไม่ระบุ',
      lot_number: item.lot,
      exp_date: sanitizeDate(item.exp),
      value_amount: Number(item.val) || 0,
      invoice_number: item.inv || item.invoiceNumber,
    }));

    // เรียกใช้ RPC
    const { data, error } = await supabase.rpc('create_exchange_request', {
      p_b2b_customer_id: formData.sender.b2b_customer_id,
      p_request_data: requestData,
      p_drug_items: items
    });

    if (error) throw error;

    // ตรวจสอบว่า data ออกมาเป็น Array หรือ Object
    // ถ้า Function คืนค่าเป็น Table ปกติจะเป็น Array ของ Object
    return { id: data[0].request_id, refId: data[0].ref_id };
  }
};