import { useState } from 'react'
import { ArrowRight } from '@phosphor-icons/react'

/**
 * ตรงกับเฟรม "Admin Login" ใน Figma — SSK-7
 * เลย์เอาต์ split-screen: ครึ่งซ้ายเป็นภาพบรรยากาศ + ข้อความ "The Art of
 * Serenity." มุมซ้ายล่าง, ครึ่งขวาเป็นฟอร์ม Sign In บนพื้นขาว
 *
 * หมายเหตุสำคัญ:
 * - ภาพพื้นหลังครึ่งซ้าย: ทีมส่งไฟล์จริงมาให้แล้ว เก็บไว้ที่
 *   frontend/public/login-bg.png (อ้างอิงเป็น /login-bg.png ด้านล่าง) — ไฟล์ที่
 *   ได้มามีความละเอียด 646x834 ซึ่งเป็นสัดส่วนโครปจากดีไซน์ ไม่ใช่ไฟล์ต้นฉบับ
 *   ความละเอียดสูง ถ้าจอใหญ่มากอาจเบลอเล็กน้อย — ถ้ามีไฟล์ export ความละเอียด
 *   สูงกว่านี้จาก Figma ทีหลัง ค่อยเอามาแทนที่ path เดิมได้เลย
 * - backend ยังไม่มี endpoint auth เลย (ดู README) ปุ่ม Sign In เลยแค่
 *   preventDefault ไว้ก่อน ยังไม่ได้ต่อ logic จริง
 * - ยังไม่ได้ wiring เข้า App.tsx/router (เหมือน ticket อื่นก่อนหน้านี้) และยัง
 *   ไม่ได้เพิ่ม dependency ใน package.json
 */

const LEFT_PANEL_STYLE = {
  backgroundImage: 'url(/login-bg.png)',
  backgroundSize: 'cover',
  backgroundPosition: 'center',
}

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  functionโค้ดที่ได้รับการแก้ไขแล้วครับ

สาเหตุเกิดจาก `<button>` ซ้อนอยู่ใน `<label>` เดียวกันกับ `<input>` ซึ่งในสเปก HTML นั้น `<button>` เป็น labelable element ทำให้ `getByLabelText('Password')` ใน unit test (รวมถึง Accesssibility / Screen Reader) ไปจับเจอ `<button type="button">Forgot Password?</button>` เป็นตัวแรกแทนที่จะเป็น `<input type="password">`

### โค้ดที่แก้ไขแล้ว (`LoginPage.tsx`)

```tsx
import { useState } from 'react'
import { ArrowRight } from '@phosphor-icons/react'

/**
 * ตรงกับเฟรม "Admin Login" ใน Figma — SSK-7
 * เลย์เอาต์ split-screen: ครึ่งซ้ายเป็นภาพบรรยากาศ + ข้อความ "The Art of
 * Serenity." มุมซ้ายล่าง, ครึ่งขวาเป็นฟอร์ม Sign In บนพื้นขาว
 */

const LEFT_PANEL_STYLE = {
  backgroundImage: 'url(/login-bg.png)',
  backgroundSize: 'cover',
  backgroundPosition: 'center',
}

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // TODO: ต่อ endpoint auth จริงตอน backend มี route ให้
  }

  return (
    <div className="flex min-h-screen w-full">
      {/* ครึ่งซ้าย: ภาพพื้นหลัง /login-bg.png */}
      <div className="hidden w-1/2 lg:block" style={LEFT_PANEL_STYLE} role="img" aria-label="The Art of Serenity." />

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
            {/* Username Field */}
            <div className="flex flex-col gap-2">
              <label htmlFor="username" className="text-sm text-body-muted">
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="adminsakura01"
                className="w-full border-b border-[rgba(212,194,195,0.5)] bg-transparent py-2 text-base text-ink outline-none placeholder:text-body-muted/60 focus:border-brand"
              />
            </div>

            {/* Password Field */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-sm text-body-muted">
                  Password
                </label>
                <button type="button" className="text-sm text-brand hover:underline">
                  Forgot Password?
                </button>
              </div>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border-b border-[rgba(212,194,195,0.5)] bg-transparent py-2 text-base text-ink outline-none focus:border-brand"
              />
            </div>

            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-cta-bg py-3.5 text-base font-medium text-cta-text shadow-sm hover:brightness-95"
            >
              Sign In
              <ArrowRight size="{18}" weight="bold"/>
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}