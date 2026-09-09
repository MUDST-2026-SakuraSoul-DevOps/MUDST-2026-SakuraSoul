import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { NAV_ITEMS } from './nav'
import { MenuIcon, CloseIcon, LogOutIcon } from '../components/icons'

/**
 * โครงหน้าหลักของฝั่งแอดมิน: sidebar เมนูซ้าย + เนื้อหาแต่ละหน้า (Outlet)
 *
 * ก๊อปมาจาก Figma component "SideNavBar/Default/Default" (node 119:2395)
 * ตรง ๆ ทั้ง layout, สี, ฟอนต์, ระยะห่าง — ดูที่มาของสี/ฟอนต์ได้ที่
 * src/index.css ดีไซน์ต้นฉบับเป็น desktop-only (1440px) ไม่มี breakpoint มือถือ
 * ส่วน hamburger/overlay สำหรับจอเล็กเป็นสิ่งที่เพิ่มเข้ามาเองให้ใช้งานได้จริง
 * ไม่ได้อยู่ใน Figma
 *
 * ดีไซน์ยังไม่มีรูปโปรไฟล์ผู้จัดการจริง (ระบบ login ยังไม่ทำ ดู README) เลยใช้
 * ตัวอักษรย่อแทนรูปไปก่อน พอมี auth จริงค่อยเปลี่ยนเป็นรูปจากบัญชีผู้ใช้
 */
export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  const activeItem = NAV_ITEMS.find((item) =>
    item.matchPrefix ? location.pathname.startsWith(item.path) : location.pathname === item.path,
  )

  return (
    <div className="flex min-h-screen bg-white font-sans text-ink">
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 transform flex-col justify-between border-r border-sidebar-border bg-sidebar py-8 pr-[25px] pl-6 transition-transform duration-200 ease-out lg:static lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <button
          type="button"
          className="absolute top-4 right-2 rounded-md p-1.5 text-ink-muted hover:bg-black/5 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="ปิดเมนู"
        >
          <CloseIcon size={18} />
        </button>

        <div className="flex flex-col pb-12">
          <h1 className="font-heading text-2xl leading-8 font-medium text-brand">Sakura Soul</h1>
          <p className="text-xs leading-4 font-medium text-ink-muted">Admin Management</p>
        </div>

        <nav className="flex flex-1 flex-col gap-4">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const isActive = item.matchPrefix
              ? location.pathname.startsWith(item.path)
              : location.pathname === item.path
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={!item.matchPrefix}
                onClick={() => setMobileOpen(false)}
                className={`flex w-full items-center gap-4 rounded px-3 py-2 text-sm leading-5 font-semibold tracking-[0.7px] text-ink-muted ${
                  isActive ? 'bg-accent-soft' : 'hover:bg-black/5'
                }`}
              >
                <Icon size={18} />
                {item.label}
              </NavLink>
            )
          })}
        </nav>

        <div className="flex items-center gap-3 border-t border-sidebar-border pt-[25px]">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-avatar-ring bg-accent-soft/40 text-xs font-semibold text-brand">
            HS
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm leading-5 font-semibold tracking-[0.7px] text-ink">Haruka S.</p>
            <p className="truncate text-xs leading-4 font-medium text-ink-muted">Property Manager</p>
          </div>
          <button type="button" className="shrink-0 text-ink-muted hover:text-ink" aria-label="ออกจากระบบ">
            <LogOutIcon size={24} />
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-sidebar-border bg-white px-4 sm:px-6 lg:hidden">
          <button
            type="button"
            className="rounded-md p-1.5 text-ink-muted hover:bg-black/5"
            onClick={() => setMobileOpen(true)}
            aria-label="เปิดเมนู"
          >
            <MenuIcon size={20} />
          </button>
          <span className="text-sm font-semibold text-ink">{activeItem?.label ?? 'Sakura Soul'}</span>
        </header>

        <main className="flex-1 bg-page-bg/50 p-6 sm:px-8 sm:py-16">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
