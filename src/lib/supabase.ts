import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true },
})

/** Dispara a fila de WhatsApp em segundo plano (não bloqueia a tela). */
export function dispararWhatsApp() {
  supabase.functions.invoke('whatsapp', { body: {} }).catch(() => {})
}

export function msgErro(e: unknown): string {
  if (!e) return 'Erro desconhecido.'
  if (typeof e === 'string') return e
  const m = (e as { message?: string }).message ?? String(e)
  if (m.includes('Invalid login credentials')) return 'E-mail ou senha incorretos.'
  return m
}
