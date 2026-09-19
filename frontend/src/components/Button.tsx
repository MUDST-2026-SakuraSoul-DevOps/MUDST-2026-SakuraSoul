import type { ButtonHTMLAttributes, ReactNode } from 'react'

/**
 * ปุ่ม 2 แบบที่ใช้ซ้ำทุกหน้าเนื้อหา (Units, Payments, Maintenance, Contracts,
 * Appliances) ก๊อปสไตล์จากปุ่ม "Config" / "Add Unit" ใน Unit Page (node
 * 125:2292) — secondary = ปุ่มขอบขาว, primary = ปุ่มชมพู CTA
 */
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }

export function SecondaryButton({ children, className = '', ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={`rounded-lg border border-card-border bg-white px-4 py-2 text-sm font-medium text-heading hover:bg-black/5 ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export function PrimaryButton({ children, className = '', ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={`flex items-center gap-2 rounded-lg bg-cta-bg px-4 py-2 text-sm font-medium text-cta-text shadow-sm hover:brightness-95 ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
