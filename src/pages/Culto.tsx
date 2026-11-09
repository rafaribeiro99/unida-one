import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import clsx from 'clsx'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  AlertTriangle, ArrowLeft, CalendarDays, Check, CheckCircle2, Clock, Hourglass, ImagePlus, MapPin, MessageCircle, MoreHorizontal,
  Music2, Pencil, Trash2, X, ExternalLink,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useData, q } from '../lib/useData'
import { supabase, msgErro, dispararWhatsApp } from '../lib/supabase'
import { d, fmtHora } from '../lib/datas'
import { TIPO_EVENTO_LABEL, type Evento } from '../lib/types'
import { Botao, Card, Carregando, Iniciais, Painel, StatusAloc, useAviso } from '../components/ui'
import { FormEvento } from '../components/Eventos'
import { carregarMeusLideres } from '../lib/contatos'
import { linkWhats } from '../lib/whats'
import { IconeMinisterio } from '../components/IconeMinisterio'
import { EditorLiturgia, EditorRepertorio, enviarBanner, type ItemLiturgia, type ItemRepertorio } from '../components/Liturgia'

export interface Aloc { id: string; pessoa_id: string; status: string | null; motivo: string | null; nome: string; funcao_id: string | null; funcao: string | null; funcao_ordem: number }
export interface Equipe { id: string; org_id: string; publicada: boolean; nome: string; veStatus: boolean; alocacoes: Aloc[] }

export async function carregarEquipes(eventoId: string): Promise<Equipe[]> {
  const linhas = (await q(supabase.rpc('equipes_do_culto', { p_evento: eventoId }))) as any[]
  const m = new Map<string, Equipe>()
  linhas.forEach((l) => {
    if (!m.has(l.escala_id)) m.set(l.escala_id, { id: l.escala_id, org_id: l.org_id, publicada: l.publicada, nome: l.org_nome, veStatus: l.ve_status, alocacoes: [] })
    m.get(l.escala_id)!.alocacoes.push({ id: l.alocacao_id, pessoa_id: l.pessoa_id, status: l.status, motivo: l.motivo, nome: l.nome,
      funcao_id: l.funcao_id, funcao: l.funcao, funcao_ordem: l.funcao_ordem })
  })
  return [...m.values()].sort((a, b) => (a.nome === 'Pastoral' ? -1 : b.nome === 'Pastoral' ? 1 : a.nome.localeCompare(b.nome)))
}

const primeiro = (n: string) => n.replace(/^(Pr\.|Pra\.)\s+/, '$1 ').split(' ').slice(0, 2).join(' ')

