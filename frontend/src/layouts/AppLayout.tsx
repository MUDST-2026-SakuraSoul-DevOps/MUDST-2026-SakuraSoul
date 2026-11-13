import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { NAV_ITEMS } from './nav'
import { MenuIcon, CloseIcon } from '../components/icons'
import { LogoutConfirmModal } from '../components/LogoutConfirmModal'
import { ProfileAvatar } from '../components/ProfileAvatar'
import { useUserProfile } from '../domain/profileStore'
import { fetchLowStockSupplies } from '../api/client'
import { useLoader } from '../hooks/useLoader'

/**
 * โครงหน้าหลักของฝั่งแอดมิน: sidebar เมนูซ้าย + เนื้อหาแต่ละหน้า (Outlet)
 */
export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [profile] = useUserProfile()
  const location = useLocation()

  // ตัวนับของใกล้หมดที่เมนู Maintenance (SSK-171) โหลดใหม่ทุกครั้งที่เปลี่ยนหน้า เติมของแล้วตัวเลขจะลดตาม
  const lowStock = useLoader(fetchLowStockSupplies, 'Could not load low stock items', [location.pathname, location.search])
  const lowStockCount = lowStock.data?.length ?? 0

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
        className={`fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] transform flex-col justify-between overflow-y-auto border-r border-sidebar-border bg-sidebar py-8 pr-[25px] pl-6 transition-transform duration-200 ease-out lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <button
          type="button"
          className="icon-button absolute top-4 right-2 rounded-md p-1.5 text-ink-muted hover:bg-black/5 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
        >
          <CloseIcon aria-hidden="true" className="ui-icon size-icon-control" />
        </button>

        <div className="flex flex-col pb-12">
          <h1 className="font-heading text-2xl leading-normal font-medium text-brand">Sakura Soul</h1>
          <p className="text-xs leading-normal font-medium text-ink-muted">Admin Management</p>
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
                className={`flex w-full items-center gap-4 rounded px-3 py-2 text-sm leading-normal font-semibold tracking-[0.7px] text-ink-muted ${
                  isActive ? 'bg-accent-soft' : 'hover:bg-black/5'
                }`}
              >
                <Icon aria-hidden="true" className="ui-icon size-icon-control" />
                {item.label}
                {/*
                  ชื่อลิงก์ต้องยังเป็น "Maintenance" เฉย ๆ ตัวเลขจึงซ่อนจาก screen reader แล้วบอกผ่าน title แทน
                  ไม่งั้นลิงก์จะชื่อ "Maintenance 1" และใครที่หาเมนูด้วยชื่อจะหาไม่เจอ
                */}
                {item.path === '/maintenance' && lowStockCount > 0 && (
                  <span
                    aria-hidden="true"
                    data-testid="low-stock-count"
                    title={`${lowStockCount} low stock ${lowStockCount === 1 ? 'item' : 'items'}`}
                    className="ml-auto rounded-full bg-honey-140 px-2 py-0.5 text-xs font-semibold text-honey-615"
                  >
                    {lowStockCount}
                  </span>
                )}
              </NavLink>
            )
          })}
        </nav>

        <div className="flex items-center gap-2 border-t border-sidebar-border pt-[25px]">
          <NavLink
            to="/settings"
            onClick={() => setMobileOpen(false)}
            aria-label="Account Settings"
            className={({ isActive }) =>
              `flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1.5 transition-colors ${
                isActive ? 'bg-accent-soft' : 'hover:bg-black/5'
              }`
            }
          >
            <div className="size-10 shrink-0 overflow-hidden rounded-xl border border-avatar-ring shadow-sm">
              <ProfileAvatar src={profile.avatarUrl} alt={profile.fullName} size={40} className="rounded-xl" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm leading-normal font-semibold tracking-[0.7px] text-ink">{profile.fullName}</p>
              {/* แอดมินที่ยังไม่ได้ตั้ง APP_ADMIN_DISPLAY_NAME จะมีชื่อว่า Administrator
                  ซึ่งซ้ำกับตำแหน่งตั้งต้นพอดี ซ่อนบรรทัดล่างไว้จะได้ไม่ขึ้นคำเดิมสองรอบ */}
              {profile.role && profile.role !== profile.fullName && (
                <p className="break-words text-xs leading-normal font-medium text-ink-muted">{profile.role}</p>
              )}
            </div>
          </NavLink>
          <LogoutConfirmModal />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col lg:pl-72">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-sidebar-border bg-white px-4 sm:px-6 lg:hidden">
          <button
            type="button"
            className="icon-button rounded-md p-1.5 text-ink-muted hover:bg-black/5"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <MenuIcon aria-hidden="true" className="ui-icon size-icon-control" />
          </button>
          <span className="text-sm font-semibold text-ink">{activeItem?.label ?? 'Sakura Soul'}</span>
        </header>

        <main className="flex-1 bg-page-bg/50 min-w-0 p-4 sm:px-8 sm:py-12">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
