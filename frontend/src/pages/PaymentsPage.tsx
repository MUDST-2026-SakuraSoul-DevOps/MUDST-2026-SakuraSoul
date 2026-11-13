import { useMemo, useRef, useState } from 'react'
import { Bank, ClipboardText, CalendarCheck, Plus } from '@phosphor-icons/react'
import {
  Search,
  Receipt as ReceiptIcon,
  Clock,
  Send,
  Check,
  Pencil,
  Printer,
  Settings2,
  Banknote,
  FileText,
} from 'lucide-react'
import {
  errorMessage,
  fetchBillingSchedule,
  fetchDebts,
  fetchLeases,
  fetchReceipts,
  fetchRooms,
  payReceipt,
  recordReceiptPayment,
  uploadAttachment,
  voidPayment,
} from '../api/client'
import type { BillingSchedule, Lease, Receipt, RoomSummary, SendReceiptsResult } from '../api/types'
import { PageHeader } from '../components/PageHeader'
import { PrimaryButton } from '../components/Button'
import { StatCard } from '../components/StatCard'
import { InitialsAvatar } from '../components/InitialsAvatar'
import { DataTable } from '../components/DataTable'
import { ErrorState, LoadingState } from '../components/PageState'
import { GenerateReceiptModal } from '../components/GenerateReceiptModal'
import { CreatePaymentDialog } from '../dialogs/CreatePaymentDialog'
import { EditPaymentDialog } from '../dialogs/EditPaymentDialog'
import { ScheduledBillingDialog } from '../dialogs/ScheduledBillingDialog'
import { BulkSendInvoicesDialog, type BulkSendItem } from '../dialogs/BulkSendInvoicesDialog'
import { BillingSettingsDialog } from '../dialogs/BillingSettingsDialog'
import { RecordPaymentDialog } from '../dialogs/RecordPaymentDialog'
import { PaymentSlipDialog } from '../dialogs/PaymentSlipDialog'
import { BulkPrintReceiptsDialog } from '../dialogs/BulkPrintReceiptsDialog'
import { PaymentHistoryTab } from '../components/PaymentHistoryTab'
import { SummaryReportsTab } from '../components/SummaryReportsTab'
import { displayBillingMonth, toReceiptData, type PaymentStatus } from '../domain/billing'
import {
  type PaymentRecord,
  type InvoiceBalances,
} from '../domain/paymentPhase2'
import { canEditReceipt, canRecordPayment, invoiceBalances, newestPaymentId, paymentHistory } from '../domain/paymentLedger'
import { roomTypeLabel } from '../domain/room'
import {
  baht,
  bahtAmount,
  dateInBangkok,
  daysUntil,
  displayDate,
  displayDateTime,
  ordinalSuffix,
  todayInBangkok,
} from '../format'
import { useLoader } from '../hooks/useLoader'

/**
 * หน้า Payment Management ตาม Figma (SSK-16 / SSK-106 / SSK-130)
 * พร้อมฟีเจอร์ Phase 2 (SSK-163, SSK-164, SSK-168, SSK-169, SSK-170):
 * - Invoices, Payment history & Summary reports subviews
 * - PromptPay QR & bank details
 * - Multi-select invoices to bulk print receipts
 * - Partial payments, debt calculation, slip proof
 * - Carryover unpaid balance & configurable late interest
 */

interface PaymentRow {
  receipt: Receipt
  roomType: string
  cycle: string
  status: PaymentStatus
  balances: InvoiceBalances
}

const CYCLE_LABEL: Record<Lease['billingCycle'], string> = {
  MONTHLY: 'Monthly',
  YEARLY: 'Yearly',
}

const RENEWAL_WINDOW_DAYS = 30

