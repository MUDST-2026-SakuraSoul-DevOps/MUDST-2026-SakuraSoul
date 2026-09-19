import { useMemo, useState } from 'react'
import { Bank, ClipboardText, CalendarCheck, Plus, TrendUp } from '@phosphor-icons/react'
import { Search, Receipt, Download, Clock, Send, Check } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { PrimaryButton } from '../components/Button'
import { StatCard } from '../components/StatCard'
import { InitialsAvatar } from '../components/InitialsAvatar'
import { GenerateReceiptModal } from '../components/GenerateReceiptModal'
import { CreatePaymentDialog, type CreatePaymentFormData } from '../dialogs/CreatePaymentDialog'
import { ScheduledBillingDialog, type ScheduledBillingConfig } from '../dialogs/ScheduledBillingDialog'
import { BulkSendInvoicesDialog } from '../dialogs/BulkSendInvoicesDialog'
import { downloadReceipt, type ReceiptData } from '../domain/receipt'

/**
 * หน้า Payment Management ตาม Figma (SSK-16 / SSK-106 / SSK-130)
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
    <span className="inline-flex items-center rounded-sm bg-[#e8f5e9] px-2.5 py-1 text-xs font-medium text-[#2e7d32]">
      Paid
    </span>
  ) : (
    <span className="inline-flex items-center rounded-sm border border-[rgba(255,224,130,0.5)] bg-[#fff8e1] px-2.5 py-1 text-xs font-medium text-[#f57f17]">
      Pending
    </span>
  )
}

function paymentToReceiptData(p: PaymentItem): ReceiptData {
  return {
    receiptNo: p.receiptNo || 'RC-2026-1015',
    tenant: p.tenant,
    unit: p.unit.replace(/^Unit\s+/, '').split(' - ')[0] || p.unit,
    billingMonth: p.cycleDate || 'October 2026',
    dueDate: '5 Nov 2026',
    items: [
      { id: 'room-rent', item: 'Room rent', amount: p.amountValue || 45000 },
      { id: 'electricity', item: 'Electricity', usageValue: 120, usageUnit: 'units', rate: 50, amount: 6000 },
      { id: 'water', item: 'Water', usageValue: 15, usageUnit: 'units', rate: 100, amount: 1500 },
      { id: 'appliance-fee', item: 'Appliance fee', detail: 'Refrigerator 5.9 cu.ft', amount: 3000 },
      { id: 'repair-charge', item: 'Repair charge', detail: 'Toilet replacement · MT-2026-0088', amount: 3500 },
    ],
    totalAmount: (p.amountValue || 45000) + 6000 + 1500 + 3000 + 3500,
    status: p.status,
    paidDate: p.paidDate || (p.status === 'Paid' ? '3 Nov 2026' : undefined),
    paymentMethod: 'Bank transfer',
  }
}

const INITIAL_SCHEDULE_CONFIG: ScheduledBillingConfig = {
  enabled: true,
  scheduleType: 'MONTHLY_RECURRING',
  dayOfMonth: 25,
  dispatchTime: '09:00',
  targetAudience: 'ALL_ACTIVE',
  sendEmail: true,
  sendLine: true,
  sendSms: false,
  attachPdf: true,
  advanceNoticeDays: 5,
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<PaymentItem[]>(INITIAL_PAYMENTS)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'All' | 'Paid' | 'Pending'>('All')
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptData | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isScheduleOpen, setIsScheduleOpen] = useState(false)
  const [isBulkSendOpen, setIsBulkSendOpen] = useState(false)
  const [scheduleConfig, setScheduleConfig] = useState<ScheduledBillingConfig>(INITIAL_SCHEDULE_CONFIG)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

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

  const allFilteredSelected = filtered.length > 0 && filtered.every((p) => selectedIds.has(p.id))
  const someFilteredSelected = filtered.some((p) => selectedIds.has(p.id)) && !allFilteredSelected

  function handleToggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleToggleSelectAll() {
    if (allFilteredSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        filtered.forEach((p) => next.delete(p.id))
        return next
      })
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        filtered.forEach((p) => next.add(p.id))
        return next
      })
    }
  }

  const selectedPaymentsForBulk = useMemo(() => {
    if (selectedIds.size === 0) return filtered
    return payments.filter((p) => selectedIds.has(p.id))
  }, [payments, selectedIds, filtered])

  function handleCreatePayment(formData: CreatePaymentFormData) {
    const rawTenant = formData.tenant.split(' · ')[0] || formData.tenant
    const newItem: PaymentItem = {
      id: `pay-${Date.now()}`,
      receiptNo: `RC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      tenant: rawTenant,
      unit: `Unit ${formData.room}`,
      roomType: 'Single Bedroom',
      amount: formData.roomRent.toLocaleString('en-US'),
      amountValue: formData.roomRent,
      amountLabel: 'Rent',
      cycle: 'Monthly',
      cycleDate: formData.billingMonth,
      status: formData.status === 'Paid' ? 'Paid' : 'Pending',
      paidDate: formData.paidDate,
    }
    setPayments((prev) => [newItem, ...prev])
  }

  function handleDownloadPayment(p: PaymentItem) {
    downloadReceipt(paymentToReceiptData(p))
  }

  function handleBulkSentSuccess() {
    setIsBulkSendOpen(false)
    const count = selectedPaymentsForBulk.length
    setSelectedIds(new Set())
    setToastMessage(`Successfully dispatched ${count} ${count === 1 ? 'invoice' : 'invoices'} to tenants!`)
    setTimeout(() => {
      setToastMessage(null)
    }, 4000)
  }

  function handleScheduleSaved(config: ScheduledBillingConfig) {
    setScheduleConfig(config)
    setToastMessage(
      config.enabled
        ? `Auto-billing schedule active: Every ${config.dayOfMonth}th at ${config.dispatchTime}`
        : 'Auto-billing schedule has been paused.',
    )
    setTimeout(() => {
      setToastMessage(null)
    }, 4000)
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
            <span className="inline-flex items-center gap-1 rounded-sm bg-[rgba(76,175,80,0.1)] px-2 py-1 text-xs font-medium text-[#4caf50]">
              <TrendUp size={12} weight="bold" /> +8.4%
            </span>
          }
        />
        <StatCard
          label="PENDING COLLECTIONS"
          value="450,000"
          icon={ClipboardText}
          footer={<span className="text-xs font-medium text-[#6b5c4b]">12 Invoices Awaiting Payment</span>}
        />
        <StatCard
          label="UPCOMING RENEWALS (30D)"
          value="8 Units"
          icon={CalendarCheck}
          footer={<span className="text-xs font-medium text-ink-muted">Total Value: ¥1,200,000</span>}
        />
      </div>

      {toastMessage && (
        <div className="flex items-center gap-2.5 rounded-xl border border-[#c8e6c9] bg-[#f1f8e9] p-3.5 text-xs font-medium text-[#2e7d32] shadow-sm animate-fade-in">
          <Check size={16} className="text-[#2e7d32]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Schedule Status Pill */}
        {scheduleConfig.enabled ? (
          <div className="inline-flex items-center gap-2 rounded-full border border-[#c8e6c9] bg-[#f1f8e9] px-3.5 py-1.5 text-xs text-[#2e7d32]">
            <span className="size-2 rounded-full bg-[#4caf50] animate-pulse" />
            <span>
              Auto-Billing Active: Every <strong>{scheduleConfig.dayOfMonth}th</strong> at{' '}
              <strong>{scheduleConfig.dispatchTime}</strong>
            </span>
          </div>
        ) : (
          <div className="inline-flex items-center gap-2 rounded-full border border-[#e0e0e0] bg-[#f5f5f5] px-3.5 py-1.5 text-xs text-[#757575]">
            <span className="size-2 rounded-full bg-[#9e9e9e]" />
            <span>Auto-Billing Paused</span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Schedule Auto-Billing */}
          <button
            type="button"
            onClick={() => setIsScheduleOpen(true)}
            aria-label="Schedule Auto-Billing"
            className="flex items-center gap-2 rounded-xl border border-[#eed9c4] bg-white px-4 py-2.5 text-xs font-semibold text-[#5a3036] shadow-sm hover:bg-[#faf9f8] transition cursor-pointer"
          >
            <Clock size={16} />
            Schedule Auto-Billing
          </button>

          {/* Send Invoices (Bulk) */}
          <button
            type="button"
            onClick={() => setIsBulkSendOpen(true)}
            aria-label={selectedIds.size > 0 ? `Send Invoices (${selectedIds.size})` : 'Send All Invoices'}
            className="flex items-center gap-2 rounded-xl bg-[#5a3036] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#47262b] transition cursor-pointer"
          >
            <Send size={15} />
            {selectedIds.size > 0 ? `Send Invoices (${selectedIds.size})` : 'Send All Invoices'}
          </button>

          {/* New Invoice */}
          <PrimaryButton onClick={() => setIsCreateOpen(true)} aria-label="New Invoice">
            <Plus size={11} weight="bold" />
            New Invoice
          </PrimaryButton>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="w-full overflow-hidden rounded-lg border border-[rgba(238,217,196,0.5)] bg-white/70 shadow-[0px_10px_30px_-10px_rgba(122,84,87,0.08)] backdrop-blur-[6px]">
        <div className="flex flex-col gap-3 border-b border-[rgba(212,194,195,0.3)] bg-white/50 p-6 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative w-full sm:max-w-sm">
            <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-body-muted/70" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by Tenant or Unit..."
              className="w-full rounded-md border border-[rgba(212,194,195,0.5)] bg-sidebar py-2.5 pr-4 pl-10 text-sm text-ink outline-none placeholder:text-body-muted/70 focus:border-brand"
            />
          </label>
          <div className="flex gap-2">
            {(['All', 'Paid', 'Pending'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`rounded-xl border border-[rgba(212,194,195,0.5)] px-4 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                  statusFilter === st ? 'bg-accent-soft text-brand font-semibold' : 'bg-white text-ink hover:bg-black/5'
                }`}
              >
                {st === 'All' ? 'All Status' : st}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left">
            <thead>
              <tr className="border-b border-[rgba(212,194,195,0.3)] bg-[#f6f3f2]">
                {/* Multi-Select Header Checkbox */}
                <th className="w-12 px-4 py-4 text-center">
                  <input
                    type="checkbox"
                    aria-label="Select all invoices"
                    checked={allFilteredSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someFilteredSelected
                    }}
                    onChange={handleToggleSelectAll}
                    className="size-4 rounded border-[#eed9c4] accent-[#5a3036] cursor-pointer"
                  />
                </th>
                {['TENANT & UNIT', 'ROOM TYPE', 'AMOUNT', 'BILLING CYCLE', 'STATUS', 'ACTIONS'].map((col, i) => (
                  <th
                    key={col}
                    className={`px-6 py-4 text-xs font-medium tracking-[0.6px] text-body-muted uppercase ${
                      i === 5 ? 'text-right' : ''
                    }`}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white/40">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-xs text-body-muted">
                    No payment records found.
                  </td>
                </tr>
              ) : (
                filtered.map((p) => {
                  const isSelected = selectedIds.has(p.id)
                  return (
                    <tr
                      key={p.id}
                      className={`border-t border-[rgba(212,194,195,0.2)] transition-colors ${
                        isSelected ? 'bg-[#fcf5f5]/80' : 'hover:bg-black/2'
                      }`}
                    >
                      {/* Row Checkbox */}
                      <td className="w-12 px-4 py-5 text-center">
                        <input
                          type="checkbox"
                          aria-label={`Select invoice for ${p.tenant}`}
                          checked={isSelected}
                          onChange={() => handleToggleSelect(p.id)}
                          className="size-4 rounded border-[#eed9c4] accent-[#5a3036] cursor-pointer"
                        />
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <InitialsAvatar name={p.tenant} size={40} />
                          <div>
                            <p className="text-sm font-semibold tracking-[0.7px] text-ink">{p.tenant}</p>
                            <p className="text-[13px] text-body-muted">{p.unit}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <p className="text-base text-ink">{p.roomType}</p>
                        <p className="text-xs text-body-muted">{p.amountLabel}</p>
                      </td>
                      <td className="px-6 py-5">
                        <p className="text-base text-ink">{p.amount}</p>
                        <p className="text-xs text-body-muted">{p.amountLabel}</p>
                      </td>
                      <td className="px-6 py-5">
                        <p className="text-base text-ink">{p.cycle}</p>
                        <p className="text-xs text-body-muted">{p.cycleDate}</p>
                      </td>
                      <td className="px-6 py-5">
                        <PaymentStatusPill status={p.status} />
                      </td>
                      <td className="px-6 py-5">
                        {/* Row Actions: View Receipt & Download (Send icon removed) */}
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
                            aria-label={`Download invoice for ${p.tenant}`}
                            className="hover:text-ink cursor-pointer"
                            onClick={() => handleDownloadPayment(p)}
                          >
                            <Download size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-[rgba(212,194,195,0.3)] bg-white/50 px-6 py-4">
          <p className="text-xs font-medium text-body-muted">
            {selectedIds.size > 0
              ? `Selected ${selectedIds.size} of ${filtered.length} entries`
              : `Showing ${filtered.length} of ${payments.length} entries`}
          </p>
          <div className="flex items-center gap-1 text-xs font-medium text-body-muted">
            <span className="flex size-8 items-center justify-center rounded-sm bg-accent-soft font-medium text-[#795356]">
              1
            </span>
          </div>
        </div>
      </div>

      {/* Popups & Dialogs */}
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

      {isScheduleOpen && (
        <ScheduledBillingDialog
          initialConfig={scheduleConfig}
          onClose={() => setIsScheduleOpen(false)}
          onSave={handleScheduleSaved}
        />
      )}

      {isBulkSendOpen && (
        <BulkSendInvoicesDialog
          items={selectedPaymentsForBulk}
          onClose={() => setIsBulkSendOpen(false)}
          onSent={handleBulkSentSuccess}
        />
      )}
    </div>
  )
}

