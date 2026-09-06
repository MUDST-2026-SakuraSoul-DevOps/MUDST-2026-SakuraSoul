import { useState } from 'react'
import { ArrowRight } from '@phosphor-icons/react'

/**
 * ตรงกับเฟรม "Admin Login" ใน Figma — SSK-7
 * เลย์เอาต์ split-screen: ครึ่งซ้ายเป็นภาพบรรยากาศ + ข้อความ "The Art of
 * Serenity." มุมซ้ายล่าง, ครึ่งขวาเป็นฟอร์ม Sign In บนพื้นขาว
 *
 * หมายเหตุสำคัญ:
 * - ภาพพื้นหลังครึ่งซ้ายเป็นภาพถ่ายเฉพาะจากดีไซน์ (ไม่มีไฟล์ภาพจริงให้ในซิป/ที่
 *   ผมเข้าถึงได้) เลยใส่เป็น placeholder gradient สีโทนไม้/ครีมแทนไปก่อน ให้
 *   เปลี่ยน `background` ใน LEFT_PANEL_STYLE ด้านล่างเป็นภาพจริงตอนมี asset
 * - backend ยังไม่มี endpoint auth เลย (ดู README) ปุ่ม Sign In เลยแค่
 *   preventDefault ไว้ก่อน ยังไม่ได้ต่อ logic จริง
 * - ยังไม่ได้ wiring เข้า App.tsx/router (เหมือน ticket อื่นก่อนหน้านี้) และยัง
 *   ไม่ได้เพิ่ม dependency ใน package.json
 */

const LEFT_PANEL_STYLE = {
  backgroundImage:
    'linear-gradient(160deg, #e7d9c7 0%, #efe4d4 35%, #f7f0e6 60%, #fbf7f0 100%)',
}

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // TODO: ต่อ endpoint auth จริงตอน backend มี route ให้ (ดูหมายเหตุด้านบน)
  }

  return (
    <div className="flex min-h-screen w-full">
      {/* ครึ่งซ้าย: ภาพบรรยากาศ + ข้อความปิดท้าย */}
      <div className="relative hidden w-1/2 overflow-hidden lg:block" style={LEFT_PANEL_STYLE}>
        <div className="absolute right-0 bottom-10 left-0 flex flex-col gap-2 px-10">
          <span className="text-2xl text-[#f4c2c2]">✿</span>
          <p className="font-heading text-3xl text-white drop-shadow-sm">The Art of Serenity.</p>
        </div>
      </div>

      {/* ครึ่งขวา: ฟอร์ม Sign In */}
      <div className="flex w-full flex-col justify-center px-8 sm:px-16 lg:w-1/2 lg:px-24">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-10 flex items-center gap-2">
            <span className="text-xl text-brand">🌳</span>
            <span className="font-heading text-2xl font-medium text-brand">Sakura Soul</span>
          </div>

          <h1 className="font-heading text-4xl text-ink">Welcome back</h1>
          <p className="mt-2 text-base text-body-muted">
            Please enter your details to access your sanctuary.
          </p>

          <form onSubmit={handleSubmit} className="mt-10 flex flex-col gap-8">
            <label className="flex flex-col gap-2">
              <span className="text-sm text-body-muted">Username</span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="adminsakura01"
                className="w-full border-b border-[rgba(212,194,195,0.5)] bg-transparent py-2 text-base text-ink outline-none placeholder:text-body-muted/60 focus:border-brand"
              />
            </label>

            <label className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-body-muted">Password</span>
                <button type="button" className="text-sm text-brand hover:underline">
                  Forgot Password?
                </button>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border-b border-[rgba(212,194,195,0.5)] bg-transparent py-2 text-base text-ink outline-none focus:border-brand"
              />
            </label>

            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-cta-bg py-3.5 text-base font-medium text-cta-text shadow-sm hover:brightness-95"
            >
              Sign In
              <ArrowRight size={18} weight="bold" />
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
