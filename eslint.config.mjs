import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  { ignores: [".next/**", "node_modules/**"] },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // โค้ดเบสนี้ใช้ prefix `_` เป็นธรรมเนียมสื่อ "ตั้งใจไม่ใช้ตัวแปรนี้" อยู่แล้ว (เช่น
    // `const { organizations: _omit, ...rest } = row` ตอน destructure ทิ้งบาง field,
    // หรือ stub method ใน test harness ที่รับ arg ตาม signature จริงแต่ไม่ได้ใช้ภายใน)
    // แต่ rule เริ่มต้นของ eslint-config-next ไม่รู้จัก pattern นี้ เลยขึ้นเตือนทั้งที่ตั้งใจ
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      // ทั้งโปรเจกต์นี้ตั้งใจ fetch ข้อมูลฝั่ง client ผ่าน server action + useEffect
      // โดยตรง (ไม่ใช้ React Query/SWR/Suspense) และมี pattern ตั้งค่า state ให้ตรง
      // client เสมอกันปัญหา SSR/client mismatch (เช่น `setToday(new Date()...)`,
      // `setMounted(true)`) ซ้ำกันเกือบทุกหน้า dashboard — rule นี้ (มากับ React
      // Compiler tooling ใน eslint-config-next ตัวใหม่) ออกแบบมาผลักดันให้ย้ายไป
      // สถาปัตยกรรมแบบอื่น (React Query/Server Components) ซึ่งไม่ใช่ทิศทางที่ระบบนี้
      // เลือกใช้ ปิดเฉพาะ rule นี้ไว้แทนการรื้อ data-fetching ของ ~20 ไฟล์เพื่อเลี่ยง
      // เตือนที่ไม่ใช่บั๊กจริง (เหมือนที่ react-hooks/incompatible-library ก็ปล่อยผ่าน
      // อยู่แล้วด้วยเหตุผลเดียวกัน — ทั้งสอง rule มาจาก React Compiler ตัวเดียวกัน)
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    // เทสต์ทำงานกับ mock/union return types ที่ TS แคบไม่ได้ตามธรรมชาติ (เช่น
    // ผลลัพธ์ที่เป็น {error} | {data} แล้วเทสต์เช็คแค่ branch เดียวต่อเคส หรือ
    // dynamic import namespace ที่ต้อง monkey-patch สำหรับ mocking) — บังคับ type
    // แคบทุกจุดในเทสต์ให้ค่าไม่คุ้มความยุ่งยาก จึงผ่อนกฎนี้เฉพาะไฟล์เทสต์เท่านั้น
    files: ["test/**/*.ts", "**/__tests__/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];

export default eslintConfig;
