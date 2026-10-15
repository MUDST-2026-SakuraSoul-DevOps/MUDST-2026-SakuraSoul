import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // proxy ไปที่ backend ตอน dev จะได้ไม่ต้องไปตั้ง CORS ฝั่ง Spring
    // ตอน build ขึ้น production nginx เป็นคน proxy ให้แทน
    proxy: {
      '/api': { target: 'http://localhost:8080', changeOrigin: true },
      '/actuator': { target: 'http://localhost:8080', changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // E2E ย้ายออกไปเป็นโมดูล e2e/ ของตัวเองแล้ว ที่นี่จึงเหลือแต่ unit test ของหน้าเว็บ
    exclude: [...configDefaults.exclude],
    css: false,
    /*
      วัด coverage ของหน้าเว็บ สั่งด้วย `npm run test:coverage`
      ไม่ได้เปิดไว้ตลอดเพราะ v8 ต้อง instrument โค้ดทุกไฟล์ ทำให้ `npm run test`
      ที่ใช้ระหว่างเขียนงานช้าลงโดยไม่จำเป็น

      ต้องมี include ที่กวาดทั้ง src ไม่งั้นรายงานจะนับเฉพาะไฟล์ที่ถูก import ระหว่างเทส
      ไฟล์ที่ไม่มีใครเทสเลยจะหายไปจากรายงาน แล้ว % จะสวยเกินจริง
      (เมื่อก่อนใช้ตัวเลือก `all: true` แต่ Vitest 4 เอาออกแล้ว กลายเป็นพฤติกรรมตั้งต้นแทน)
    */
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        // จุดเริ่มแอป เรียก createRoot อย่างเดียว ไม่มีตรรกะให้ผิด
        'src/main.tsx',
        // ตัวเทสเอง กับของที่มีไว้ให้เทสใช้
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
        // backend จำลอง ไม่ได้ขึ้น production ตัวมันเองคือของปลอมที่เอาไว้เทส
        'src/api/mockApi.ts',
        // type ล้วน ๆ compile แล้วไม่เหลือโค้ด
        'src/api/types.ts',
        'src/**/*.d.ts',
      ],
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
    },
    // เทสยิงผ่าน backend จำลองใน src/api/mockApi.ts เสมอ ไม่แตะ network จริง
    // ค่า VITE_API_MOCK ของตอนเทสอยู่ในไฟล์ .env.test เพราะ vitest รันด้วย
    // mode test แล้ว Vite อ่านไฟล์นั้นให้เอง (ตั้งที่ test.env ตรงนี้ไม่ไปถึง
    // import.meta.env)
  },
})
