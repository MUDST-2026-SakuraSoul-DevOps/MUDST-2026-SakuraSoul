/** แบ่งตำแหน่งที่มีค่าเป็นช่วงต่อเนื่อง ช่วงละหนึ่งเส้น ค่า null ตัดเส้นออกเป็นคนละช่วง */
export function continuousRuns(values: (number | null)[]): number[][] {
  const runs: number[][] = []
  let current: number[] = []
  values.forEach((value, index) => {
    if (value === null) {
      if (current.length) runs.push(current)
      current = []
    } else {
      current.push(index)
    }
  })
  if (current.length) runs.push(current)
  return runs
}
