import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  { ignores: [".next/**", "node_modules/**"] },
  ...nextCoreWebVitals,
  ...nextTypescript,
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
