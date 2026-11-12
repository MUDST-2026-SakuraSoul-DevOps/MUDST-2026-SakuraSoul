// ============================== [NOTE] ==============================
// ไฟล์นี้: บอก TypeScript ว่าแพ็กเกจรายงาน HTML มีหน้าตาอย่างไร เพราะแพ็กเกจไม่มีไฟล์ type มาให้
// ไม่มีโค้ดที่รันจริง ไม่มีเทส มีไว้ให้ npm run typecheck ผ่าน
// ====================================================================

// แพ็กเกจของรายงาน HTML ไม่มีไฟล์ type ของสองจุดนี้มาให้
declare module 'cypress-mochawesome-reporter/plugin' {
  const plugin: (on: Cypress.PluginEvents) => void
  export default plugin
}

declare module 'cypress-mochawesome-reporter/register'
