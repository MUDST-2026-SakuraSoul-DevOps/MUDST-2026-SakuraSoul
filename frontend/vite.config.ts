import { defineConfig } from 'vitest/config'
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
    css: false,
    // เทสยิงผ่าน backend จำลองใน src/api/mockApi.ts เสมอ ไม่แตะ network จริง
    // ค่า VITE_API_MOCK ของตอนเทสอยู่ในไฟล์ .env.test เพราะ vitest รันด้วย
    // mode test แล้ว Vite อ่านไฟล์นั้นให้เอง (ตั้งที่ test.env ตรงนี้ไม่ไปถึง
    // import.meta.env)
  },
})
