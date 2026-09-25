import { useEffect, useRef, useState } from 'react'
import { X, Clock, Calendar, Mail, Check, Sparkles, ChevronDown } from 'lucide-react'
import { ordinalSuffix } from '../format'
import { DEFAULT_SCHEDULE_CONFIG, type ScheduledBillingConfig } from '../domain/scheduledBilling'

export function ScheduledBillingDialog({
  initialConfig = DEFAULT_SCHEDULE_CONFIG,
  onClose,
  onSave,
}: {
  initialConfig?: ScheduledBillingConfig
  onClose: () => void
  onSave: (config: ScheduledBillingConfig) => void
}) {
  const [config, setConfig] = useState<ScheduledBillingConfig>(initialConfig)
  const [isSaved, setIsSaved] = useState(false)
  const [testRunMessage, setTestRunMessage] = useState<string | null>(null)

  function handleSave() {
    onSave(config)
    setIsSaved(true)
    setTimeout(() => {
      onClose()
    }, 600)
  }

  function handleTestRun() {
    const channels = [config.sendEmail && 'Email', config.sendSms && 'SMS'].filter(Boolean).join(', ')
    setTestRunMessage(
      `Test dispatch simulated for ${config.targetAudience === 'ALL_ACTIVE' ? 'All Active Tenants' : 'Pending Invoices Only'} via ${channels || 'no delivery channel'}.`,
    )
    setTimeout(() => {
      setTestRunMessage(null)
    }, 4000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Scheduled Bulk Billing"
        className="relative z-10 flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-sidebar-border bg-white shadow-2xl outline-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-sand-65 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-accent-soft text-brand">
              <Clock size={20} />
            </div>
            <div>
              <h2 className="font-heading text-lg font-bold text-sand-830">Scheduled Bulk Billing</h2>
              <p className="text-xs text-sand-530">
                Configure automated recurring invoice generation and delivery
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-sand-530 hover:bg-black/5 hover:text-sand-830 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-sand-830">
          {/*
            SSK-141 ต้องบอกตั้งแต่บรรทัดแรกว่าเป็นแบบจำลอง ค่าที่บันทึกอยู่แค่ใน localStorage
            ของเบราว์เซอร์นี้ ยังไม่มีงานฝั่ง backend ออกหรือส่งใบแจ้งหนี้ให้จริง (SSK-143)
          */}
          <p
            role="note"
            className="rounded-xl border border-honey-88/50 bg-honey-20 px-4 py-3 text-xs text-honey-350"
          >
            <strong className="font-semibold">Simulation only.</strong> Saving keeps these settings in this
            browser; no invoices are generated or sent yet.
          </p>

          {/* Status Banner */}
          <div
            className={`flex items-center justify-between rounded-xl p-4 border transition-colors ${
              config.enabled
                ? 'border-moss-120 bg-moss-50 text-moss-545'
                : 'border-sand-90 bg-sand-50 text-sand-530'
            }`}
          >
            <div className="flex items-center gap-3">
              <span
                className={`flex size-3 rounded-full ${
                  config.enabled ? 'bg-moss-545 animate-pulse' : 'bg-sand-368'
                }`}
              />
              <div>
                <p className="font-bold text-sm">
                  {config.enabled ? 'Auto-Schedule is On (simulation)' : 'Auto-Schedule is Paused'}
                </p>
                <p className="text-[11px] opacity-90">
                  {config.enabled
                    ? `Preview: would dispatch every ${config.dayOfMonth}${ordinalSuffix(config.dayOfMonth)} of the month at ${config.dispatchTime}`
                    : 'Automated invoice generation is currently paused'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setConfig((prev) => ({ ...prev, enabled: !prev.enabled }))}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold shadow-sm transition cursor-pointer ${
                config.enabled
                  ? 'bg-white text-wine-680 border border-wine-600/30 hover:bg-wine-600/10'
                  : 'bg-brand text-white hover:bg-brand/90'
              }`}
            >
              {config.enabled ? 'Pause Schedule' : 'Enable Schedule'}
            </button>
          </div>

          {testRunMessage && (
            <div className="flex items-center gap-2 rounded-lg border border-moss-120 bg-moss-50 p-3 text-xs text-moss-545">
              <Sparkles size={16} />
              <span>{testRunMessage}</span>
            </div>
          )}

          {/* Section 1: Schedule Frequency & Time */}
          <div className="rounded-xl border border-honey-140/60 bg-page-bg p-4 space-y-4">
            <h3 className="font-bold text-xs uppercase tracking-wider text-sand-530 flex items-center gap-1.5">
              <Calendar size={15} />
              1. Schedule Frequency &amp; Timing
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="schedule-day" className="block font-medium text-sand-830 mb-1">
                  Billing Day of Month
                </label>
                <BillingDayPicker
                  id="schedule-day"
                  value={config.dayOfMonth}
                  onChange={(day) => setConfig((prev) => ({ ...prev, dayOfMonth: day }))}
                />
                <p className="mt-1 text-[10px] text-sand-530">Recommended: 25th of every month</p>
              </div>

              <div>
                <label htmlFor="schedule-time" className="block font-medium text-sand-830 mb-1">
                  Dispatch Time
                </label>
                <input
                  id="schedule-time"
                  type="time"
                  value={config.dispatchTime}
                  onChange={(e) => setConfig((prev) => ({ ...prev, dispatchTime: e.target.value }))}
                  className="w-full rounded-lg border border-honey-140 bg-white px-3 py-2 text-xs text-sand-830 outline-none focus:border-brand"
                />
                <p className="mt-1 text-[10px] text-sand-530">Time in Bangkok (UTC+7)</p>
              </div>
            </div>
          </div>

          {/* Section 2: Target Audience */}
          <div className="rounded-xl border border-honey-140/60 bg-page-bg p-4 space-y-4">
            <h3 className="font-bold text-xs uppercase tracking-wider text-sand-530">
              2. Target Recipients
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label
                className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition ${
                  config.targetAudience === 'ALL_ACTIVE'
                    ? 'border-brand bg-white shadow-xs'
                    : 'border-honey-140 bg-white/60 hover:bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="targetAudience"
                  checked={config.targetAudience === 'ALL_ACTIVE'}
                  onChange={() => setConfig((prev) => ({ ...prev, targetAudience: 'ALL_ACTIVE' }))}
                  className="mt-0.5 accent-brand"
                />
                <div>
                  <p className="font-bold text-xs text-sand-830">All Active Tenants</p>
                  <p className="text-[11px] text-sand-530 mt-0.5">
                    Generate &amp; send invoices for all residents currently living in units
                  </p>
                </div>
              </label>

              <label
                className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition ${
                  config.targetAudience === 'PENDING_ONLY'
                    ? 'border-brand bg-white shadow-xs'
                    : 'border-honey-140 bg-white/60 hover:bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="targetAudience"
                  checked={config.targetAudience === 'PENDING_ONLY'}
                  onChange={() => setConfig((prev) => ({ ...prev, targetAudience: 'PENDING_ONLY' }))}
                  className="mt-0.5 accent-brand"
                />
                <div>
                  <p className="font-bold text-xs text-sand-830">Pending Invoices Only</p>
                  <p className="text-[11px] text-sand-530 mt-0.5">
                    Send reminders exclusively for unpaid or pending payment items
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Section 3: Delivery Channels & Options */}
          <div className="rounded-xl border border-honey-140/60 bg-page-bg p-4 space-y-3">
            <h3 className="font-bold text-xs uppercase tracking-wider text-sand-530">
              3. Delivery Channels &amp; Attachments
            </h3>

            <div className="space-y-2">
              <label className="flex items-center gap-3 rounded-lg bg-white p-2.5 border border-honey-140/70 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.sendEmail}
                  onChange={(e) => setConfig((prev) => ({ ...prev, sendEmail: e.target.checked }))}
                  className="size-4 rounded accent-brand"
                />
                <Mail size={16} className="text-brand" />
                <div className="flex-1">
                  <span className="font-medium text-sand-830">Email Notification</span>
                  <span className="ml-2 text-[11px] text-sand-530">(Direct to tenant email address)</span>
                </div>
              </label>

              <label className="flex items-center gap-3 rounded-lg bg-white p-2.5 border border-honey-140/70 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.attachPdf}
                  onChange={(e) => setConfig((prev) => ({ ...prev, attachPdf: e.target.checked }))}
                  className="size-4 rounded accent-brand"
                />
                <div className="size-4 flex items-center justify-center text-brand font-bold text-[10px]">
                  PDF
                </div>
                <div className="flex-1">
                  <span className="font-medium text-sand-830">Auto-generate &amp; attach official PDF invoice</span>
                  <span className="ml-2 text-[11px] text-sand-530">(Includes utility breakdown)</span>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-sand-65 px-6 py-4 bg-white">
          <button
            type="button"
            onClick={handleTestRun}
            className="flex items-center gap-1.5 rounded-lg border border-honey-140 bg-white px-3.5 py-2 text-xs font-medium text-brand hover:bg-page-bg transition cursor-pointer"
          >
            <Sparkles size={14} />
            Test Simulation
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-sand-110 bg-white px-4 py-2 text-xs font-medium text-sand-530 hover:bg-black/5 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex items-center gap-2 rounded-lg bg-brand px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand/90 transition cursor-pointer"
            >
              {isSaved ? (
                <>
                  <Check size={14} /> Saved!
                </>
              ) : (
                'Save Schedule'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
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
