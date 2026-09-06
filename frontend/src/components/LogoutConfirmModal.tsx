import { useState } from 'react'
import { LogOutIcon } from './icons'

/**
 * ตรงกับเฟรม "Log Out" popup ใน Figma — SSK-8
 * เด้งเป็น modal ตรงกลางจอทับ overlay มืด เมื่อกดไอคอน logout ที่ sidebar
 * (ไอคอนเดิมอยู่ที่ src/layouts/AppLayout.tsx บรรทัดที่มี LogOutIcon)
 *
 * คงดีไซน์เดิมตามภาพทุกอย่างตามที่ทีมยืนยัน ไม่ปรับเปลี่ยน รวมถึงข้อความปุ่ม
 * "CANCLE" (สะกดแบบนี้ในดีไซน์ต้นฉบับ ไม่ใช่ผมพิมพ์ผิด — คงไว้ตามภาพ)
 *
 * เป็น component แยกที่มี trigger (ไอคอน logout) ในตัวเอง ให้เอาไปแทนที่ปุ่ม
 * logout เปล่า ๆ ใน AppLayout.tsx ได้เลยตอน wiring scaffold จริง — รอบนี้ยัง
 * ไม่ได้แก้ AppLayout.tsx ตรง ๆ (เหมือน ticket อื่นก่อนหน้านี้ที่ยังไม่ wiring
 * เข้า App.tsx/router/deps)
 *
 * backend ยังไม่มี endpoint auth/session เลย ปุ่ม CONFIRM เลยยังไม่ได้ต่อ logic
 * จริง (แค่ปิด modal ไปก่อน) รอ endpoint logout จริงค่อยเปลี่ยนเป็นเรียก API +
 * เคลียร์ session แล้ว redirect ไปหน้า Login (SSK-7)
 */

export function LogoutConfirmModal() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        className="shrink-0 text-ink-muted hover:text-ink"
        aria-label="ออกจากระบบ"
        onClick={() => setOpen(true)}
      >
        <LogOutIcon size={24} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setOpen(false)}
        >
          <div
            className="mx-4 flex w-full max-w-sm flex-col items-center gap-4 rounded-lg bg-white px-8 py-8 text-center shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center gap-1">
              <span className="text-2xl text-ink">✿</span>
              <span className="font-heading text-sm tracking-[3px] text-ink uppercase">Sakura</span>
            </div>

            <h2 className="font-heading text-2xl text-ink">Log Out</h2>
            <p className="text-sm text-body-muted">Are you sure you want to logout?</p>

            <div className="mt-2 flex w-full gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 rounded-md bg-[#d97a7d] py-2.5 text-xs font-semibold tracking-[1.5px] text-white uppercase hover:brightness-95"
              >
                Cancle
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 rounded-md bg-[#95d1a3] py-2.5 text-xs font-semibold tracking-[1.5px] text-white uppercase hover:brightness-95"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
