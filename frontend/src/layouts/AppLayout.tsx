import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { NAV_ITEMS } from './nav'
import { MenuIcon, CloseIcon } from '../components/icons'
import { LogoutConfirmModal } from '../components/LogoutConfirmModal'
import { ProfileAvatar } from '../components/ProfileAvatar'
import { useUserProfile } from '../domain/profileStore'

/**
 * โครงหน้าหลักของฝั่งแอดมิน: sidebar เมนูซ้าย + เนื้อหาแต่ละหน้า (Outlet)
 */
export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [profile] = useUserProfile()
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
        className={`fixed inset-y-0 left-0 z-40 flex w-64 transform flex-col justify-between overflow-y-auto border-r border-sidebar-border bg-sidebar py-8 pr-[25px] pl-6 transition-transform duration-200 ease-out lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <button
          type="button"
          className="absolute top-4 right-2 rounded-md p-1.5 text-ink-muted hover:bg-black/5 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
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
              <p className="truncate text-sm leading-5 font-semibold tracking-[0.7px] text-ink">{profile.fullName}</p>
              <p className="truncate text-xs leading-4 font-medium text-ink-muted">{profile.role}</p>
            </div>
          </NavLink>
          <LogoutConfirmModal />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-sidebar-border bg-white px-4 sm:px-6 lg:hidden">
          <button
            type="button"
            className="rounded-md p-1.5 text-ink-muted hover:bg-black/5"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
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
