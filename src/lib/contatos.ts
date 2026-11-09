import { supabase } from './supabase'

/** Telefone e e-mail das pessoas que o usuário pode ver (as demais simplesmente não voltam) */
export async function carregarContatos(ids: string[]) {
  if (!ids.length) return new Map<string, { telefone: string | null; email: string | null }>()
  const { data } = await supabase.rpc('contatos', { p_ids: ids })
  return new Map(((data ?? []) as { id: string; telefone: string | null; email: string | null }[]).map((c) => [c.id, c]))
}

export interface Lider { org_id: string; org_nome: string; pessoa_id: string; nome: string; papel: string; telefone: string | null }
export async function carregarMeusLideres() {
  const { data } = await supabase.rpc('meus_lideres')
  return (data ?? []) as Lider[]
}
