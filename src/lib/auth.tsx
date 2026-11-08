import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Org, Pessoa, Vinculo, Papel } from './types'

const GESTAO: Papel[] = ['coordenador', 'supervisor', 'lider']
const SUPERVISAO: Papel[] = ['coordenador', 'supervisor']
const ESCALAVEIS = ['pilar', 'ministerio', 'equipe', 'curso', 'turma', 'gp']

interface Ctx {
  session: Session | null
  carregando: boolean
  eu: Pessoa | null
  vinculos: Vinculo[]
  orgs: Org[]
  orgPorId: Map<string, Org>
  admin: boolean
  secretaria: boolean
  pastor: boolean
  ancestrais: (id: string | null) => string[]
  gerencio: (id: string | null) => boolean
  supervisiono: (id: string | null) => boolean
  aprovador: boolean
  /** pastor, secretaria, coordenador, supervisor ou admin: vê a dinâmica completa dos cultos */
  visaoGeral: boolean
  /** ministérios/áreas que tenho (como membro ou gestão), já escaláveis */
  minhasAreas: Org[]
  /** áreas onde posso montar escala */
  areasQueGerencio: Org[]
  caminho: (id: string | null) => string
  recarregar: () => Promise<void>
  sair: () => Promise<void>
}

const AuthCtx = createContext<Ctx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [eu, setEu] = useState<Pessoa | null>(null)
  const [vinculos, setVinculos] = useState<Vinculo[]>([])
  const [orgs, setOrgs] = useState<Org[]>([])

  const carregarPerfil = useCallback(async (s: Session | null) => {
    if (!s) { setEu(null); setVinculos([]); setOrgs([]); return }
    const { data: p } = await supabase.from('pessoas').select('*').eq('user_id', s.user.id).maybeSingle()
    setEu(p as Pessoa | null)
    if (p) {
      const [{ data: v }, { data: o }] = await Promise.all([
        supabase.from('vinculos').select('*').eq('pessoa_id', p.id).eq('ativo', true),
        supabase.from('org').select('*').eq('ativo', true).order('ordem').order('nome'),
      ])
      setVinculos((v ?? []) as Vinculo[])
      setOrgs((o ?? []) as Org[])
    }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      await carregarPerfil(data.session)
      setCarregando(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((evt, s) => {
      setSession(s)
      if (evt === 'SIGNED_IN' || evt === 'SIGNED_OUT' || evt === 'USER_UPDATED') {
        setTimeout(() => { carregarPerfil(s) }, 0)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [carregarPerfil])

  const valor = useMemo<Ctx>(() => {
    const orgPorId = new Map(orgs.map((o) => [o.id, o]))
    const ancestrais = (id: string | null) => {
      const r: string[] = []
      let cur = id ? orgPorId.get(id) : undefined
      while (cur) { r.push(cur.id); cur = cur.parent_id ? orgPorId.get(cur.parent_id) : undefined }
      return r
    }
    const admin = !!eu?.is_admin
    const temPapelEm = (id: string | null, papeis: Papel[]) => {
      if (!id) return false
      const anc = new Set(ancestrais(id))
      return vinculos.some((v) => v.ativo && papeis.includes(v.papel) && anc.has(v.org_id))
    }
    const gerencio = (id: string | null) => !!id && (admin || temPapelEm(id, GESTAO))
    const supervisiono = (id: string | null) => !!id && (admin || temPapelEm(id, SUPERVISAO))
    const secretaria = admin || vinculos.some((v) => v.papel === 'secretaria')
    const pastor = admin || vinculos.some((v) => v.papel === 'pastor')
    const aprovador = admin || secretaria || vinculos.some((v) => GESTAO.includes(v.papel))
    const visaoGeral = admin || secretaria || pastor || vinculos.some((v) => SUPERVISAO.includes(v.papel))
    const escalaveis = orgs.filter((o) => ESCALAVEIS.includes(o.tipo) && !(o.tipo === 'pilar' && ['Ministerial', 'Grupos Pequenos'].includes(o.nome)))
    const areasQueGerencio = escalaveis.filter((o) => gerencio(o.id))
    const membroDe = new Set(vinculos.map((v) => v.org_id))
    const minhasAreas = escalaveis.filter((o) => membroDe.has(o.id) || gerencio(o.id))
    const caminho = (id: string | null) => ancestrais(id).reverse().slice(1).map((x) => orgPorId.get(x)?.nome).join(' › ')
    return {
      session, carregando, eu, vinculos, orgs, orgPorId, admin, secretaria, pastor, ancestrais, gerencio, supervisiono,
      aprovador, visaoGeral, minhasAreas, areasQueGerencio, caminho,
      recarregar: () => carregarPerfil(session),
      sair: async () => { await supabase.auth.signOut() },
    }
  }, [session, carregando, eu, vinculos, orgs, carregarPerfil])

  return <AuthCtx.Provider value={valor}>{children}</AuthCtx.Provider>
}

export function useAuth() {
  const c = useContext(AuthCtx)
  if (!c) throw new Error('AuthProvider ausente')
  return c
}