const STATUS_PILL: Record<PaymentStatus, string> = {
  Paid: 'bg-moss-50 text-moss-545',
  'Partially paid': 'border border-amber-300 bg-amber-50 text-amber-700',
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

function toRows(
  receipts: Receipt[],
  rooms: RoomSummary[],
  leases: Lease[],
): PaymentRow[] {
  return receipts.map((receipt) => {
    const room = rooms.find((r) => r.roomNumber === receipt.roomNumber)
    const lease = leases.find((l) => l.id === receipt.leaseId)
    const balances = invoiceBalances(receipt)
    return {
      receipt,
      roomType: roomTypeLabel(room?.roomType),
      cycle: lease ? CYCLE_LABEL[lease.billingCycle] : '-',
      status: balances.status,
      balances,
    }
  })
}

function scheduleSummary(schedule: BillingSchedule): string {
  return `Every ${schedule.dayOfMonth}${ordinalSuffix(schedule.dayOfMonth)} at ${schedule.sendTime}`
}

function getInitialTab(): 'invoices' | 'history' | 'reports' {
  if (typeof window === 'undefined') return 'invoices'
  const params = new URLSearchParams(window.location.search)
  const view = params.get('view')
  if (view === 'history') return 'history'
  if (view === 'reports') return 'reports'
  return 'invoices'
}

export default function PaymentsPage() {
  const [activeTab, setActiveTab] = useState<'invoices' | 'history' | 'reports'>(getInitialTab)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'All' | PaymentStatus>(() =>
    new URLSearchParams(window.location.search).get('status') === 'Overdue' ? 'Overdue' : 'All',
  )
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingReceipt, setEditingReceipt] = useState<Receipt | null>(null)
  const [isScheduleOpen, setIsScheduleOpen] = useState(false)
  const [isBulkSendOpen, setIsBulkSendOpen] = useState(false)
  const [isBillingSettingsOpen, setIsBillingSettingsOpen] = useState(false)
  const [isBulkPrintOpen, setIsBulkPrintOpen] = useState(false)
  const [recordPaymentTarget, setRecordPaymentTarget] = useState<PaymentRow | null>(null)
  // การชำระที่เปิดป็อปอัปสลิปอยู่ retry มีเมื่อหน้าเปิดให้เองเพราะอัปโหลดตอนบันทึกการชำระไม่ผ่าน
  const [slipTarget, setSlipTarget] = useState<{ record: PaymentRecord; retry?: { notice: string; file: File } } | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const page = useLoader(async () => {
    const [receipts, rooms, leases, debts] = await Promise.all([
      fetchReceipts(),
      fetchRooms(),
      fetchLeases(),
      fetchDebts(),
    ])
    return { receipts, rooms, leases, debts }
  }, 'Could not load the payments')

  const schedule = useLoader(fetchBillingSchedule, 'Could not load the billing schedule')

  const rows = useMemo(
    () =>
      page.data
        ? toRows(page.data.receipts, page.data.rooms, page.data.leases)
        : [],
    [page.data],
  )

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return rows.filter(({ receipt, status }) => {
      const matchSearch =
        query === '' ||
        receipt.tenantName.toLowerCase().includes(query) ||
        receipt.roomNumber.toLowerCase().includes(query)
      const matchStatus = statusFilter === 'All' || status === statusFilter
      return matchSearch && matchStatus
    })
  }, [rows, search, statusFilter])

  const allFilteredSelected = filtered.length > 0 && filtered.every((p) => selectedIds.has(p.receipt.id))
  const someFilteredSelected = filtered.some((p) => selectedIds.has(p.receipt.id)) && !allFilteredSelected

  function handleToggleSelect(id: number) {
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
        filtered.forEach((p) => next.delete(p.receipt.id))
        return next
      })
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        filtered.forEach((p) => next.add(p.receipt.id))
        return next
      })
    }
  }

  const visibleSelected = useMemo(() => filtered.filter((p) => selectedIds.has(p.receipt.id)), [filtered, selectedIds])
  const bulkTargets = useMemo(
    () => (visibleSelected.length > 0 ? visibleSelected : filtered.filter((p) => p.status !== 'Paid')),
    [filtered, visibleSelected],
  )
  const bulkLabel = visibleSelected.length > 0 ? `Send Invoices (${visibleSelected.length})` : 'Send All Invoices'

  const bulkItems = useMemo<BulkSendItem[]>(
    () =>
      bulkTargets.map(({ receipt, cycle, status }) => ({
        receiptId: receipt.id,
        tenant: receipt.tenantName,
        email: receipt.tenantEmail,
        unit: `Unit ${receipt.roomNumber}`,
        amount: baht(receipt.totalAmount),
        amountValue: receipt.totalAmount,
        cycle,
        cycleDate: displayBillingMonth(receipt.billingMonth),
        status,
        sentCount: receipt.sentCount,
      })),
    [bulkTargets],
  )

  // Server payment records are the only source for printable receipts.
  const printableReceipts = useMemo(() => paymentHistory(filtered.filter(row => selectedIds.has(row.receipt.id)).map(row => row.receipt)).filter(record => record.status !== 'Voided'), [filtered, selectedIds])

  const allHistoryRecords = useMemo(() => paymentHistory(page.data?.receipts ?? []), [page.data?.receipts])

  const summary = useMemo(() => {
    const debts = page.data?.debts ?? []
    const year = todayInBangkok().slice(0, 4)

    let totalRevenue = 0
    let paymentCount = 0

    for (const record of allHistoryRecords) {
      if (record.status !== 'Voided' && record.date.startsWith(year)) {
        totalRevenue += record.amount
        paymentCount++
      }
    }

    const pendingAmount = debts.reduce((sum, d) => sum + d.balanceDue, 0)
    const pendingCount = debts.length

    const renewals = (page.data?.leases ?? []).filter((l) => {
      if (l.status !== 'ACTIVE' || l.endDate === null) {
        return false
      }
      const days = daysUntil(l.endDate)
      return days >= 0 && days <= RENEWAL_WINDOW_DAYS
    })
    const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)
    return {
      revenue: totalRevenue,
      paidCount: (page.data?.receipts ?? []).filter(receipt => receipt.status === 'PAID').length,
      paymentCount,
      pendingAmount,
      pendingCount,
      renewalCount: renewals.length,
      renewalValue: sum(renewals.map((l) => l.monthlyRent)),
    }
  }, [page.data, allHistoryRecords])

  // นับเวลาใหม่ทุกครั้งที่มีข้อความใหม่ ไม่งั้นตัวจับเวลาของข้อความก่อนหน้าจะลบข้อความล่าสุดเร็วกว่ากำหนด
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function showToast(message: string) {
    setToastMessage(message)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => {
      setToastMessage(null)
    }, 4000)
  }

  function handleTabChange(tab: 'invoices' | 'history' | 'reports') {
    setActiveTab(tab)
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      const url = new URL(window.location.href)
      if (tab === 'invoices') {
        url.searchParams.delete('view')
      } else {
        url.searchParams.set('view', tab)
      }
      window.history.replaceState({}, '', url.toString())
    }
  }

  function handleBulkSent(result: SendReceiptsResult) {
    setIsBulkSendOpen(false)
    setSelectedIds(new Set())
    page.reload()
    const total = result.sent.length + result.skipped.length
    const skipped = result.skipped.length
    showToast(
      `Sent ${result.sent.length} of ${total} ${total === 1 ? 'invoice' : 'invoices'} by email` +
        (skipped > 0 ? ` (${skipped} skipped)` : ''),
    )
  }

  function handleScheduleSaved(saved: BillingSchedule) {
    setIsScheduleOpen(false)
    schedule.reload()
    showToast(
      saved.enabled
        ? `Auto-billing saved: ${scheduleSummary(saved)}` +
            (saved.nextRunAt ? ` · next run ${displayDateTime(saved.nextRunAt)}` : '')
        : 'Auto-billing schedule has been paused.',
    )
  }

  function handleBillingSettingsSaved() {
    setIsBillingSettingsOpen(false)
    showToast('Billing settings updated successfully')
    page.reload()
  }

  /**
   * บันทึกการชำระ แล้วแนบสลิปถ้าเลือกไว้ (SSK-163) ตามลำดับในสัญญา: บันทึกก่อน แล้วอัปโหลดด้วย id ของการชำระนั้น
   * สองขั้นนี้ไม่ใช่ธุรกรรมเดียว ถ้าอัปโหลดไม่ผ่าน การชำระยังถูกบันทึกแล้ว ป็อปอัปบันทึกจึงปิดตามปกติ
   * แล้วเปิดป็อปอัปสลิปของการชำระก้อนนั้นให้แนบใหม่ (ปิดไปแล้วก็แนบจากแท็บประวัติได้)
   * แทนที่จะให้ผู้ใช้กดบันทึกซ้ำจนได้การชำระสองก้อน
   */
  async function handleRecordPayment(payment: Omit<PaymentRecord, 'id'>, slip?: File) {
    const methodMap: Record<string, 'CASH' | 'TRANSFER' | 'QR' | 'OTHER'> = {
      'Cash': 'CASH',
      'Bank transfer': 'TRANSFER',
      'PromptPay': 'QR',
      'Other': 'OTHER',
    }
    const apiMethod = payment.method && methodMap[payment.method] ? methodMap[payment.method] : 'TRANSFER'

    let updatedReceipt: Receipt
    try {
      updatedReceipt = await recordReceiptPayment(payment.receiptId, {
        amount: payment.amount,
        paidOn: payment.date || undefined,
        method: apiMethod,
        reference: undefined,
        note: payment.note ? payment.note.slice(0, 500) : undefined,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not record payment'
      showToast(`Error: ${msg}`)
      throw err
    }

    const remaining = updatedReceipt?.balanceDue != null
      ? updatedReceipt.balanceDue
      : Math.max(0, (recordPaymentTarget?.balances.outstanding ?? 0) - payment.amount)
    const recorded = `Payment of ${bahtAmount(payment.amount)} recorded for Unit ${payment.roomNumber}`
    if (!slip) {
      showToast(`${recorded}. Remaining: ${bahtAmount(remaining)}`)
    } else {
      const paymentId = newestPaymentId(updatedReceipt)
      let problem: string | null = null
      if (paymentId === null) {
        problem = 'the new payment was not found on the receipt'
      } else {
        try {
          await uploadAttachment(slip, 'PAYMENT', paymentId)
        } catch (err) {
          problem = errorMessage(err, 'Could not upload the slip')
        }
      }
      if (problem === null) {
        showToast(`${recorded} with the slip attached. Remaining: ${bahtAmount(remaining)}`)
      } else {
        showToast(`${recorded}, but the slip was not uploaded: ${problem}. Attach it from Payment history.`)
        // ป็อปอัปสลิปบังข้อความด้านบน จึงบอกเหตุผลซ้ำในป็อปอัปเอง พร้อมไฟล์เดิมให้กดลองใหม่ได้เลย
        if (paymentId !== null) {
          setSlipTarget({
            record: {
              id: `PAY-${paymentId}`,
              paymentId,
              receiptId: payment.receiptId,
              receiptNo: payment.receiptNo,
              roomNumber: payment.roomNumber,
              tenantName: payment.tenantName,
              amount: payment.amount,
              date: payment.date,
              status: 'Paid',
            },
            retry: {
              notice: `The payment was recorded, but the slip was not uploaded: ${problem}. Press Attach slip to try again, or attach it later from Payment history.`,
              file: slip,
            },
          })
        }
      }
    }
    page.reload()
  }

  async function handleVoidPayment(paymentId: number) {
    try {
      await voidPayment(paymentId)
      showToast('Payment voided successfully')
      page.reload()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not void payment')
      page.reload()
    }
  }

  const selectedRow = rows.find((r) => r.receipt.id === selectedId) ?? null
  const selected = selectedRow?.receipt ?? null

  async function markPaid(id: number) {
    await payReceipt(id)
    page.reload()
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center justify-between text-xs text-body-muted gap-2">
        <div className="flex items-center gap-1.5 font-medium">
          <span>Sakura Soul</span>
          <span>›</span>
          <span>Payments</span>
          <span>›</span>
          <span className="text-ink font-semibold">
            {activeTab === 'invoices' ? 'Invoices' : activeTab === 'history' ? 'Payment history' : 'Summary reports'}
          </span>
        </div>
      </div>

      <PageHeader
        title="Payment Management"
        description="Keep track of invoices, partial payments, and outstanding balances."
        actions={
          <a
            href="/documents?type=Receipt"
            className="flex items-center gap-2 rounded-xl border border-avatar-ring/60 bg-white px-4 py-2.5 text-xs font-semibold text-brand shadow-xs hover:bg-page-bg transition cursor-pointer"
          >
            <FileText size={17} aria-hidden="true" />
            View all documents
          </a>
        }
      />

      {/* Subnavigation Tabs */}
      <div className="section-tabs">
        <button
          type="button"
          onClick={() => handleTabChange('invoices')}
          aria-label="Invoices tab"
          aria-pressed={activeTab === 'invoices'}
          className="section-tab"
        >
          Invoices
        </button>
        <button
          type="button"
          onClick={() => handleTabChange('history')}
          aria-label="Payment history tab"
          aria-pressed={activeTab === 'history'}
          className="section-tab"
        >
          Payment history
        </button>
        <button
          type="button"
          onClick={() => handleTabChange('reports')}
          aria-label="Summary reports tab"
          aria-pressed={activeTab === 'reports'}
          className="section-tab"
        >
          Summary reports
        </button>
      </div>

      {toastMessage && (
        <div className="flex items-center gap-2.5 rounded-xl border border-moss-120 bg-moss-50 p-3.5 text-xs font-medium text-moss-545 shadow-sm animate-fade-in">
          <Check className="ui-icon size-icon-inline text-moss-545" aria-hidden="true" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Tab Content: Payment History */}
      {activeTab === 'history' && (
        <PaymentHistoryTab
          records={allHistoryRecords}
          onOpenSettings={() => setIsBillingSettingsOpen(true)}
          onOpenNewDraft={() => setIsCreateOpen(true)}
          onVoidPayment={handleVoidPayment}
          onViewSlip={(record) => setSlipTarget({ record })}
          totalOutstanding={summary.pendingAmount}
          paidInFullRatio={`${summary.paidCount} / ${rows.length}`}
          invoicesAwaitingCount={summary.pendingCount}
        />
      )}

      {/* Tab Content: Summary Reports */}
      {activeTab === 'reports' && <SummaryReportsTab onNotify={showToast} />}

      {/* Tab Content: Main Invoices Table */}
      {activeTab === 'invoices' && (
        <>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <StatCard
              label="TOTAL REVENUE (YTD)"
              value={baht(summary.revenue)}
              icon={Bank}
              footer={
                <span className="inline-flex items-center gap-1 rounded-sm bg-moss-360/10 px-2 py-1 text-xs font-medium text-moss-360">
                  {summary.paymentCount} Payments Received This Year
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
                  Lease contracts expiring in 30 days · Total Value: {bahtAmount(summary.renewalValue)}
                </span>
              }
            />
          </div>

          {/* Top Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {schedule.error ? (
              <div className="inline-flex items-center gap-2 rounded-full border border-sand-90 bg-sand-50 px-3.5 py-1.5 text-xs text-sand-530">
                <span className="size-2 rounded-full bg-sand-368" />
                <span>Schedule unavailable</span>
              </div>
            ) : schedule.data === null ? (
              <div className="inline-flex items-center gap-2 rounded-full border border-sand-90 bg-sand-50 px-3.5 py-1.5 text-xs text-sand-530">
                <span className="size-2 rounded-full bg-sand-368" />
                <span>Checking schedule...</span>
              </div>
            ) : schedule.data.enabled ? (
              <div className="inline-flex items-center gap-2 rounded-full border border-moss-120 bg-moss-50 px-3.5 py-1.5 text-xs text-moss-545">
                <span className="size-2 rounded-full bg-moss-545" />
                <span>
                  Auto-Billing: <strong>{scheduleSummary(schedule.data)}</strong>
                  {schedule.data.nextRunAt && ` · Next run ${displayDateTime(schedule.data.nextRunAt)}`}
                </span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 rounded-full border border-sand-90 bg-sand-50 px-3.5 py-1.5 text-xs text-sand-530">
                <span className="size-2 rounded-full bg-sand-368" />
                <span>Auto-Billing Paused</span>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Billing Settings (SSK-164 + SSK-168) */}
              <button
                type="button"
                onClick={() => setIsBillingSettingsOpen(true)}
                aria-label="Billing Settings"
                className="flex items-center gap-2 rounded-xl border border-honey-140 bg-white px-4 py-2.5 text-xs font-semibold text-brand shadow-sm hover:bg-page-bg transition cursor-pointer"
              >
                <Settings2 aria-hidden="true" className="ui-icon size-icon-control" />
                Billing Settings
              </button>

              {/* Schedule Auto-Billing */}
              <button
                type="button"
                onClick={() => setIsScheduleOpen(true)}
                aria-label="Schedule Auto-Billing"
                disabled={schedule.data === null}
                title={schedule.error ? 'The billing schedule could not be loaded' : undefined}
                className="flex items-center gap-2 rounded-xl border border-honey-140 bg-white px-4 py-2.5 text-xs font-semibold text-brand shadow-sm hover:bg-page-bg transition cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Clock aria-hidden="true" className="ui-icon size-icon-control" />
                Schedule Auto-Billing
              </button>

              {/* Send Invoices (Bulk) */}
              <button
                type="button"
                onClick={() => setIsBulkSendOpen(true)}
                aria-label={bulkLabel}
                disabled={bulkTargets.length === 0}
                title={bulkTargets.length === 0 ? 'No unpaid invoices to send' : undefined}
                className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-brand/90 transition cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send aria-hidden="true" className="ui-icon size-icon-control" />
                {bulkLabel}
              </button>

              {/* New Invoice */}
              <PrimaryButton onClick={() => setIsCreateOpen(true)} aria-label="New Invoice">
                <Plus weight="bold" aria-hidden="true" className="ui-icon size-icon-control" />
                New Invoice
              </PrimaryButton>
            </div>
          </div>

          <div className="w-full overflow-hidden rounded-lg border border-honey-140/50 bg-white/70 shadow-[0px_10px_30px_-10px_rgba(122,84,87,0.08)] backdrop-blur-[6px]">
            <div className="flex flex-col gap-3 border-b border-avatar-ring/30 bg-white/50 p-6 sm:flex-row sm:items-center sm:justify-between">
              <label className="relative w-full sm:max-w-sm">
                <Search className="ui-icon size-icon-inline absolute top-1/2 left-3 -translate-y-1/2 text-body-muted/70" aria-hidden="true" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by Tenant or Unit..."
                  className="w-full rounded-md border border-avatar-ring/50 bg-sidebar py-2.5 pr-4 pl-10 text-sm text-ink outline-none placeholder:text-body-muted/70 focus:border-brand"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                {(['All', 'Paid', 'Partially paid', 'Pending', 'Overdue'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`rounded-xl border border-avatar-ring/50 px-4 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                      statusFilter === st ? 'bg-accent-soft text-brand font-semibold' : 'bg-white text-ink hover:bg-black/5'
                    }`}
                  >
                    {st === 'All' ? 'All Status' : st === 'Partially paid' ? 'Partially Paid' : st}
                  </button>
                ))}
              </div>
            </div>

            {/* SSK-169: Selection Action Bar */}
            {selectedIds.size > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-avatar-ring/30 bg-sand-50/70 px-6 py-3 text-xs font-medium">
                <span className="text-body-muted">
                  {selectedIds.size} invoices selected · {printableReceipts.length} payment receipts
                </span>
                <button
                  type="button"
                  disabled={printableReceipts.length === 0}
                  onClick={() => setIsBulkPrintOpen(true)}
                  aria-label="Bulk print receipts"
                  title={printableReceipts.length === 0 ? 'Only payments actually received become receipts' : undefined}
                  className="flex items-center gap-1.5 rounded-lg border border-honey-140 bg-white px-3 py-1.5 text-xs font-semibold text-brand shadow-xs hover:bg-page-bg transition cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Printer size={15} aria-hidden="true" />
                  Bulk print receipts
                </button>
              </div>
            )}

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
                  minWidth={1032}
                  headRowClass="border-b border-avatar-ring/30 bg-page-bg"
                  headCellClass="px-6 py-4 text-xs font-medium tracking-[0.6px] text-body-muted uppercase"
                  bodyClass="bg-white/40"
                  rowClass="border-t border-avatar-ring/20"
                  cellClass="px-6 py-5"
                  empty="No invoices yet"
                  emptyCellClass="px-6 py-8 text-center text-sm text-body-muted"
                  columns={[
                    {
                      key: 'select',
                      header: (
                        <input
                          type="checkbox"
                          aria-label="Select all invoices"
                          checked={allFilteredSelected}
                          ref={(el) => {
                            if (el) el.indeterminate = someFilteredSelected
                          }}
                          onChange={handleToggleSelectAll}
                          className="size-4 rounded border-honey-140 accent-brand cursor-pointer"
                        />
                      ),
                      headerClass: 'w-12 px-4 text-center',
                      cellClass: 'w-12 px-4 text-center',
                      cell: (p) => (
                        <input
                          type="checkbox"
                          aria-label={`Select invoice for ${p.receipt.tenantName}`}
                          checked={selectedIds.has(p.receipt.id)}
                          onChange={() => handleToggleSelect(p.receipt.id)}
                          className="size-4 rounded border-honey-140 accent-brand cursor-pointer"
                        />
                      ),
                    },
                    {
                      key: 'tenant',
                      header: 'TENANT & UNIT',
                      cell: (p) => (
                        <div className="flex items-center gap-3">
                          <InitialsAvatar name={p.receipt.tenantName} size={40} />
                          <div>
                            <p className="text-sm font-semibold tracking-[0.7px] text-ink">{p.receipt.tenantName}</p>
                            <p className="text-sm text-body-muted">Unit {p.receipt.roomNumber}</p>
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
                          {p.balances.totalPaid > 0 && p.balances.outstanding > 0 ? (
                            <>
                              <p className="whitespace-nowrap text-base font-semibold text-amber-800">
                                {baht(p.balances.outstanding)}
                              </p>
                              <p className="text-xs font-medium text-amber-700">
                                Paid {baht(p.balances.totalPaid)} · Bal {baht(p.balances.outstanding)}
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="whitespace-nowrap text-base text-ink">{baht(p.balances.totalDue)}</p>
                              {p.balances.carriedBalance > 0 ? (
                                <p className="text-xs text-body-muted">
                                  Incl. carry {baht(p.balances.carriedBalance)}
                                </p>
                              ) : (
                                <p className="text-xs text-body-muted">Total Bill</p>
                              )}
                            </>
                          )}
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
                      cell: (p) => (
                        <div className="flex flex-col items-start gap-1">
                          <PaymentStatusPill status={p.status} />
                          {p.receipt.sentCount > 0 && p.receipt.lastSentAt && (
                            <span className="text-xs text-body-muted">
                              Emailed ×{p.receipt.sentCount} · {displayDate(dateInBangkok(p.receipt.lastSentAt))}
                            </span>
                          )}
                        </div>
                      ),
                    },
                    {
                      key: 'actions',
                      header: 'ACTIONS',
                      headerClass: 'text-right pr-6',
                      cell: (p) => (
                        <div className="flex items-center justify-end gap-2 text-ink-muted">
                          {/* SSK-163: Record payment button for non-paid invoices */}
                          {p.receipt.carriedToReceiptNo ? (
                            <span className="text-xs text-body-muted font-medium">
                              Carried to {p.receipt.carriedToReceiptNo}
                            </span>
                          ) : canRecordPayment(p.receipt) ? (
                            <button
                              type="button"
                              aria-label={`Record payment for unit ${p.receipt.roomNumber}`}
                              title={`Record payment for unit ${p.receipt.roomNumber}`}
                              className="flex size-9 items-center justify-center rounded-lg border border-honey-140/80 bg-accent-soft text-brand hover:bg-accent-soft/80 hover:shadow-xs transition cursor-pointer"
                              onClick={() => setRecordPaymentTarget(p)}
                            >
                              <Banknote size={18} strokeWidth={2} aria-hidden="true" />
                            </button>
                          ) : null}
                          {canEditReceipt(p.receipt) && (
                            <button
                              type="button"
                              aria-label={`Edit invoice for ${p.receipt.tenantName}`}
                              title={`Edit invoice for ${p.receipt.tenantName}`}
                              className="flex size-9 items-center justify-center rounded-lg border border-avatar-ring/40 bg-white text-ink-muted hover:text-ink hover:bg-black/5 hover:border-avatar-ring transition cursor-pointer shadow-xs"
                              onClick={() => setEditingReceipt(p.receipt)}
                            >
                              <Pencil size={18} strokeWidth={2} aria-hidden="true" />
                            </button>
                          )}
                          <button
                            type="button"
                            aria-label={`View receipt for ${p.receipt.tenantName}`}
                            title={`View receipt for ${p.receipt.tenantName}`}
                            className="flex size-9 items-center justify-center rounded-lg border border-avatar-ring/40 bg-white text-ink-muted hover:text-brand hover:bg-accent-soft hover:border-avatar-ring transition cursor-pointer shadow-xs"
                            onClick={() => setSelectedId(p.receipt.id)}
                          >
                            <ReceiptIcon size={18} strokeWidth={2} aria-hidden="true" />
                          </button>
                        </div>
                      ),
                    },
                  ]}
                />
              )}
            </div>

            <div className="flex items-center justify-between border-t border-avatar-ring/30 bg-white/50 px-6 py-4">
              <p className="text-xs font-medium text-body-muted">
                {selectedIds.size > 0
                  ? `Selected ${selectedIds.size} of ${filtered.length} entries`
                  : `Showing ${filtered.length} of ${rows.length} entries`}
              </p>
              <div className="flex items-center gap-1 text-xs font-medium text-body-muted">
                <span className="flex size-8 items-center justify-center rounded-sm bg-accent-soft font-medium text-brand">
                  1
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Popups */}
      {selected && (
        <GenerateReceiptModal
          receipt={toReceiptData(selected)}
          receiptId={selected.id}
          isOpen={true}
          onClose={() => setSelectedId(null)}
          onMarkPaid={canRecordPayment(selected) ? () => markPaid(selected.id) : undefined}
          onOpenRecordPayment={
            selectedRow && canRecordPayment(selectedRow.receipt)
              ? () => {
                  setSelectedId(null)
                  setRecordPaymentTarget(selectedRow)
                }
              : undefined
          }
          balances={selectedRow?.balances}
          trigger={false}
        />
      )}

      {isCreateOpen && (
        <CreatePaymentDialog onClose={() => setIsCreateOpen(false)} onCreated={() => page.reload()} />
      )}

      {editingReceipt && (
        <EditPaymentDialog
          receipt={editingReceipt}
          onClose={() => setEditingReceipt(null)}
          onUpdated={(updated) => {
            setEditingReceipt(null)
            page.reload()
            showToast(`Invoice ${updated.receiptNo} updated successfully`)
          }}
        />
      )}

      {isScheduleOpen && schedule.data && (
        <ScheduledBillingDialog
          schedule={schedule.data}
          onClose={() => setIsScheduleOpen(false)}
          onSaved={handleScheduleSaved}
        />
      )}

      {isBulkSendOpen && (
        <BulkSendInvoicesDialog
          items={bulkItems}
          onClose={() => setIsBulkSendOpen(false)}
          onSent={handleBulkSent}
        />
      )}

      {/* SSK-164 & SSK-168: Billing Settings Dialog */}
      {isBillingSettingsOpen && (
        <BillingSettingsDialog
          isOpen={true}
          onClose={() => setIsBillingSettingsOpen(false)}
          onSaved={handleBillingSettingsSaved}
        />
      )}

      {/* SSK-163: Record Payment Dialog */}
      {recordPaymentTarget && (
        <RecordPaymentDialog
          isOpen={true}
          receipt={recordPaymentTarget.receipt}
          outstanding={recordPaymentTarget.balances.outstanding}
          onClose={() => setRecordPaymentTarget(null)}
          onRecord={handleRecordPayment}
        />
      )}

      {/* SSK-163: สลิปของการชำระ ดูหรือแนบภายหลังจากแท็บประวัติ */}
      {slipTarget && slipTarget.record.paymentId !== undefined && (
        <PaymentSlipDialog
          payment={{
            paymentId: slipTarget.record.paymentId,
            label: slipTarget.record.id,
            roomNumber: slipTarget.record.roomNumber,
            receiptNo: slipTarget.record.receiptNo,
            voided: slipTarget.record.status === 'Voided',
          }}
          notice={slipTarget.retry?.notice}
          initialFile={slipTarget.retry?.file}
          onClose={() => setSlipTarget(null)}
        />
      )}

      {/* SSK-169: Bulk Print Receipts Dialog */}
      {isBulkPrintOpen && (
        <BulkPrintReceiptsDialog
          isOpen={true}
          receipts={printableReceipts}
          onClose={() => setIsBulkPrintOpen(false)}
        />
      )}
    </div>
  )
}
