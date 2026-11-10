import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { searchTenants } from '../api/client'
import type { Tenant, TenantMatch } from '../api/types'
import { useLoader } from '../hooks/useLoader'

/**
 * ช่องค้นหาผู้เช่าในฟอร์มที่ต้องเลือกผู้เช่า (SSK-174) ใช้ GET /tenants/search ชุดเดียวกับหน้า Tenants
 * พิมพ์ชื่อผิดเล็กน้อยก็เจอ ("krant" เจอ "Kant") ผลแบบคล้ายติดป้าย Similar name และค้นจากเบอร์โทรได้ด้วย
 * กดชื่อในรายการแล้วเลือกผู้เช่าคนนั้นให้ ช่องค้นหาว่างกลับเหมือนเดิม
 */
export function TenantSearchField({
  tenants,
  onPick,
}: {
  /** ผู้เช่าที่เลือกได้ในฟอร์มนี้ ผลค้นหาที่ไม่อยู่ในชุดนี้จะไม่ขึ้น */
  tenants: Tenant[]
  onPick: (tenantId: number) => void
}) {
  const [query, setQuery] = useState('')
  // หยุดพิมพ์ 250 ms ค่อยถาม server เหมือนช่องค้นหาหน้า Tenants
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250)
    return () => clearTimeout(timer)
  }, [query])
  // ผลค้นติดคำค้นที่ใช้ไว้ด้วย useLoader คงผลเก่าไว้ระหว่างโหลดคำใหม่ จะได้ไม่โชว์ผลของคำก่อนหน้า
  const byName = useLoader(
    async () => ({ q: debounced, hits: debounced === '' ? [] : await searchTenants(debounced) }),
    'Could not search tenants',
    [debounced],
  )

  const trimmed = query.trim()
  const ready = trimmed !== '' && byName.data?.q === trimmed
  const digits = trimmed.replace(/\D/g, '')
  const results: { tenant: Tenant; match: TenantMatch | 'PHONE' }[] = []
  if (ready) {
    for (const hit of byName.data?.hits ?? []) {
      const tenant = tenants.find((t) => t.id === hit.id)
      if (tenant) results.push({ tenant, match: hit.match })
    }
    if (digits.length >= 3) {
      for (const tenant of tenants) {
        if (tenant.phone.replace(/\D/g, '').includes(digits) && !results.some((r) => r.tenant.id === tenant.id)) {
          results.push({ tenant, match: 'PHONE' })
        }
      }
    }
  }

  return (
    <div className="mb-1.5">
      <label className="relative mt-1 block">
        <Search className="ui-icon size-icon-inline absolute top-1/2 left-3 -translate-y-1/2 text-sand-320" aria-hidden="true" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a tenant by name or phone"
          aria-label="Find a tenant by name or phone"
          className="w-full rounded-lg border border-sand-110 bg-white py-2 pr-3 pl-9 text-sm text-sand-830 outline-none focus:border-brand"
        />
      </label>
      {ready && (
        <ul aria-label="Matching tenants" className="mt-1 flex flex-col gap-1 rounded-lg border border-sand-110 bg-page-bg p-1.5 text-sm">
          {results.length === 0 && (
            <li className="px-2 py-1 text-sand-320">No tenants match “{trimmed}”</li>
          )}
          {results.map(({ tenant, match }) => (
            <li key={tenant.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(tenant.id)
                  setQuery('')
                }}
                className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-sand-830 hover:bg-white"
              >
                <span>
                  {tenant.fullName}
                  <span className="ml-1 text-xs text-sand-320">{tenant.phone}</span>
                </span>
                {match === 'SIMILAR' && (
                  <span className="rounded bg-honey-20 px-2 py-0.5 text-[10px] font-medium text-honey-615">Similar name</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
