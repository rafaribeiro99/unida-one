import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import clsx from 'clsx'
import { AlertTriangle, ArrowLeft, Check, ChevronDown, ClipboardList, MapPin, MessageCircle, Pencil, Trash2, X } from 'lucide-react'
import { carregarMeusLideres } from '../lib/contatos'
import { linkWhats } from '../lib/whats'
import { useAuth } from '../lib/auth'
import { useData, q } from '../lib/useData'
import { supabase, msgErro, dispararWhatsApp } from '../lib/supabase'
import { d, fmtHora } from '../lib/datas'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { TIPO_EVENTO_LABEL, type Evento } from '../lib/types'
import { Botao, Card, Carregando, Iniciais, Selo, StatusAloc, Vazio, useAviso } from '../components/ui'
import { FormEvento } from '../components/Eventos'

export interface Equipe {
  id: string; org_id: string; publicada: boolean; org: { nome: string }; veStatus: boolean
  /** status e motivo vêm nulos quando o usuário não pode vê-los */
  alocacoes: { id: string; pessoa_id: string; status: string | null; motivo: string | null; pessoas: { nome: string }; funcoes: { nome: string; ordem: number } | null }[]
}

interface LinhaRpc { escala_id: string; org_id: string; org_nome: string; publicada: boolean; alocacao_id: string; pessoa_id: string; nome: string; funcao: string | null; funcao_ordem: number; status: string | null; motivo: string | null; ve_status: boolean }

export async function carregarEquipes(eventoId: string): Promise<Equipe[]> {
  const linhas = (await q(supabase.rpc('equipes_do_culto', { p_evento: eventoId }))) as LinhaRpc[]
  const m = new Map<string, Equipe>()
  linhas.forEach((l) => {
    if (!m.has(l.escala_id)) m.set(l.escala_id, { id: l.escala_id, org_id: l.org_id, publicada: l.publicada, org: { nome: l.org_nome }, veStatus: l.ve_status, alocacoes: [] })
    m.get(l.escala_id)!.alocacoes.push({ id: l.alocacao_id, pessoa_id: l.pessoa_id, status: l.status, motivo: l.motivo, pessoas: { nome: l.nome },
      funcoes: l.funcao ? { nome: l.funcao, ordem: l.funcao_ordem } : null })
  })
  return [...m.values()]
}

const ESCALAVEIS = ['pilar', 'ministerio', 'equipe']

