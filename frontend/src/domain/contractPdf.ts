import { fetchApartmentConfig, fetchRoom, fetchTenant } from '../api/client'
import type { ApartmentConfig, Lease, RoomDetail, RoomSummary, Tenant } from '../api/types'
import { roomTypeLabel } from './room'
import { getLeaseDisplayAmount } from './lease'
import { displayDate, bahtAmount } from '../format'
import { downloadBlob } from '../lib/downloadFile'

function buildPdfFromJpeg(jpegBytes: Uint8Array, width: number, height: number): Blob {
  const pageW = 595.28
  const pageH = 841.89

  const maxW = pageW
  const maxH = pageH
  const imgRatio = width / height
  const pageRatio = maxW / maxH

  let renderW = maxW
  let renderH = maxW / imgRatio
  if (imgRatio < pageRatio) {
    renderH = maxH
    renderW = maxH * imgRatio
  }

  const posX = (pageW - renderW) / 2
  const posY = (pageH - renderH) / 2

  const obj1 = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'
  const obj2 = '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n'
  const obj3 = `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW.toFixed(2)} ${pageH.toFixed(2)}] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`

  const obj4Header = `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`
  const obj4Footer = '\nendstream\nendobj\n'

  const contentStream = `q\n${renderW.toFixed(2)} 0 0 ${renderH.toFixed(2)} ${posX.toFixed(2)} ${posY.toFixed(2)} cm\n/Im1 Do\nQ\n`
  const obj5 = `5 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}endstream\nendobj\n`

  const header = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'
  const encoder = new TextEncoder()

  const headerBytes = encoder.encode(header)
  const obj1Bytes = encoder.encode(obj1)
  const obj2Bytes = encoder.encode(obj2)
  const obj3Bytes = encoder.encode(obj3)
  const obj4HBytes = encoder.encode(obj4Header)
  const obj4FBytes = encoder.encode(obj4Footer)
  const obj5Bytes = encoder.encode(obj5)

  const offset1 = headerBytes.length
  const offset2 = offset1 + obj1Bytes.length
  const offset3 = offset2 + obj2Bytes.length
  const offset4 = offset3 + obj3Bytes.length
  const offset5 = offset4 + obj4HBytes.length + jpegBytes.length + obj4FBytes.length

  const xrefOffset = offset5 + obj5Bytes.length

  const pad = (n: number) => n.toString().padStart(10, '0')

  const xrefAndTrailer =
    `xref\n0 6\n` +
    `0000000000 65535 f \n` +
    `${pad(offset1)} 00000 n \n` +
    `${pad(offset2)} 00000 n \n` +
    `${pad(offset3)} 00000 n \n` +
    `${pad(offset4)} 00000 n \n` +
    `${pad(offset5)} 00000 n \n` +
    `trailer\n<< /Size 6 /Root 1 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`

  const xrefBytes = encoder.encode(xrefAndTrailer)

  const totalLength = xrefOffset + xrefBytes.length
  const fullBytes = new Uint8Array(totalLength)

  let pos = 0
  fullBytes.set(headerBytes, pos); pos += headerBytes.length
  fullBytes.set(obj1Bytes, pos); pos += obj1Bytes.length
  fullBytes.set(obj2Bytes, pos); pos += obj2Bytes.length
  fullBytes.set(obj3Bytes, pos); pos += obj3Bytes.length
  fullBytes.set(obj4HBytes, pos); pos += obj4HBytes.length
  fullBytes.set(jpegBytes, pos); pos += jpegBytes.length
  fullBytes.set(obj4FBytes, pos); pos += obj4FBytes.length
  fullBytes.set(obj5Bytes, pos); pos += obj5Bytes.length
  fullBytes.set(xrefBytes, pos)

  return new Blob([fullBytes], { type: 'application/pdf' })
}

