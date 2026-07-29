import { defineConfig } from 'vitest/config';
import path from 'path';

// Config แยกจาก vitest.config.ts โดยตั้งใจ — eval/ เรียก Gemini API จริง
// (มีค่าใช้จ่าย, ต้องมี GEMINI_API_KEY, ผลไม่ deterministic 100%) จึงต้อง
// ไม่ปนกับ `npm test`/CI ที่ต้องรันได้แบบไม่มี secret จริงเสมอ
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    include: ['eval/**/*.eval.ts'],
    exclude: ['node_modules', '.next'],
    testTimeout: 30000,
  },
});
