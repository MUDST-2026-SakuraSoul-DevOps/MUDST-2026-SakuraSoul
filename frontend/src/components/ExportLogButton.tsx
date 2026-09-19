import { useState } from 'react'
import { DownloadSimple } from '@phosphor-icons/react'
import type { MaintenanceTicket } from '../api/types'
import { maintenanceCsvFilename, toMaintenanceCsv } from '../domain/maintenanceExport'
import { downloadTextFile } from '../lib/downloadFile'
import { SecondaryButton } from './Button'

/**
 * ปุ่ม Export Log ในหน้า Maintenance Log ตาม US-18 ตรงกับปุ่มในเฟรม Figma
 * node 196:1102
 *
 * รับรายการที่จะ export เข้ามาเป็น prop ไม่ได้ไปดึงเอง เพราะ US-18-S2 บอกว่า
 * ไฟล์ต้องมีเฉพาะรายการที่ตรงกับตัวกรองที่ผู้ใช้เลือกไว้ ถ้า component นี้ไปดึง
 * ข้อมูลเองมันจะไม่รู้จักตัวกรองของหน้าที่มันอยู่ แล้วจะ export ทุกรายการเสมอ
 * ซึ่งผิด scenario
 */
export function ExportLogButton({ tickets }: { tickets: MaintenanceTicket[] }) {
  const [message, setMessage] = useState<string | null>(null)

  /**
   * ล้างข้อความเตือนทันทีที่รายการที่จะ export เปลี่ยน
   *
   * QA เจอว่าถ้ากด Export ตอนตารางว่างแล้วได้ข้อความ "ยังไม่มีประวัติ..."
   * พอผู้ใช้ล้างตัวกรองจนมีข้อมูลแล้ว ข้อความยังค้างอยู่จนกว่าจะกด Export
   * อีกรอบ ซึ่งอ่านแล้วเหมือนระบบยังไม่มีข้อมูลทั้งที่ตารางมีของอยู่เต็ม
   */
  const [lastCount, setLastCount] = useState(tickets.length)
  if (lastCount !== tickets.length) {
    setLastCount(tickets.length)
    if (message !== null) {
      setMessage(null)
    }
  }

  function handleExport() {
    const csv = toMaintenanceCsv(tickets)

    // US-18-S3 ไม่มีรายการก็ไม่สร้างไฟล์ ไฟล์ CSV ที่มีแต่หัวตารางหลอกคนอ่าน
    // ให้คิดว่า export สำเร็จแต่ระบบไม่มีข้อมูล ซึ่งเป็นคนละเรื่องกัน
    if (csv === null) {
      setMessage('There is no maintenance history to export')
      return
    }

    setMessage(null)
    downloadTextFile(maintenanceCsvFilename(), csv, 'text/csv;charset=utf-8')
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <SecondaryButton onClick={handleExport} className="flex items-center gap-2">
        <DownloadSimple size={14} weight="bold" />
        Export Log
      </SecondaryButton>

      {message && (
        <p role="alert" className="text-sm text-[#93000a]">
          {message}
        </p>
      )}
    </div>
  )
}
