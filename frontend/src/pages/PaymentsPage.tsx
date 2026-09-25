import { useMemo, useState } from 'react'
import { Bank, ClipboardText, CalendarCheck, Plus } from '@phosphor-icons/react'
import { Search, Receipt as ReceiptIcon, Send } from 'lucide-react'
import { fetchLeases, fetchReceipts, fetchRooms, payReceipt } from '../api/client'
import type { Lease, Receipt, RoomSummary } from '../api/types'
import { PageHeader } from '../components/PageHeader'
import { PrimaryButton } from '../components/Button'
import { StatCard } from '../components/StatCard'
import { InitialsAvatar } from '../components/InitialsAvatar'
import { DataTable } from '../components/DataTable'
import { ErrorState, LoadingState } from '../components/PageState'
import { GenerateReceiptModal } from '../components/GenerateReceiptModal'
import { CreatePaymentDialog } from '../dialogs/CreatePaymentDialog'
import { displayBillingMonth, paymentStatusOf, toReceiptData, type PaymentStatus } from '../domain/billing'
import { roomTypeLabel } from '../domain/room'
import { baht, bahtAmount, daysUntil, todayInBangkok } from '../format'
import { useLoader } from '../hooks/useLoader'

/**
 * หน้า Payment Management ตาม Figma (SSK-16 / SSK-106) ข้อมูลทั้งหมดมาจาก /api/receipts
 *
 * ประเภทห้องกับรอบบิลไม่ได้อยู่ในใบเสร็จ ต้องประกอบจากห้องและสัญญา ตามที่
 * docs/api-contract-billing.md บอกไว้ การ์ดสรุปสามใบยังไม่มี endpoint จึงคิดจากรายการที่โหลดมา
 */

interface PaymentRow {
  receipt: Receipt
  roomType: string
  cycle: string
  status: PaymentStatus
}

const CYCLE_LABEL: Record<Lease['billingCycle'], string> = {
  MONTHLY: 'Monthly',
  YEARLY: 'Yearly',
}

const RENEWAL_WINDOW_DAYS = 30

/**
 * SSK-16 เพิ่มป้าย Overdue ใบที่ยังไม่จ่ายและเลยวันครบกำหนด (กฎอยู่ที่ paymentStatusOf)
 * ป้ายผู้เช่าในหน้า Tenants คิดจากกฎเดียวกัน สองหน้าจะได้บอกตรงกันว่าใครค้างจ่าย
 */
const STATUS_PILL: Record<PaymentStatus, string> = {
  Paid: 'bg-moss-50 text-moss-545',
  Pending: 'border border-honey-88/50 bg-honey-20 text-honey-350',
  Overdue: 'border border-accent-soft bg-blush-80 text-alert-525',
}

function PaymentStatusPill({ status }: { status: PaymentStatus }) {
  return (
    <span className={`inline-flex items-center rounded-sm px-2.5 py-1 text-xs font-medium ${STATUS_PILL[status]}`}>
      {status}
    </span>
  )
}

function toRows(receipts: Receipt[], rooms: RoomSummary[], leases: Lease[], today: string): PaymentRow[] {
  return receipts.map((receipt) => {
    const room = rooms.find((r) => r.roomNumber === receipt.roomNumber)
    const lease = leases.find((l) => l.id === receipt.leaseId)
    return {
      receipt,
      roomType: roomTypeLabel(room?.roomType),
      cycle: lease ? CYCLE_LABEL[lease.billingCycle] : '-',
      status: paymentStatusOf(receipt, today),
    }
  })
}

