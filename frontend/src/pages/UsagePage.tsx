import { useSearchParams } from 'react-router-dom'
import { fetchRooms } from '../api/client'
import { useLoader } from '../hooks/useLoader'
import { PageHeader } from '../components/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '../components/PageState'
import { BuildingUsagePanel } from './usage/BuildingUsagePanel'
import { UtilitiesView } from './units/UtilitiesView'

type UsageMode = 'building' | 'units'

const MODES: { value: UsageMode; label: string }[] = [
  { value: 'building', label: 'Whole building' },
  { value: 'units', label: 'By floor or unit' },
]

/**
 * หน้า Usage (SSK-181 ร่วมกับ SSK-167): ภาพรวมทั้งตึกเป็นค่าเริ่มต้น สลับไปดูรายชั้นหรือรายห้องได้ในหน้าเดียว
 * CSV imports and meter readings are available in the floor/unit view.
 */
export default function UsagePage() {
  const [params, setParams] = useSearchParams()
  const mode: UsageMode = params.get('view') === 'units' ? 'units' : 'building'
  function setMode(value: UsageMode) {
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      next.set('view', value)
      return next
    })
  }
  const rooms = useLoader(fetchRooms, 'Could not load the units')

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Usage"
        description="Water and electricity for the whole building across months and years, or by floor and unit."
      />
      <div
        role="group"
        aria-label="Usage view"
        className="section-tabs"
      >
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            aria-pressed={mode === m.value}
            onClick={() => setMode(m.value)}
            className="section-tab"
          >
            {m.label}
          </button>
        ))}
      </div>
      {mode === 'building' && <BuildingUsagePanel />}
      {mode === 'units' && rooms.error && <ErrorState message={rooms.error} />}
      {mode === 'units' && !rooms.data && !rooms.error && <LoadingState label="Loading units..." />}
      {mode === 'units' && rooms.data && rooms.data.length === 0 && (
        <EmptyState title="No units yet" hint="Set up the building layout under Units first." />
      )}
      {mode === 'units' && rooms.data && rooms.data.length > 0 && <UtilitiesView rooms={rooms.data} />}
    </div>
  )
}
