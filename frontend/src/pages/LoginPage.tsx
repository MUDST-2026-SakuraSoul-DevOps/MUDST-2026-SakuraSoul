import { useState } from 'react'
import { ArrowRight } from '@phosphor-icons/react'

/**
 * ตรงกับเฟรม "Admin Login" ใน Figma — SSK-7
 *
 * เลย์เอาต์ split-screen:
 * - ครึ่งซ้าย: ภาพบรรยากาศญี่ปุ่น (/login-bg.png) พร้อม gradient overlay
 *   ข้างล่างมีไอคอนดอกบัว + ข้อความ "The Art of Serenity."
 * - ครึ่งขวา: ฟอร์ม Sign In บนพื้นขาว (โลโก้ Sakura Soul, Welcome back,
 *   ช่อง Username/Password, ปุ่ม Sign In สีชมพู)
 *
 * Typography จาก Figma Inspect:
 *   - "Welcome back": Manrope, Regular (400), 32px, line-height 40px,
 *     letter-spacing -0.32px
 *   - Labels (Username/Password): 14px, text-[#504444]
 *   - Subtitle: 16px, text-[#504444]
 */

/** SVG ดอกบัว/ซากุระ ก๊อปมาจากดีไซน์ Figma */
function LotusIcon({ className = '', size = 24 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* กลีบกลาง */}
      <path
        d="M12 3C12 3 9 8 9 12.5C9 15.5 10.3 17 12 17C13.7 17 15 15.5 15 12.5C15 8 12 3 12 3Z"
        fill="currentColor"
        opacity="0.9"
      />
      {/* กลีบซ้าย */}
      <path
        d="M7.5 6C7.5 6 4 10 4.5 14C4.8 16.5 6.5 17.5 8 17C9.5 16.5 10 14.5 9.5 12C8.8 8.5 7.5 6 7.5 6Z"
        fill="currentColor"
        opacity="0.7"
      />
      {/* กลีบขวา */}
      <path
        d="M16.5 6C16.5 6 20 10 19.5 14C19.2 16.5 17.5 17.5 16 17C14.5 16.5 14 14.5 14.5 12C15.2 8.5 16.5 6 16.5 6Z"
        fill="currentColor"
        opacity="0.7"
      />
      {/* กลีบซ้ายนอก */}
      <path
        d="M4 9C4 9 1.5 12.5 2.5 15.5C3 17 4.5 17.5 5.5 16.5C6.5 15.5 6.5 13.5 5.5 11.5C4.8 10 4 9 4 9Z"
        fill="currentColor"
        opacity="0.5"
      />
      {/* กลีบขวานอก */}
      <path
        d="M20 9C20 9 22.5 12.5 21.5 15.5C21 17 19.5 17.5 18.5 16.5C17.5 15.5 17.5 13.5 18.5 11.5C19.2 10 20 9 20 9Z"
        fill="currentColor"
        opacity="0.5"
      />
      {/* ก้านล่าง */}
      <path
        d="M12 17C12 17 11 19 10 20.5M12 17C12 17 13 19 14 20.5"
        stroke="currentColor"
        strokeWidth="0.8"
        opacity="0.6"
      />
    </svg>
  )
}

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // TODO: ต่อ endpoint auth จริงตอน backend มี route ให้
  }

  return (
    <div className="flex min-h-screen w-full font-sans">
      {/* ═══════════════ ครึ่งซ้าย: ภาพพื้นหลัง ═══════════════ */}
      <div
        className="relative hidden w-1/2 lg:block"
        role="img"
        aria-label="Japanese zen room background"
      >
        {/* Background image */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: 'url(/login-bg.png)' }}
        />
        {/* Gradient overlay ด้านล่าง */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />

        {/* Tagline ด้านล่างซ้าย */}
        <div className="absolute bottom-10 left-10 flex items-center gap-2.5">
          <LotusIcon className="text-[#e8b4b8]" size={28} />
          <span
            className="text-lg tracking-wide text-white"
            style={{ fontFamily: "'Manrope', sans-serif", fontStyle: 'italic', fontWeight: 400 }}
          >
            The Art of Serenity.
          </span>
        </div>
      </div>

      {/* ═══════════════ ครึ่งขวา: ฟอร์ม Sign In ═══════════════ */}
      <div className="flex w-full flex-col justify-center bg-[#faf9f8] px-8 sm:px-16 lg:w-1/2 lg:px-24">
        <div className="mx-auto w-full max-w-[400px]">
          {/* โลโก้ Sakura Soul */}
          <div className="mb-8 flex items-center gap-2">
            <LotusIcon className="text-[#c4878a]" size={22} />
            <span
              className="text-[18px] font-medium tracking-[0.5px] text-[#7a5457]"
              style={{ fontFamily: "'Manrope', sans-serif" }}
            >
              Sakura Soul
            </span>
          </div>

          {/* Welcome back — Manrope Regular 32px / line-height 40px / letter-spacing -0.32px */}
          <h1
            className="text-[32px] leading-[40px] font-normal text-[#1b1c1c]"
            style={{
              fontFamily: "'Manrope', sans-serif",
              letterSpacing: '-0.32px',
            }}
          >
            Welcome back
          </h1>
          <p className="mt-2 text-[16px] leading-[24px] text-[#504444]">
            Please enter your details to access your sanctuary.
          </p>

          {/* ฟอร์ม */}
          <form onSubmit={handleSubmit} className="mt-10 flex flex-col gap-7">
            {/* Username Field */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="username" className="text-[14px] font-medium text-[#504444]">
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
                className="w-full border-b border-[#d4c2c3] bg-transparent pb-2.5 text-[15px] text-[#1b1c1c] outline-none transition-colors placeholder:text-[#b0a8a8] focus:border-[#7a5457]"
              />
            </div>

            {/* Password Field */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-[14px] font-medium text-[#504444]">
                  Password
                </label>
                <button
                  type="button"
                  className="text-[13px] font-medium text-[#7a5457] hover:underline"
                >
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
                placeholder="••••••••"
                className="w-full border-b border-[#d4c2c3] bg-transparent pb-2.5 text-[15px] text-[#1b1c1c] outline-none transition-colors placeholder:text-[#b0a8a8] focus:border-[#7a5457]"
              />
            </div>

            {/* Sign In Button */}
            <button
              type="submit"
              className="mt-2 flex items-center justify-center gap-2 rounded-lg bg-[#f4c2c2] py-3.5 text-[15px] font-semibold text-[#504444] shadow-[0px_4px_12px_rgba(122,84,87,0.1)] transition-all hover:bg-[#f0b3b3] hover:shadow-[0px_4px_16px_rgba(122,84,87,0.18)] active:scale-[0.99]"
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