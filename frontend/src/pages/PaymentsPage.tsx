import { useMemo, useState } from 'react'
import { Bank, ClipboardText, CalendarCheck, Plus, TrendUp } from '@phosphor-icons/react'
import { Search, Receipt, Send } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { PrimaryButton } from '../components/Button'
import { StatCard } from '../components/StatCard'
import { InitialsAvatar } from '../components/InitialsAvatar'
import { DataTable } from '../components/DataTable'
import { GenerateReceiptModal } from '../components/GenerateReceiptModal'
import { CreatePaymentDialog, type CreatePaymentFormData } from '../dialogs/CreatePaymentDialog'
import { receiptTotal, utilityCharge, type ReceiptData, type ReceiptLineItem } from '../domain/receipt'

/**
 * หน้า Payment Management ตาม Figma (SSK-16 / SSK-106)
 */

interface PaymentItem {
  id: string
  receiptNo: string
  tenant: string
  unit: string
  roomType: string
  amount: string
  amountValue: number
  amountLabel: string
  cycle: string
  cycleDate: string
  status: 'Paid' | 'Pending'
  paidDate?: string
  receiptData?: ReceiptData
}

const INITIAL_PAYMENTS: PaymentItem[] = [
  {
    id: 'pay-1',
    receiptNo: 'RC-2026-1015',
    tenant: 'Yuki Tanaka',
    unit: 'Unit 4A - Sakura Wing',
    roomType: 'Single Bedroom',
    amount: '35,000',
    amountValue: 35000,
    amountLabel: 'Rent',
    cycle: 'Monthly',
    cycleDate: 'Oct 2024',
    status: 'Paid',
    paidDate: '3 Nov 2026',
  },
  {
    id: 'pay-2',
    receiptNo: 'RC-2026-1016',
    tenant: 'Kenji Sato',
    unit: 'Unit 2B - Lotus Wing',
    roomType: 'Double Bedroom',
    amount: '500,000',
    amountValue: 500000,
    amountLabel: 'Annual Rent',
    cycle: 'Yearly',
    cycleDate: '2024 - 2025',
    status: 'Pending',
  },
  {
    id: 'pay-3',
    receiptNo: 'RC-2026-1017',
    tenant: 'Hiroshi Nakamura',
    unit: 'Unit 8C - Maple Penthouse',
    roomType: 'Double Bedroom',
    amount: '45,000',
    amountValue: 45000,
    amountLabel: 'Rent',
    cycle: 'Monthly',
    cycleDate: 'Oct 2024',
    status: 'Paid',
    paidDate: '3 Nov 2026',
  },
]

function PaymentStatusPill({ status }: { status: PaymentItem['status'] }) {
  return status === 'Paid' ? (
    <span className="inline-flex items-center rounded-sm bg-moss-50 px-2.5 py-1 text-xs font-medium text-moss-545">
      Paid
    </span>
  ) : (
    <span className="inline-flex items-center rounded-sm border border-honey-88/50 bg-honey-20 px-2.5 py-1 text-xs font-medium text-honey-350">
      Pending
    </span>
  )
}

