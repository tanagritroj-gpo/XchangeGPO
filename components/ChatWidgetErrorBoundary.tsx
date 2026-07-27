'use client';

import { Component, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { hasError: boolean };

/**
 * ChatWidgetErrorBoundary
 *
 * กัน bug ใน ChatWidget (ฟีเจอร์ใหม่ที่ยังทดลองอยู่) ไม่ให้ทำทั้งหน้า/ทั้ง
 * (authenticated) layout พังไปด้วย — ถ้า ChatWidget error จะซ่อนตัวมันเอง
 * เงียบๆ (return null) ส่วนเนื้อหาหลักของหน้า (Sidebar, เนื้อหาหน้านั้นๆ,
 * BottomNav) ยังทำงานปกติต่อไปได้ ไม่ได้ error message โชว์ผู้ใช้เพราะเป็น
 * แค่ widget เสริม ไม่ใช่ฟีเจอร์หลักของหน้า
 *
 * ต้องเป็น class component เท่านั้น — React error boundary ยังไม่มี hook
 * version (getDerivedStateFromError / componentDidCatch ใช้ได้กับ class
 * component เท่านั้นตาม API ของ React ปัจจุบัน)
 */
export class ChatWidgetErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: unknown) {
    // log ไว้ให้เห็นใน console เผื่อ debug ทีหลัง แต่ไม่โชว์ผู้ใช้
    console.error('[ChatWidget] เกิดข้อผิดพลาด ซ่อน widget ไว้ไม่ให้กระทบหน้าอื่น:', error, info);
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

export default ChatWidgetErrorBoundary;