export default function Culto() {
  const { id = '' } = useParams()
  const { eu, orgs, gerencio, visaoGeral, secretaria, supervisiono } = useAuth()
  const nav = useNavigate()
  const avisar = useAviso()
  const [abertos, setAbertos] = useState<Set<string> | null>(null)
  const [editando, setEditando] = useState(false)
  const [cancelando, setCancelando] = useState(false)

  const { data, loading, reload } = useData(async () => {
    const [evento, equipes, lideres] = await Promise.all([
      q(supabase.from('eventos').select('*').eq('id', id).single()),
      carregarEquipes(id),
      carregarMeusLideres(),
    ])
    return { evento: evento as unknown as Evento, equipes, lideres }
  }, [id])

  const ordenadas = useMemo(() => (data?.equipes ?? [])
    .filter((e) => e.alocacoes.length || gerencio(e.org_id))
    .sort((a, b) => (a.org.nome === 'Pastoral' ? -1 : b.org.nome === 'Pastoral' ? 1 : a.org.nome.localeCompare(b.org.nome))), [data, gerencio])

  if (loading || !data) return <Carregando />
  const { evento } = data
  const minha0 = ordenadas.flatMap((e) => e.alocacoes.map((a) => ({ ...a, equipe: e }))).find((a) => a.pessoa_id === eu?.id)
  const lideres = minha0 ? data.lideres.filter((l) => l.org_id === minha0.equipe.org_id && l.telefone) : []
  const minha = ordenadas.flatMap((e) => e.alocacoes.map((a) => ({ ...a, equipe: e }))).find((a) => a.pessoa_id === eu?.id)
  const visiveis = ordenadas.filter((e) => e.veStatus)
  const todas = visiveis.flatMap((e) => e.alocacoes)
  const ativas = todas.filter((a) => a.status !== 'recusada')
  const pessoasNoCulto = ordenadas.flatMap((e) => e.alocacoes).filter((a) => a.status !== 'recusada').length
  const conf = ativas.filter((a) => a.status === 'confirmada').length
  const recusas = todas.filter((a) => a.status === 'recusada').length
  const pct = ativas.length ? Math.round((conf / ativas.length) * 100) : 0
  const comEscala = new Set(ordenadas.map((e) => e.org_id))
  const semEscala = visaoGeral && ['culto', 'ebd', 'evento'].includes(evento.tipo)
    ? orgs.filter((o) => ESCALAVEIS.includes(o.tipo) && !comEscala.has(o.id) && !['Ministerial', 'Grupos Pequenos'].includes(o.nome) && (o.tipo !== 'pilar' || o.nome === 'Pastoral' || o.nome === 'Escola Bíblica'))
    : []
  const padraoAbertos = new Set(ordenadas.filter((e) => !visaoGeral && (e.alocacoes.some((a) => a.pessoa_id === eu?.id) || gerencio(e.org_id))).map((e) => e.id))
  const abertosAtual = abertos ?? padraoAbertos
  const alternar = (k: string) => { const n = new Set(abertosAtual); n.has(k) ? n.delete(k) : n.add(k); setAbertos(n) }
  const tudoAberto = ordenadas.length > 0 && ordenadas.every((e) => abertosAtual.has(e.id))
  const podeEditar = secretaria || (!!evento.org_id && gerencio(evento.org_id))
  const direto = secretaria || (!!evento.org_id && supervisiono(evento.org_id)) || (!!evento.org_id && ['ensaio', 'reuniao'].includes(evento.tipo) && gerencio(evento.org_id))
  const passado = d(evento.fim) < new Date()

  async function responder(confirmar: boolean) {
    const motivo = confirmar ? null : prompt('Motivo (opcional):') ?? undefined
    if (motivo === undefined) return
    const { error } = await supabase.rpc('responder_alocacao', { p_alocacao: minha!.id, p_confirmar: confirmar, p_motivo: motivo })
    if (error) return avisar(msgErro(error), 'erro')
    if (!confirmar) dispararWhatsApp()
    avisar(confirmar ? 'Presença confirmada!' : 'Seu líder foi avisado.'); reload()
  }
  async function cancelar(serie: boolean) {
    const { data: r, error } = await supabase.rpc('salvar_evento', { p_acao: 'cancelar', p_evento: evento.id, p_dados: { serie } })
    if (error) return avisar(msgErro(error), 'erro')
    dispararWhatsApp(); avisar(r?.status === 'pendente' ? 'Pedido de cancelamento enviado.' : 'Evento cancelado.')
    setCancelando(false); reload()
  }

  return (
    <div className="space-y-5">
      <button onClick={() => nav(-1)} className="inline-flex items-center gap-1 text-sm text-grafite/50"><ArrowLeft className="h-4 w-4" />Voltar</button>

      {/* Resumo */}
      <section className="bloco-marca rounded-[28px] p-5 text-white shadow-[0_16px_40px_-20px_rgba(11,46,38,0.8)]">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold text-verde-glow">{TIPO_EVENTO_LABEL[evento.tipo]}</span>
          {evento.cancelado && <span className="rounded-full bg-red-500/80 px-2.5 py-0.5 text-[11px] font-semibold">Cancelado</span>}
        </div>
        <h1 className="font-titulo text-[26px] leading-tight font-extrabold tracking-tight mt-3">{evento.titulo}</h1>
        <p className="text-white/70 text-sm mt-1.5 first-letter:uppercase">{format(d(evento.inicio), "EEEE, d 'de' MMMM", { locale: ptBR })} · {fmtHora(evento.inicio)}–{fmtHora(evento.fim)}</p>
        {evento.local && <p className="text-white/50 text-xs mt-1 flex items-center gap-1"><MapPin className="h-3 w-3" />{evento.local}</p>}

        <div className={clsx('grid gap-2 mt-5', visiveis.length ? 'grid-cols-3' : 'grid-cols-2')}>
          <Numero valor={ordenadas.length} rotulo="ministérios" />
          <Numero valor={pessoasNoCulto} rotulo="servindo" />
          {visiveis.length > 0 && <Numero valor={ativas.length ? `${pct}%` : '–'} rotulo={visaoGeral ? 'confirmados' : 'confirmados na sua equipe'} destaque />}
        </div>
        {visiveis.length > 0 && ativas.length > 0 && (
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mt-3">
            <div className="h-full rounded-full bg-gradient-to-r from-verde-claro to-verde-glow" style={{ width: `${pct}%` }} />
          </div>
        )}
        {recusas > 0 && (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-red-500/20 px-3 py-1 text-xs font-medium text-red-100">
            <AlertTriangle className="h-3.5 w-3.5" />{recusas} {recusas > 1 ? 'pessoas não poderão' : 'pessoa não poderá'} servir
          </p>
        )}
      </section>

      {/* Minha participação */}
      {minha && (
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-grafite/50">Você serve neste culto</p>
              <p className="font-titulo font-bold text-verde">{minha.equipe.org.nome}{minha.funcoes ? ` · ${minha.funcoes.nome}` : ''}</p>
            </div>
            <StatusAloc status={minha.status ?? 'pendente'} />
          </div>
          {lideres.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {lideres.map((l) => (
                <a key={l.pessoa_id} href={linkWhats(l.telefone, `Olá, ${l.nome.split(' ')[0]}! Sobre a escala de ${evento.titulo}:`)} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                  <MessageCircle className="h-3.5 w-3.5" />Falar com {l.nome.split(' ')[0]}{l.papel !== 'lider' ? ` (${l.papel})` : ''}
                </a>
              ))}
            </div>
          )}
          {minha.status === 'pendente' && !passado && (
            <div className="flex gap-2 mt-3">
              <Botao className="flex-1 h-10" onClick={() => responder(true)}><Check className="h-4 w-4" />Confirmar</Botao>
              <Botao variante="secundario" className="h-10" onClick={() => responder(false)}><X className="h-4 w-4" />Não posso</Botao>
            </div>
          )}
        </Card>
      )}

      {/* Equipes */}
      <section>
        <div className="flex items-center justify-between mb-2.5 px-1">
          <h2 className="font-titulo font-bold text-verde">Equipes</h2>
          {ordenadas.length > 1 && (
            <button className="text-xs font-semibold text-verde-2" onClick={() => setAbertos(tudoAberto ? new Set() : new Set(ordenadas.map((e) => e.id)))}>
              {tudoAberto ? 'Recolher tudo' : 'Expandir tudo'}
            </button>
          )}
        </div>
        {ordenadas.length === 0 ? (
          <Card><Vazio icone={<ClipboardList className="h-6 w-6" />} titulo="Nenhuma escala publicada" texto="Quando os ministérios publicarem as escalas deste culto, as equipes aparecem aqui." /></Card>
        ) : (
          <div className="space-y-2.5">
            {ordenadas.map((e) => <LinhaEquipe key={e.id} e={e} aberta={abertosAtual.has(e.id)} onAlternar={() => alternar(e.id)}
              gere={gerencio(e.org_id)} eventoId={evento.id} meuId={eu?.id} />)}
          </div>
        )}
        {semEscala.length > 0 && (
          <div className="mt-3 rounded-[20px] border border-dashed border-black/10 px-4 py-3">
            <p className="text-xs font-semibold text-grafite/50 mb-2">Sem escala neste culto</p>
            <div className="flex flex-wrap gap-1.5">
              {semEscala.map((o) => gerencio(o.id) && !passado
                ? <Link key={o.id} to={`/ministerios/${o.id}/escala/${evento.id}`} className="rounded-full bg-verde-claro/40 px-2.5 py-1 text-xs font-medium text-verde">+ {o.nome}</Link>
                : <span key={o.id} className="rounded-full bg-black/[0.04] px-2.5 py-1 text-xs text-grafite/55">{o.nome}</span>)}
            </div>
          </div>
        )}
      </section>

      {podeEditar && !evento.cancelado && !passado && (
        <div className="flex gap-2">
          <Botao variante="secundario" className="flex-1" onClick={() => setEditando(true)}><Pencil className="h-4 w-4" />{direto ? 'Editar evento' : 'Pedir alteração'}</Botao>
          <Botao variante="perigo" onClick={() => setCancelando(true)}><Trash2 className="h-4 w-4" /></Botao>
        </div>
      )}
      {cancelando && (
        <Card className="p-4 space-y-2">
          <p className="text-sm text-red-700">{direto ? 'Cancelar este evento? Quem está escalado será avisado.' : 'Pedir o cancelamento deste evento?'}</p>
          <div className="flex gap-2 flex-wrap">
            <Botao variante="perigo" className="h-9" onClick={() => cancelar(false)}>Só este</Botao>
            {evento.serie_id && <Botao variante="perigo" className="h-9" onClick={() => cancelar(true)}>Este e os próximos</Botao>}
            <Botao variante="fantasma" className="h-9" onClick={() => setCancelando(false)}>Voltar</Botao>
          </div>
        </Card>
      )}
      <FormEvento aberto={editando} onFechar={() => setEditando(false)} evento={evento} onSalvo={reload} />
    </div>
  )
}

