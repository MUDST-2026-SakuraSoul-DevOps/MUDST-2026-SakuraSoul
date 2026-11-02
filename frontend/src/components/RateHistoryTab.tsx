import { useState, useMemo } from 'react'
import { Plus, History, Calendar, Info, CheckCircle2 } from 'lucide-react'
import { CustomSelect } from './CustomSelect'
import { ALL_ROOM_NUMBERS } from '../domain/documents'
import { getRoomRates, type RoomRateRecord } from '../domain/unitsPhase2'
import { bahtAmount as money } from '../format'
import { ScheduleRateDialog } from '../dialogs/ScheduleRateDialog'

const UNIT_OPTIONS = [
  { value: 'ALL', label: 'All units' },
  ...ALL_ROOM_NUMBERS.map((r) => ({ value: r, label: `Unit ${r}` })),
]

export function RateHistoryTab({ onNotify }: { onNotify?: (msg: string) => void }) {
  const [selectedUnit, setSelectedUnit] = useState<string>('101')
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [rates, setRates] = useState<RoomRateRecord[]>(() => getRoomRates())

  function reloadRates() {
    setRates(getRoomRates())
  }

  const filteredRates = useMemo(() => {
    if (selectedUnit === 'ALL') return rates
    return rates.filter((r) => r.roomNumber === selectedUnit)
  }, [rates, selectedUnit])

  return (
    <div className="flex flex-col gap-6 font-sans">
      {/* Top toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-honey-140/60 bg-white p-4 shadow-xs">
        <div className="flex items-center gap-3">
          <label className="text-xs font-semibold text-ink">Select Unit:</label>
          <div className="w-40">
            <CustomSelect
              aria-label="Filter rate by unit"
              value={selectedUnit}
              onChange={setSelectedUnit}
              options={UNIT_OPTIONS}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => setScheduleOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-blush-120 px-5 py-2.5 text-xs font-semibold text-brand shadow-xs transition hover:bg-blush-170 cursor-pointer"
        >
          <Plus size={16} aria-hidden="true" />
          Schedule rate
        </button>
      </div>

      {/* Concept note */}
      <div className="rounded-xl border border-avatar-ring/60 bg-sand-60/50 p-4 text-xs text-ink flex items-start gap-2.5">
        <Info size={16} className="text-brand shrink-0 mt-0.5" />
        <p className="text-[11px] leading-relaxed">
          New rates apply from their effective date. Previously issued invoices keep the rates captured when they were created, preserving historical accounting fidelity.
        </p>
      </div>

      {/* Main Table Card */}
      <div className="overflow-hidden rounded-2xl border border-honey-140/60 bg-white shadow-xs">
        <div className="border-b border-sand-80 bg-sand-60/40 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History size={18} className="text-brand" />
            <h2 className="font-heading text-lg font-bold text-ink">
              Rate history {selectedUnit !== 'ALL' ? `· Unit ${selectedUnit}` : ''}
            </h2>
          </div>
          <span className="text-xs text-body-muted">
            {filteredRates.length} schedule record{filteredRates.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-sand-80 bg-sand-60/60 text-ink-muted uppercase tracking-[0.5px]">
                <th scope="col" className="py-3 px-5 font-semibold">UNIT</th>
                <th scope="col" className="py-3 px-4 font-semibold">EFFECTIVE FROM</th>
                <th scope="col" className="py-3 px-4 font-semibold">RENT / MONTH</th>
                <th scope="col" className="py-3 px-4 font-semibold">WATER / m³</th>
                <th scope="col" className="py-3 px-4 font-semibold">ELECTRICITY / kWh</th>
                <th scope="col" className="py-3 px-5 font-semibold">NOTE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-80/60">
              {filteredRates.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-body-muted">
                    No scheduled rate changes for this unit.
                  </td>
                </tr>
              ) : (
                filteredRates.map((r) => (
                  <tr key={r.id} className="hover:bg-sand-60/30 transition">
                    <td className="py-3.5 px-5 font-semibold text-ink">Unit {r.roomNumber}</td>
                    <td className="py-3.5 px-4 font-medium text-ink flex items-center gap-1.5">
                      <Calendar size={14} className="text-body-muted" />
                      {r.effectiveDate}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-brand">{money(r.monthlyRent)}</td>
                    <td className="py-3.5 px-4 text-body-muted">{money(r.waterRate)}</td>
                    <td className="py-3.5 px-4 text-body-muted">{money(r.electricityRate)}</td>
                    <td className="py-3.5 px-5 text-body-muted">{r.note}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Snapshot comparison cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Past invoice illustration */}
        <div className="rounded-2xl border border-avatar-ring/60 bg-white p-5 shadow-xs flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-sand-80 pb-3">
            <h3 className="font-heading text-sm font-bold text-ink">October invoice · Locked rates</h3>
            <span className="rounded-md bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 flex items-center gap-1">
              <CheckCircle2 size={12} />
              Historical unchanged
            </span>
          </div>
          <div className="flex flex-col gap-2 text-xs py-1">
            <div className="flex justify-between">
              <span className="text-body-muted">Unit 101 · October rent:</span>
              <strong className="text-ink">{money(4000)}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-body-muted">Rate captured:</span>
              <span className="text-body-muted">01 Jan 2026</span>
            </div>
          </div>
          <p className="text-[11px] text-body-muted border-t border-sand-80 pt-2">
            Issued invoices freeze room rates at creation time. Subsequent rate changes never alter historical billing.
          </p>
        </div>

        {/* Current invoice illustration */}
        <div className="rounded-2xl border border-avatar-ring/60 bg-white p-5 shadow-xs flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-sand-80 pb-3">
            <h3 className="font-heading text-sm font-bold text-ink">November invoice · Current rates</h3>
            <span className="rounded-md bg-sand-60 border border-sand-80 px-2 py-0.5 text-[11px] font-semibold text-brand">
              Separate snapshot
            </span>
          </div>
          <div className="flex flex-col gap-2 text-xs py-1">
            <div className="flex justify-between">
              <span className="text-body-muted">Unit 101 · November rent:</span>
              <strong className="text-ink">{money(4500)}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-body-muted">Rate effective from:</span>
              <span className="text-body-muted">01 Nov 2026</span>
            </div>
          </div>
          <p className="text-[11px] text-body-muted border-t border-sand-80 pt-2">
            The updated rate is activated seamlessly on the effective date for all subsequent billing cycles.
          </p>
        </div>
      </div>

      {/* Schedule Rate Dialog */}
      <ScheduleRateDialog
        isOpen={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        initialRoom={selectedUnit !== 'ALL' ? selectedUnit : '101'}
        onScheduled={(newRate) => {
          reloadRates()
          onNotify?.(`Scheduled new rate of ${money(newRate.monthlyRent)} for Unit ${newRate.roomNumber}`)
        }}
      />
    </div>
  )
}
