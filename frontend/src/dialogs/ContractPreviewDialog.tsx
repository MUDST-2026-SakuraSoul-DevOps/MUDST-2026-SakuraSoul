import { X, Printer, Download } from 'lucide-react'
import { fetchApartmentConfig, fetchRoom, fetchTenant } from '../api/client'
import type { Lease } from '../api/types'
import { downloadContractPdf } from '../domain/contractPdf'
import { leaseDepositText } from '../domain/lease'
import { roomTypeLabel } from '../domain/room'
import { displayDate, bahtAmount } from '../format'
import { useLoader } from '../hooks/useLoader'

function textField(value: string | null | undefined, loading: boolean): string {
  if (value) return value
  return loading ? 'Loading...' : 'Not provided'
}

function perUnit(rate: number | undefined, loading: boolean): string {
  if (rate !== undefined) return `${bahtAmount(rate)} per unit`
  return loading ? 'Loading...' : 'Not available'
}

function perMonth(fee: number | undefined, loading: boolean): string {
  if (fee !== undefined) return `${bahtAmount(fee)} per month`
  return loading ? 'Loading...' : 'Not available'
}

/**
 * Dialog สำหรับ Preview เอกสารสัญญา Residential Lease Agreement
 * ไม่มีแถบ Print Sidebar แต่แสดงเอกสารเต็มรูปแบบ และมีปุ่ม Print / Close
 */