function createSimpleContractPdfBlob(lease: Lease): Blob {
  const lines = [
    '============================================================',
    '             RESIDENTIAL LEASE AGREEMENT                    ',
    '           Sakura Soul Property Management                  ',
    `               Contract No: CT-00${lease.id}                 `,
    '============================================================',
    '',
    `Tenant Name:        ${lease.tenantName}`,
    `Premises:           Unit ${lease.roomNumber}`,
    `Start Date:         ${displayDate(lease.startDate)}`,
    `End Date:           ${lease.endDate ? displayDate(lease.endDate) : 'Indefinite'}`,
    `Monthly Rent:       ${bahtAmount(lease.monthlyRent)}`,
    `Security Deposit:   ${bahtAmount(lease.monthlyRent * 2)}`,
    `Billing Cycle:      ${lease.billingCycle}`,
    '',
    '------------------------------------------------------------',
    'Landlord: Sakura Soul Management        Tenant: ' + lease.tenantName,
    '============================================================',
  ]

  let streamText = 'BT\n/F1 10 Tf\n14 TL\n40 800 Td\n'
  for (const line of lines) {
    const escaped = line.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
    streamText += `(${escaped}) '\n`
  }
  streamText += 'ET\n'

  const obj1 = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'
  const obj2 = '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n'
  const obj3 =
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Courier >> >> >> /Contents 4 0 R >>\nendobj\n'
  const obj4 = `4 0 obj\n<< /Length ${streamText.length} >>\nstream\n${streamText}endstream\nendobj\n`

  const header = '%PDF-1.4\n'
  const encoder = new TextEncoder()
  const headerBytes = encoder.encode(header)
  const obj1Bytes = encoder.encode(obj1)
  const obj2Bytes = encoder.encode(obj2)
  const obj3Bytes = encoder.encode(obj3)
  const obj4Bytes = encoder.encode(obj4)

  const offset1 = headerBytes.length
  const offset2 = offset1 + obj1Bytes.length
  const offset3 = offset2 + obj2Bytes.length
  const offset4 = offset3 + obj3Bytes.length
  const xrefOffset = offset4 + obj4Bytes.length

  const pad = (n: number) => n.toString().padStart(10, '0')
  const xrefAndTrailer =
    `xref\n0 5\n` +
    `0000000000 65535 f \n` +
    `${pad(offset1)} 00000 n \n` +
    `${pad(offset2)} 00000 n \n` +
    `${pad(offset3)} 00000 n \n` +
    `${pad(offset4)} 00000 n \n` +
    `trailer\n<< /Size 5 /Root 1 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`

  const xrefBytes = encoder.encode(xrefAndTrailer)
  const fullBytes = new Uint8Array(xrefOffset + xrefBytes.length)
  let pos = 0
  fullBytes.set(headerBytes, pos); pos += headerBytes.length
  fullBytes.set(obj1Bytes, pos); pos += obj1Bytes.length
  fullBytes.set(obj2Bytes, pos); pos += obj2Bytes.length
  fullBytes.set(obj3Bytes, pos); pos += obj3Bytes.length
  fullBytes.set(obj4Bytes, pos); pos += obj4Bytes.length
  fullBytes.set(xrefBytes, pos)

  return new Blob([fullBytes], { type: 'application/pdf' })
}

function fillRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fillColor: string,
) {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + width - radius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
  ctx.lineTo(x + width, y + height - radius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  ctx.lineTo(x + radius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
  ctx.fillStyle = fillColor
  ctx.fill()
}

export function renderContractToCanvas(
  lease: Lease,
  tenant?: Tenant | null,
  room?: RoomSummary | RoomDetail | null,
  config?: ApartmentConfig | null,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  const scale = 3 // 3x scale for crisp, print-ready 300 DPI resolution
  const width = 800
  const height = 1131
  canvas.width = width * scale
  canvas.height = height * scale

  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  ctx.scale(scale, scale)

  // Clean pure white background (full A4 sheet)
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, width, height)

  // Header
  ctx.fillStyle = '#2b2a26'
  ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('Residential Lease Agreement', width / 2, 75)

  ctx.fillStyle = '#767065'
  ctx.font = 'bold 10.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ctx.fillText('SAKURA SOUL PROPERTY MANAGEMENT', width / 2, 98)

  ctx.fillStyle = '#a9a49b'
  ctx.font = '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ctx.fillText(`Contract No: CT-00${lease.id}`, width / 2, 118)

  // Header bottom subtle divider
  ctx.strokeStyle = '#f0ece6'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(60, 138)
  ctx.lineTo(740, 138)
  ctx.stroke()

  // Intro text
  ctx.textAlign = 'left'
  ctx.fillStyle = '#504444'
  ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ctx.fillText(
    `This Residential Lease Agreement ("Agreement") is made and entered into on ${displayDate(lease.startDate)}, by and`,
    60,
    168,
  )
  ctx.fillText(
    `between Sakura Soul Property Management ("Landlord") and ${lease.tenantName} ("Tenant").`,
    60,
    188,
  )

  // Section 1: Tenant Details
  ctx.fillStyle = '#2b2a26'
  ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ctx.fillText('1. TENANT DETAILS', 60, 222)

  fillRoundedRect(ctx, 60, 234, 680, 56, 6, '#faf9f8')

  ctx.fillStyle = '#767065'
  ctx.font = '11.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ctx.fillText('Full Name:', 78, 256)
  ctx.fillText('Phone:', 78, 276)
  ctx.fillText('ID Number:', 410, 256)
  ctx.fillText('Email:', 410, 276)

  ctx.fillStyle = '#2b2a26'
  ctx.font = 'bold 11.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ctx.fillText(lease.tenantName, 150, 256)

  ctx.font = '11.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ctx.fillText(tenant?.phone || 'Not provided', 150, 276)
  ctx.fillText(tenant?.nationalId || 'Not provided', 485, 256)
  ctx.fillText(tenant?.email || 'Not provided', 485, 276)

  // Section 2: Property Details
  ctx.fillStyle = '#2b2a26'
  ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ctx.fillText('2. PROPERTY DETAILS', 60, 314)

  fillRoundedRect(ctx, 60, 326, 680, 76, 6, '#faf9f8')

  ctx.fillStyle = '#767065'
  ctx.font = '11.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ctx.fillText('Premises:', 78, 349)
  ctx.fillText('Floor:', 78, 369)
  ctx.fillText('Address:', 78, 389)
  ctx.fillText('Room Type:', 410, 349)

  ctx.fillStyle = '#2b2a26'
  ctx.font = 'bold 11.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ctx.fillText(`Unit ${lease.roomNumber}`, 150, 349)

  ctx.font = '11.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  const roomAddress = (room && 'address' in room && room.address) ? room.address : 'Building A, 123 Street'
  ctx.fillText(room?.floor ? String(room.floor) : '1', 150, 369)
  ctx.fillText(roomAddress, 150, 389)
  ctx.fillText(room ? roomTypeLabel(room.roomType) : 'Single Bedroom', 485, 349)

  // Section 3: Lease Terms
  ctx.fillStyle = '#2b2a26'
  ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ctx.fillText('3. LEASE TERMS', 60, 424)

  fillRoundedRect(ctx, 60, 436, 680, 76, 6, '#faf9f8')

  const rentInfo = getLeaseDisplayAmount(lease)
  const isAnnual = rentInfo.label === 'Annual Rent'
  const rentLabel = isAnnual ? 'Annual Rent:' : 'Monthly Rent:'
  const depositAmount = isAnnual
    ? bahtAmount(Math.round(rentInfo.amountValue / 6))
    : bahtAmount(rentInfo.amountValue * 2)

  ctx.fillStyle = '#767065'
  ctx.font = '11.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ctx.fillText('Start Date:', 78, 459)
  ctx.fillText(rentLabel, 78, 479)
  ctx.fillText('Billing Cycle:', 78, 499)
  ctx.fillText('End Date:', 410, 459)
  ctx.fillText('Security Deposit:', 410, 479)
  ctx.fillText('Rent Due:', 410, 499)

  ctx.fillStyle = '#2b2a26'
  ctx.font = 'bold 11.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ctx.fillText(displayDate(lease.startDate), 160, 459)
  ctx.fillText(`฿${rentInfo.amount}`, 160, 479)
  ctx.fillText(depositAmount, 515, 479)

  ctx.font = '11.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ctx.fillText(lease.endDate ? displayDate(lease.endDate) : 'Indefinite', 515, 459)
  ctx.fillText(isAnnual ? 'YEARLY' : lease.billingCycle, 160, 499)
  ctx.fillText('1st of each period', 515, 499)

  // Section 4: Utility Rates
  ctx.fillStyle = '#2b2a26'
  ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ctx.fillText('4. UTILITY RATES', 60, 534)

  fillRoundedRect(ctx, 60, 546, 680, 56, 6, '#faf9f8')

  const elecRate = config?.electricRatePerUnit !== undefined ? `${bahtAmount(config.electricRatePerUnit)} per unit` : '฿50.00 per unit'
  const waterRate = config?.waterRatePerUnit !== undefined ? `${bahtAmount(config.waterRatePerUnit)} per unit` : '฿100.00 per unit'
  const commFee = config?.commonAreaFee !== undefined ? `${bahtAmount(config.commonAreaFee)} per month` : '฿300.00 per month'
  const netFee = config?.internetFee !== undefined ? `${bahtAmount(config.internetFee)} per month` : '฿250.00 per month'

  ctx.fillStyle = '#767065'
  ctx.font = '11.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ctx.fillText('Electricity:', 78, 569)
  ctx.fillText('Common Area:', 78, 589)
  ctx.fillText('Water:', 410, 569)
  ctx.fillText('Internet:', 410, 589)

  ctx.fillStyle = '#2b2a26'
  ctx.fillText(elecRate, 160, 569)
  ctx.fillText(commFee, 160, 589)
  ctx.fillText(waterRate, 485, 569)
  ctx.fillText(netFee, 485, 589)

  // Section 5: Tenant Responsibilities
  ctx.fillStyle = '#2b2a26'
  ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ctx.fillText('5. TENANT RESPONSIBILITIES', 60, 626)

  ctx.fillStyle = '#504444'
  ctx.font = '11.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ctx.fillText('1.  Pay rent and utilities on time each period.', 78, 650)
  ctx.fillText('2.  Keep the premises in a clean, sanitary, and good condition.', 78, 670)
  ctx.fillText('3.  Notify the Landlord promptly of any damage or required maintenance.', 78, 690)
  ctx.fillText('4.  Comply with all building rules regarding noise and common areas.', 78, 710)

  // Divider
  ctx.strokeStyle = '#f0ece6'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(60, 745)
  ctx.lineTo(740, 745)
  ctx.stroke()

  // Signatures
  ctx.fillStyle = '#767065'
  ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ctx.fillText('LANDLORD SIGNATURE', 78, 775)
  ctx.fillText('TENANT SIGNATURE', 430, 775)

  ctx.fillStyle = '#2b2a26'
  ctx.font = 'bold 12.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ctx.fillText('Sakura Soul Management', 78, 830)
  ctx.fillText(lease.tenantName, 430, 830)

  ctx.strokeStyle = '#2b2a26'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(78, 837)
  ctx.lineTo(340, 837)
  ctx.moveTo(430, 837)
  ctx.lineTo(690, 837)
  ctx.stroke()

  ctx.fillStyle = '#a9a49b'
  ctx.font = '10.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ctx.fillText(`Date: ${displayDate(lease.startDate)}`, 78, 856)
  ctx.fillText(`Date: ${displayDate(lease.startDate)}`, 430, 856)

  return canvas
}

export function createContractPdfBlob(
  lease: Lease,
  tenant?: Tenant | null,
  room?: RoomSummary | RoomDetail | null,
  config?: ApartmentConfig | null,
): Blob {
  const canvas = renderContractToCanvas(lease, tenant, room, config)
  let jpegDataUrl: string | null
  try {
    jpegDataUrl = canvas.toDataURL?.('image/jpeg', 0.98) ?? null
  } catch {
    jpegDataUrl = null
  }

  if (!jpegDataUrl || !jpegDataUrl.startsWith('data:image/jpeg;base64,')) {
    return createSimpleContractPdfBlob(lease)
  }

  try {
    const base64Data = jpegDataUrl.replace(/^data:image\/jpeg;base64,/, '')
    const binaryString = atob(base64Data)
    const jpegBytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      jpegBytes[i] = binaryString.charCodeAt(i)
    }
    return buildPdfFromJpeg(jpegBytes, canvas.width, canvas.height)
  } catch {
    return createSimpleContractPdfBlob(lease)
  }
}

export async function downloadContractPdf(
  lease: Lease,
  tenant?: Tenant | null,
  room?: RoomSummary | RoomDetail | null,
  config?: ApartmentConfig | null,
): Promise<void> {
  let finalTenant = tenant
  let finalRoom = room
  let finalConfig = config

  if (!finalTenant || !finalRoom || !finalConfig) {
    try {
      const [t, r, c] = await Promise.all([
        finalTenant ? Promise.resolve(finalTenant) : fetchTenant(lease.tenantId).catch(() => null),
        finalRoom ? Promise.resolve(finalRoom) : fetchRoom(lease.roomId).catch(() => null),
        finalConfig ? Promise.resolve(finalConfig) : fetchApartmentConfig().catch(() => null),
      ])
      finalTenant = t
      finalRoom = r
      finalConfig = c
    } catch {
      // Use fallback
    }
  }

  const blob = createContractPdfBlob(lease, finalTenant, finalRoom, finalConfig)
  downloadBlob(`contract-Unit-${lease.roomNumber}.pdf`, blob)
}
