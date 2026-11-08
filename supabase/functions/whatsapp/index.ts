// Processa a fila de notificações e envia pelo WhatsApp via Evolution API.
// Variáveis: EVOLUTION_URL, EVOLUTION_INSTANCE, EVOLUTION_APIKEY (opcional EVOLUTION_V1=1 para a API v1)
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const url = Deno.env.get('EVOLUTION_URL'), inst = Deno.env.get('EVOLUTION_INSTANCE'), key = Deno.env.get('EVOLUTION_APIKEY')
  if (!url || !inst || !key) return json({ configurado: false, enviadas: 0, erros: 0 })

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  await sb.rpc('destravar_fila')
  const { data: fila, error } = await sb.rpc('pegar_fila', { p_n: 20 })
  if (error) return json({ erro: error.message }, 500)

  const v1 = Deno.env.get('EVOLUTION_V1') === '1'
  let enviadas = 0, erros = 0
  for (const m of fila ?? []) {
    if (!m.telefone) { await sb.rpc('marcar_envio', { p_id: m.id, p_ok: false, p_erro: 'sem telefone' }); erros++; continue }
    try {
      const r = await fetch(`${url.replace(/\/$/, '')}/message/sendText/${inst}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: key },
        body: JSON.stringify(v1 ? { number: m.telefone, textMessage: { text: m.mensagem } } : { number: m.telefone, text: m.mensagem }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`)
      await sb.rpc('marcar_envio', { p_id: m.id, p_ok: true })
      enviadas++
    } catch (e) {
      await sb.rpc('marcar_envio', { p_id: m.id, p_ok: false, p_erro: String((e as Error).message ?? e) })
      erros++
    }
    await espera(1200) // ritmo humano, reduz risco de bloqueio do número
  }
  return json({ configurado: true, enviadas, erros })
})
