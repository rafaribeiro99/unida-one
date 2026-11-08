import { format, isToday, isTomorrow, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export const d = (s: string) => parseISO(s)
export const fmtDia = (s: string) => {
  const x = d(s)
  if (isToday(x)) return 'Hoje'
  if (isTomorrow(x)) return 'Amanhã'
  return format(x, "EEE, dd 'de' MMM", { locale: ptBR })
}
export const fmtHora = (s: string) => format(d(s), 'HH:mm')
export const fmtDiaHora = (s: string) => `${fmtDia(s)} · ${fmtHora(s)}`
export const fmtDataCurta = (s: string) => format(d(s), 'dd/MM/yyyy')
export const fmtMes = (x: Date) => format(x, "MMMM 'de' yyyy", { locale: ptBR })
/** Valor para <input type="datetime-local"> no fuso local */
export const paraInput = (s: string | Date) => format(typeof s === 'string' ? d(s) : s, "yyyy-MM-dd'T'HH:mm")
export const deInput = (v: string) => new Date(v).toISOString()
