-- request_pings ถูกแทนที่ด้วย notification_log (type='ping') แล้วทั้งหมด — ข้อมูลเดิม
-- ทุกแถวถูกย้ายเข้า notification_log แล้วตอน migration create_notification_log_table
-- ไม่มีโค้ดฝั่ง app จุดไหนอ่าน/เขียนตารางนี้อีกต่อไป (ping-actions.ts, staff-ping-actions.ts
-- เดิม ทั้งหมดสลับไปใช้ notification_log แล้ว) ยืนยันจากผู้ใช้ให้ลบได้
drop table if exists public.request_pings;