function Numero({ valor, rotulo, destaque }: { valor: number | string; rotulo: string; destaque?: boolean }) {
  return (
    <div className="rounded-2xl bg-white/[0.07] px-3 py-2.5">
      <p className={clsx('font-titulo text-[22px] font-extrabold leading-none', destaque && 'text-verde-glow')}>{valor}</p>
      <p className="text-[11px] text-white/55 mt-1">{rotulo}</p>
    </div>
  )
}

function LinhaEquipe({ e, aberta, onAlternar, gere, eventoId, meuId }: { e: Equipe; aberta: boolean; onAlternar: () => void; gere: boolean; eventoId: string; meuId?: string }) {
  const ativas = e.alocacoes.filter((a) => a.status !== 'recusada')
  const conf = ativas.filter((a) => a.status === 'confirmada').length
  const rec = e.alocacoes.length - ativas.length
  const cor = !e.veStatus ? null : rec ? 'bg-red-500' : conf === ativas.length && ativas.length ? 'bg-emerald-500' : 'bg-amber-400'
  const grupos = useMemo(() => {
    const m = new Map<string, Equipe['alocacoes']>()
    ;[...e.alocacoes].sort((a, b) => (a.funcoes?.ordem ?? 99) - (b.funcoes?.ordem ?? 99)).forEach((a) => {
      const k = a.funcoes?.nome ?? 'Equipe'; m.set(k, [...(m.get(k) ?? []), a])
    })
    return [...m.entries()]
  }, [e])
  return (
    <Card className="overflow-hidden">
      <button onClick={onAlternar} className="w-full flex items-center gap-3 p-3.5 text-left">
        <div className="relative h-10 w-10 shrink-0 rounded-[14px] bg-verde text-verde-claro grid place-items-center font-titulo font-extrabold">
          {e.org.nome[0]}
          {cor && <span className={clsx('absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-white', cor)} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-verde truncate">{e.org.nome}{!e.publicada && <span className="ml-2 align-middle"><Selo cor="amarelo">Rascunho</Selo></span>}</p>
          <p className="text-xs text-grafite/55">{ativas.length} {ativas.length === 1 ? 'pessoa' : 'pessoas'}{e.veStatus ? ` · ${conf} confirmad${conf === 1 ? 'a' : 'as'}${rec ? ` · ${rec} não pode${rec > 1 ? 'm' : ''}` : ''}` : ''}</p>
        </div>
        <ChevronDown className={clsx('h-5 w-5 text-grafite/30 transition', aberta && 'rotate-180')} />
      </button>
      {aberta && (
        <div className="px-3.5 pb-3.5 space-y-3">
          {grupos.map(([funcao, lista]) => (
            <div key={funcao}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-grafite/40 mb-1.5">{funcao}</p>
              <div className="space-y-1.5">
                {lista.map((a) => (
                  <div key={a.id} className={clsx('flex items-center gap-2.5 rounded-xl px-2.5 py-2', a.pessoa_id === meuId ? 'bg-verde-claro/25' : 'bg-black/[0.025]')}>
                    <Iniciais nome={a.pessoas.nome} className="h-8 w-8 text-[11px]" />
                    <div className="flex-1 min-w-0">
                      <p className={clsx('text-sm font-medium truncate', a.status === 'recusada' && 'line-through text-grafite/40')}>{a.pessoas.nome}{a.pessoa_id === meuId ? ' (você)' : ''}</p>
                      {a.status === 'recusada' && a.motivo && <p className="text-[11px] text-red-500">{a.motivo}</p>}
                    </div>
                    {a.status && <StatusAloc status={a.status} />}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {gere && <Link to={`/ministerios/${e.org_id}/escala/${eventoId}`} className="block"><Botao variante="secundario" className="w-full h-10"><Pencil className="h-4 w-4" />Editar escala</Botao></Link>}
        </div>
      )}
    </Card>
  )
}
