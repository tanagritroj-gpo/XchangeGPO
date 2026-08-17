// ค่าคงที่ร่วมระหว่างฝั่ง client (app/(authenticated)/form/components/Step2Items.tsx) และฝั่ง
// server (app/actions/form-actions.ts) สำหรับฟีเจอร์แนบรูปใบส่งของ — เดิมประกาศแยกกันคนละไฟล์
// ผูกกันด้วยคอมเมนต์ "ต้องตรงกับ...ในไฟล์ X" เท่านั้น ไม่มีอะไรบังคับจริง เสี่ยงหลุดไม่ตรงกัน
// ถ้าแก้ไฟล์เดียวแล้วลืมอีกไฟล์ — รวมเป็นจุดเดียวให้ทั้งสองฝั่ง import ตรงนี้แทน (ไฟล์นี้เป็นแค่
// ค่าคงที่ล้วนๆ ไม่มี import ที่ผูกกับ server-only จึงปลอดภัยสำหรับทั้ง client component และ
// server action)
export const MAX_DELIVERY_PHOTOS = 5; // เผื่อใบส่งของหลายหน้า/ถ่ายหน้า-หลัง ไม่ใช่ 1 รูปตายตัว
export const MAX_DELIVERY_PHOTO_BYTES = 2 * 1024 * 1024; // 2MB หลังบีบอัดฝั่ง client แล้ว
