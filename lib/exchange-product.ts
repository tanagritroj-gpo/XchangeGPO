// สินค้าที่ขอแลกเปลี่ยน — เดิมเก็บเป็นคอลัมน์ text เดียว (requests.exchange_product ที่ drop
// ไปแล้วใน migration 20260830023041) ตอนนี้แตกเป็น 3 คอลัมน์: type ("รายการเดิม"/"อื่นๆ"),
// list (JSON array ของชื่อยาที่ติ๊กเลือกจากรายการในคำร้อง), other (ข้อความอิสระกรณี "อื่นๆ")
// helper นี้เป็นที่เดียวที่ประกอบ 3 คอลัมน์นั้นกลับเป็นข้อความอ่านง่าย ใช้ร่วมกันทั้ง
// PDF (pdf-service), Excel export (manager/downloads-export) และหน้า Review

type ExchangeProductColumns = {
  exchange_product_type?: string | null;
  exchange_product_list?: string | null;
  exchange_product_other?: string | null;
};

// list เก็บเป็น JSON.stringify(string[]) — parse กลับแบบไม่ throw (ข้อมูลเก่า/ที่กรอกผ่าน
// server action ตรงอาจไม่ใช่ JSON ที่ถูกต้อง) fallback เป็น [ค่าดิบ] ถ้า parse ไม่ได้
export function parseExchangeList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === 'string' && x.trim() !== '');
  } catch {
    /* ไม่ใช่ JSON — ใช้ค่าดิบเป็นรายการเดียว */
  }
  return raw.trim() ? [raw.trim()] : [];
}

// คืนข้อความบรรทัดเดียวสำหรับช่อง "และยินยอมให้แลกเปลี่ยนเป็นสินค้า ..." บนฟอร์ม / คอลัมน์ export
// คืน '' ถ้าไม่ใช่คำร้องแลกเปลี่ยน หรือยังไม่ได้ระบุสินค้า
export function formatExchangeProduct(r: ExchangeProductColumns): string {
  const type = r.exchange_product_type?.trim();
  if (!type) return '';
  if (type === 'รายการเดิม') {
    const names = parseExchangeList(r.exchange_product_list);
    return names.length ? names.join(', ') : type;
  }
  return r.exchange_product_other?.trim() || type;
}
