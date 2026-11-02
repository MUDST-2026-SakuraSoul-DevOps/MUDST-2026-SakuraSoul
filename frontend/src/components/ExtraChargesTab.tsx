import { useState, useMemo } from 'react'
import { Plus, Tag, Trash2, Info } from 'lucide-react'
import { CustomSelect } from './CustomSelect'
import { ALL_ROOM_NUMBERS } from '../domain/documents'
import { getExtraCharges, deleteExtraCharge, type ExtraChargeRecord } from '../domain/unitsPhase2'
import { bahtAmount as money } from '../format'
import { AddExtraChargeDialog } from '../dialogs/AddExtraChargeDialog'

const UNIT_OPTIONS = [
  { value: 'ALL', label: 'All units' },
  ...ALL_ROOM_NUMBERS.map((r) => ({ value: r, label: `Unit ${r}` })),
]

export function ExtraChargesTab({ onNotify }: { onNotify?: (msg: string) => void }) {
  const [selectedUnit, setSelectedUnit] = useState<string>('ALL')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [charges, setCharges] = useState<ExtraChargeRecord[]>(() => getExtraCharges())

  function reloadCharges() {
    setCharges(getExtraCharges())
  }

  const filteredCharges = useMemo(() => {
    if (selectedUnit === 'ALL') return charges
    return charges.filter((c) => c.roomNumber === selectedUnit)
  }, [charges, selectedUnit])

  function handleDelete(charge: ExtraChargeRecord) {
    deleteExtraCharge(charge.id)
    reloadCharges()
    onNotify?.(`Removed charge "${charge.name}" for Unit ${charge.roomNumber}`)
  }

  return (
    <div className="flex flex-col gap-6 font-sans">
      {/* Top toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-honey-140/60 bg-white p-4 shadow-xs">
        <div className="flex items-center gap-3">
          <label className="text-xs font-semibold text-ink">Filter Unit:</label>
          <div className="w-40">
            <CustomSelect
              aria-label="Filter charge by unit"
              value={selectedUnit}
              onChange={setSelectedUnit}
              options={UNIT_OPTIONS}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-blush-120 px-5 py-2.5 text-xs font-semibold text-brand shadow-xs transition hover:bg-blush-170 cursor-pointer"
        >
          <Plus size={16} aria-hidden="true" />
          Add extra charge
        </button>
      </div>

      {/* Description note */}
      <div className="rounded-xl border border-avatar-ring/60 bg-sand-60/50 p-4 text-xs text-ink flex items-start gap-2.5">
        <Info size={16} className="text-brand shrink-0 mt-0.5" />
        <p className="text-[11px] leading-relaxed">
          Room-specific charges apply as separate invoice line items. Monthly recurring items renew with each billing cycle, while one-time charges apply to the next generated invoice only.
        </p>
      </div>

      {/* Main Table Card */}
      <div className="overflow-hidden rounded-2xl border border-honey-140/60 bg-white shadow-xs">
        <div className="border-b border-sand-80 bg-sand-60/40 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Tag size={18} className="text-brand" />
            <h2 className="font-heading text-lg font-bold text-ink">
              Room-specific charges {selectedUnit !== 'ALL' ? `· Unit ${selectedUnit}` : ''}
            </h2>
          </div>
          <span className="text-xs text-body-muted">
            {filteredCharges.length} charge record{filteredCharges.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-sand-80 bg-sand-60/60 text-ink-muted uppercase tracking-[0.5px]">
                <th scope="col" className="py-3 px-5 font-semibold">UNIT</th>
                <th scope="col" className="py-3 px-4 font-semibold">DESCRIPTION</th>
                <th scope="col" className="py-3 px-4 font-semibold">AMOUNT</th>
                <th scope="col" className="py-3 px-4 font-semibold">FREQUENCY</th>
                <th scope="col" className="py-3 px-4 font-semibold">STATUS</th>
                <th scope="col" className="py-3 px-4 font-semibold text-center">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-80/60">
              {filteredCharges.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-body-muted">
                    No extra charges found for this selection.
                  </td>
                </tr>
              ) : (
                filteredCharges.map((c) => (
                  <tr key={c.id} className="hover:bg-sand-60/30 transition">
                    <td className="py-3.5 px-5 font-semibold text-ink">Unit {c.roomNumber}</td>
                    <td className="py-3.5 px-4 font-medium text-ink">{c.name}</td>
                    <td className="py-3.5 px-4 font-bold text-brand">{money(c.amount)}</td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                          c.cycle === 'Monthly'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200/60'
                            : 'bg-sand-60 text-body-muted border border-sand-80'
                        }`}
                      >
                        {c.cycle}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center rounded-md bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                        {c.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => handleDelete(c)}
                        aria-label={`Delete charge ${c.name} for unit ${c.roomNumber}`}
                        className="flex size-8 items-center justify-center mx-auto rounded-lg border border-transparent text-body-muted hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 transition cursor-pointer"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Extra Charge Dialog */}
      <AddExtraChargeDialog
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        initialRoom={selectedUnit !== 'ALL' ? selectedUnit : '101'}
        onAdded={(newCharge) => {
          reloadCharges()
          onNotify?.(`Added "${newCharge.name}" (${money(newCharge.amount)}) for Unit ${newCharge.roomNumber}`)
        }}
      />
    </div>
  )
}
