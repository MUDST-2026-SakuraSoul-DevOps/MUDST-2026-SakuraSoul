import { useState } from 'react'
import { Printer, X } from 'lucide-react'
import type { Lease } from '../api/types'
import { displayDate, yen } from '../format'

/**
 * Dialog แสดงเอกสารสัญญา Residential Lease Agreement พร้อมเมนู Print / Save as PDF
 * ตรงกับ Figma รูป Prototype "Print / Save as PDF"
 */
export function ContractPdfDialog({
  lease,
  onClose,
}: {
  lease: Lease
  onClose: () => void
}) {
  const [destination, setDestination] = useState('Save as PDF')
  const [pages, setPages] = useState('All')
  const [layout, setLayout] = useState('Portrait')

  function handlePrint() {
    window.print()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Contract PDF Preview"
        className="relative z-10 flex max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-[rgba(238,217,196,0.5)] bg-[#2b2a26] shadow-2xl outline-none"
      >
        {/* Document Area (Left) */}
        <div className="flex-1 overflow-y-auto bg-[#e5e5e5] p-8">
          <div className="mx-auto max-w-[680px] rounded-lg bg-white p-10 shadow-lg text-[#2b2a26] text-xs leading-relaxed font-sans">
            {/* Header */}
            <div className="text-center pb-6 border-b border-[#f0ece6]">
              <h1 className="font-heading text-xl font-bold text-[#2b2a26]">Residential Lease Agreement</h1>
              <p className="mt-1 text-[10px] tracking-[1.5px] text-[#767065] uppercase">
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
                <div><span className="text-[#767065]">ID Number:</span> <span className="text-[#2b2a26]">1-2345-67890-12-3</span></div>
                <div><span className="text-[#767065]">Phone:</span> <span className="text-[#2b2a26]">012-345-6789</span></div>
                <div><span className="text-[#767065]">Line ID:</span> <span className="text-[#2b2a26]">@{lease.tenantName.toLowerCase().replace(/\s+/g, '')}</span></div>
              </div>
            </div>

            {/* 2. Property Details */}
            <div className="mt-4">
              <h2 className="text-xs font-bold text-[#2b2a26] uppercase tracking-wider">2. Property Details</h2>
              <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 rounded bg-[#faf9f8] p-3 text-[11px]">
                <div><span className="text-[#767065]">Premises:</span> <span className="font-medium text-[#2b2a26]">Unit {lease.roomNumber}</span></div>
                <div><span className="text-[#767065]">Room Type:</span> <span className="text-[#2b2a26]">Single / Double Bedroom</span></div>
                <div className="col-span-2"><span className="text-[#767065]">Address:</span> <span className="text-[#2b2a26]">123 Blossom Lane, Zen District, Tokyo</span></div>
              </div>
            </div>

            {/* 3. Lease Terms */}
            <div className="mt-4">
              <h2 className="text-xs font-bold text-[#2b2a26] uppercase tracking-wider">3. Lease Terms</h2>
              <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 rounded bg-[#faf9f8] p-3 text-[11px]">
                <div><span className="text-[#767065]">Start Date:</span> <span className="font-medium text-[#2b2a26]">{displayDate(lease.startDate)}</span></div>
                <div><span className="text-[#767065]">End Date:</span> <span className="text-[#2b2a26]">{lease.endDate ? displayDate(lease.endDate) : 'Indefinite'}</span></div>
                <div><span className="text-[#767065]">Monthly Rent:</span> <span className="font-bold text-[#2b2a26]">{yen(lease.monthlyRent)}</span></div>
                <div><span className="text-[#767065]">Security Deposit:</span> <span className="font-medium text-[#2b2a26]">{yen(lease.monthlyRent * 2)}</span></div>
                <div><span className="text-[#767065]">Billing Cycle:</span> <span className="text-[#2b2a26]">{lease.billingCycle}</span></div>
                <div><span className="text-[#767065]">Rent Due:</span> <span className="text-[#2b2a26]">1st of each period</span></div>
              </div>
            </div>

            {/* 4. Utility Rates */}
            <div className="mt-4">
              <h2 className="text-xs font-bold text-[#2b2a26] uppercase tracking-wider">4. Utility Rates</h2>
              <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 rounded bg-[#faf9f8] p-3 text-[11px]">
                <div><span className="text-[#767065]">Electricity:</span> <span className="text-[#2b2a26]">¥8.00 per unit</span></div>
                <div><span className="text-[#767065]">Water:</span> <span className="text-[#2b2a26]">¥18.00 per unit</span></div>
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

        {/* Print Sidebar (Right) */}
        <div className="flex w-72 flex-col justify-between border-l border-[#42413e] bg-[#33322f] p-6 text-white">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-[#4d4c48]">
              <div className="flex items-center gap-2">
                <Printer size={18} className="text-[#fdcbce]" />
                <h3 className="font-heading text-base font-semibold">Print</h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-md p-1 text-[#a9a49b] hover:bg-white/10 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-6 flex flex-col gap-4 text-xs">
              <div>
                <label htmlFor="print-destination" className="block text-[#a9a49b] mb-1">Destination</label>
                <select
                  id="print-destination"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  className="w-full rounded bg-[#242321] border border-[#4d4c48] px-3 py-2 text-white outline-none"
                >
                  <option value="Save as PDF">Save as PDF</option>
                  <option value="Brother HL-L2350DW">Brother HL-L2350DW</option>
                  <option value="HP LaserJet Pro">HP LaserJet Pro</option>
                </select>
              </div>

              <div>
                <label htmlFor="print-pages" className="block text-[#a9a49b] mb-1">Pages</label>
                <select
                  id="print-pages"
                  value={pages}
                  onChange={(e) => setPages(e.target.value)}
                  className="w-full rounded bg-[#242321] border border-[#4d4c48] px-3 py-2 text-white outline-none"
                >
                  <option value="All">All (1 page)</option>
                  <option value="Custom">Custom</option>
                </select>
              </div>

              <div>
                <label htmlFor="print-layout" className="block text-[#a9a49b] mb-1">Layout</label>
                <select
                  id="print-layout"
                  value={layout}
                  onChange={(e) => setLayout(e.target.value)}
                  className="w-full rounded bg-[#242321] border border-[#4d4c48] px-3 py-2 text-white outline-none"
                >
                  <option value="Portrait">Portrait</option>
                  <option value="Landscape">Landscape</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-6 border-t border-[#4d4c48]">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-[#4d4c48] bg-transparent py-2 text-xs font-medium text-[#e5e5e5] hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="flex-1 rounded-lg bg-[#a3e635] py-2 text-xs font-semibold text-[#1a471a] hover:bg-[#92d326]"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
