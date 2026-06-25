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
    const { data, error } = await supabase
      .from('requests')
      .select('doc_number')
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle(); // ป้องกัน Error กรณีตารางว่าง
  
    if (error) {
      console.error("Error fetching doc_number:", error);
      return "S001/2026";
    }

    if (!data || !data.doc_number) return "S001/2026"; 

    // ใช้ logic ของกิตที่อ่านง่ายและชัวร์
    const lastNum = parseInt(data.doc_number.split('/')[0].replace('S', ''));
    const nextNum = (lastNum + 1).toString().padStart(3, '0');
    return `S${nextNum}/2026`;
   },

  createReturnRequest: async (formData: any) => {
    const supabase = createClient();
    const refId = `REF-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;

    // 1. บันทึกตาราง requests
    const requestData = {
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

    const { data: request, error: reqError } = await supabase
      .from('requests')
      .insert(requestData)
      .select('id')
      .single();

    if (reqError) throw reqError;

    // 2. บันทึกตาราง drug_items (ปรับตาม Schema ใหม่)
    const itemsToInsert = formData.items.map((item: any) => ({
      request_id: request.id,
      drug_name: item.drugName,
      qty: Number(item.qty) || 0,
      unit: item.unit && item.unit !== '' ? item.unit : 'ไม่ระบุ',
      lot_number: item.lot,
      exp_date: sanitizeDate(item.exp),
      value_amount: Number(item.val) || 0,
      invoice_number: item.inv || item.invoiceNumber,
    }));

    const { error: itemsError } = await supabase
      .from('drug_items')
      .insert(itemsToInsert);

    if (itemsError) throw itemsError;

    return { refId };
  }
};