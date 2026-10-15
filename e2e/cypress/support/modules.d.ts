// แพ็กเกจของรายงาน HTML ไม่มีไฟล์ type ของสองจุดนี้มาให้
declare module 'cypress-mochawesome-reporter/plugin' {
  const plugin: (on: Cypress.PluginEvents) => void
  export default plugin
}

declare module 'cypress-mochawesome-reporter/register'
