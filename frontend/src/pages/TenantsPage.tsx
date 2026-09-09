import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { UserPlus } from '@phosphor-icons/react'
import { Search, Pencil, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'
import { createTenant, fetchTenants, ApiError } from '../api/client'
import type { Tenant } from '../api/types'
import { PageHeader } from '../components/PageHeader'
import { PrimaryButton } from '../components/Button'
import { InitialsAvatar } from '../components/InitialsAvatar'
import { LoadingState, ErrorState, EmptyState } from '../components/PageState'

/**
 * ตรงกับเฟรม "Tenant Directory" ใน Figma (node 1:648) — ต่อ API จริงอยู่แล้ว
 * (GET/POST /api/tenants) แต่คอลัมน์ LEASE PERIOD / ROOM TYPE / RENT / STATUS
 * ในดีไซน์ทั้งหมดมาจากตาราง lease ที่ backend ยังไม่มี (README หัวข้อ
 * "ที่ยังไม่มี" ข้อ 1) เลยโชว์ "-" ไปก่อน ส่วน filter สถานะ (Active/Pending/
 * Overdue) เป็น UI เฉย ๆ ยังกดไม่ได้ด้วยเหตุผลเดียวกัน — ช่องค้นหาใช้งานได้จริง
 * (กรองจากชื่อฝั่ง client เพราะ backend ยังไม่มี query param ค้นหา)
 *
 * ฟอร์มเพิ่มผู้เช่า: ดีไซน์ใช้ popup ("Add Tenant", node 378:1960) แต่รอบนี้
 * ยังไม่ทำ popup (ดูสรุปขอบเขตที่คุยกันไว้) เลยคงพาเนลฟอร์มแบบเดิมที่ใช้งานได้
 * จริงไว้ก่อน แค่เปลี่ยนปุ่มเปิดให้หน้าตาตรงปุ่ม "Add New Tenant" ในดีไซน์
 */
export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')

  function load() {
    fetchTenants()
      .then(setTenants)
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'เรียกรายชื่อผู้เช่าไม่สำเร็จ')
      })
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return tenants ?? []
    return (tenants ?? []).filter((t) => t.fullName.toLowerCase().includes(q))
  }, [tenants, search])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tenant Directory"
        description="Manage resident profiles, lease statuses, and rent payments for Sakura Soul."
        actions={
          <PrimaryButton onClick={() => setShowForm((v) => !v)}>
            <UserPlus size={14} weight="bold" />
            {showForm ? 'Close form' : 'Add New Tenant'}
          </PrimaryButton>
        }
      />

      {showForm && (
        <TenantForm
          onCreated={() => {
            setShowForm(false)
            load()
          }}
        />
      )}

      <div className="flex flex-col gap-3 rounded-xl border border-[rgba(238,217,196,0.5)] bg-white p-3.5 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative flex-1 sm:max-w-xs">
          <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-[#c9c6c2]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tenants by name or unit..."
            className="w-full rounded-md border-b border-transparent py-2 pr-3 pl-9 text-sm text-ink outline-none placeholder:text-[#c9c6c2]"
          />
        </label>
        <div className="flex flex-wrap gap-2.5">
          <span className="rounded-full bg-[#e4e2e1] px-3 py-1.5 text-xs font-medium text-ink">All Status</span>
          <span className="rounded-full border border-[rgba(212,194,195,0.5)] px-3 py-1.5 text-xs font-medium text-ink-muted">
            Active
          </span>
          <span className="rounded-full border border-[rgba(212,194,195,0.5)] px-3 py-1.5 text-xs font-medium text-ink-muted">
            Pending
          </span>
          <span className="rounded-full border border-[rgba(212,194,195,0.5)] px-3 py-1.5 text-xs font-medium text-ink-muted">
            Overdue
          </span>
        </div>
      </div>

      <div className="w-full overflow-hidden rounded-xl border border-[rgba(238,217,196,0.5)] bg-white shadow-sm">
        <div className="overflow-x-auto">
          {error && (
            <div className="p-4">
              <ErrorState message={error} />
            </div>
          )}
          {!error && !tenants && (
            <div className="p-4">
              <LoadingState label="กำลังโหลดรายชื่อผู้เช่า..." />
            </div>
          )}
          {!error && tenants && filtered.length === 0 && (
            <div className="p-4">
              <EmptyState
                title={tenants.length === 0 ? 'ยังไม่มีผู้เช่าในระบบ' : 'ไม่พบผู้เช่าที่ค้นหา'}
                hint={tenants.length === 0 ? 'กด Add New Tenant เพื่อเริ่มบันทึก' : undefined}
              />
            </div>
          )}
          {!error && filtered.length > 0 && (
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="border-b border-[rgba(238,217,196,0.3)] bg-[rgba(251,249,248,0.5)]">
                  {['TENANT', 'PHONE', 'LEASE PERIOD', 'ROOM TYPE', 'RENT', 'STATUS', 'ACTION'].map((col) => (
                    <th
                      key={col}
                      className="px-5 py-3.5 text-[10px] font-medium tracking-[0.5px] text-ink-muted uppercase"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((tenant) => (
                  <tr key={tenant.id} className="border-t border-[rgba(238,217,196,0.3)]">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2.5">
                        <InitialsAvatar name={tenant.fullName} />
                        <div>
                          <p className="text-sm font-medium text-ink">{tenant.fullName}</p>
                          <p className="text-[10px] text-ink-muted">{tenant.nationalId ?? '-'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-ink-muted">{tenant.phone ?? '-'}</td>
                    <td className="px-5 py-4 text-sm text-ink-muted">-</td>
                    <td className="px-5 py-4 text-sm text-table-label">-</td>
                    <td className="px-5 py-4 text-right text-sm font-semibold text-[#667085]">-</td>
                    <td className="px-5 py-4">
                      <span className="text-sm text-ink-muted">-</span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-center gap-3">
                        <button type="button" className="text-ink-muted hover:text-ink" aria-label="แก้ไข">
                          <Pencil size={15} />
                        </button>
                        <button type="button" className="text-ink-muted hover:text-[#93000a]" aria-label="ลบ">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {!error && tenants && tenants.length > 0 && (
          <div className="flex items-center justify-between border-t border-[rgba(238,217,196,0.3)] px-4 py-3.5">
            <p className="text-[10px] text-ink-muted">
              Showing {filtered.length} of {tenants.length} tenants
            </p>
            <div className="flex items-center gap-2 text-[10px] font-semibold text-[#8c9096]">
              <ChevronLeft size={14} />
              Previous
              <span className="ml-2 flex size-6 items-center justify-center rounded border border-[#d9dfe8] text-black">
                1
              </span>
              Next
              <ChevronRight size={14} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function TenantForm({ onCreated }: { onCreated: () => void }) {
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [nationalId, setNationalId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setFormError(null)
    try {
      await createTenant({
        fullName,
        phone: phone || undefined,
        nationalId: nationalId || undefined,
      })
      setFullName('')
      setPhone('')
      setNationalId('')
      onCreated()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'เพิ่มผู้เช่าไม่สำเร็จ')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-xl border border-[rgba(238,217,196,0.5)] bg-white p-4 sm:flex-row sm:flex-wrap sm:items-end"
    >
      <Field label="ชื่อ-นามสกุล *" required value={fullName} onChange={setFullName} />
      <Field label="เบอร์โทร" value={phone} onChange={setPhone} />
      <Field label="เลขบัตรประชาชน" value={nationalId} onChange={setNationalId} />

      <button
        type="submit"
        disabled={submitting || fullName.trim() === ''}
        className="rounded-lg bg-accent-soft px-4 py-2 text-sm font-medium text-[#795356] hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? 'กำลังบันทึก...' : 'บันทึก'}
      </button>

      {formError && <p className="w-full text-sm text-[#93000a]">{formError}</p>}
    </form>
  )
}

function Field({
  label,
  value,
  onChange,
  required,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  required?: boolean
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-ink-muted">{label}</span>
      <input
        type="text"
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-card-border px-3 py-2 text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand"
      />
    </label>
  )
}
