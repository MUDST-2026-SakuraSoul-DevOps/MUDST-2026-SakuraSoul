import { useEffect, useRef, useState } from 'react'
import { Calendar, ChevronDown, Mail } from 'lucide-react'
import { errorMessage, updateBillingSchedule } from '../api/client'
import type { BillingSchedule, BillingScheduleRequest, BillingScheduleRun } from '../api/types'
import { PrimaryButton, SecondaryButton } from '../components/Button'
import { Modal } from '../components/Modal'
import { billingPeriodOf, nextBillingRunAt, validateBillingSchedule } from '../domain/scheduledBilling'
import { displayDateTime, ordinalSuffix } from '../format'

/**
 * ป็อปอัปตั้งเวลาเตือนใบค้างรายเดือน (SSK-143) อ่านและบันทึกผ่าน /api/billing-schedule
 *
 * เดิมเป็นแบบจำลองที่เก็บใน localStorage มีตัวเลือกกลุ่มผู้รับ ช่องทาง SMS/LINE และปุ่ม Test Simulation
 * (SSK-130 / SSK-141) ตอนนี้เหลือแค่สิ่งที่ backend ทำได้จริง คือเปิดปิด วันที่ และเวลา ส่วนผู้รับเป็นกฎตายตัว
 * บอกเป็นข้อความ และบอกตรง ๆ ว่าการออกบิลใหม่อัตโนมัติยังทำไม่ได้
 *
 * รอบถัดไปในป็อปอัปคิดจากค่าในฟอร์มด้วยกฎเดียวกับ backend โดยถือว่ากดบันทึกตอนเปิดป็อปอัป แอดมินจึงเห็นก่อนกดว่า
 * รอบแรกจะเป็นเมื่อไหร่ เช่นเปิดใช้วันที่ 26 โดยตั้งวันที่ 25 จะเห็นว่ารอเดือนหน้า ไม่ใช่ส่งทันที
 */
