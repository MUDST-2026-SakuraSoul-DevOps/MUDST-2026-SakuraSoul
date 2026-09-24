import { X, Printer, Download } from 'lucide-react'
import { fetchApartmentConfig, fetchRoom, fetchTenant } from '../api/client'
import type { Lease } from '../api/types'
import { downloadContractPdf } from '../domain/contractPdf'
import { getLeaseDisplayAmount } from '../domain/lease'
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
        className="relative z-10 flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[rgba(238,217,196,0.5)] bg-white shadow-2xl outline-none"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#f0ece6] px-7 py-4">
          <div>
            <h2 className="font-heading text-lg font-bold text-[#2b2a26]">Contract Preview</h2>
            <p className="text-xs text-[#767065]">
              Unit {lease.roomNumber} · {lease.tenantName} · Contract CT-00{lease.id}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-[#767065] hover:bg-black/5 hover:text-[#2b2a26] cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body: Document Content */}
        <div className="flex-1 overflow-y-auto bg-[#f8f6f5] p-6 sm:p-8">
          <div className="mx-auto max-w-[680px] rounded-xl border border-[#eed9c4] bg-white p-8 sm:p-10 shadow-sm text-[#2b2a26] text-xs leading-relaxed font-sans">
            {/* Header Banner */}
            <div className="text-center pb-6 border-b border-[#f0ece6]">
              <h1 className="font-heading text-xl font-bold text-[#2b2a26]">Residential Lease Agreement</h1>
              <p className="mt-1 text-[10px] tracking-[1.5px] text-[#767065] uppercase font-medium">
                Sakura Soul Property Management
              </p>
              <p className="mt-1 text-[11px] font-semibold text-[#a9a49b]">
                Contract No: CT-00{lease.id}
              </p>
            </div>

            {/* Intro */}
            <p className="mt-5 text-[#504444]">
              This Residential Lease Agreement (&quot;Agreement&quot;) is made and entered into on{' '}
              <span className="font-semibold text-[#2b2a26]">{displayDate(lease.startDate)}</span>, by and between{' '}
              <strong>Sakura Soul Property Management</strong> (&quot;Landlord&quot;) and{' '}
              <strong className="text-[#2b2a26]">{lease.tenantName}</strong> (&quot;Tenant&quot;).
            </p>

            {/* 1. Tenant Details */}
            <div className="mt-5">
              <h2 className="text-xs font-bold text-[#2b2a26] uppercase tracking-wider">1. Tenant Details</h2>
              <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 rounded bg-[#faf9f8] p-3 text-[11px]">
                <div><span className="text-[#767065]">Full Name:</span> <span className="font-medium text-[#2b2a26]">{lease.tenantName}</span></div>
                <div><span className="text-[#767065]">ID Number:</span> <span className="text-[#2b2a26]">{textField(tenant.data?.nationalId, tenant.loading)}</span></div>
                <div><span className="text-[#767065]">Phone:</span> <span className="text-[#2b2a26]">{textField(tenant.data?.phone, tenant.loading)}</span></div>
                <div><span className="text-[#767065]">Email:</span> <span className="text-[#2b2a26]">{textField(tenant.data?.email, tenant.loading)}</span></div>
              </div>
            </div>

            {/* 2. Property Details */}
            <div className="mt-4">
              <h2 className="text-xs font-bold text-[#2b2a26] uppercase tracking-wider">2. Property Details</h2>
              <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 rounded bg-[#faf9f8] p-3 text-[11px]">
                <div><span className="text-[#767065]">Premises:</span> <span className="font-medium text-[#2b2a26]">Unit {lease.roomNumber}</span></div>
                <div><span className="text-[#767065]">Room Type:</span> <span className="text-[#2b2a26]">{room.data ? roomTypeLabel(room.data.roomType) : textField(null, room.loading)}</span></div>
                <div><span className="text-[#767065]">Floor:</span> <span className="text-[#2b2a26]">{room.data ? String(room.data.floor) : textField(null, room.loading)}</span></div>
                <div className="col-span-2"><span className="text-[#767065]">Address:</span> <span className="text-[#2b2a26]">{textField(room.data?.address, room.loading)}</span></div>
              </div>
            </div>

            {/* 3. Lease Terms */}
            {(() => {
              const rentInfo = getLeaseDisplayAmount(lease)
              const isAnnual = rentInfo.label === 'Annual Rent'
              return (
                <div className="mt-4">
                  <h2 className="text-xs font-bold text-[#2b2a26] uppercase tracking-wider">3. Lease Terms</h2>
                  <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 rounded bg-[#faf9f8] p-3 text-[11px]">
                    <div><span className="text-[#767065]">Start Date:</span> <span className="font-medium text-[#2b2a26]">{displayDate(lease.startDate)}</span></div>
                    <div><span className="text-[#767065]">End Date:</span> <span className="text-[#2b2a26]">{lease.endDate ? displayDate(lease.endDate) : 'Indefinite'}</span></div>
                    <div><span className="text-[#767065]">{isAnnual ? 'Annual Rent:' : 'Monthly Rent:'}</span> <span className="font-bold text-[#2b2a26]">฿{rentInfo.amount}</span></div>
                    <div><span className="text-[#767065]">Security Deposit:</span> <span className="font-medium text-[#2b2a26]">{bahtAmount(isAnnual ? Math.round(rentInfo.amountValue / 6) : rentInfo.amountValue * 2)}</span></div>
                    <div><span className="text-[#767065]">Billing Cycle:</span> <span className="text-[#2b2a26]">{isAnnual ? 'YEARLY' : lease.billingCycle}</span></div>
                    <div><span className="text-[#767065]">Rent Due:</span> <span className="text-[#2b2a26]">1st of each period</span></div>
                  </div>
                </div>
              )
            })()}

            {/* 4. Utility Rates */}
            <div className="mt-4">
              <h2 className="text-xs font-bold text-[#2b2a26] uppercase tracking-wider">4. Utility Rates</h2>
              <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 rounded bg-[#faf9f8] p-3 text-[11px]">
                <div><span className="text-[#767065]">Electricity:</span> <span className="text-[#2b2a26]">{perUnit(config.data?.electricRatePerUnit, config.loading)}</span></div>
                <div><span className="text-[#767065]">Water:</span> <span className="text-[#2b2a26]">{perUnit(config.data?.waterRatePerUnit, config.loading)}</span></div>
                <div><span className="text-[#767065]">Common Area:</span> <span className="text-[#2b2a26]">{perMonth(config.data?.commonAreaFee, config.loading)}</span></div>
                <div><span className="text-[#767065]">Internet:</span> <span className="text-[#2b2a26]">{perMonth(config.data?.internetFee, config.loading)}</span></div>
              </div>
            </div>

            {/* 5. Responsibilities */}
            <div className="mt-4">
              <h2 className="text-xs font-bold text-[#2b2a26] uppercase tracking-wider">5. Tenant Responsibilities</h2>
              <ol className="mt-2 list-decimal pl-5 space-y-1 text-[11px] text-[#504444]">
                <li>Pay rent and utilities on time each period.</li>
                <li>Keep the premises in a clean, sanitary, and good condition.</li>
                <li>Notify the Landlord promptly of any damage or required maintenance.</li>
                <li>Comply with all building rules regarding noise and common areas.</li>
              </ol>
            </div>

            {/* Signatures */}
            <div className="mt-8 pt-6 border-t border-[#f0ece6] grid grid-cols-2 gap-8 text-[11px]">
              <div>
                <p className="text-[#767065] text-[10px] uppercase tracking-wider">Landlord Signature</p>
                <div className="mt-6 border-b border-[#2b2a26] pb-1 font-medium text-[#2b2a26]">Sakura Soul Management</div>
                <p className="mt-1 text-[10px] text-[#a9a49b]">Date: {displayDate(lease.startDate)}</p>
              </div>
              <div>
                <p className="text-[#767065] text-[10px] uppercase tracking-wider">Tenant Signature</p>
                <div className="mt-6 border-b border-[#2b2a26] pb-1 font-medium text-[#2b2a26]">{lease.tenantName}</div>
                <p className="mt-1 text-[10px] text-[#a9a49b]">Date: {displayDate(lease.startDate)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-[#f0ece6] px-7 py-4 bg-white">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg border border-[#e7e0d3] bg-white px-5 py-2.5 text-xs font-medium text-[#767065] hover:bg-black/5 cursor-pointer"
          >
            Close
          </button>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => downloadContractPdf(lease, tenant.data, room.data, config.data)}
              aria-label="Download (PDF)"
              className="flex items-center gap-2 rounded-lg border border-[#e7e0d3] bg-white px-4 py-2.5 text-xs font-medium text-[#2b2a26] hover:bg-black/5 transition-colors cursor-pointer"
            >
              <Download size={15} />
              Download (PDF)
            </button>
            <button
              type="button"
              onClick={handlePrint}
              aria-label="Print Contract"
              className="flex items-center gap-2 rounded-lg bg-[#5a3036] px-5 py-2.5 text-xs font-medium text-white shadow-sm hover:bg-[#47262b] transition-colors cursor-pointer"
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
