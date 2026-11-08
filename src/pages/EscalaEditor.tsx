import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import clsx from 'clsx'
import { AlertTriangle, ArrowLeft, CopyPlus, Plus, Send, Trash2 } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useData, q } from '../lib/useData'
import { supabase, msgErro, dispararWhatsApp } from '../lib/supabase'
import { fmtDiaHora, fmtHora } from '../lib/datas'
import type { Conflito, Escala, Evento, Funcao } from '../lib/types'
import { Botao, Card, Carregando, Iniciais, Painel, Selo, StatusAloc, Vazio, useAviso } from '../components/ui'

interface Aloc { id: string; pessoa_id: string; funcao_id: string | null; status: string; motivo: string | null; notificado_em: string | null; criado_em: string; pessoas: { nome: string } }
interface ConfEscala { alocacao_id: string; descricao: string; origem: string; posterior: boolean }
interface Membro { pessoa_id: string; funcao_ids: string[]; pessoas: { id: string; nome: string } }

export default function EscalaEditor() {
  const { orgId = '', eventoId = '' } = useParams()
  const { orgPorId, gerencio, eu } = useAuth()
  const avisar = useAviso()
  const org = orgPorId.get(orgId)
  const [adicionando, setAdicionando] = useState(false)
  const [publicando, setPublicando] = useState(false)

  const { data, loading, reload } = useData(async () => {
    const [evento, escala, funcoes, membros] = await Promise.all([
      q(supabase.from('eventos').select('*').eq('id', eventoId).single()),
      q(supabase.from('escalas').select('*').eq('evento_id', eventoId).eq('org_id', orgId).maybeSingle()),
      q(supabase.from('funcoes').select('*').eq('org_id', orgId).order('ordem').order('nome')),
      q(supabase.from('vinculos').select('pessoa_id,funcao_ids,pessoas(id,nome)').eq('org_id', orgId).eq('ativo', true)),
    ])
    let alocs: Aloc[] = [], conflitos: ConfEscala[] = []
    if (escala) {
      const [a, c] = await Promise.all([
        q(supabase.from('alocacoes').select('id,pessoa_id,funcao_id,status,motivo,notificado_em,criado_em,pessoas!alocacoes_pessoa_id_fkey(nome)').eq('escala_id', (escala as Escala).id).order('criado_em')),
        q(supabase.rpc('conflitos_escala', { p_escala: (escala as Escala).id })),
      ])
      alocs = a as unknown as Aloc[]; conflitos = c as ConfEscala[]
    }
    const ms = Array.from(new Map((membros as unknown as Membro[]).map((m) => [m.pessoa_id, m])).values()).sort((x, y) => x.pessoas.nome.localeCompare(y.pessoas.nome))
    return { evento: evento as unknown as Evento, escala: escala as unknown as Escala | null, funcoes: funcoes as Funcao[], membros: ms, alocs, conflitos }
  }, [orgId, eventoId])

  const grupos = useMemo(() => {
    if (!data) return []
    const g: { funcao: Funcao | null; alocs: Aloc[] }[] = data.funcoes.map((f) => ({ funcao: f, alocs: data.alocs.filter((a) => a.funcao_id === f.id) }))
    const sem = data.alocs.filter((a) => !a.funcao_id || !data.funcoes.some((f) => f.id === a.funcao_id))
    if (sem.length || !data.funcoes.length) g.push({ funcao: null, alocs: sem })
    return g
  }, [data])

  if (!gerencio(orgId)) return <Card><Vazio titulo="Sem permissão" texto="Você não lidera este ministério." /></Card>
  if (loading || !data || !org) return <Carregando />
  const { evento, escala, alocs, conflitos } = data
  const novos = alocs.filter((a) => !a.notificado_em && a.status === 'pendente').length
  const passado = new Date(evento.fim) < new Date()

  async function garantirEscala(): Promise<string> {
    if (escala) return escala.id
    const { data: s, error } = await supabase.from('escalas').insert({ evento_id: eventoId, org_id: orgId, criado_por: eu!.id }).select('id').single()
    if (error) throw error
    return s.id
  }
  async function remover(a: Aloc) {
    if (a.notificado_em && !confirm(`${a.pessoas.nome} já foi avisado(a). Remover mesmo assim?`)) return
    const { error } = await supabase.from('alocacoes').delete().eq('id', a.id)
    if (error) return avisar(msgErro(error), 'erro')
    reload()
  }
  async function publicar() {
    setPublicando(true)
    const { data: n, error } = await supabase.rpc('publicar_escala', { p_escala: escala!.id })
    setPublicando(false)
    if (error) return avisar(msgErro(error), 'erro')
    dispararWhatsApp()
    avisar(n ? `Escala publicada. ${n} pessoa${n > 1 ? 's' : ''} avisada${n > 1 ? 's' : ''} no WhatsApp.` : 'Escala publicada.')
    reload()
  }
  async function copiarAnterior() {
    const { data: ant } = await supabase.from('escalas').select('id,eventos!inner(titulo,inicio),alocacoes(pessoa_id,funcao_id,status)')
      .eq('org_id', orgId).eq('eventos.titulo', evento.titulo).lt('eventos.inicio', evento.inicio)
    const fonte = ((ant ?? []) as any[]).sort((a, b) => b.eventos.inicio.localeCompare(a.eventos.inicio)).find((s) => s.alocacoes.length)
    if (!fonte) return avisar('Nenhuma escala anterior deste mesmo evento para copiar.', 'erro')
    try {
      const id = await garantirEscala()
      const linhas = (fonte.alocacoes as any[]).filter((a) => a.status !== 'recusada')
        .filter((a) => !alocs.some((x) => x.pessoa_id === a.pessoa_id && x.funcao_id === a.funcao_id))
        .map((a) => ({ escala_id: id, pessoa_id: a.pessoa_id, funcao_id: a.funcao_id, criado_por: eu!.id }))
      if (linhas.length) { const { error } = await supabase.from('alocacoes').insert(linhas); if (error) throw error }
      avisar(`${linhas.length} pessoa${linhas.length !== 1 ? 's' : ''} copiada${linhas.length !== 1 ? 's' : ''} de ${fmtDiaHora(fonte.eventos.inicio)}.`)
      reload()
    } catch (e) { avisar(msgErro(e), 'erro') }
  }

  return (
    <div>
      <Link to={`/ministerios/${orgId}`} className="inline-flex items-center gap-1 text-sm text-white/50 mb-2"><ArrowLeft className="h-4 w-4" />{org.nome}</Link>
      <h1 className="font-titulo text-[22px] font-bold text-white leading-tight">{evento.titulo}</h1>
      <p className="text-sm text-white/60 mt-1">{fmtDiaHora(evento.inicio)} – {fmtHora(evento.fim)}{evento.local ? ` · ${evento.local}` : ''}</p>
      <div className="flex gap-2 mt-3 mb-5 flex-wrap">
        <Selo cor="claro">Escala: {org.nome}</Selo>
        {!escala || !escala.publicada ? <Selo cor="amarelo">Rascunho — ninguém foi avisado</Selo> : <Selo cor="verde">Publicada</Selo>}
        {evento.cancelado && <Selo cor="vermelho">Evento cancelado</Selo>}
      </div>

      {!passado && !evento.cancelado && (
        <div className="flex gap-2 mb-5">
          <Botao className="flex-1" onClick={() => setAdicionando(true)}><Plus className="h-4 w-4" />Escalar pessoa</Botao>
          {alocs.length === 0 && <Botao variante="secundario" onClick={copiarAnterior} title="Copiar a escala anterior deste mesmo evento"><CopyPlus className="h-4 w-4" />Copiar anterior</Botao>}
        </div>
      )}

      {alocs.length === 0 ? <Card><Vazio titulo="Escala vazia" texto="Toque em Escalar pessoa para começar. Nada é enviado até você publicar." /></Card> : (
        <div className="space-y-4">
          {grupos.map((g) => (
            <section key={g.funcao?.id ?? 'sem'}>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-white/50 mb-2">{g.funcao?.nome ?? 'Sem função definida'} <span className="text-white/30">· {g.alocs.length}</span></h2>
              {g.alocs.length === 0 ? <p className="text-sm text-white/40 mb-1">Ninguém escalado.</p> : (
                <Card className="divide-y divide-white/[0.06]">
                  {g.alocs.map((a) => {
                    const cs = conflitos.filter((c) => c.alocacao_id === a.id)
                    const vermelho = cs.some((c) => c.posterior)
                    return (
                      <div key={a.id} className={clsx('p-3.5', vermelho && 'bg-red-500/10')}>
                        <div className="flex items-center gap-3">
                          <Iniciais nome={a.pessoas.nome} />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{a.pessoas.nome}</p>
                            {a.status === 'recusada' && a.motivo && <p className="text-xs text-red-300">Motivo: {a.motivo}</p>}
                          </div>
                          {escala?.publicada && a.notificado_em ? <StatusAloc status={a.status} /> : <Selo>Não avisado</Selo>}
                          {!passado && <button onClick={() => remover(a)} className="p-2 -mr-2 text-white/35 hover:text-red-300" aria-label="Remover"><Trash2 className="h-4 w-4" /></button>}
                        </div>
                        {cs.map((c, i) => (
                          <p key={i} className={clsx('mt-2 ml-12 text-xs flex items-start gap-1.5', c.posterior ? 'text-red-300 font-medium' : 'text-amber-200')}>
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
                            {c.origem === 'indisponivel' ? c.descricao : c.posterior ? `Conflito: já estava escalado(a) em ${c.descricao}` : `Também escalado(a) depois em ${c.descricao} — esta escala tem prioridade`}
                          </p>
                        ))}
                      </div>
                    )
                  })}
                </Card>
              )}
            </section>
          ))}
        </div>
      )}

      {escala && alocs.length > 0 && !passado && !evento.cancelado && (!escala.publicada || novos > 0) && (
        <div className="sticky bottom-[calc(84px+env(safe-area-inset-bottom))] md:bottom-4 mt-6">
          <Botao className="w-full h-12 shadow-lg" onClick={publicar} carregando={publicando}>
            <Send className="h-4 w-4" />{!escala.publicada ? `Publicar e avisar ${alocs.length} pessoa${alocs.length > 1 ? 's' : ''}` : `Avisar ${novos} nova${novos > 1 ? 's' : ''} pessoa${novos > 1 ? 's' : ''}`}
          </Botao>
        </div>
      )}

      <PainelEscalar aberto={adicionando} onFechar={() => setAdicionando(false)} evento={evento} escalaId={escala?.id ?? null}
        funcoes={data.funcoes} membros={data.membros} alocs={alocs} garantirEscala={garantirEscala} onMudou={reload} />
    </div>
  )
}