export default function PaymentsPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'All' | PaymentStatus>('All')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  const page = useLoader(async () => {
    const [receipts, rooms, leases] = await Promise.all([fetchReceipts(), fetchRooms(), fetchLeases()])
    return { receipts, rooms, leases }
  }, 'Could not load the payments')

  const rows = useMemo(
    () => (page.data ? toRows(page.data.receipts, page.data.rooms, page.data.leases, todayInBangkok()) : []),
    [page.data],
  )

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return rows.filter(({ receipt, status }) => {
      const matchSearch =
        query === '' ||
        receipt.tenantName.toLowerCase().includes(query) ||
        receipt.roomNumber.toLowerCase().includes(query)
      // กรองตามป้ายที่เห็น ใบที่เลยกำหนดอยู่ในปุ่ม Overdue ไม่ปนกับ Pending
      const matchStatus = statusFilter === 'All' || status === statusFilter
      return matchSearch && matchStatus
    })
  }, [rows, search, statusFilter])

  const summary = useMemo(() => {
    const receipts = page.data?.receipts ?? []
    const year = todayInBangkok().slice(0, 4)
    const paidThisYear = receipts.filter((r) => r.status === 'PAID' && r.billingMonth.startsWith(year))
    const pending = receipts.filter((r) => r.status === 'PENDING')
    const renewals = (page.data?.leases ?? []).filter((l) => {
      if (l.status !== 'ACTIVE' || l.endDate === null) {
        return false
      }
      const days = daysUntil(l.endDate)
      return days >= 0 && days <= RENEWAL_WINDOW_DAYS
    })
    const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)
    return {
      revenue: sum(paidThisYear.map((r) => r.totalAmount)),
      paidCount: paidThisYear.length,
      pendingAmount: sum(pending.map((r) => r.totalAmount)),
      pendingCount: pending.length,
      renewalCount: renewals.length,
      renewalValue: sum(renewals.map((l) => l.monthlyRent)),
    }
  }, [page.data])

  const selected = page.data?.receipts.find((r) => r.id === selectedId) ?? null

  async function markPaid(id: number) {
    await payReceipt(id)
    page.reload()
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
          value={baht(summary.revenue)}
          icon={Bank}
          footer={
            <span className="inline-flex items-center gap-1 rounded-sm bg-moss-360/10 px-2 py-1 text-xs font-medium text-moss-360">
              {summary.paidCount} Paid Invoices This Year
            </span>
          }
        />
        <StatCard
          label="PENDING COLLECTIONS"
          value={baht(summary.pendingAmount)}
          icon={ClipboardText}
          footer={
            <span className="text-xs font-medium text-honey-600">
              {summary.pendingCount} Invoices Awaiting Payment
            </span>
          }
        />
        <StatCard
          label="UPCOMING RENEWALS (30D)"
          value={`${summary.renewalCount} Units`}
          icon={CalendarCheck}
          footer={
            <span className="text-xs font-medium text-ink-muted">
              Total Value: {bahtAmount(summary.renewalValue)}
            </span>
          }
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
            {(['All', 'Paid', 'Pending', 'Overdue'] as const).map((st) => (
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
          {page.error ? (
            <div className="p-6">
              <ErrorState message={page.error} />
            </div>
          ) : page.data === null ? (
            <div className="p-6">
              <LoadingState label="Loading payments..." />
            </div>
          ) : (
            <DataTable
              rows={filtered}
              rowKey={(p) => p.receipt.id}
              minWidth={820}
              headRowClass="border-b border-avatar-ring/30 bg-page-bg"
              headCellClass="px-6 py-4 text-xs font-medium tracking-[0.6px] text-body-muted uppercase"
              bodyClass="bg-white/40"
              rowClass="border-t border-avatar-ring/20"
              cellClass="px-6 py-5"
              empty="No invoices yet"
              emptyCellClass="px-6 py-8 text-center text-sm text-body-muted"
              columns={[
                {
                  key: 'tenant',
                  header: 'TENANT & UNIT',
                  cell: (p) => (
                    <div className="flex items-center gap-3">
                      <InitialsAvatar name={p.receipt.tenantName} size={40} />
                      <div>
                        <p className="text-sm font-semibold tracking-[0.7px] text-ink">{p.receipt.tenantName}</p>
                        <p className="text-[13px] text-body-muted">Unit {p.receipt.roomNumber}</p>
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
                      <p className="text-xs text-body-muted">{p.receipt.receiptNo}</p>
                    </>
                  ),
                },
                {
                  key: 'amount',
                  header: 'AMOUNT',
                  cell: (p) => (
                    <>
                      <p className="text-base text-ink">{baht(p.receipt.totalAmount)}</p>
                      <p className="text-xs text-body-muted">Total Bill</p>
                    </>
                  ),
                },
                {
                  key: 'cycle',
                  header: 'BILLING CYCLE',
                  cell: (p) => (
                    <>
                      <p className="text-base text-ink">{p.cycle}</p>
                      <p className="text-xs text-body-muted">{displayBillingMonth(p.receipt.billingMonth)}</p>
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
                        aria-label={`View receipt for ${p.receipt.tenantName}`}
                        className="hover:text-ink cursor-pointer"
                        onClick={() => setSelectedId(p.receipt.id)}
                      >
                        <ReceiptIcon size={18} />
                      </button>
                      {/*
                        SSK-16 ปิดไว้ก่อน เดิมกดแล้วเงียบ ๆ เหมือนส่งแล้ว ยังไม่มี endpoint ส่งอีเมล
                        และวิชาห้ามใช้บริการภายนอก เก็บปุ่มไว้ตามดีไซน์พร้อมบอกเหตุผลตอนชี้
                      */}
                      <button
                        type="button"
                        disabled
                        aria-label={`Send invoice for ${p.receipt.tenantName}`}
                        title="Sending receipts by email is not available yet"
                        className="cursor-not-allowed opacity-40"
                      >
                        <Send size={18} />
                      </button>
                    </div>
                  ),
                },
              ]}
            />
          )}
        </div>

        <div className="flex items-center justify-between border-t border-avatar-ring/30 bg-white/50 px-4 py-4">
          <p className="text-xs font-medium text-body-muted">
            Showing {filtered.length} of {rows.length} entries
          </p>
          <div className="flex items-center gap-1 text-xs font-medium text-body-muted">
            <span className="flex size-8 items-center justify-center rounded-sm bg-accent-soft font-medium text-brand">
              1
            </span>
          </div>
        </div>
      </div>

      {/* Popups */}
      {selected && (
        <GenerateReceiptModal
          receipt={toReceiptData(selected)}
          receiptId={selected.id}
          isOpen={true}
          onClose={() => setSelectedId(null)}
          onMarkPaid={() => markPaid(selected.id)}
          trigger={false}
        />
      )}

      {isCreateOpen && (
        <CreatePaymentDialog onClose={() => setIsCreateOpen(false)} onCreated={() => page.reload()} />
      )}
    </div>
  )
}
