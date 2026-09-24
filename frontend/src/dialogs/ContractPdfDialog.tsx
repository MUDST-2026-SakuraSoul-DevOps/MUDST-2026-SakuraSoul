import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Printer, X } from 'lucide-react'
import { fetchApartmentConfig, fetchRoom, fetchTenant } from '../api/client'
import type { Lease } from '../api/types'
import { roomTypeLabel } from '../domain/room'
import { getLeaseDisplayAmount } from '../domain/lease'
import { displayDate, bahtAmount } from '../format'
import { useLoader } from '../hooks/useLoader'
import { CustomSelect } from '../components/CustomSelect'

/*
  เอกสารนี้เป็นตัวสัญญาที่ผู้เช่าเซ็นจริง ค่าที่ยังโหลดไม่เสร็จจึงห้ามปล่อยว่าง
  หรือเดาแทน ต้องบอกให้ชัดว่ากำลังโหลดอยู่ หรือไม่มีข้อมูลในระบบ คนอ่านจะได้
  ไม่เผลอพิมพ์สัญญาที่ช่องสำคัญหายไปเฉย ๆ
*/
function textField(value: string | null | undefined, loading: boolean): string {
  if (value) return value
  return loading ? 'Loading...' : 'Not provided'
}

/** อัตราต่อหน่วยตั้งเป็นทศนิยมได้ (เช่น 12.5) จึงคงสองตำแหน่งไว้ให้อ่านเป็นอัตรา */
function perUnit(rate: number | undefined, loading: boolean): string {
  if (rate !== undefined) return `${bahtAmount(rate)} per unit`
  return loading ? 'Loading...' : 'Not available'
}

function perMonth(fee: number | undefined, loading: boolean): string {
  if (fee !== undefined) return `${bahtAmount(fee)} per month`
  return loading ? 'Loading...' : 'Not available'
}

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

  /*
    SSK-116 ข้อมูลในเอกสารเดิมเขียนตายตัวไว้ในไฟล์ทั้งชุด ทั้งอัตราค่าไฟค่าน้ำ
    เลขบัตรประชาชน เบอร์โทร ประเภทห้อง และที่อยู่ ไปแก้ที่หน้า Apartment Config
    หรือแก้ข้อมูลผู้เช่าแล้วเอกสารก็ยังพิมพ์ค่าเดิมออกมา ซึ่งเป็นสัญญาที่ผิด
    ตอนนี้โหลดของจริงทั้งสามชุดตามสัญญาที่เปิดอยู่
  */
  const config = useLoader(fetchApartmentConfig, 'Could not load utility rates')
  const tenant = useLoader(
    () => fetchTenant(lease.tenantId),
    'Could not load tenant details',
    [lease.tenantId],
  )
  const room = useLoader(() => fetchRoom(lease.roomId), 'Could not load unit details', [lease.roomId])

  function handlePrint() {
    window.print()
  }

  /*
    ตอนสั่งพิมพ์ต้องได้แค่เอกสารสัญญาเต็มหน้า ไม่ใช่ภาพหน้าจอทั้งป็อปอัป
    จึง portal ไปไว้ใต้ body ตรง ๆ ให้ print CSS ใน index.css ซ่อนตัวแอปข้างหลัง
    ได้ทั้งก้อน แล้วคลาส print: ด้านล่างถอดกรอบ แถบตั้งค่า และความสูงที่ถูกตัด
    ออกให้เหลือแต่ตัวเอกสาร
  */
  return createPortal(
    <div className="contract-print-root fixed inset-0 z-50 flex items-center justify-center p-4 print:static print:block print:p-0">
      <div className="absolute inset-0 bg-black/50 print:hidden" onClick={onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Contract PDF Preview"
        className="relative z-10 flex max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-[rgba(238,217,196,0.5)] bg-[#2b2a26] shadow-2xl outline-none print:static print:block print:max-h-none print:max-w-none print:overflow-visible print:rounded-none print:border-0 print:bg-white print:shadow-none"
      >
        {/* Document Area (Left) */}
        <div className="flex-1 overflow-y-auto bg-[#e5e5e5] p-8 print:overflow-visible print:bg-white print:p-0">
          <div className="mx-auto max-w-[680px] rounded-lg bg-white p-10 shadow-lg text-[#2b2a26] text-xs leading-relaxed font-sans print:max-w-none print:rounded-none print:p-[18mm] print:shadow-none">
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
                <div><span className="text-[#767065]">ID Number:</span> <span className="text-[#2b2a26]">{textField(tenant.data?.nationalId, tenant.loading)}</span></div>
                <div><span className="text-[#767065]">Phone:</span> <span className="text-[#2b2a26]">{textField(tenant.data?.phone, tenant.loading)}</span></div>
                {/*
                  ช่องนี้เดิมเป็น Line ID ที่ประกอบจากชื่อผู้เช่า ซึ่งไม่ใช่ไอดีจริงของใครเลย
                  และระบบก็ไม่ได้เก็บ Line ID ไว้ที่ไหน (ช่องในฟอร์มสร้างสัญญาไม่ถูกบันทึก)
                  เปลี่ยนเป็นอีเมลที่เป็นฟิลด์บังคับของผู้เช่าและใช้ส่งเอกสารได้จริงตาม US-03
                */}
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

        {/* Print Sidebar (Right) */}
        <div className="flex w-72 flex-col justify-between border-l border-[#42413e] bg-[#33322f] p-6 text-white print:hidden">
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
                className="rounded-md p-1 text-[#a9a49b] hover:bg-white/10 hover:text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-6 flex flex-col gap-4 text-xs">
              <div>
                <label htmlFor="print-destination" className="block text-[#a9a49b] mb-1">Destination</label>
                <CustomSelect
                  id="print-destination"
                  value={destination}
                  onChange={(val) => setDestination(val)}
                  variant="dark"
                  options={[
                    { value: 'Save as PDF', label: 'Save as PDF' },
                    { value: 'Brother HL-L2350DW', label: 'Brother HL-L2350DW' },
                    { value: 'HP LaserJet Pro', label: 'HP LaserJet Pro' },
                  ]}
                />
              </div>

              <div>
                <label htmlFor="print-pages" className="block text-[#a9a49b] mb-1">Pages</label>
                <CustomSelect
                  id="print-pages"
                  value={pages}
                  onChange={(val) => setPages(val)}
                  variant="dark"
                  options={[
                    { value: 'All', label: 'All (1 page)' },
                    { value: 'Custom', label: 'Custom' },
                  ]}
                />
              </div>

              <div>
                <label htmlFor="print-layout" className="block text-[#a9a49b] mb-1">Layout</label>
                <CustomSelect
                  id="print-layout"
                  value={layout}
                  onChange={(val) => setLayout(val)}
                  variant="dark"
                  options={[
                    { value: 'Portrait', label: 'Portrait' },
                    { value: 'Landscape', label: 'Landscape' },
                  ]}
                />
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-6 border-t border-[#4d4c48]">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-[#4d4c48] bg-transparent py-2 text-xs font-medium text-[#e5e5e5] hover:bg-white/10 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="flex-1 rounded-lg bg-[#a3e635] py-2 text-xs font-semibold text-[#1a471a] hover:bg-[#92d326] cursor-pointer"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