function PainelEscalar({ aberto, onFechar, evento, escalaId, funcoes, membros, alocs, garantirEscala, onMudou }: {
  aberto: boolean; onFechar: () => void; evento: Evento; escalaId: string | null; funcoes: Funcao[]; membros: Membro[]; alocs: Aloc[]
  garantirEscala: () => Promise<string>; onMudou: () => void
}) {
  const { eu } = useAuth()
  const avisar = useAviso()
  const [funcao, setFuncao] = useState<string>('')
  const [conf, setConf] = useState<Map<string, Conflito[]>>(new Map())
  useEffect(() => {
    if (!aberto) return
    if (!funcao && funcoes[0]) setFuncao(funcoes[0].id)
    supabase.rpc('conflitos_pessoas', { p_pessoas: membros.map((m) => m.pessoa_id), p_inicio: evento.inicio, p_fim: evento.fim, p_ignorar_escala: escalaId })
      .then(({ data }) => {
        const m = new Map<string, Conflito[]>()
        ;((data ?? []) as Conflito[]).forEach((c) => m.set(c.pessoa_id, [...(m.get(c.pessoa_id) ?? []), c]))
        setConf(m)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, escalaId, membros, evento.inicio, evento.fim])
  const [salvando, setSalvando] = useState<string | null>(null)

  const ordenados = [...membros].sort((a, b) => {
    const fa = funcao && a.funcao_ids.includes(funcao) ? 0 : 1, fb = funcao && b.funcao_ids.includes(funcao) ? 0 : 1
    const ca = conf.has(a.pessoa_id) ? 1 : 0, cb = conf.has(b.pessoa_id) ? 1 : 0
    return fa - fb || ca - cb || a.pessoas.nome.localeCompare(b.pessoas.nome)
  })

  async function escalar(m: Membro) {
    const cs = conf.get(m.pessoa_id)
    if (cs?.length && !confirm(`${m.pessoas.nome}: ${cs.map((c) => c.descricao).join('; ')}.\n\nEscalar mesmo assim?`)) return
    setSalvando(m.pessoa_id)
    try {
      const id = await garantirEscala()
      const { error } = await supabase.from('alocacoes').insert({ escala_id: id, pessoa_id: m.pessoa_id, funcao_id: funcao || null, criado_por: eu!.id })
      if (error) throw error
      onMudou()
    } catch (e) { avisar(msgErro(e), 'erro') }
    setSalvando(null)
  }

  return (
    <Painel aberto={aberto} onFechar={onFechar} titulo="Escalar pessoa">
      {funcoes.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-3 -mx-5 px-5">
          {funcoes.map((f) => (
            <button key={f.id} onClick={() => setFuncao(f.id)} className={clsx('shrink-0 rounded-full px-3.5 h-8 text-sm font-medium border',
              funcao === f.id ? 'bg-verde-claro text-escuro border-verde-claro' : 'bg-white/[0.04] border-white/[0.08] text-white/70')}>{f.nome}</button>
          ))}
          <button onClick={() => setFuncao('')} className={clsx('shrink-0 rounded-full px-3.5 h-8 text-sm font-medium border',
            funcao === '' ? 'bg-verde-claro text-escuro border-verde-claro' : 'bg-white/[0.04] border-white/[0.08] text-white/70')}>Sem função</button>
        </div>
      )}
      {membros.length === 0 ? <Vazio titulo="Nenhuma pessoa no ministério" texto="Adicione pessoas na aba Pessoas do ministério." /> : (
        <div className="space-y-1.5">
          {ordenados.map((m) => {
            const ja = alocs.some((a) => a.pessoa_id === m.pessoa_id && (a.funcao_id ?? '') === funcao)
            const cs = conf.get(m.pessoa_id)
            const temFuncao = !funcao || m.funcao_ids.includes(funcao)
            return (
              <button key={m.pessoa_id} disabled={ja || salvando === m.pessoa_id} onClick={() => escalar(m)}
                className={clsx('w-full text-left flex items-center gap-3 rounded-xl p-2.5 border transition disabled:opacity-50',
                  cs ? 'bg-red-500/10 border-red-400/25' : 'bg-white/[0.04] border-white/[0.08] hover:border-verde-glow/40')}>
                <Iniciais nome={m.pessoas.nome} />
                <div className="flex-1 min-w-0">
                  <p className={clsx('font-medium truncate', !temFuncao && 'text-white/50')}>{m.pessoas.nome}</p>
                  {cs ? cs.map((c, i) => <p key={i} className="text-xs text-red-300 truncate">{c.origem === 'indisponivel' ? c.descricao : `Já escalado: ${c.descricao}`}</p>)
                    : !temFuncao ? <p className="text-xs text-white/40">Não tem esta função</p> : null}
                </div>
                {ja ? <Selo cor="verde">Escalado</Selo> : <Plus className="h-5 w-5 text-verde-glow" />}
              </button>
            )
          })}
        </div>
      )}
    </Painel>
  )
}
