import { initialsFrom } from '../format'

/**
 * รูปโปรไฟล์ของคนที่ล็อกอินอยู่ ใช้บน sidebar และการ์ดในหน้า Account Settings
 *
 * ไม่มีรูปก็โชว์ตัวย่อของชื่อ ไม่ตกไปที่รูปคนอื่นที่ค้างอยู่ใน public เพราะการ
 * เอารูปของคนหนึ่งไปแปะให้ทุก account ที่ยังไม่ได้อัปโหลดรูป คือการบอกผิดว่าใคร
 * กำลังล็อกอินอยู่
 *
 * ขนาดตัวอักษรคิดจาก size ที่ส่งเข้ามา ไม่ได้ fix ไว้แบบ InitialsAvatar เพราะ
 * ตัวนี้ถูกใช้ตั้งแต่ 40px บน sidebar ไปจนถึง 116px บนหน้า Account Settings
 * ถ้าตรึง text-xs ไว้ ตัวย่อในกรอบใหญ่จะเล็กจนดูเหมือนวางผิดที่
 */
export function ProfileAvatar({
  src,
  alt = '',
  className = '',
  size = 120,
}: {
  src?: string
  alt?: string
  className?: string
  size?: number
}) {
  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden bg-[#eae4de] ${className}`}
      style={{ width: size, height: size }}
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          className="size-full object-cover"
          onError={(e) => {
            // รูปที่ผู้ใช้อัปโหลดไว้โหลดไม่ขึ้น ซ่อน img ทิ้งให้เหลือพื้นหลังเปล่า
            // ดีกว่าปล่อยไอคอนรูปพังของ browser ค้างอยู่
            e.currentTarget.style.display = 'none'
          }}
        />
      ) : (
        <span
          className="font-semibold text-brand"
          style={{ fontSize: Math.max(11, Math.round(size * 0.34)) }}
        >
          {initialsFrom(alt) || '?'}
        </span>
      )}
    </div>
  )
}
