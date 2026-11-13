// ============================== [NOTE] ==============================
// ไฟล์นี้: กล่องเครื่องมือที่ไฟล์เทสหลายไฟล์ใช้ร่วมกัน ไม่มีเทสในไฟล์นี้ ไฟล์เทส import เฉพาะตัวที่ใช้
// optionLabels / normalizeText = อ่านข้อความบนจอ · newThaiNationalId / uniqueName = สร้างข้อมูลเทสไม่ซ้ำ
// todayInBangkok / yesterdayInBangkok = วันที่ไทย · api = ยิง API ตรง (เตรียมข้อมูล/เก็บกวาด)
// pollUntil = ถามซ้ำจนเจอ (กล่องอีเมล) · onCleanup / runCleanups = ระบบเก็บกวาดของชุด live
// ====================================================================

/*
  ตัวช่วยที่ไฟล์เทสหลายไฟล์ใช้ร่วมกัน ไฟล์เทส import เข้าไปเอง (ไม่ได้โหลดผ่าน supportFile)
*/

// [NOTE] optionLabels: อ่านตัวเลือกทั้งหมดใน <select> เป็นอาร์เรย์ ใช้เช็คว่า dropdown มีหรือไม่มีห้องไหน (CONTRACT-001/002)
/** ข้อความของตัวเลือกทั้งหมดใน select เช่นรายการห้องในฟอร์มสัญญา "105 · Floor 1" ใช้กับ .then(optionLabels) */
export function optionLabels($select: JQuery<HTMLElement>): string[] {
  return [...$select.find('option')].map((option) => option.textContent?.trim() ?? '')
}

// [NOTE] normalizeText: ยุบช่องว่างกับขึ้นบรรทัดให้เหลือช่องเดียว ก่อนเทียบข้อความยาว (PAYMENT-001)
/** ยุบช่องว่างทุกแบบให้เหลือช่องเดียว ใช้ก่อนเทียบข้อความทั้งก้อนกับ regex */
export function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

// [NOTE] newThaiNationalId: สุ่ม 12 หลัก แล้วคำนวณหลักที่ 13 ตามสูตร checksum (Mod 11) เหมือนหน้าเว็บตรวจ
//   ต้องสุ่ม เพราะ backend ไม่รับเลขซ้ำ ถ้าใช้เลขตายตัว รอบที่สองจะพังเอง
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

// [NOTE] uniqueName('QA Contract') → "QA Contract 1760650000000" (ต่อท้ายด้วยเวลาเป็นมิลลิวินาที) แยกข้อมูลเทสออกจากข้อมูลจริง
/** ชื่อที่ไม่ซ้ำของเดิม ใช้ค้นหาแถวของตัวเองในตารางที่มีข้อมูลจริงปนอยู่ */
export function uniqueName(prefix = 'QA Live'): string {
  return `${prefix} ${Date.now()}`
}

// [NOTE] todayInBangkok: วันนี้แบบ YYYY-MM-DD ตามเวลาไทย ใช้เป็นวันเริ่ม/วันปิดสัญญา
/** วันนี้ตามเวลาไทย ตรงกับ todayInBangkok() ที่หน้าเว็บใช้ตั้งวันเริ่มและวันปิดสัญญา */
export function todayInBangkok(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date())
}

// [NOTE] yesterdayInBangkok: เมื่อวาน ใช้ตั้งวันเริ่มรอบแจ้งเตือนให้ถึงกำหนดทันที (REMINDER-001)
/** เมื่อวานตามเวลาไทย รูปแบบ YYYY-MM-DD ที่ช่องวันที่ของฟอร์มรับ */
export function yesterdayInBangkok(): string {
  const bangkokNow = new Date(Date.now() + 7 * 60 * 60 * 1000)
  bangkokNow.setUTCDate(bangkokNow.getUTCDate() - 1)
  return bangkokNow.toISOString().slice(0, 10)
}

// [NOTE] api(method, url, body): ห่อ cy.request ยิง API ตรงด้วย cookie ของหน้าที่ล็อกอินไว้
//   failOnStatusCode: false = ได้ 4xx/5xx ก็ไม่พังเอง คนเรียกเช็ค status เอง ใช้เตรียมข้อมูลกับเก็บกวาด ไม่ใช่สิ่งที่เทสพิสูจน์
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

// [NOTE] pollUntil: ถาม check() ทุก 0.5 วินาที จนได้ true หรือครบ 15 วินาทีแล้ว error ใช้กับของที่ไม่อยู่บนจอ เช่นกล่อง Mailpit (PAYMENT-001)
/**
 * วนถามซ้ำจนกว่า check จะตอบ true หรือหมดเวลา ใช้กับสิ่งที่ไม่ได้อยู่บนหน้าจอ เช่นกล่องอีเมลของ Mailpit
 * (ของที่อยู่บนหน้าจอให้ใช้ .should(callback) ซึ่ง Cypress ถามซ้ำให้เองอยู่แล้ว)
 */
