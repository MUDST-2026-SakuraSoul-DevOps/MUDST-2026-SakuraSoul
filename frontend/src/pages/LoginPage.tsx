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
                className="w-full border-b border-body"
              />
            </div>

            {/* Password Field */}
            <div className="flex flex-col gap-2">
              <label htmlFor="password" className="text-sm text-body-muted">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full border-b border-body"
              />
            </div>

            <button
              type="submit"
              className="flex items-center justify-center gap-2 rounded-md bg-brand py-3 text-base font-medium text-white hover:bg-brand-hover focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2"
            >
              Sign in
              <ArrowRight size={20} />
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}