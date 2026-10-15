/*
  ตัวช่วยที่ไฟล์เทสหลายไฟล์ใช้ร่วมกัน ไฟล์เทส import เข้าไปเอง (ไม่ได้โหลดผ่าน supportFile)
*/

/** ข้อความของตัวเลือกทั้งหมดใน select เช่นรายการห้องในฟอร์มสัญญา "105 · Floor 1" ใช้กับ .then(optionLabels) */
export function optionLabels($select: JQuery<HTMLElement>): string[] {
  return [...$select.find('option')].map((option) => option.textContent?.trim() ?? '')
}

/** ยุบช่องว่างทุกแบบให้เหลือช่องเดียว ใช้ก่อนเทียบข้อความทั้งก้อนกับ regex */
export function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * เลขบัตรประชาชนไทย 13 หลักที่ผ่าน checksum และไม่ซ้ำของเดิมในฐานข้อมูล
 *
 * ฐานข้อมูลจริงไม่ได้รีเซ็ตทุกครั้งที่รันเทส และ backend กันเลขบัตรซ้ำไว้
 * (existsByNationalId) ถ้าใช้เลขตายตัว รันรอบที่สองจะพังเพราะเลขซ้ำ ไม่ใช่เพราะโปรแกรมผิด
 * 12 หลักแรกสุ่ม หลักที่ 13 คำนวณตามสูตร Modulo 11 เหมือนที่หน้าเว็บตรวจ
 */
export function newThaiNationalId(): string {
  const digits = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10))
  const sum = digits.reduce((total, digit, index) => total + digit * (13 - index), 0)
  const check = (11 - (sum % 11)) % 10
  return [...digits, check].join('')
}

/** ชื่อที่ไม่ซ้ำของเดิม ใช้ค้นหาแถวของตัวเองในตารางที่มีข้อมูลจริงปนอยู่ */
export function uniqueName(prefix = 'QA Live'): string {
  return `${prefix} ${Date.now()}`
}

/** วันนี้ตามเวลาไทย ตรงกับ todayInBangkok() ที่หน้าเว็บใช้ตั้งวันเริ่มและวันปิดสัญญา */
export function todayInBangkok(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date())
}

/** เมื่อวานตามเวลาไทย รูปแบบ YYYY-MM-DD ที่ช่องวันที่ของฟอร์มรับ */
export function yesterdayInBangkok(): string {
  const bangkokNow = new Date(Date.now() + 7 * 60 * 60 * 1000)
  bangkokNow.setUTCDate(bangkokNow.getUTCDate() - 1)
  return bangkokNow.toISOString().slice(0, 10)
}

/**
 * เรียก API ของ backend จริง (ชุด live) ผ่าน proxy ของ Vite ด้วย cookie ของหน้าเว็บที่ล็อกอินไว้
 * ไม่ล้มเองเมื่อได้สถานะ 4xx/5xx คนเรียกต้องเช็ค status เองพร้อมข้อความที่บอกสาเหตุ
 */
export function api<T = unknown>(
  method: Cypress.HttpMethod,
  url: string,
  body?: Cypress.RequestBody,
): Cypress.Chainable<Cypress.Response<T>> {
  return cy.request<T>({ method, url, body, failOnStatusCode: false })
}

/**
 * วนถามซ้ำจนกว่า check จะตอบ true หรือหมดเวลา ใช้กับสิ่งที่ไม่ได้อยู่บนหน้าจอ เช่นกล่องอีเมลของ Mailpit
 * (ของที่อยู่บนหน้าจอให้ใช้ .should(callback) ซึ่ง Cypress ถามซ้ำให้เองอยู่แล้ว)
 */
export function pollUntil(check: () => Cypress.Chainable<boolean>, message: string, timeoutMs = 15_000): void {
  const deadline = Date.now() + timeoutMs
  const attempt = (): void => {
    check().then((done) => {
      if (done) return
      if (Date.now() > deadline) throw new Error(message)
      cy.wait(500, { log: false }).then(attempt)
    })
  }
  attempt()
}

/*
  การเก็บกวาดของชุด live

  ของที่เทสสร้างไว้ในฐานข้อมูลจริงต้องเก็บกวาดเสมอ แม้เทสพังกลางทาง ใน Cypress คำสั่งที่พัง
  จะทิ้งคำสั่งที่เหลือในคิวทั้งหมด try/finally จึงช่วยไม่ได้ ทางที่ถูกคือจด cleanup ไว้ทันทีที่รู้ id
  แล้วให้ afterEach ของไฟล์เทสเรียก runCleanups() ซึ่ง Cypress รันให้ทั้งตอนเทสผ่านและตอนพัง

  ฟังก์ชัน cleanup ต้องไม่ assert อะไรเลย และเรียก API ผ่าน api() ที่ไม่ล้มเองเมื่อได้ 4xx/5xx
  เพราะถ้า afterEach พัง Cypress จะข้ามเคสที่เหลือทั้งไฟล์
*/
const cleanups: Array<() => void> = []

/** จดงานเก็บกวาดไว้ ทำย้อนลำดับตอนจบเทส (ของที่สร้างทีหลังลบก่อน) */
export function onCleanup(fn: () => void): void {
  cleanups.push(fn)
}

/** เรียกใน afterEach ของไฟล์เทสชุด live */
export function runCleanups(): void {
  cleanups.splice(0).reverse().forEach((fn) => fn())
}