export function pollUntil(check: () => Cypress.Chainable<boolean>, message: string, timeoutMs = 15_000): void {
  let deadline = 0
  const attempt = (): void => {
    check().then((done) => {
      if (done) return
      if (Date.now() > deadline) throw new Error(message)
      cy.wait(500, { log: false }).then(attempt)
    })
  }
  // เริ่มนับเวลาตอนที่คำสั่งถึงคิวจริง ไม่ใช่ตอนเรียกฟังก์ชัน ซึ่ง Cypress แค่จดคำสั่งลงคิวไว้ก่อน
  cy.then(() => {
    deadline = Date.now() + timeoutMs
    attempt()
  })
}

/*
  การเก็บกวาดของชุด live

  ของที่เทสสร้างไว้ในฐานข้อมูลจริงต้องเก็บกวาดเสมอ แม้เทสพังกลางทาง ใน Cypress คำสั่งที่พัง
  จะทิ้งคำสั่งที่เหลือในคิวทั้งหมด try/finally จึงช่วยไม่ได้ ทางที่ถูกคือจด cleanup ไว้ทันทีที่รู้ id
  แล้วให้ afterEach ของไฟล์เทสเรียก runCleanups() ซึ่ง Cypress รันให้ทั้งตอนเทสผ่านและตอนพัง

  ฟังก์ชัน cleanup ต้องไม่ assert อะไรเลย และเรียก API ผ่าน api() ที่ไม่ล้มเองเมื่อได้ 4xx/5xx
  เพราะถ้า afterEach พัง Cypress จะข้ามเคสที่เหลือทั้งไฟล์
*/
// [NOTE] รายการงานเก็บกวาดของเคสที่กำลังรัน (อาร์เรย์ของฟังก์ชัน)
const cleanups: Array<() => void> = []

// [NOTE] onCleanup(fn): จดงานเก็บกวาดทันทีที่รู้ id ของที่สร้าง เช่น onCleanup(() => deleteTenant(id))
/** จดงานเก็บกวาดไว้ ทำย้อนลำดับตอนจบเทส (ของที่สร้างทีหลังลบก่อน) */
export function onCleanup(fn: () => void): void {
  cleanups.push(fn)
}

// [NOTE] runCleanups: เรียกใน afterEach ทั้งตอนเทสผ่านและพัง · splice(0) เอางานออกมาทั้งหมดและล้างรายการ
//   reverse() ทำย้อนลำดับ ของที่สร้างทีหลังลบก่อน เช่นลบใบแจ้งซ่อมก่อนลบรอบที่สร้างมัน
/** เรียกใน afterEach ของไฟล์เทสชุด live */
export function runCleanups(): void {
  cleanups.splice(0).reverse().forEach((fn) => fn())
}

// [NOTE] createQaLease: สร้างผู้เช่า + สัญญาของเทสบนห้องว่าง แล้วจดงานปิดสัญญาไว้ใน onCleanup ให้เอง
//   ใช้กับเคส live ที่ต้องการห้องที่ไม่มีใครใช้ (PAYMENT-003, UNITS-002) ผู้เช่าลบไม่ได้เมื่อมีประวัติสัญญา จึงค้างอยู่ในฐานข้อมูลโดยตั้งใจ
/** ผลของ createQaLease: ข้อมูลที่เทสต้องใช้ต่อ */
export interface QaLease {
  tenantName: string
  leaseId: number
  roomId: number
}

/**
 * สร้างผู้เช่ากับสัญญา active ให้ห้อง `unit` ผ่าน API (การสร้างผ่านหน้าจอมีเคส CONTRACT-001 คุมอยู่แล้ว)
 * ห้องต้องว่างก่อนเริ่ม ถ้ามีสัญญาของเทสรอบก่อนค้างอยู่ให้ Check Out ที่ Dashboard
 * ปิดสัญญาคืนห้องตอน runCleanups() ซึ่งทำย้อนลำดับ จึงจด onCleanup อื่นของเคส (เช่นรับชำระใบ) ไว้ทีหลังได้
 */
export function createQaLease(unit: string, namePrefix: string): Cypress.Chainable<QaLease> {
  const tenantName = uniqueName(namePrefix)
  const today = todayInBangkok()
  return api<Array<{ id: number; roomNumber: string; status: string }>>('GET', '/api/rooms').then((rooms) => {
    const room = rooms.body.find((candidate) => candidate.roomNumber === unit)
    expect(room, `ไม่เจอห้อง ${unit}`).to.exist
    expect(
      room?.status,
      `ห้อง ${unit} ต้องว่างก่อนเริ่ม ถ้ามีสัญญาของ "${namePrefix} ..." ค้าง ให้ Check Out ที่ Dashboard ก่อน`,
    ).to.eq('AVAILABLE')

    return api<{ id: number }>('POST', '/api/tenants', {
      fullName: tenantName,
      nationalId: newThaiNationalId(),
      phone: '089-123-4567',
    }).then((tenant) => {
      expect(tenant.status, 'สร้างผู้เช่าของเทสไม่สำเร็จ').to.eq(201)
      return api<{ id: number }>('POST', '/api/leases', {
        roomId: room?.id,
        tenantId: tenant.body.id,
        startDate: today,
        billingCycle: 'MONTHLY',
      }).then((lease) => {
        expect(lease.status, 'สร้างสัญญาของเทสไม่สำเร็จ').to.eq(201)
        onCleanup(() => api('POST', `/api/leases/${lease.body.id}/terminate`, { endDate: today }))
        return { tenantName, leaseId: lease.body.id, roomId: room?.id as number }
      })
    })
  })
}
