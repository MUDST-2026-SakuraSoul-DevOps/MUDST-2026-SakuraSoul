import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { LogOutIcon } from './icons'

function SakuraCrescentLogo({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <svg
        width="56"
        height="56"
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="size-14"
      >
        {/* Crescent moon curve */}
        <path
          d="M58 20C42 24 34 40 38 58C42 74 58 82 72 78C56 86 36 78 28 62C20 46 26 28 44 18C48 16 54 18 58 20Z"
          fill="#1c1b1c"
          opacity="0.85"
        />
        {/* Branch / twig */}
        <path
          d="M40 52C46 45 48 35 44 26M42 42C48 38 52 38 56 36M41 48C46 48 52 46 55 43M38 32C41 30 46 29 48 27"
          stroke="#1c1b1c"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        {/* Blossom petals in pink */}
        <circle cx="44" cy="24" r="2.5" fill="#f4a8b2" />
        <circle cx="41.5" cy="22.5" r="1.5" fill="#e88998" />
        <circle cx="56" cy="35" r="2.5" fill="#f4a8b2" />
        <circle cx="58" cy="37" r="1.5" fill="#e88998" />
        <circle cx="55" cy="42" r="2.5" fill="#f4a8b2" />
        <circle cx="53" cy="44" r="1.5" fill="#e88998" />
        <circle cx="48" cy="27" r="2" fill="#f4a8b2" />
        <circle cx="36" cy="36" r="1.8" fill="#f4a8b2" />
        <circle cx="46" cy="46" r="2" fill="#f4a8b2" />
      </svg>
      <span
        className="mt-0.5 text-[11px] font-medium tracking-[2.5px] text-[#2d2b2c]"
        style={{ fontFamily: "'Cinzel', 'Playfair Display', serif" }}
      >
        SAKURA
      </span>
    </div>
  )
}

/**
 * ตรงกับเฟรม "Log Out" popup ใน Figma — SSK-8 / SSK-101
 * เด้งเป็น modal ตรงกลางจอทับ overlay มืด เมื่อกดไอคอน logout ที่ sidebar
 */
export function LogoutConfirmModal({
  onConfirm,
}: {
  onConfirm?: () => void
}) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  function handleConfirm() {
    setOpen(false)
    if (onConfirm) {
      onConfirm()
    } else {
      navigate('/login')
    }
  }

  return (
    <>
      <button
        type="button"
        className="group relative flex size-9 shrink-0 items-center justify-center rounded-xl text-ink-muted transition-all duration-200 hover:bg-white hover:text-ink hover:shadow-[0_4px_12px_rgba(0,0,0,0.12)] active:scale-95 cursor-pointer"
        aria-label="ออกจากระบบ"
        onClick={() => setOpen(true)}
      >
        <LogOutIcon size={22} className="transition-transform duration-200 group-hover:translate-x-0.5" />
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => setOpen(false)}
          >
            <div
              className="flex w-full max-w-[340px] flex-col items-center gap-3 rounded-2xl bg-white px-7 py-7 text-center shadow-2xl animate-in fade-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <SakuraCrescentLogo />

              <h2 className="text-lg font-bold text-[#1b1c1c]">Log Out</h2>
              <p className="text-xs font-normal text-[#605555]">
                Are you sure you want to logout?
              </p>

              <div className="mt-3 flex w-full items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="w-28 rounded-lg bg-[#ee6a6c] py-2 text-xs font-bold tracking-wider text-white uppercase shadow-sm transition-all hover:bg-[#e05658] hover:shadow-md active:scale-95 cursor-pointer"
                >
                  CANCLE
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  className="w-28 rounded-lg bg-[#a2ea9f] py-2 text-xs font-bold tracking-wider text-[#1e3e1e] uppercase shadow-sm transition-all hover:bg-[#90de8d] hover:shadow-md active:scale-95 cursor-pointer"
                >
                  CONFIRM
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
