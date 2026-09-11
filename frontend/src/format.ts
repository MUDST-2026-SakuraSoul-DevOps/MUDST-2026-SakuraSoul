const BAHT = new Intl.NumberFormat('th-TH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const BANGKOK_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' })

const THAI_DATE = new Intl.DateTimeFormat('th-TH', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

const ENGLISH_DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

const SHORT_DATE = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: '2-digit',
  year: 'numeric',
})

const CURRENCY = new Intl.NumberFormat('en-US')

export function baht(value: number): string {
  return BAHT.format(value)
}

export function yen(value: number): string {
  return `¥${CURRENCY.format(value)}`
}

export function formatCurrency(value: number): string {
  return CURRENCY.format(value)
}

export function todayInBangkok(now = new Date()): string {
  return BANGKOK_DATE.format(now)
}

export function thaiDate(value: string | null): string {
  if (!value) {
    return '-'
  }
  return THAI_DATE.format(new Date(`${value}T00:00:00`))
}

export function englishDate(value: string | null): string {
  if (!value) {
    return '—'
  }
  const date = new Date(`${value}T00:00:00`)
  if (isNaN(date.getTime())) {
    return value
  }
  return ENGLISH_DATE.format(date)
}

export function formatShortDate(value: string | null): string {
  if (!value) {
    return '—'
  }
  const date = new Date(`${value}T00:00:00`)
  if (isNaN(date.getTime())) {
    return value
  }
  return SHORT_DATE.format(date)
}

export function daysUntil(value: string, today = new Date()): number {
  const target = new Date(`${value}T00:00:00`).getTime()
  const from = new Date(`${todayInBangkok(today)}T00:00:00`).getTime()
  return Math.round((target - from) / 86_400_000)
}