function paymentToReceiptData(p: PaymentItem): ReceiptData {
  if (p.receiptData) {
    return p.receiptData
  }
  const items: ReceiptLineItem[] = [
    { id: 'room-rent', item: 'Room rent', amount: p.amountValue || 45000 },
    { id: 'electricity', item: 'Electricity', usageValue: 120, usageUnit: 'units', rate: 50, amount: utilityCharge(120, 50) },
    { id: 'water', item: 'Water', usageValue: 15, usageUnit: 'units', rate: 100, amount: utilityCharge(15, 100) },
    { id: 'appliance-fee', item: 'Appliance fee', detail: 'Refrigerator 5.9 cu.ft', amount: 3000 },
    { id: 'repair-charge', item: 'Repair charge', detail: 'Toilet replacement · MT-2026-0088', amount: 3500 },
  ]
  return {
    receiptNo: p.receiptNo || 'RC-2026-1015',
    tenant: p.tenant,
    unit: p.unit.replace(/^Unit\s+/, '').split(' - ')[0] || p.unit,
    billingMonth: p.cycleDate || 'October 2026',
    dueDate: '5 Nov 2026',
    items,
    // SSK-128 ยอดรวมคิดจากรายการจริง เดิมบวกค่าคงที่ชุดเดิมซ้ำเอง แก้รายการแล้วยอดไม่ตาม
    totalAmount: receiptTotal(items),
    status: p.status,
    paidDate: p.paidDate || (p.status === 'Paid' ? '3 Nov 2026' : undefined),
    paymentMethod: 'Bank transfer',
  }
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<PaymentItem[]>(INITIAL_PAYMENTS)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'All' | 'Paid' | 'Pending'>('All')

  // Modals state
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptData | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  const filtered = useMemo(() => {
    return payments.filter((p) => {
      const matchSearch =
        !search.trim() ||
        p.tenant.toLowerCase().includes(search.trim().toLowerCase()) ||
        p.unit.toLowerCase().includes(search.trim().toLowerCase())

      const matchStatus = statusFilter === 'All' || p.status === statusFilter
      return matchSearch && matchStatus
    })
  }, [payments, search, statusFilter])

  function handleCreatePayment(formData: CreatePaymentFormData) {
    const rawTenant = formData.tenant.split(' · ')[0] || formData.tenant
    const newReceiptNo = `RC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`

    const items: ReceiptLineItem[] = [
      { id: 'room-rent', item: 'Room rent', amount: formData.roomRent },
    ]
    if (formData.electricUsage > 0 || formData.electricRate > 0) {
      items.push({
        id: 'electricity',
        item: 'Electricity',
        usageValue: formData.electricUsage,
        usageUnit: 'units',
        rate: formData.electricRate,
        amount: utilityCharge(formData.electricUsage, formData.electricRate || 0),
      })
    }
    if (formData.waterUsage > 0 || formData.waterRate > 0) {
      items.push({
        id: 'water',
        item: 'Water',
        usageValue: formData.waterUsage,
        usageUnit: 'units',
        rate: formData.waterRate,
        amount: utilityCharge(formData.waterUsage, formData.waterRate || 0),
      })
    }
    if (formData.applianceFee > 0) {
      items.push({
        id: 'appliance-fee',
        item: 'Appliance fee',
        detail: formData.applianceDetail || undefined,
        amount: formData.applianceFee,
      })
    }
    if (formData.repairCharge > 0) {
      items.push({
        id: 'repair-charge',
        item: 'Repair charge',
        detail: formData.repairDetail || undefined,
        amount: formData.repairCharge,
      })
    }

    const totalAmount = receiptTotal(items)

    const receiptData: ReceiptData = {
      receiptNo: newReceiptNo,
      tenant: rawTenant,
      unit: formData.room,
      billingMonth: formData.billingMonth,
      dueDate: formData.dueDate,
      items,
      totalAmount,
      status: formData.status === 'Paid' ? 'Paid' : 'Pending',
      paidDate: formData.paidDate,
      paymentMethod: 'Bank transfer',
    }

    const newItem: PaymentItem = {
      id: `pay-${Date.now()}`,
      receiptNo: newReceiptNo,
      tenant: rawTenant,
      unit: `Unit ${formData.room}`,
      roomType: 'Single Bedroom',
      amount: totalAmount.toLocaleString('en-US'),
      amountValue: totalAmount,
      amountLabel: 'Total Bill',
      cycle: 'Monthly',
      cycleDate: formData.billingMonth,
      status: formData.status === 'Paid' ? 'Paid' : 'Pending',
      paidDate: formData.paidDate,
      receiptData,
    }
    setPayments((prev) => [newItem, ...prev])
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Payment Management"
        description="Oversee financial transactions, generate receipts, and manage billing cycles with clarity and ease."
      />

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <StatCard
          label="TOTAL REVENUE (YTD)"
          value="12,450,000"
          icon={Bank}
          footer={
            <span className="inline-flex items-center gap-1 rounded-sm bg-moss-360/10 px-2 py-1 text-xs font-medium text-moss-360">
              <TrendUp size={12} weight="bold" /> +8.4%
            </span>
          }
        />
        <StatCard
          label="PENDING COLLECTIONS"
          value="450,000"
          icon={ClipboardText}
          footer={<span className="text-xs font-medium text-honey-600">12 Invoices Awaiting Payment</span>}
        />
        <StatCard
          label="UPCOMING RENEWALS (30D)"
          value="8 Units"
          icon={CalendarCheck}
          footer={<span className="text-xs font-medium text-ink-muted">Total Value: ฿1,200,000.00</span>}
        />
      </div>

      <div className="flex justify-end">
        <PrimaryButton onClick={() => setIsCreateOpen(true)} aria-label="New Invoice">
          <Plus size={11} weight="bold" />
          New Invoice
        </PrimaryButton>
      </div>

      <div className="w-full overflow-hidden rounded-lg border border-honey-140/50 bg-white/70 shadow-[0px_10px_30px_-10px_rgba(122,84,87,0.08)] backdrop-blur-[6px]">
        <div className="flex flex-col gap-3 border-b border-avatar-ring/30 bg-white/50 p-6 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative w-full sm:max-w-sm">
            <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-body-muted/70" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by Tenant or Unit..."
              className="w-full rounded-md border border-avatar-ring/50 bg-sidebar py-2.5 pr-4 pl-10 text-sm text-ink outline-none placeholder:text-body-muted/70 focus:border-brand"
            />
          </label>
          <div className="flex gap-2">
            {(['All', 'Paid', 'Pending'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`rounded-xl border border-avatar-ring/50 px-4 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                  statusFilter === st ? 'bg-accent-soft text-brand font-semibold' : 'bg-white text-ink hover:bg-black/5'
                }`}
              >
                {st === 'All' ? 'All Status' : st}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <DataTable
            rows={filtered}
            rowKey={(p) => p.id}
            minWidth={820}
            headRowClass="border-b border-avatar-ring/30 bg-page-bg"
            headCellClass="px-6 py-4 text-xs font-medium tracking-[0.6px] text-body-muted uppercase"
            bodyClass="bg-white/40"
            rowClass="border-t border-avatar-ring/20"
            cellClass="px-6 py-5"
            columns={[
              {
                key: 'tenant',
                header: 'TENANT & UNIT',
                cell: (p) => (
                  <div className="flex items-center gap-3">
                    <InitialsAvatar name={p.tenant} size={40} />
                    <div>
                      <p className="text-sm font-semibold tracking-[0.7px] text-ink">{p.tenant}</p>
                      <p className="text-[13px] text-body-muted">{p.unit}</p>
                    </div>
                  </div>
                ),
              },
              {
                key: 'roomType',
                header: 'ROOM TYPE',
                cell: (p) => (
                  <>
                    <p className="text-base text-ink">{p.roomType}</p>
                    <p className="text-xs text-body-muted">{p.amountLabel}</p>
                  </>
                ),
              },
              {
                key: 'amount',
                header: 'AMOUNT',
                cell: (p) => (
                  <>
                    <p className="text-base text-ink">{p.amount}</p>
                    <p className="text-xs text-body-muted">{p.amountLabel}</p>
                  </>
                ),
              },
              {
                key: 'cycle',
                header: 'BILLING CYCLE',
                cell: (p) => (
                  <>
                    <p className="text-base text-ink">{p.cycle}</p>
                    <p className="text-xs text-body-muted">{p.cycleDate}</p>
                  </>
                ),
              },
              {
                key: 'status',
                header: 'STATUS',
                cell: (p) => <PaymentStatusPill status={p.status} />,
              },
              {
                key: 'actions',
                header: 'ACTIONS',
                headerClass: 'text-right',
                cell: (p) => (
                  <div className="flex items-center justify-end gap-3 text-ink-muted">
                    <button
                      type="button"
                      aria-label={`View receipt for ${p.tenant}`}
                      className="hover:text-ink cursor-pointer"
                      onClick={() => setSelectedReceipt(paymentToReceiptData(p))}
                    >
                      <Receipt size={18} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Send invoice for ${p.tenant}`}
                      className="hover:text-ink cursor-pointer"
                    >
                      <Send size={18} />
                    </button>
                  </div>
                ),
              },
            ]}
          />
        </div>

        <div className="flex items-center justify-between border-t border-avatar-ring/30 bg-white/50 px-4 py-4">
          <p className="text-xs font-medium text-body-muted">
            Showing {filtered.length} of {payments.length} entries
          </p>
          <div className="flex items-center gap-1 text-xs font-medium text-body-muted">
            <span className="flex size-8 items-center justify-center rounded-sm bg-accent-soft font-medium text-brand">
              1
            </span>
          </div>
        </div>
      </div>

      {/* Popups */}
      {selectedReceipt && (
        <GenerateReceiptModal
          receipt={selectedReceipt}
          isOpen={true}
          onClose={() => setSelectedReceipt(null)}
          trigger={false}
        />
      )}

      {isCreateOpen && (
        <CreatePaymentDialog
          onClose={() => setIsCreateOpen(false)}
          onSubmit={handleCreatePayment}
        />
      )}
    </div>
  )
}
