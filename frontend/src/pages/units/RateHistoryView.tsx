import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { fetchApartmentConfig, fetchRoomRates } from '../../api/client'
import type { RoomRate, RoomSummary } from '../../api/types'
import { displayMonth, rateInEffect } from '../../domain/roomRate'
import { useLoader } from '../../hooks/useLoader'
import { DataTable } from '../../components/DataTable'
import { PrimaryButton } from '../../components/Button'
import { SelectField } from '../../components/Field'
import { LoadingState, ErrorState } from '../../components/PageState'
import { Note, Panel, ToneBadge } from '../../components/Callout'
import { ScheduleRateDialog } from '../../dialogs/ScheduleRateDialog'
import { baht, bahtAmount, displayDate, todayInBangkok } from '../../format'

/**
 * แท็บ Rate history ของหน้า Units (SSK-162) ตามดีไซน์ SSK-177
 *
 * ห้องที่ดูอยู่เก็บใน ?room= ปุ่มประวัติในตาราง All units จะได้ลิงก์ตรงมาที่ห้องนั้น
 * การ์ดสองใบท้ายแท็บของ preview เป็นตัวอย่างตายตัว ตรงนี้ใช้ข้อมูลจริงแทน ซ้ายคือสัญญาที่ใช้อยู่
 * ซึ่งคงอัตราเดิมเสมอ ขวาคืออัตราที่สัญญาใหม่เดือนนี้จะได้ ให้เห็นกติกาของ SSK-180 จากของจริง
 */
export function RateHistoryView({ rooms, onChanged }: { rooms: RoomSummary[]; onChanged: () => void }) {
  const [params, setParams] = useSearchParams()
  const room = rooms.find((r) => String(r.id) === params.get('room')) ?? rooms[0]
  const [scheduling, setScheduling] = useState(false)

  const rates = useLoader(() => fetchRoomRates(room.id), 'Could not load the rate history', [room.id])
  const config = useLoader(fetchApartmentConfig, 'Could not load the utility rates')

  const thisMonth = todayInBangkok().slice(0, 7)
  const inEffect = rates.data ? rateInEffect(rates.data, thisMonth) : null
  const current = config.data
    ? {
        monthlyRent: inEffect?.monthlyRent ?? room.baseRent,
        electricRatePerUnit: inEffect?.electricRatePerUnit ?? config.data.electricRatePerUnit,
        waterRatePerUnit: inEffect?.waterRatePerUnit ?? config.data.waterRatePerUnit,
        commonAreaFee: inEffect?.commonAreaFee ?? config.data.commonAreaFee,
        internetFee: inEffect?.internetFee ?? config.data.internetFee,
      }
    : null

  function selectRoom(id: string) {
    const next = new URLSearchParams(params)
    next.set('room', id)
    setParams(next)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="w-full sm:w-48">
          <SelectField
            label="Unit"
            value={room.id}
            onChange={selectRoom}
            options={rooms.map((r) => ({ value: r.id, label: r.roomNumber }))}
          />
        </div>
        <PrimaryButton onClick={() => setScheduling(true)} disabled={!current}>
          <Plus className="ui-icon size-icon-inline" aria-hidden="true" />
          Schedule rate
        </PrimaryButton>
      </div>

      <Note>
        New rates apply to contracts signed from their effective month. Existing contracts keep the rates they were
        signed with, and issued invoices keep the rates captured when they were created.
      </Note>

      <Panel title={`Rate history · Unit ${room.roomNumber}`}>
        <div className="overflow-x-auto px-6 pb-6">
          {rates.error && <ErrorState message={rates.error} />}
          {rates.loading && !rates.data && <LoadingState label="Loading rates..." />}
          {rates.data && (
            <DataTable<RoomRate>
              rows={rates.data}
              rowKey={(rate) => rate.id}
              minWidth={768}
              headCellClass="border-b border-card-border px-4 py-4 text-xs font-semibold tracking-[0.6px] text-table-label uppercase"
              rowClass="border-t border-row-border"
              cellClass="px-4 py-5 text-sm text-table-label"
              empty={
                <p className="py-6 text-center text-sm text-body-muted">
                  No rate changes yet. This unit uses its room type rent and the Apartment Config rates.
                </p>
              }
              columns={[
                {
                  key: 'from',
                  header: 'EFFECTIVE FROM',
                  cellClass: 'font-medium text-heading',
                  cell: (rate) => (
                    <span className="flex flex-col gap-1">
                      {displayMonth(rate.effectiveFrom)}
                      {rate.effectiveFrom > thisMonth && <ToneBadge tone="amber">Scheduled</ToneBadge>}
                      {rate === inEffect && <ToneBadge tone="green">In effect</ToneBadge>}
                    </span>
                  ),
                },
                { key: 'rent', header: 'RENT / MONTH', cell: (rate) => bahtAmount(rate.monthlyRent) },
                { key: 'water', header: 'WATER / m³', cell: (rate) => bahtAmount(rate.waterRatePerUnit) },
                { key: 'electric', header: 'ELECTRICITY / kWh', cell: (rate) => bahtAmount(rate.electricRatePerUnit) },
                {
                  key: 'fees',
                  header: 'COMMON / INTERNET',
                  cell: (rate) => `${baht(rate.commonAreaFee)} / ${baht(rate.internetFee)}`,
                },
                { key: 'note', header: 'NOTE', cell: (rate) => rate.note ?? '-' },
              ]}
            />
          )}
        </div>
      </Panel>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Current contract · Locked rates">
          <div className="flex flex-col gap-3 px-6 py-5 text-sm">
            {room.currentLease ? (
              <>
                <p className="flex justify-between gap-4">
                  <span className="text-body-muted">{room.currentLease.tenantName} · rent</span>
                  <strong className="text-heading">{bahtAmount(room.currentLease.monthlyRent)}</strong>
                </p>
                <p className="flex justify-between gap-4">
                  <span className="text-body-muted">Signed from</span>
                  <span>{displayDate(room.currentLease.startDate)}</span>
                </p>
                <ToneBadge tone="green">Unchanged by new room rates</ToneBadge>
              </>
            ) : (
              <p className="text-body-muted">Unit {room.roomNumber} has no active contract.</p>
            )}
          </div>
        </Panel>
        <Panel title="New contracts · Rate in effect">
          <div className="flex flex-col gap-3 px-6 py-5 text-sm">
            {current ? (
              <>
                <p className="flex justify-between gap-4">
                  <span className="text-body-muted">Unit {room.roomNumber} · rent</span>
                  <strong className="text-heading">{bahtAmount(current.monthlyRent)}</strong>
                </p>
                <p className="flex justify-between gap-4">
                  <span className="text-body-muted">Rate source</span>
                  <span>{inEffect ? `Room rate from ${displayMonth(inEffect.effectiveFrom)}` : 'Room type + Apartment Config'}</span>
                </p>
                <ToneBadge>Applies to contracts signed this month</ToneBadge>
              </>
            ) : (
              <LoadingState label="Loading rates..." />
            )}
          </div>
        </Panel>
      </div>

      {scheduling && current && (
        <ScheduleRateDialog
          rooms={rooms}
          roomId={room.id}
          defaults={current}
          onClose={() => setScheduling(false)}
          onSaved={(id) => {
            selectRoom(String(id))
            rates.reload()
            onChanged()
          }}
        />
      )}
    </div>
  )
}
