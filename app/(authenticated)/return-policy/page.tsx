import type { Metadata } from "next";
import { ReturnPolicySection } from "@/components/ReturnPolicySection";

// หน้านี้อยู่ใน route group (authenticated) — ต้องล็อกอินก่อนถึงจะเข้าได้
// การเช็ค session ทำที่ app/(authenticated)/layout.tsx แล้ว (redirect ก่อน
// render ถ้าไม่มี session) หน้านี้จึงไม่ต้องเช็คซ้ำเอง — ตาม pattern เดียวกับ
// /form และ /welcome ที่มีอยู่แล้วในระบบ

export const metadata: Metadata = {
  title: "หลักเกณฑ์การรับคืนผลิตภัณฑ์ | GPO Xchange",
  description:
    "แนวทางการรับคืน แลกเปลี่ยน และลดหนี้ผลิตภัณฑ์ยาขององค์การเภสัชกรรม",
};

export default function ReturnPolicyPage() {
  return <ReturnPolicySection />;
}