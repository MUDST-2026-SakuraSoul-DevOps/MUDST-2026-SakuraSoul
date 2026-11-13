import { beforeEach, describe, expect, it } from 'vitest'
import { mockFetch, resetMockStore } from './mockApi'
import type { Attachment, Receipt } from './types'
import { pngFile } from '../test/files'
import { todayInBangkok } from '../format'

/**
 * SSK-163: backend จำลองรับสลิปที่เจ้าของเป็นการชำระ (ownerType=PAYMENT) เหมือน backend จริง
 * การชำระอยู่ในใบเสร็จ จึงต้องหาเจ้าของจาก receipt.payments
 */
beforeEach(() => resetMockStore())

function slipForm(paymentId: number): FormData {
  const form = new FormData()
  form.append('file', pngFile('slip.png'))
  form.append('ownerType', 'PAYMENT')
  form.append('ownerId', String(paymentId))
  return form
}

describe('payment slips in the mock backend', () => {
  it('attaches a slip to a payment that was just recorded and lists it under that payment', async () => {
    const receipts = (await (await mockFetch('/receipts')).json()) as Receipt[]
    const open = receipts.find((r) => r.latest && (r.balanceDue ?? 0) > 0)
    expect(open).toBeDefined()
    const recorded = await mockFetch(`/receipts/${open!.id}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 100, paidOn: todayInBangkok(), method: 'CASH' }),
    })
    const updated = (await recorded.json()) as Receipt
    const paymentId = Math.max(...(updated.payments ?? []).filter((p) => !p.voidedAt).map((p) => p.id))

    const created = await mockFetch('/attachments', { method: 'POST', body: slipForm(paymentId) })
    expect(created.status).toBe(201)
    expect(await created.json()).toMatchObject({ ownerType: 'PAYMENT', ownerId: paymentId, fileName: 'slip.png', contentType: 'image/png' })

    const listed = (await (await mockFetch(`/attachments?ownerType=PAYMENT&ownerId=${paymentId}`)).json()) as Attachment[]
    expect(listed.map((a) => a.fileName)).toEqual(['slip.png'])
  })

  it('answers 404 with the backend message for a payment that does not exist', async () => {
    const response = await mockFetch('/attachments', { method: 'POST', body: slipForm(999999) })
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ detail: 'No payment with id 999999' })
  })
})
