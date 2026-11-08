// Ativa o acesso de uma pessoa a partir do link de convite: cria o login (e-mail + senha) e vincula ao cadastro.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { token, email, senha } = await req.json()
    if (!token || !email || !senha) return json({ erro: 'Preencha e-mail e senha.' })
    if (String(senha).length < 6) return json({ erro: 'A senha precisa ter pelo menos 6 caracteres.' })
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: info } = await sb.rpc('info_convite', { p_token: token })
    if (!info?.valido) return json({ erro: 'Este convite não é mais válido. Peça um novo link ao seu líder.' })

    const mail = String(email).trim().toLowerCase()
    const { data: criado, error } = await sb.auth.admin.createUser({ email: mail, password: senha, email_confirm: true, user_metadata: { nome: info.nome } })
    if (error) {
      const msg = /already|registered|exists/i.test(error.message) ? 'Este e-mail já tem acesso. Use outro e-mail ou entre com sua senha.' : error.message
      return json({ erro: msg })
    }
    const { error: e2 } = await sb.rpc('vincular_convite', { p_token: token, p_user: criado.user.id })
    if (e2) { await sb.auth.admin.deleteUser(criado.user.id); return json({ erro: e2.message }) }
    await sb.from('pessoas').update({ email: mail }).eq('user_id', criado.user.id)
    return json({ ok: true })
  } catch (e) {
    return json({ erro: String((e as Error).message ?? e) }, 500)
  }
})
