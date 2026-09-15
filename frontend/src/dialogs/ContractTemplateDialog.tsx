import { useState } from 'react'
import { Info, X } from 'lucide-react'

const AVAILABLE_VARIABLES = [
  '[CONTRACT_NO]',
  '[DATE]',
  '[TENANT_NAME]',
  '[NATIONAL_ID]',
  '[TENANT_PHONE]',
  '[TENANT_LINE_ID]',
  '[UNIT_NUMBER]',
  '[FLOOR]',
  '[PROPERTY_ADDRESS]',
  '[START_DATE]',
  '[END_DATE]',
  '[BILLING_CYCLE]',
  '[RENT_AMOUNT]',
  '[SECURITY_DEPOSIT]',
  '[COMMON_AREA_FEE]',
  '[DUE_DAY]',
  '[WATER_RATE]',
  '[ELECTRIC_RATE]',
]

/**
 * Dialog แก้ไข Contract Template — ตรงกับ Figma "Contract template"
 */
export function ContractTemplateDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  function handleSave() {
    setSaving(true)
    setTimeout(() => {
      setSaving(false)
      onSaved()
      onClose()
    }, 400)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Contract Template"
        className="relative z-10 flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[rgba(238,217,196,0.5)] bg-white p-7 shadow-2xl outline-none"
      >
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-sand-65">
          <div>
            <h2 className="font-heading text-xl font-bold text-sand-830">Contract Template</h2>
            <p className="text-xs text-sand-530">Edit once — every new contract is generated from this</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-sand-530 hover:bg-black/5 hover:text-sand-830"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Area (Two Columns) */}
        <div className="flex-1 overflow-y-auto py-5 grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left Column: Contract Content */}
          <div className="md:col-span-2 flex flex-col">
            <h3 className="text-xs font-semibold text-sand-830 mb-2">Contract Content</h3>
            <div className="flex-1 rounded-xl border border-sand-110 bg-page-bg p-6 text-xs leading-relaxed text-sand-830 overflow-y-auto max-h-[52vh] font-sans">
              <div className="text-center pb-4 border-b border-sand-65">
                <p className="font-bold tracking-wide">RESIDENTIAL LEASE AGREEMENT</p>
                <p className="mt-1 text-[11px] text-sand-530">
                  Contract No. <span className="text-wine-600 font-semibold">[CONTRACT_NO]</span>
                </p>
              </div>

              <p className="mt-4 text-body-muted">
                This Agreement is made on <span className="text-wine-600 font-semibold">[DATE]</span> between Sakura
                Soul Property Management (&quot;Landlord&quot;) and{' '}
                <span className="text-wine-600 font-semibold">[TENANT_NAME]</span> (&quot;Tenant&quot;).
              </p>

              {/* 1. Tenant Details */}
              <div className="mt-4">
                <p className="font-bold text-[11px] uppercase tracking-wider text-sand-830">1. TENANT DETAILS</p>
                <p className="mt-1 text-body-muted">
                  Full name: <span className="text-wine-600 font-semibold">[TENANT_NAME]</span>
                  <br />
                  National ID: <span className="text-wine-600 font-semibold">[NATIONAL_ID]</span>
                  <br />
                  Phone: <span className="text-wine-600 font-semibold">[TENANT_PHONE]</span>
                  <br />
                  Line ID: <span className="text-wine-600 font-semibold">[TENANT_LINE_ID]</span>
                </p>
              </div>

              {/* 2. Property Details */}
              <div className="mt-4">
                <p className="font-bold text-[11px] uppercase tracking-wider text-sand-830">2. PROPERTY DETAILS</p>
                <p className="mt-1 text-body-muted">
                  Premises: Unit <span className="text-wine-600 font-semibold">[UNIT_NUMBER]</span>, Floor{' '}
                  <span className="text-wine-600 font-semibold">[FLOOR]</span>
                  <br />
                  Address: <span className="text-wine-600 font-semibold">[PROPERTY_ADDRESS]</span>
                </p>
              </div>

              {/* 3. Lease Terms */}
              <div className="mt-4">
                <p className="font-bold text-[11px] uppercase tracking-wider text-sand-830">3. LEASE TERMS</p>
                <p className="mt-1 text-body-muted">
                  Start date: <span className="text-wine-600 font-semibold">[START_DATE]</span>
                  <br />
                  End date: <span className="text-wine-600 font-semibold">[END_DATE]</span>
                  <br />
                  Billing cycle: <span className="text-wine-600 font-semibold">[BILLING_CYCLE]</span>
                  <br />
                  Rent: <span className="text-wine-600 font-semibold">[RENT_AMOUNT]</span>
                  <br />
                  Security deposit: <span className="text-wine-600 font-semibold">[SECURITY_DEPOSIT]</span>
                  <br />
                  Common area fee: <span className="text-wine-600 font-semibold">[COMMON_AREA_FEE]</span> per month
                  <br />
                  Rent is due on the <span className="text-wine-600 font-semibold">[DUE_DAY]</span> of each period.
                </p>
              </div>

              {/* 4. Utility Rates */}
              <div className="mt-4">
                <p className="font-bold text-[11px] uppercase tracking-wider text-sand-830">4. UTILITY RATES</p>
                <p className="mt-1 text-body-muted">
                  Electricity: <span className="text-wine-600 font-semibold">[ELECTRIC_RATE]</span> per unit
                  <br />
                  Water: <span className="text-wine-600 font-semibold">[WATER_RATE]</span> per unit
                </p>
              </div>

              {/* 5. Responsibilities */}
              <div className="mt-4">
                <p className="font-bold text-[11px] uppercase tracking-wider text-sand-830">5. TENANT RESPONSIBILITIES</p>
                <ol className="mt-1 list-decimal pl-4 space-y-1 text-body-muted">
                  <li>Pay rent and utilities on time each period.</li>
                  <li>Keep the premises in a clean, sanitary, and good condition.</li>
                  <li>Notify the Landlord promptly of any damage or required maintenance.</li>
                  <li>Comply with all building rules regarding noise and common areas.</li>
                  <li>Make no alterations or additions without prior written consent.</li>
                  <li>Repair costs for damage caused by the Tenant are charged to the Tenant.</li>
                </ol>
              </div>

              {/* Signatures */}
              <div className="mt-8 pt-6 border-t border-dashed border-sand-110 grid grid-cols-2 gap-6 text-[11px]">
                <div>
                  <p className="text-sand-530">Landlord</p>
                  <p className="mt-4 text-sand-320">Date: ________________</p>
                </div>
                <div>
                  <p className="text-sand-530">
                    Tenant (<span className="text-wine-600 font-semibold">[TENANT_NAME]</span>)
                  </p>
                  <p className="mt-4 text-sand-320">Date: ________________</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Available Variables */}
          <div className="flex flex-col gap-4">
            <div>
              <h3 className="text-xs font-semibold text-sand-830">Available variables</h3>
              <p className="mt-0.5 text-[11px] text-sand-530">
                Click to insert at the cursor. Anything not on this list prints as literal text.
              </p>
            </div>

            {/* Variable Pills Grid */}
            <div className="flex flex-wrap gap-1.5 p-3 rounded-xl border border-sand-110 bg-page-bg max-h-[36vh] overflow-y-auto">
              {AVAILABLE_VARIABLES.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => {}}
                  className="rounded-md border border-blush-125 bg-sand-45 px-2 py-1 text-[10.5px] font-mono text-wine-630 transition hover:bg-blush-80 hover:border-blush-200"
                >
                  {v}
                </button>
              ))}
            </div>

            {/* Notice Alert Box */}
            <div className="flex items-start gap-2.5 rounded-xl border border-blush-125 bg-sand-45 p-3.5 text-[11px] text-wine-630">
              <Info size={16} className="mt-0.5 shrink-0 text-blush-530" />
              <p className="leading-snug">
                Editing this template only affects contracts created from now on. Contracts already issued keep their
                original wording.
              </p>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-sand-65">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-sand-110 bg-white px-5 py-2 text-xs font-medium text-sand-530 hover:bg-black/5"
          >
            Cancel
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className="rounded-lg border border-sand-110 bg-white px-4 py-2 text-xs font-medium text-sand-830 hover:bg-black/5"
            >
              Preview with sample data
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-moss-160 px-5 py-2 text-xs font-semibold text-moss-740 shadow-sm transition hover:bg-moss-220 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Template'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