export default function Culto() {
  const { id = '' } = useParams()
  const { eu, orgs, gerencio, visaoGeral, secretaria, supervisiono, pastor } = useAuth()
  const nav = useNavigate()
  const avisar = useAviso()
  const [menu, setMenu] = useState(false)
  const [editando, setEditando] = useState(false)
  const [cancelando, setCancelando] = useState(false)
  const [editLit, setEditLit] = useState(false)
  const [editRep, setEditRep] = useState<string | null>(null)
  const [equipeAberta, setEquipeAberta] = useState<Equipe | null>(null)
  const arquivo = useRef<HTMLInputElement>(null)

  const { data, loading, reload } = useData(async () => {
    const [evento, equipes, lideres, liturgia, repertorio] = await Promise.all([
      q(supabase.from('eventos').select('*').eq('id', id).single()),
      carregarEquipes(id),
      carregarMeusLideres(),
      q(supabase.from('liturgia_itens').select('*').eq('evento_id', id).order('ordem')),
      q(supabase.from('repertorio').select('id,org_id,ordem,tom,observacao,musicas(id,titulo,artista,tom,link,cifra_link)').eq('evento_id', id).order('ordem')),
    ])
    return { evento: evento as unknown as Evento & { banner_url: string | null }, equipes, lideres, liturgia: liturgia as ItemLiturgia[], repertorio: repertorio as unknown as ItemRepertorio[] }
  }, [id])

  const orgRepertorio = useMemo(() => orgs.filter((o) => o.tem_repertorio), [orgs])

  if (loading || !data) return <Carregando />
  const { evento, equipes, liturgia, repertorio } = data
  const passado = d(evento.fim) < new Date()
  const minha = equipes.flatMap((e) => e.alocacoes.map((a) => ({ ...a, equipe: e }))).find((a) => a.pessoa_id === eu?.id)
  const lideres = minha ? data.lideres.filter((l) => l.org_id === minha.equipe.org_id && l.telefone) : []
  const servindo = equipes.flatMap((e) => e.alocacoes).filter((a) => a.status !== 'recusada').length
  const editoLit = pastor || secretaria
  const podeEditar = secretaria || (!!evento.org_id && gerencio(evento.org_id))
  const direto = secretaria || (!!evento.org_id && supervisiono(evento.org_id)) || (!!evento.org_id && ['ensaio', 'reuniao'].includes(evento.tipo) && gerencio(evento.org_id))
  const podeBanner = pastor || secretaria || (!!evento.org_id && gerencio(evento.org_id))
  const repertorioPorOrg = (orgId: string) => repertorio.filter((r) => r.org_id === orgId)
  const equipeDe = (orgId: string | null) => equipes.find((e) => e.org_id === orgId)

  // responsável de um item da liturgia: vem da escala (função) ou do texto
  const responsavel = (it: ItemLiturgia) => {
    if (it.funcao_id) {
      const ps = equipes.flatMap((e) => e.alocacoes).filter((a) => a.funcao_id === it.funcao_id && a.status !== 'recusada')
      if (ps.length) return ps.map((p) => primeiro(p.nome)).join(', ')
      return it.responsavel_texto || 'A definir'
    }
    if (it.responsavel_texto) return it.responsavel_texto
    if (it.org_id) return equipeDe(it.org_id)?.nome ?? orgs.find((o) => o.id === it.org_id)?.nome ?? ''
    return ''
  }

  // acompanhamento (só o que posso ver)
  const visiveis = equipes.filter((e) => e.veStatus)
  const aguardando = visiveis.flatMap((e) => e.alocacoes).filter((a) => a.status === 'pendente').length
  const recusas = visiveis.flatMap((e) => e.alocacoes).filter((a) => a.status === 'recusada')
  const completas = visiveis.filter((e) => e.alocacoes.every((a) => a.status === 'confirmada')).length
  const comEscala = new Set(equipes.map((e) => e.org_id))
  const semEscala = visaoGeral && ['culto', 'ebd', 'evento'].includes(evento.tipo)
    ? orgs.filter((o) => ['ministerio', 'equipe'].includes(o.tipo) && !comEscala.has(o.id) || (o.tipo === 'pilar' && o.nome === 'Pastoral' && !comEscala.has(o.id)))
    : []
  const minhasSemEscala = orgs.filter((o) => ['pilar', 'ministerio', 'equipe'].includes(o.tipo) && gerencio(o.id) && !visaoGeral && !comEscala.has(o.id) && !['Ministerial', 'Grupos Pequenos'].includes(o.nome))

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
  async function trocarBanner(f: File) {
    try {
      const serie = !!evento.serie_id && confirm('Usar este banner também nos próximos eventos desta série?')
      const n = await enviarBanner(evento.id, f, serie)
      avisar(n > 1 ? `Banner aplicado em ${n} eventos.` : 'Banner atualizado.'); reload()
    } catch (e) { avisar(msgErro(e), 'erro') }
  }

  // Liturgia: itens do louvor aparecem com músicas e equipe
  const temLiturgia = liturgia.length > 0
  const orgsComRepSemItem = [...new Set(repertorio.map((r) => r.org_id))].filter((o) => !liturgia.some((it) => it.org_id === o))

  return (
    <div className="space-y-6 -mt-[max(16px,env(safe-area-inset-top))] md:mt-0">
      {/* Topo com banner */}
      <section className="relative -mx-4 md:mx-0 overflow-hidden rounded-b-[32px] md:rounded-[32px] text-white min-h-[300px] flex flex-col">
        {evento.banner_url
          ? <img src={evento.banner_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
          : <div className="absolute inset-0 bloco-marca"><img src="/symbol.png" alt="" className="absolute -right-8 -top-4 h-64 opacity-[0.07]" /></div>}
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-verde/50 to-verde" />
        <div className="relative flex items-center justify-between px-4 pt-[max(14px,env(safe-area-inset-top))]">
          <button onClick={() => nav(-1)} className="h-10 w-10 grid place-items-center rounded-full bg-black/25 backdrop-blur" aria-label="Voltar"><ArrowLeft className="h-5 w-5" /></button>
          {(podeEditar || podeBanner) && !passado && (
            <button onClick={() => setMenu(true)} className="h-10 w-10 grid place-items-center rounded-full bg-black/25 backdrop-blur" aria-label="Opções"><MoreHorizontal className="h-5 w-5" /></button>
          )}
        </div>
        <div className="relative mt-auto px-5 pb-5 pt-10">
          <div className="flex gap-2">
            <span className="rounded-full bg-white/15 backdrop-blur px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider">{TIPO_EVENTO_LABEL[evento.tipo]}</span>
            {evento.cancelado && <span className="rounded-full bg-red-500/90 px-2.5 py-0.5 text-[11px] font-bold">Cancelado</span>}
          </div>
          <h1 className="font-titulo text-[28px] leading-[1.1] font-extrabold tracking-tight mt-2.5">{evento.titulo}</h1>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 text-[13px] text-white/80">
            <span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{(() => { const t = format(d(evento.inicio), "EEEE, d 'de' MMM", { locale: ptBR }); return t[0].toUpperCase() + t.slice(1) })()}</span>
            <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{fmtHora(evento.inicio)}–{fmtHora(evento.fim)}</span>
            {evento.local && <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{evento.local}</span>}
          </div>
          <div className="flex gap-2 mt-4 flex-wrap">
            <Pilula><b>{equipes.length}</b> ministério{equipes.length !== 1 ? 's' : ''}</Pilula>
            <Pilula><b>{servindo}</b> servindo</Pilula>
            {minha && (
              <span className="rounded-full bg-verde-claro text-verde px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />Você serve · {minha.equipe.nome}{minha.funcao ? ` · ${minha.funcao}` : ''}
              </span>
            )}
          </div>
          {minha?.status === 'pendente' && !passado && (
            <div className="flex gap-2 mt-3">
              <Botao className="h-10 flex-1 bg-white text-verde hover:bg-white/90" onClick={() => responder(true)}><Check className="h-4 w-4" />Confirmar presença</Botao>
              <Botao className="h-10 bg-white/15 text-white hover:bg-white/20 shadow-none" onClick={() => responder(false)}><X className="h-4 w-4" />Não posso</Botao>
            </div>
          )}
        </div>
      </section>

      {/* Programação / liturgia */}
      {(temLiturgia || editoLit || repertorio.length > 0) && (
        <section>
          <Titulo acao={editoLit && !passado && <button onClick={() => setEditLit(true)} className="text-xs font-semibold text-verde-2">{temLiturgia ? 'Editar' : 'Montar'}</button>}>
            Programação
          </Titulo>
          {!temLiturgia && !repertorio.length ? (
            <Card className="p-5 text-center">
              <p className="text-sm text-grafite/55">A programação deste culto ainda não foi montada.</p>
              {editoLit && <Botao variante="secundario" className="mt-3 h-10" onClick={() => setEditLit(true)}>Montar programação</Botao>}
            </Card>
          ) : (
            <Card className="py-1.5">
              {liturgia.map((it, i) => {
                const rep = it.org_id ? repertorioPorOrg(it.org_id) : []
                const ehLouvor = !!it.org_id && (rep.length > 0 || orgRepertorio.some((o) => o.id === it.org_id))
                return ehLouvor
                  ? <BlocoLouvor key={it.id} n={i + 1} titulo={it.titulo} horario={it.horario} rep={rep} equipe={equipeDe(it.org_id)}
                      podeEditar={gerencio(it.org_id!) && !passado} onEditar={() => setEditRep(it.org_id)} />
                  : <LinhaLiturgia key={it.id} n={i + 1} titulo={it.titulo} quem={responsavel(it)} horario={it.horario} obs={it.observacao} />
              })}
              {orgsComRepSemItem.map((o, i) => (
                <BlocoLouvor key={o} n={liturgia.length + i + 1} titulo="Louvor" rep={repertorioPorOrg(o)} equipe={equipeDe(o)}
                  podeEditar={gerencio(o) && !passado} onEditar={() => setEditRep(o)} />
              ))}
            </Card>
          )}
        </section>
      )}
      {!temLiturgia && !repertorio.length && !editoLit && orgRepertorio.some((o) => gerencio(o.id)) && !passado && (
        <Botao variante="secundario" className="w-full" onClick={() => setEditRep(orgRepertorio.find((o) => gerencio(o.id))!.id)}><Music2 className="h-4 w-4" />Montar repertório</Botao>
      )}

      {/* Ministérios em serviço */}
      {equipes.length > 0 && (
        <section>
          <Titulo>Ministérios em serviço</Titulo>
          <div className="flex gap-2.5 overflow-x-auto sem-barra -mx-4 px-4 pb-1">
            {equipes.map((e) => {
              const n = e.alocacoes.filter((a) => a.status !== 'recusada').length
              const alerta = e.veStatus && e.alocacoes.some((a) => a.status === 'recusada')
              return (
                <button key={e.id} onClick={() => setEquipeAberta(e)}
                  className="relative shrink-0 w-[92px] rounded-[20px] bg-white border border-black/[0.05] shadow-[0_8px_20px_-14px_rgba(16,24,20,0.25)] py-3.5 flex flex-col items-center gap-1.5 active:scale-[0.97] transition">
                  <IconeMinisterio nome={e.nome} className="h-6 w-6 text-verde-2" />
                  <span className="text-[12px] font-semibold text-verde text-center leading-tight px-1">{e.nome}</span>
                  <span className="font-titulo text-lg font-extrabold text-verde leading-none">{n}</span>
                  {alerta && <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-red-500" />}
                  {!e.publicada && <span className="absolute top-2 left-2 h-2 w-2 rounded-full bg-amber-400" title="Rascunho" />}
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* Acompanhamento: liderado vê só o contato do líder; gestão vê os números */}
      {(visiveis.length > 0 || lideres.length > 0 || semEscala.length > 0 || minhasSemEscala.length > 0) && (
        <section>
          <Titulo>{visiveis.length || semEscala.length ? 'Acompanhamento' : 'Sua equipe'}</Titulo>
          <Card className="divide-y divide-black/[0.05]">
            {visiveis.length > 0 && <LinhaAcomp icone={<CheckCircle2 className="h-[18px] w-[18px] text-emerald-600" />} texto="Equipes 100% confirmadas" valor={`${completas} de ${visiveis.length}`} />}
            {aguardando > 0 && <LinhaAcomp icone={<Hourglass className="h-[18px] w-[18px] text-amber-500" />} texto={`${aguardando} aguardando confirmação`} />}
            {recusas.length > 0 && (
              <LinhaAcomp icone={<AlertTriangle className="h-[18px] w-[18px] text-red-500" />} texto={`${recusas.length} não poder${recusas.length > 1 ? 'ão' : 'á'} servir`} cor="text-red-600"
                sub={recusas.map((r) => `${primeiro(r.nome)}${r.motivo ? ` (${r.motivo})` : ''}`).join(', ')} />
            )}
            {semEscala.length > 0 && <LinhaAcomp icone={<span className="h-[18px] w-[18px] grid place-items-center text-grafite/35">○</span>} texto="Sem escala neste culto" sub={semEscala.map((o) => o.nome).join(', ')} />}
            {minhasSemEscala.map((o) => (
              <Link key={o.id} to={`/ministerios/${o.id}/escala/${evento.id}`}><LinhaAcomp icone={<Pencil className="h-[18px] w-[18px] text-verde-2" />} texto={`Montar escala de ${o.nome}`} seta /></Link>
            ))}
            {lideres.map((l) => (
              <a key={l.pessoa_id} href={linkWhats(l.telefone, `Olá, ${l.nome.split(' ')[0]}! Sobre a escala de ${evento.titulo}:`)} target="_blank" rel="noreferrer">
                <LinhaAcomp icone={<MessageCircle className="h-[18px] w-[18px] text-emerald-600" />} texto={`Falar com ${primeiro(l.nome)}`} sub={l.papel === 'lider' ? `Líder de ${l.org_nome}` : `${l.papel[0].toUpperCase()}${l.papel.slice(1)}`} seta />
              </a>
            ))}
          </Card>
        </section>
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

      <input ref={arquivo} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) trocarBanner(f); e.target.value = '' }} />
      <Painel aberto={menu} onFechar={() => setMenu(false)} titulo="Opções do evento">
        <div className="space-y-2 pb-2">
          {podeBanner && <Botao variante="secundario" className="w-full justify-start" onClick={() => { setMenu(false); arquivo.current?.click() }}><ImagePlus className="h-4 w-4" />Trocar imagem de fundo</Botao>}
          {podeBanner && evento.banner_url && <Botao variante="secundario" className="w-full justify-start" onClick={async () => { setMenu(false); await supabase.rpc('definir_banner', { p_evento: evento.id, p_url: '', p_serie: false }); reload() }}><X className="h-4 w-4" />Remover imagem</Botao>}
          {editoLit && <Botao variante="secundario" className="w-full justify-start" onClick={() => { setMenu(false); setEditLit(true) }}><Pencil className="h-4 w-4" />Editar programação</Botao>}
          {podeEditar && <Botao variante="secundario" className="w-full justify-start" onClick={() => { setMenu(false); setEditando(true) }}><Pencil className="h-4 w-4" />{direto ? 'Editar evento' : 'Pedir alteração do evento'}</Botao>}
          {podeEditar && <Botao variante="perigo" className="w-full justify-start" onClick={() => { setMenu(false); setCancelando(true) }}><Trash2 className="h-4 w-4" />Cancelar evento</Botao>}
        </div>
      </Painel>
      <PainelEquipe equipe={equipeAberta} onFechar={() => setEquipeAberta(null)} meuId={eu?.id} gere={!!equipeAberta && gerencio(equipeAberta.org_id)} eventoId={evento.id} passado={passado} />
      <FormEvento aberto={editando} onFechar={() => setEditando(false)} evento={evento} onSalvo={reload} />
      <EditorLiturgia aberto={editLit} onFechar={() => setEditLit(false)} eventoId={evento.id} itens={liturgia} onMudou={reload} />
      <EditorRepertorio orgId={editRep} onFechar={() => setEditRep(null)} eventoId={evento.id} itens={editRep ? repertorioPorOrg(editRep) : []} onMudou={reload} />
    </div>
  )
}

function Pilula({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-white/12 bg-white/[0.12] backdrop-blur px-3 py-1.5 text-xs text-white/90 [&>b]:font-bold [&>b]:text-white">{children}</span>
}

function Titulo({ children, acao }: { children: ReactNode; acao?: ReactNode }) {
  return <div className="flex items-center justify-between mb-2.5 px-1"><h2 className="font-titulo font-bold text-[17px] text-verde">{children}</h2>{acao}</div>
}

function Numero({ n }: { n: number }) {
  return <span className="h-7 w-7 shrink-0 rounded-full bg-verde-claro/45 text-verde text-xs font-bold grid place-items-center">{n}</span>
}

function LinhaLiturgia({ n, titulo, quem, horario, obs }: { n: number; titulo: string; quem: string; horario: string | null; obs: string | null }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Numero n={n} />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-verde leading-tight">{titulo}</p>
        {(quem || obs) && <p className="text-[13px] text-grafite/55 truncate">{[quem, obs].filter(Boolean).join(' · ')}</p>}
      </div>
      {horario && <span className="text-xs font-semibold text-grafite/40">{horario.slice(0, 5)}</span>}
    </div>
  )
}

function BlocoLouvor({ n, titulo, horario, rep, equipe, podeEditar, onEditar }: { n: number; titulo: string; horario?: string | null; rep: ItemRepertorio[]; equipe?: Equipe; podeEditar: boolean; onEditar: () => void }) {
  const porFuncao = useMemo(() => {
    const m = new Map<string, string[]>()
    ;(equipe?.alocacoes ?? []).filter((a) => a.status !== 'recusada').sort((a, b) => a.funcao_ordem - b.funcao_ordem)
      .forEach((a) => { const k = a.funcao ?? 'Equipe'; m.set(k, [...(m.get(k) ?? []), primeiro(a.nome)]) })
    return [...m.entries()]
  }, [equipe])
  return (
    <div className="mx-2 my-1.5 rounded-[18px] bloco-marca text-white p-4">
      <div className="flex items-center gap-3">
        <span className="h-7 w-7 shrink-0 rounded-full bg-white/15 text-white text-xs font-bold grid place-items-center">{n}</span>
        <p className="flex-1 font-titulo font-bold">{titulo}</p>
        {horario && <span className="text-xs text-white/50">{horario.slice(0, 5)}</span>}
        {podeEditar && <button onClick={onEditar} className="text-xs font-semibold text-verde-glow">{rep.length ? 'Editar' : '+ Músicas'}</button>}
      </div>
      {rep.length > 0 ? (
        <ol className="mt-3 space-y-1.5">
          {rep.map((r) => (
            <li key={r.id} className="flex items-center gap-2.5 rounded-xl bg-white/[0.07] px-3 py-2">
              <Music2 className="h-3.5 w-3.5 text-verde-glow shrink-0" />
              <span className="flex-1 min-w-0 text-sm font-medium truncate">{r.musicas.titulo}{r.musicas.artista && <span className="text-white/45 font-normal"> · {r.musicas.artista}</span>}</span>
              {(r.tom || r.musicas.tom) && <span className="text-[11px] font-bold rounded-md bg-white/10 px-1.5 py-0.5">{r.tom || r.musicas.tom}</span>}
              {r.musicas.link && <a href={r.musicas.link} target="_blank" rel="noreferrer" className="text-white/60" aria-label="Ouvir"><ExternalLink className="h-3.5 w-3.5" /></a>}
              {r.musicas.cifra_link && <a href={r.musicas.cifra_link} target="_blank" rel="noreferrer" className="text-[10px] font-bold text-verde-glow">CIFRA</a>}
            </li>
          ))}
        </ol>
      ) : <p className="mt-2 text-sm text-white/50">Repertório ainda não definido.</p>}
      {porFuncao.length > 0 && (
        <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-2 gap-x-3 gap-y-1.5">
          {porFuncao.map(([f, nomes]) => (
            <p key={f} className="text-xs leading-snug"><span className="text-white/45">{f}</span><br /><span className="font-medium">{nomes.join(', ')}</span></p>
          ))}
        </div>
      )}
    </div>
  )
}

function LinhaAcomp({ icone, texto, valor, sub, cor, seta }: { icone: ReactNode; texto: string; valor?: string; sub?: string; cor?: string; seta?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {icone}
      <div className="flex-1 min-w-0">
        <p className={clsx('text-sm font-medium', cor ?? 'text-grafite')}>{texto}</p>
        {sub && <p className="text-xs text-grafite/50 truncate">{sub}</p>}
      </div>
      {valor && <span className="text-sm font-bold text-verde">{valor}</span>}
      {seta && <span className="text-grafite/30">›</span>}
    </div>
  )
}

function PainelEquipe({ equipe, onFechar, meuId, gere, eventoId, passado }: { equipe: Equipe | null; onFechar: () => void; meuId?: string; gere: boolean; eventoId: string; passado: boolean }) {
  if (!equipe) return null
  const grupos = new Map<string, Aloc[]>()
  ;[...equipe.alocacoes].sort((a, b) => a.funcao_ordem - b.funcao_ordem).forEach((a) => { const k = a.funcao ?? 'Equipe'; grupos.set(k, [...(grupos.get(k) ?? []), a]) })
  return (
    <Painel aberto onFechar={onFechar} titulo={equipe.nome}
      rodape={gere && !passado ? <Link to={`/ministerios/${equipe.org_id}/escala/${eventoId}`}><Botao className="w-full"><Pencil className="h-4 w-4" />Editar escala</Botao></Link> : undefined}>
      <div className="space-y-4 pb-2">
        {[...grupos.entries()].map(([f, lista]) => (
          <div key={f}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-grafite/40 mb-1.5">{f}</p>
            <div className="space-y-1.5">
              {lista.map((a) => (
                <div key={a.id} className={clsx('flex items-center gap-2.5 rounded-xl px-3 py-2', a.pessoa_id === meuId ? 'bg-verde-claro/30' : 'bg-white')}>
                  <Iniciais nome={a.nome} className="h-8 w-8 text-[11px]" />
                  <div className="flex-1 min-w-0">
                    <p className={clsx('text-sm font-medium truncate', a.status === 'recusada' && 'line-through text-grafite/40')}>{a.nome}{a.pessoa_id === meuId ? ' (você)' : ''}</p>
                    {a.status === 'recusada' && a.motivo && <p className="text-[11px] text-red-500">{a.motivo}</p>}
                  </div>
                  {a.status && <StatusAloc status={a.status} />}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Painel>
  )
}