export function ContractPreviewDialog({
  lease,
  onClose,
  onPrint,
}: {
  lease: Lease
  onClose: () => void
  onPrint?: () => void
}) {
  const config = useLoader(fetchApartmentConfig, 'Could not load utility rates')
  const tenant = useLoader(
    () => fetchTenant(lease.tenantId),
    'Could not load tenant details',
    [lease.tenantId],
  )
  const room = useLoader(() => fetchRoom(lease.roomId), 'Could not load unit details', [lease.roomId])

  function handlePrint() {
    if (onPrint) {
      onPrint()
    } else {
      window.print()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Contract Preview"
        className="relative z-10 flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-honey-140/50 bg-white shadow-2xl outline-none"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-sand-65 px-7 py-4">
          <div>
            <h2 className="font-heading text-lg font-bold text-sand-830">Contract Preview</h2>
            <p className="text-xs text-sand-530">
              Unit {lease.roomNumber} · {lease.tenantName} · Contract CT-00{lease.id}
            </p>
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

        {/* Modal Body: Document Content */}
        <div className="flex-1 overflow-y-auto bg-sidebar p-6 sm:p-8">
          <div className="mx-auto max-w-[680px] rounded-xl border border-honey-140 bg-white p-8 sm:p-10 shadow-sm text-sand-830 text-xs leading-relaxed font-sans">
            {/* Header Banner */}
            <div className="text-center pb-6 border-b border-sand-65">
              <h1 className="font-heading text-xl font-bold text-sand-830">Residential Lease Agreement</h1>
              <p className="mt-1 text-[10px] tracking-[1.5px] text-sand-530 uppercase font-medium">
                Sakura Soul Property Management
              </p>
              <p className="mt-1 text-[11px] font-semibold text-sand-320">
                Contract No: CT-00{lease.id}
              </p>
            </div>

            {/* Intro */}
            <p className="mt-5 text-body-muted">
              This Residential Lease Agreement (&quot;Agreement&quot;) is made and entered into on{' '}
              <span className="font-semibold text-sand-830">{displayDate(lease.startDate)}</span>, by and between{' '}
              <strong>Sakura Soul Property Management</strong> (&quot;Landlord&quot;) and{' '}
              <strong className="text-sand-830">{lease.tenantName}</strong> (&quot;Tenant&quot;).
            </p>

            {/* 1. Tenant Details */}
            <div className="mt-5">
              <h2 className="text-xs font-bold text-sand-830 uppercase tracking-wider">1. Tenant Details</h2>
              <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 rounded bg-page-bg p-3 text-[11px]">
                <div><span className="text-sand-530">Full Name:</span> <span className="font-medium text-sand-830">{lease.tenantName}</span></div>
                <div><span className="text-sand-530">ID Number:</span> <span className="text-sand-830">{textField(tenant.data?.nationalId, tenant.loading)}</span></div>
                <div><span className="text-sand-530">Phone:</span> <span className="text-sand-830">{textField(tenant.data?.phone, tenant.loading)}</span></div>
                <div><span className="text-sand-530">Email:</span> <span className="text-sand-830">{textField(tenant.data?.email, tenant.loading)}</span></div>
              </div>
            </div>

            {/* 2. Property Details */}
            <div className="mt-4">
              <h2 className="text-xs font-bold text-sand-830 uppercase tracking-wider">2. Property Details</h2>
              <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 rounded bg-page-bg p-3 text-[11px]">
                <div><span className="text-sand-530">Premises:</span> <span className="font-medium text-sand-830">Unit {lease.roomNumber}</span></div>
                <div><span className="text-sand-530">Room Type:</span> <span className="text-sand-830">{room.data ? roomTypeLabel(room.data.roomType) : textField(null, room.loading)}</span></div>
                <div><span className="text-sand-530">Floor:</span> <span className="text-sand-830">{room.data ? String(room.data.floor) : textField(null, room.loading)}</span></div>
                <div className="col-span-2"><span className="text-sand-530">Address:</span> <span className="text-sand-830">{textField(room.data?.address, room.loading)}</span></div>
              </div>
            </div>

            {/* 3. Lease Terms ค่าเช่าคือ monthlyRent ที่ backend ล็อกตามประเภทห้อง (SSK-127) */}
            <div className="mt-4">
              <h2 className="text-xs font-bold text-sand-830 uppercase tracking-wider">3. Lease Terms</h2>
              <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 rounded bg-page-bg p-3 text-[11px]">
                <div><span className="text-sand-530">Start Date:</span> <span className="font-medium text-sand-830">{displayDate(lease.startDate)}</span></div>
                <div><span className="text-sand-530">End Date:</span> <span className="text-sand-830">{lease.endDate ? displayDate(lease.endDate) : 'Indefinite'}</span></div>
                <div><span className="text-sand-530">Monthly Rent:</span> <span className="font-bold text-sand-830">{bahtAmount(lease.monthlyRent)}</span></div>
                <div><span className="text-sand-530">Security Deposit:</span> <span className="font-medium text-sand-830">{leaseDepositText(lease)}</span></div>
                <div><span className="text-sand-530">Billing Cycle:</span> <span className="text-sand-830">{lease.billingCycle}</span></div>
                <div><span className="text-sand-530">Rent Due:</span> <span className="text-sand-830">1st of each period</span></div>
              </div>
            </div>

            {/* 4. Utility Rates */}
            <div className="mt-4">
              <h2 className="text-xs font-bold text-sand-830 uppercase tracking-wider">4. Utility Rates</h2>
              <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 rounded bg-page-bg p-3 text-[11px]">
                <div><span className="text-sand-530">Electricity:</span> <span className="text-sand-830">{perUnit(config.data?.electricRatePerUnit, config.loading)}</span></div>
                <div><span className="text-sand-530">Water:</span> <span className="text-sand-830">{perUnit(config.data?.waterRatePerUnit, config.loading)}</span></div>
                <div><span className="text-sand-530">Common Area:</span> <span className="text-sand-830">{perMonth(config.data?.commonAreaFee, config.loading)}</span></div>
                <div><span className="text-sand-530">Internet:</span> <span className="text-sand-830">{perMonth(config.data?.internetFee, config.loading)}</span></div>
              </div>
            </div>

            {/* 5. Responsibilities */}
            <div className="mt-4">
              <h2 className="text-xs font-bold text-sand-830 uppercase tracking-wider">5. Tenant Responsibilities</h2>
              <ol className="mt-2 list-decimal pl-5 space-y-1 text-[11px] text-body-muted">
                <li>Pay rent and utilities on time each period.</li>
                <li>Keep the premises in a clean, sanitary, and good condition.</li>
                <li>Notify the Landlord promptly of any damage or required maintenance.</li>
                <li>Comply with all building rules regarding noise and common areas.</li>
              </ol>
            </div>

            {/* Signatures */}
            <div className="mt-8 pt-6 border-t border-sand-65 grid grid-cols-2 gap-8 text-[11px]">
              <div>
                <p className="text-sand-530 text-[10px] uppercase tracking-wider">Landlord Signature</p>
                <div className="mt-6 border-b border-sand-830 pb-1 font-medium text-sand-830">Sakura Soul Management</div>
                <p className="mt-1 text-[10px] text-sand-320">Date: {displayDate(lease.startDate)}</p>
              </div>
              <div>
                <p className="text-sand-530 text-[10px] uppercase tracking-wider">Tenant Signature</p>
                <div className="mt-6 border-b border-sand-830 pb-1 font-medium text-sand-830">{lease.tenantName}</div>
                <p className="mt-1 text-[10px] text-sand-320">Date: {displayDate(lease.startDate)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-sand-65 px-7 py-4 bg-white">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg border border-sand-110 bg-white px-5 py-2.5 text-xs font-medium text-sand-530 hover:bg-black/5 cursor-pointer"
          >
            Close
          </button>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => downloadContractPdf(lease, tenant.data, room.data, config.data)}
              aria-label="Download (PDF)"
              className="flex items-center gap-2 rounded-lg border border-sand-110 bg-white px-4 py-2.5 text-xs font-medium text-sand-830 hover:bg-black/5 transition-colors cursor-pointer"
            >
              <Download size={15} />
              Download (PDF)
            </button>
            <button
              type="button"
              onClick={handlePrint}
              aria-label="Print Contract"
              className="flex items-center gap-2 rounded-lg bg-wine-750 px-5 py-2.5 text-xs font-medium text-white shadow-sm hover:bg-wine-800 transition-colors cursor-pointer"
            >
              <Printer size={15} />
              Print Contract
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
