import { pad2, dateKeyOf } from '../lib/format'

export interface CalCell {
  day: number
  key: string
  inMonth: boolean
  isToday: boolean
}

/** Porta renderCal() do protótipo: 42 células (6 semanas), começando na segunda. */
export function buildCalendar(year: number, month: number): CalCell[] {
  const first = new Date(year, month, 1)
  const startDow = (first.getDay() + 6) % 7 // segunda = 0
  const dim = new Date(year, month + 1, 0).getDate()
  const prevDim = new Date(year, month, 0).getDate()
  const todayKey = dateKeyOf(new Date())

  const cells: CalCell[] = []
  for (let i = 0; i < 42; i++) {
    const dayNum = i - startDow + 1
    let inMonth = true
    let dnum = dayNum
    let mm = month
    let yy = year
    if (dayNum < 1) {
      inMonth = false; dnum = prevDim + dayNum; mm = month - 1
      if (mm < 0) { mm = 11; yy-- }
    } else if (dayNum > dim) {
      inMonth = false; dnum = dayNum - dim; mm = month + 1
      if (mm > 11) { mm = 0; yy++ }
    }
    const key = yy + '-' + pad2(mm + 1) + '-' + pad2(dnum)
    cells.push({ day: dnum, key, inMonth, isToday: key === todayKey })
  }
  return cells
}
