// จังหวัดที่ครอบคลุมสำหรับ sale — สะกดตามที่ใช้อยู่แล้วใน RegisterForm.tsx (ประเภทลูกค้าปลายทาง)
export const SOUTHERN_PROVINCES = ['สงขลา', 'ตรัง', 'สตูล', 'พัทลุง', 'ยะลา', 'ปัตตานี', 'นราธิวาส'] as const;

export type OrgTypeValue = (typeof ORG_TYPE_OPTIONS)[number]['value'];
export type CustomerBucket = 'private' | 'government';

// ประเภทหน่วยงานของลูกค้า — เลือกตอนลงทะเบียนลูกค้า แล้วจับกลุ่มเป็น bucket
// เอกชน/ภาครัฐ เพื่อจับคู่กับขอบเขตที่พนักงาน sale เลือกดูแล
export const ORG_TYPE_OPTIONS = [
  { value: 'gov_hospital', label: 'โรงพยาบาลรัฐ', bucket: 'government' },
  { value: 'private_hospital', label: 'โรงพยาบาลเอกชน', bucket: 'private' },
  { value: 'clinic', label: 'คลินิค', bucket: 'private' },
  { value: 'pharmacy', label: 'ร้านยา', bucket: 'private' },
  { value: 'gov_other', label: 'หน่วยงานรัฐอื่นๆ', bucket: 'government' },
] as const satisfies ReadonlyArray<{ value: string; label: string; bucket: CustomerBucket }>;

// ตัวเลือกขอบเขตดูแลของ sale ตอนลงทะเบียน — เลือกได้มากกว่า 1
export const SALE_CUSTOMER_TYPE_OPTIONS = [
  { value: 'private', label: 'ลูกค้าเอกชน', hint: 'โรงพยาบาลเอกชน, คลินิค, ร้านยา' },
  { value: 'government', label: 'ลูกค้าภาครัฐ', hint: 'โรงพยาบาลรัฐ, หน่วยงานรัฐอื่นๆ' },
] as const satisfies ReadonlyArray<{ value: CustomerBucket; label: string; hint: string }>;

// ขยาย bucket ('private'/'government') ที่ sale เลือกไว้ ให้เป็น org_type ดิบ
// สำหรับใช้กรองข้อมูลลูกค้าจริงใน query
export function expandToOrgTypes(buckets: string[]): string[] {
  return ORG_TYPE_OPTIONS.filter((o) => buckets.includes(o.bucket)).map((o) => o.value);
}
