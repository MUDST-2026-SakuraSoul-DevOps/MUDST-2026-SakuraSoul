import type { TenantMatch } from '../api/types'

/**
 * ค้นหาชื่อผู้เช่าแบบยอมให้พิมพ์ผิด (SSK-174 โบนัส) ตัวอย่างของอาจารย์: "krant" หรือ "kart" ต้องเจอ "kant"
 *
 * เลือกวิธี B ของการ์ด (ระยะแก้ไขในแอป) เพราะผู้เช่ามีระดับสิบถึงร้อยคน ไม่ต้องแตะ migration หรือ extension
 * ของ PostgreSQL ใช้ Damerau-Levenshtein แบบ OSA (แทน/เพิ่ม/ลบ/สลับตัวติดกัน นับเป็น 1)
 *
 * ลำดับผล: ตรงทั้งคำ > ขึ้นต้นด้วย > มีคำนั้นอยู่ > คล้าย ภายในกลุ่มเรียงตามระยะแก้ไขแล้วตามชื่อ
 * เกณฑ์ความคล้าย: คำค้นสั้นกว่า 3 ตัวไม่หาแบบคล้าย (ไม่งั้น "ab" จะเจอแทบทุกคน) 3-6 ตัวยอมผิด 1 ตัว 7 ตัวขึ้นไปยอม 2 ตัว
 * เทียบทีละคำของชื่อ (ชื่อ นามสกุล) ไม่ใช่ทั้งชื่อ เพราะคนมักพิมพ์แค่ชื่อต้น
 *
 * ข้อจำกัดภาษาไทย: นับตาม code point สระบน/ล่างและวรรณยุกต์เป็นหนึ่งตัวแยกจากพยัญชนะ พิมพ์วรรณยุกต์ผิด/ขาดนับเป็น
 * ผิดหนึ่งตัว ชื่อไทยไม่มีเว้นวรรคระหว่างพยางค์ คำค้นที่เป็นแค่ส่วนกลางของชื่อจึงเจอผ่าน "มีคำนั้นอยู่" เท่านั้น
 */

export const MATCH_RANK: Record<TenantMatch, number> = { EXACT: 0, PREFIX: 1, CONTAINS: 2, SIMILAR: 3 }
export const MAX_RESULTS = 20

export function normalize(text: string): string {
  return text.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ')
}

/** ระยะแก้ไขแบบ OSA นับการสลับตัวอักษรติดกันเป็นหนึ่งครั้ง เช่น "knat" กับ "kant" */
export function editDistance(a: string, b: string): number {
  const x = [...a]
  const y = [...b]
  const d: number[][] = Array.from({ length: x.length + 1 }, (_, i) => [i, ...Array<number>(y.length).fill(0)])
  for (let j = 0; j <= y.length; j += 1) d[0][j] = j
  for (let i = 1; i <= x.length; i += 1) {
    for (let j = 1; j <= y.length; j += 1) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && x[i - 1] === y[j - 2] && x[i - 2] === y[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
      }
    }
  }
  return d[x.length][y.length]
}

export function allowedEdits(query: string): number {
  const length = [...query].length
  return length < 3 ? 0 : length < 7 ? 1 : 2
}

/** ผลของชื่อหนึ่งชื่อ หรือ null ถ้าไม่ผ่านเกณฑ์ */
export function matchName(fullName: string, rawQuery: string): { match: TenantMatch; distance: number } | null {
  const query = normalize(rawQuery)
  if (query === '') return null
  const name = normalize(fullName)
  const words = name.split(' ')
  if (name === query || words.includes(query)) return { match: 'EXACT', distance: 0 }
  if (name.startsWith(query) || words.some((w) => w.startsWith(query))) return { match: 'PREFIX', distance: 0 }
  if (name.includes(query)) return { match: 'CONTAINS', distance: 0 }
  const limit = allowedEdits(query)
  if (limit === 0) return null
  const distance = Math.min(...[name, ...words].map((w) => editDistance(query, w)))
  return distance <= limit ? { match: 'SIMILAR', distance } : null
}

export function rankByName<T extends { fullName: string }>(people: T[], query: string): (T & { match: TenantMatch })[] {
  return people
    .map((person) => ({ person, result: matchName(person.fullName, query) }))
    .filter((r): r is { person: T; result: { match: TenantMatch; distance: number } } => r.result !== null)
    .sort(
      (a, b) =>
        MATCH_RANK[a.result.match] - MATCH_RANK[b.result.match] ||
        a.result.distance - b.result.distance ||
        a.person.fullName.localeCompare(b.person.fullName),
    )
    .slice(0, MAX_RESULTS)
    .map(({ person, result }) => ({ ...person, match: result.match }))
}