export function ScheduledBillingDialog({
  schedule,
  onClose,
  onSaved,
}: {
  schedule: BillingSchedule
  onClose: () => void
  onSaved: (saved: BillingSchedule) => void
}) {
  const [form, setForm] = useState<BillingScheduleRequest>({
    enabled: schedule.enabled,
    dayOfMonth: schedule.dayOfMonth,
    sendTime: schedule.sendTime,
  })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // จับเวลาไว้ครั้งเดียวตอนเปิด ไม่เรียก new Date() ทุกรอบ render เพราะ render ต้องได้ผลเดิมทุกครั้งที่เรียก
  const [openedAt] = useState(() => new Date())

  const ranThisMonth = schedule.lastRun?.period === billingPeriodOf(openedAt)
  const nextRun = nextBillingRunAt({ ...form, updatedAt: openedAt.toISOString() }, ranThisMonth, openedAt)

  async function handleSave() {
    const invalid = validateBillingSchedule(form)
    if (invalid) {
      setError(invalid)
      return
    }
    setSaving(true)
    setError(null)
    try {
      onSaved(await updateBillingSchedule(form))
    } catch (err) {
      setError(errorMessage(err, 'Could not save the schedule'))
      setSaving(false)
    }
  }

  const footer = (
    <>
      <SecondaryButton onClick={onClose} disabled={saving}>
        Cancel
      </SecondaryButton>
      <PrimaryButton onClick={handleSave} disabled={saving}>
        {saving ? 'Saving...' : 'Save Schedule'}
      </PrimaryButton>
    </>
  )

  return (
    <Modal
      title="Scheduled Bulk Billing"
      subtitle="Email a reminder for every unpaid invoice once a month"
      // ระหว่างบันทึกปิดไม่ได้ ผู้ใช้จะได้ไม่เข้าใจว่ายกเลิกแล้วทั้งที่คำขอยังวิ่งอยู่
      onClose={saving ? () => {} : onClose}
      footer={footer}
      width="wide"
    >
      <div className="space-y-5 text-xs text-sand-830">
        <div
          className={`flex items-center justify-between rounded-xl border p-4 transition-colors ${
            form.enabled ? 'border-moss-120 bg-moss-50 text-moss-545' : 'border-sand-90 bg-sand-50 text-sand-530'
          }`}
        >
          <div className="flex items-center gap-3">
            <span className={`flex size-3 rounded-full ${form.enabled ? 'bg-moss-545' : 'bg-sand-368'}`} />
            <div>
              <p className="text-sm font-bold">{form.enabled ? 'Auto-Schedule is On' : 'Auto-Schedule is Paused'}</p>
              <p className="text-[11px] opacity-90">
                {nextRun
                  ? `Next run: ${displayDateTime(nextRun)} (Bangkok time)`
                  : 'No reminders are sent while the schedule is paused'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setForm((prev) => ({ ...prev, enabled: !prev.enabled }))}
            className={`cursor-pointer rounded-lg px-3.5 py-1.5 text-xs font-semibold shadow-sm transition ${
              form.enabled
                ? 'border border-wine-600/30 bg-white text-wine-680 hover:bg-wine-600/10'
                : 'bg-brand text-white hover:bg-brand/90'
            }`}
          >
            {form.enabled ? 'Pause Schedule' : 'Enable Schedule'}
          </button>
        </div>

        <div className="space-y-4 rounded-xl border border-honey-140/60 bg-page-bg p-4">
          <h3 className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-sand-530 uppercase">
            <Calendar size={15} />
            1. Day &amp; Time
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="schedule-day" className="mb-1 block font-medium text-sand-830">
                Billing Day of Month
              </label>
              <BillingDayPicker
                id="schedule-day"
                value={form.dayOfMonth}
                onChange={(day) => setForm((prev) => ({ ...prev, dayOfMonth: day }))}
              />
            </div>
            <div>
              <label htmlFor="schedule-time" className="mb-1 block font-medium text-sand-830">
                Send Time
              </label>
              <input
                id="schedule-time"
                type="time"
                value={form.sendTime}
                onChange={(e) => setForm((prev) => ({ ...prev, sendTime: e.target.value }))}
                className="w-full rounded-lg border border-honey-140 bg-white px-3 py-2 text-xs text-sand-830 outline-none focus:border-brand"
              />
              <p className="mt-1 text-[10px] text-sand-530">Time in Bangkok (UTC+7)</p>
            </div>
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-honey-140/60 bg-page-bg p-4">
          <h3 className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-sand-530 uppercase">
            <Mail size={15} />
            2. Who Gets an Email
          </h3>
          <ul className="list-disc space-y-1 pl-4 text-sand-830">
            <li>
              Every tenant with an unpaid invoice (pending or overdue) gets it by email with the invoice PDF attached.
            </li>
            <li>Paid invoices are not sent. Tenants without an email address are skipped.</li>
            <li>
              Creating new invoices automatically is not available: each invoice needs that month&apos;s meter readings,
              so invoices are still created one by one with New Invoice.
            </li>
          </ul>
        </div>

        <p className="text-sand-530">{lastRunText(schedule.lastRun)}</p>

        {error && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}

/** ผลรอบล่าสุดเป็นประโยคเดียว รอบที่ส่งไม่ออกทั้งรอบบอกเหตุผลจาก backend ตรง ๆ */
function lastRunText(run: BillingScheduleRun | null): string {
  if (!run) {
    return 'No reminders have been sent yet.'
  }
  const when = displayDateTime(run.startedAt)
  if (run.error) {
    return `Last run: ${when} — failed: ${run.error}`
  }
  const notSent = run.failedCount > 0 ? `, ${run.failedCount} not sent` : ''
  return `Last run: ${when} — ${run.sentCount} sent, ${run.skippedCount} skipped${notSent}`
}

function BillingDayPicker({
  id,
  value,
  onChange,
}: {
  id?: string
  value: number
  onChange: (val: number) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const suffix = ordinalSuffix(value)

  return (
    <div ref={ref} className="relative mt-1">
      {/* Hidden native select for accessibility and testing */}
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="sr-only"
      >
        {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
          <option key={d} value={d}>
            Every {d}{ordinalSuffix(d)} of the month
          </option>
        ))}
      </select>

      {/* Custom Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between rounded-md border border-honey-140 bg-white p-2 text-xs text-sand-830 outline-none hover:border-brand focus:border-brand cursor-pointer"
      >
        <span className="font-semibold text-ink">
          Every {value}{suffix} of the month
        </span>
        <ChevronDown size={15} className={`text-sand-530 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 z-50 mt-1.5 w-full min-w-[280px] rounded-xl border border-avatar-ring/60 bg-white p-3 shadow-xl text-xs">
          {/* Quick Presets */}
          <div className="mb-2.5 flex items-center gap-1.5 border-b border-sand-65 pb-2.5">
            <span className="text-[10px] font-bold tracking-wider text-sand-530 uppercase shrink-0">Quick:</span>
            <div className="flex flex-wrap gap-1">
              {[
                { day: 25, label: '25th (Recommended)' },
                { day: 1, label: '1st' },
                { day: 28, label: '28th' },
              ].map(({ day, label }) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => {
                    onChange(day)
                    setIsOpen(false)
                  }}
                  className={`rounded-md px-2 py-1 text-[11px] font-medium transition cursor-pointer ${
                    value === day
                      ? 'bg-brand text-white'
                      : 'bg-page-bg text-sand-830 hover:bg-black/5 hover:text-brand'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 1..31 Day Grid */}
          <div className="mb-1 text-[11px] font-semibold text-sand-530">Select Day:</div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
              const isSelected = value === day
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => {
                    onChange(day)
                    setIsOpen(false)
                  }}
                  className={`flex h-7 items-center justify-center rounded-lg font-medium text-xs transition cursor-pointer ${
                    isSelected
                      ? 'bg-brand font-bold text-white shadow-xs'
                      : 'text-sand-830 hover:bg-page-bg hover:text-brand'
                  }`}
                >
                  {day}
                </button>
              )
            })}
          </div>

          <div className="mt-2.5 border-t border-sand-65 pt-2 text-[10px] text-sand-530 leading-tight">
            Months with fewer days (e.g. Feb) dispatch on month&apos;s last day.
          </div>
        </div>
      )}
    </div>
  )
}
