import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import clsx from 'clsx'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  AlertCircle, ArrowLeft, ArrowRight, BarChart3, BookOpen, CalendarCheck, CalendarDays, Check, CheckCircle2, ChevronRight, Clock, Coins, Drum,
  Flag, Guitar, ImagePlus, ListMusic, MapPin, MessageCircle, MicVocal, MoreHorizontal, Music2, Music4, Pencil, Piano, Trash2, Users, UsersRound, X,
  CircleDashed, type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useData, q } from '../lib/useData'
import { supabase, msgErro, dispararWhatsApp } from '../lib/supabase'
import { d, fmtHora } from '../lib/datas'
import { TIPO_EVENTO_LABEL, type Evento } from '../lib/types'
import { Botao, Carregando, Iniciais, Painel, StatusAloc, useAviso } from '../components/ui'
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

const curto = (n: string) => { const p = n.split(' '); return /^(pr|pra|pb|dc|ev)\.?$/i.test(p[0]) ? p.slice(0, 3).join(' ') : p.slice(0, 2).join(' ') }
const capitalizar = (t: string) => t[0].toUpperCase() + t.slice(1)
const ativos = (a: Aloc[]) => a.filter((x) => x.status !== 'recusada')

/** Ícone do instrumento/função do louvor */
function iconeFuncao(f: string): LucideIcon {
  if (/voc|voz|cant|ministr/i.test(f)) return MicVocal
  if (/tecl|piano/i.test(f)) return Piano
  if (/bater|perc/i.test(f)) return Drum
  if (/guit|viol|baix/i.test(f)) return Guitar
  return Music4
}

interface ItemProgramacao { chave: string; titulo: string; quem: string; icone: LucideIcon; alocs: Aloc[]; obs?: string | null }

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
  const [todas, setTodas] = useState(false)
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

  const louvorOrgs = useMemo(() => orgs.filter((o) => o.tem_repertorio), [orgs])
  if (loading || !data) return <Carregando />
  const { evento, equipes, liturgia, repertorio } = data
  const passado = d(evento.fim) < new Date()
  const minha = equipes.flatMap((e) => e.alocacoes.map((a) => ({ ...a, equipe: e }))).find((a) => a.pessoa_id === eu?.id)
  const lideres = minha ? data.lideres.filter((l) => l.org_id === minha.equipe.org_id && l.telefone) : []
  const servindo = equipes.reduce((n, e) => n + ativos(e.alocacoes).length, 0)
  const editoLit = pastor || secretaria
  const podeEditar = secretaria || (!!evento.org_id && gerencio(evento.org_id))
  const direto = secretaria || (!!evento.org_id && supervisiono(evento.org_id)) || (!!evento.org_id && ['ensaio', 'reuniao'].includes(evento.tipo) && gerencio(evento.org_id))
  const podeBanner = pastor || secretaria || (!!evento.org_id && gerencio(evento.org_id))

  // ---- Programação: nos cultos padrão vem da escala pastoral; nos demais, da programação personalizada
  const pastoral = equipes.find((e) => e.nome === 'Pastoral')
  const daFuncao = (re: RegExp) => ativos(pastoral?.alocacoes ?? []).filter((a) => a.funcao && re.test(a.funcao))
  const nomes = (al: Aloc[]) => al.map((a) => curto(a.nome)).join(', ')
  const dow = d(evento.inicio).getDay()
  const cultoPadrao = evento.tipo === 'culto' && dow !== 2 && !/tarde da b[eê]n[cç][aã]o/i.test(evento.titulo)
  let programacao: ItemProgramacao[] = []
  if (liturgia.length) {
    programacao = liturgia.filter((it) => !louvorOrgs.some((o) => o.id === it.org_id)).map((it) => {
      const al = it.funcao_id ? ativos(equipes.flatMap((e) => e.alocacoes)).filter((a) => a.funcao_id === it.funcao_id) : []
      return { chave: it.id, titulo: it.titulo, quem: al.length ? nomes(al) : it.responsavel_texto ?? (it.funcao_id ? 'A definir' : ''), icone: /oferta|d[ií]zimo/i.test(it.titulo) ? Coins : /mensagem|prega|palavra/i.test(it.titulo) ? BookOpen : Flag, alocs: al, obs: it.observacao }
    })
  } else if (cultoPadrao) {
    const ab = daFuncao(/abertura/i), of = daFuncao(/oferta|d[ií]zimo/i), pr = daFuncao(/prega|mensagem|palavra/i), or = daFuncao(/ora[cç][aã]o/i)
    programacao = [
      { chave: 'abertura', titulo: 'Abertura', quem: nomes(ab) || 'A definir', icone: Flag, alocs: ab },
      ...(or.length ? [{ chave: 'oracao', titulo: 'Oração', quem: nomes(or), icone: Flag, alocs: or }] : []),
      { chave: 'oferta', titulo: 'Dízimos e Ofertas', quem: nomes(of) || 'A definir', icone: Coins, alocs: of },
      { chave: 'mensagem', titulo: 'Mensagem', quem: nomes(pr) || 'A definir', icone: BookOpen, alocs: pr },
    ]
  }

  // ---- Louvor
  const louvor = louvorOrgs.map((o) => ({ org: o, equipe: equipes.find((e) => e.org_id === o.id), hinos: repertorio.filter((r) => r.org_id === o.id) }))
    .filter((l) => l.equipe || l.hinos.length || (gerencio(l.org.id) && !passado && evento.tipo === 'culto'))

  // ---- Acompanhamento (só o que posso ver)
  const visiveis = equipes.filter((e) => e.veStatus)
  const aguardando = visiveis.flatMap((e) => e.alocacoes).filter((a) => a.status === 'pendente').length
  const recusas = visiveis.flatMap((e) => e.alocacoes).filter((a) => a.status === 'recusada')
  const completas = visiveis.filter((e) => e.alocacoes.every((a) => a.status === 'confirmada')).length
  const comEscala = new Set(equipes.map((e) => e.org_id))
  const semEscala = visaoGeral && ['culto', 'ebd', 'evento'].includes(evento.tipo)
    ? orgs.filter((o) => (['ministerio', 'equipe'].includes(o.tipo) || (o.tipo === 'pilar' && o.nome === 'Pastoral')) && !comEscala.has(o.id))
    : []
  const minhasSemEscala = visaoGeral ? [] : orgs.filter((o) => ['pilar', 'ministerio', 'equipe'].includes(o.tipo) && gerencio(o.id) && !comEscala.has(o.id) && !['Ministerial', 'Grupos Pequenos'].includes(o.nome))

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
      const serie = !!evento.serie_id && confirm('Usar esta imagem também nos próximos eventos desta série?')
      const n = await enviarBanner(evento.id, f, serie)
      avisar(n > 1 ? `Imagem aplicada em ${n} eventos.` : 'Imagem atualizada.'); reload()
    } catch (e) { avisar(msgErro(e), 'erro') }
  }

  return (
    <div className="-mx-4 -mt-[max(16px,env(safe-area-inset-top))] md:mx-0 md:mt-0 bg-[#F4F4F1] min-h-screen pb-4">
      {/* Barra superior */}
      <header className="flex items-center justify-between px-4 pt-[max(12px,env(safe-area-inset-top))] pb-3">
        <button onClick={() => nav(-1)} className="h-10 w-10 grid place-items-center rounded-full text-verde hover:bg-black/5" aria-label="Voltar"><ArrowLeft className="h-[22px] w-[22px]" /></button>
        <div className="flex items-center gap-2">
          <span className="h-7 w-7 rounded-lg bg-verde grid place-items-center"><img src="/symbol.png" alt="" className="h-4" /></span>
          <span className="font-titulo font-extrabold text-[17px] text-verde tracking-tight">Unida <span className="text-ouro">One</span></span>
        </div>
        {(podeEditar || podeBanner || editoLit) && !passado
          ? <button onClick={() => setMenu(true)} className="h-10 w-10 grid place-items-center rounded-full text-verde hover:bg-black/5" aria-label="Opções"><MoreHorizontal className="h-[22px] w-[22px]" /></button>
          : <span className="w-10" />}
      </header>

      <div className="px-4 space-y-7">
        {/* Destaque do evento */}
        <section className="relative overflow-hidden rounded-[26px] text-white shadow-[0_18px_40px_-22px_rgba(11,46,38,0.9)]">
          {evento.banner_url
            ? <img src={evento.banner_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
            : <div className="absolute inset-0 bloco-marca"><img src="/symbol.png" alt="" className="absolute right-2 top-2 h-40 opacity-[0.06]" /></div>}
          <div className="absolute inset-0 bg-gradient-to-r from-verde/95 via-verde/75 to-verde/30" />
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-verde/90 to-transparent" />
          <div className="relative p-5">
            <span className="inline-block rounded-md bg-white/15 border border-white/20 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.14em]">{TIPO_EVENTO_LABEL[evento.tipo]}</span>
            {evento.cancelado && <span className="ml-2 inline-block rounded-md bg-red-500 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider">Cancelado</span>}
            <h1 className="font-titulo text-[25px] leading-[1.15] font-extrabold tracking-tight mt-3 max-w-[90%]">{evento.titulo}</h1>
            <div className="flex items-center gap-3 mt-3 text-[13px] text-white/85">
              <span className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4 text-white/60" />{capitalizar(format(d(evento.inicio), "d 'de' MMMM", { locale: ptBR }))}</span>
              <span className="h-3.5 w-px bg-white/25" />
              <span className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-white/60" />{fmtHora(evento.inicio).replace(':', 'h')}</span>
              {evento.local && <><span className="h-3.5 w-px bg-white/25" /><span className="flex items-center gap-1.5 truncate"><MapPin className="h-4 w-4 text-white/60" />{evento.local}</span></>}
            </div>
            <div className="grid grid-cols-3 gap-2 mt-5">
              <CaixaNumero icone={Users} valor={equipes.length} rotulo={equipes.length === 1 ? 'ministério' : 'ministérios'} />
              <CaixaNumero icone={UsersRound} valor={servindo} rotulo="servindo" />
              {minha ? (
                <div className="min-w-0 rounded-2xl border border-ouro/70 bg-ouro/10 backdrop-blur px-3 py-2.5">
                  <p className="flex items-center gap-1 text-[10.5px] text-ouro-claro">
                    {minha.status === 'confirmada' ? <Check className="h-3 w-3" strokeWidth={3} /> : <Clock className="h-3 w-3" />}
                    {minha.status === 'confirmada' ? 'Você serve' : 'A confirmar'}
                  </p>
                  <p className="text-[13px] font-bold truncate leading-tight mt-0.5">{minha.equipe.nome}</p>
                  {minha.funcao && <p className="text-[11px] text-white/65 truncate">{minha.funcao}</p>}
                </div>
              ) : <CaixaNumero icone={CalendarCheck} valor={programacao.length} rotulo="momentos" />}
            </div>
            {minha?.status === 'pendente' && !passado && (
              <div className="flex gap-2 mt-3">
                <button onClick={() => responder(true)} className="flex-1 h-10 rounded-full bg-ouro text-verde text-sm font-bold flex items-center justify-center gap-1.5"><Check className="h-4 w-4" />Confirmar presença</button>
                <button onClick={() => responder(false)} className="h-10 px-4 rounded-full bg-white/10 border border-white/20 text-sm font-semibold">Não posso</button>
              </div>
            )}
          </div>
        </section>

        {/* Programação */}
        {programacao.length > 0 && (
          <section>
            <TituloSecao icone={CalendarCheck} acao={!passado && (liturgia.length ? editoLit : (pastoral && (pastor || secretaria || gerencio(pastoral.org_id))))
              ? (liturgia.length || !pastoral
                ? <button onClick={() => setEditLit(true)}>Editar</button>
                : <Link to={`/ministerios/${pastoral.org_id}/escala/${evento.id}`}>Editar</Link>)
              : undefined}>Programação</TituloSecao>
            {programacao.length <= 3 ? (
              <Superficie className="grid divide-x divide-black/[0.06]" style={{ gridTemplateColumns: `repeat(${programacao.length}, minmax(0, 1fr))` }}>
                {programacao.map((it) => <MomentoColuna key={it.chave} it={it} eu={!!eu && it.alocs.some((a) => a.pessoa_id === eu.id)} />)}
              </Superficie>
            ) : (
              <Superficie className="divide-y divide-black/[0.05]">
                {programacao.map((it) => {
                  const souEu = !!eu && it.alocs.some((a) => a.pessoa_id === eu.id)
                  return (
                    <div key={it.chave} className="flex items-center gap-3 px-4 py-3">
                      <it.icone className="h-[18px] w-[18px] shrink-0 text-ouro" strokeWidth={1.7} />
                      <span className="text-[14px] font-semibold text-verde flex-1 min-w-0 truncate">{it.titulo}</span>
                      <span className={clsx('text-[13px] truncate max-w-[50%]', it.quem === 'A definir' ? 'text-amber-600' : souEu ? 'text-[#9A7A35] font-semibold' : 'text-grafite/55')}>{souEu ? 'Você' : it.quem}</span>
                    </div>
                  )
                })}
              </Superficie>
            )}
          </section>
        )}
        {programacao.length === 0 && editoLit && !passado && (
          <button onClick={() => setEditLit(true)} className="w-full rounded-[22px] border border-dashed border-verde/20 py-4 text-sm font-semibold text-verde-2">+ Montar programação deste evento</button>
        )}

        {/* Louvor */}
        {louvor.map(({ org, equipe, hinos }) => (
          <CardLouvor key={org.id} equipe={equipe} hinos={hinos} podeEditar={gerencio(org.id) && !passado}
            onEditar={() => setEditRep(org.id)} onEquipe={() => equipe && setEquipeAberta(equipe)} />
        ))}

        {/* Ministérios em serviço */}
        {equipes.length > 0 && (
          <section>
            <TituloSecao icone={Users}>Ministérios em serviço</TituloSecao>
            <div className={clsx(equipes.length > 5 ? 'flex gap-2 overflow-x-auto sem-barra -mx-4 px-4 pb-1' : 'grid gap-2')} style={equipes.length <= 5 ? { gridTemplateColumns: `repeat(${equipes.length}, minmax(0, 1fr))` } : undefined}>
              {equipes.map((e) => {
                const alerta = e.veStatus && e.alocacoes.some((a) => a.status === 'recusada')
                return (
                  <button key={e.id} onClick={() => setEquipeAberta(e)}
                    className="relative shrink-0 min-w-[68px] rounded-[18px] bg-white border border-black/[0.04] shadow-[0_6px_16px_-12px_rgba(16,24,20,0.3)] pt-3 pb-2.5 px-1 flex flex-col items-center active:scale-[0.97] transition">
                    <IconeMinisterio nome={e.nome} className="h-[22px] w-[22px] text-verde" />
                    <span className="mt-1.5 text-[10.5px] font-semibold text-verde leading-tight text-center w-full truncate">{e.nome}</span>
                    <span className="font-titulo text-[19px] font-extrabold text-verde leading-tight">{ativos(e.alocacoes).length}</span>
                    {alerta && <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-red-500" />}
                    {!e.publicada && <span className="absolute top-2 left-2 h-2 w-2 rounded-full bg-amber-400" />}
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {/* Acompanhamento */}
        {(equipes.length > 0 || lideres.length > 0 || semEscala.length > 0 || minhasSemEscala.length > 0) && (
          <section>
            <TituloSecao icone={BarChart3}>Acompanhamento</TituloSecao>
            <Superficie className="divide-y divide-black/[0.05]">
              {visiveis.length > 0 && <button onClick={() => setTodas(true)} className="w-full text-left"><LinhaAcomp icone={<CheckCircle2 className="h-5 w-5 text-white fill-verde-2" />} texto="Equipes 100% confirmadas" valor={`${completas} de ${visiveis.length}`} /></button>}
              {aguardando > 0 && <LinhaAcomp icone={<AlertCircle className="h-5 w-5 text-ouro" />} texto={`${aguardando} ${aguardando > 1 ? 'pendências' : 'pendência'}`} cor="text-[#9A7A35]" />}
              {recusas.length > 0 && <LinhaAcomp icone={<X className="h-5 w-5 text-red-500" />} texto={`${recusas.length} não poder${recusas.length > 1 ? 'ão' : 'á'} servir`} cor="text-red-600" sub={recusas.map((r) => `${curto(r.nome)}${r.motivo ? ` (${r.motivo})` : ''}`).join(', ')} />}
              {semEscala.length > 0 && <LinhaAcomp icone={<CircleDashed className="h-5 w-5 text-grafite/35" />} texto="Sem escala neste culto" sub={semEscala.map((o) => o.nome).join(', ')} />}
              {minhasSemEscala.map((o) => (
                <Link key={o.id} className="block" to={`/ministerios/${o.id}/escala/${evento.id}`}><LinhaAcomp icone={<Pencil className="h-5 w-5 text-verde-2" />} texto={`Montar escala de ${o.nome}`} seta /></Link>
              ))}
              {lideres.map((l) => (
                <a key={l.pessoa_id} href={linkWhats(l.telefone, `Olá, ${l.nome.split(' ')[0]}! Sobre a escala de ${evento.titulo}:`)} target="_blank" rel="noreferrer" className="block">
                  <LinhaAcomp icone={<MessageCircle className="h-5 w-5 text-verde" />} texto={`Falar com ${curto(l.nome)}`} seta />
                </a>
              ))}
              {equipes.length > 0 && <button onClick={() => setTodas(true)} className="w-full text-left"><LinhaAcomp icone={<CalendarDays className="h-5 w-5 text-verde" />} texto="Ver escala completa" seta /></button>}
            </Superficie>
          </section>
        )}

        {cancelando && (
          <Superficie className="p-4 space-y-2">
            <p className="text-sm text-red-700">{direto ? 'Cancelar este evento? Quem está escalado será avisado.' : 'Pedir o cancelamento deste evento?'}</p>
            <div className="flex gap-2 flex-wrap">
              <Botao variante="perigo" className="h-9" onClick={() => cancelar(false)}>Só este</Botao>
              {evento.serie_id && <Botao variante="perigo" className="h-9" onClick={() => cancelar(true)}>Este e os próximos</Botao>}
              <Botao variante="fantasma" className="h-9" onClick={() => setCancelando(false)}>Voltar</Botao>
            </div>
          </Superficie>
        )}
      </div>

      <input ref={arquivo} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) trocarBanner(f); e.target.value = '' }} />
      <Painel aberto={menu} onFechar={() => setMenu(false)} titulo="Opções do evento">
        <div className="space-y-2 pb-2">
          {podeBanner && <Botao variante="secundario" className="w-full justify-start" onClick={() => { setMenu(false); arquivo.current?.click() }}><ImagePlus className="h-4 w-4" />Trocar imagem de fundo</Botao>}
          {podeBanner && evento.banner_url && <Botao variante="secundario" className="w-full justify-start" onClick={async () => { setMenu(false); await supabase.rpc('definir_banner', { p_evento: evento.id, p_url: '', p_serie: false }); reload() }}><X className="h-4 w-4" />Remover imagem</Botao>}
          {editoLit && <Botao variante="secundario" className="w-full justify-start" onClick={() => { setMenu(false); setEditLit(true) }}><ListMusic className="h-4 w-4" />{liturgia.length ? 'Editar programação personalizada' : 'Personalizar programação'}</Botao>}
          {podeEditar && <Botao variante="secundario" className="w-full justify-start" onClick={() => { setMenu(false); setEditando(true) }}><Pencil className="h-4 w-4" />{direto ? 'Editar evento' : 'Pedir alteração do evento'}</Botao>}
          {podeEditar && <Botao variante="perigo" className="w-full justify-start" onClick={() => { setMenu(false); setCancelando(true) }}><Trash2 className="h-4 w-4" />Cancelar evento</Botao>}
        </div>
      </Painel>
      <PainelEquipe equipe={equipeAberta} onFechar={() => setEquipeAberta(null)} meuId={eu?.id} gere={!!equipeAberta && gerencio(equipeAberta.org_id)} eventoId={evento.id} passado={passado} />
      <Painel aberto={todas} onFechar={() => setTodas(false)} titulo="Escala completa">
        <div className="space-y-5 pb-2">{equipes.map((e) => <ListaEquipe key={e.id} equipe={e} meuId={eu?.id} titulo />)}</div>
      </Painel>
      <FormEvento aberto={editando} onFechar={() => setEditando(false)} evento={evento} onSalvo={reload} />
      <EditorLiturgia aberto={editLit} onFechar={() => setEditLit(false)} eventoId={evento.id} itens={liturgia} onMudou={reload} />
      <EditorRepertorio orgId={editRep} onFechar={() => setEditRep(null)} eventoId={evento.id} itens={editRep ? repertorio.filter((r) => r.org_id === editRep) : []} onMudou={reload} />
    </div>
  )
}

function Superficie({ children, className, style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return <div style={style} className={clsx('rounded-[22px] bg-white border border-black/[0.04] shadow-[0_10px_30px_-20px_rgba(16,24,20,0.35)] overflow-hidden', className)}>{children}</div>
}

function TituloSecao({ icone: Icone, children, acao }: { icone: LucideIcon; children: ReactNode; acao?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3 px-1">
      <h2 className="flex items-center gap-2.5 font-titulo font-bold text-[18px] text-verde"><Icone className="h-5 w-5" strokeWidth={1.8} />{children}</h2>
      {acao && <span className="text-[13px] font-semibold text-verde-2">{acao}</span>}
    </div>
  )
}

function MomentoColuna({ it, eu }: { it: ItemProgramacao; eu: boolean }) {
  return (
    <div className="px-3 py-3.5 min-w-0">
      <it.icone className="h-[18px] w-[18px] text-ouro" strokeWidth={1.8} />
      <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-grafite/45 leading-tight">{it.titulo}</p>
      <p className={clsx('mt-1.5 text-[13.5px] font-semibold leading-snug line-clamp-2', it.quem === 'A definir' ? 'text-amber-600' : 'text-verde')}>{it.quem}</p>
      {it.obs && <p className="text-[11px] text-grafite/45 truncate mt-0.5">{it.obs}</p>}
      {eu && <span className="inline-block mt-1.5 rounded-full bg-ouro/15 text-[#9A7A35] text-[10.5px] font-bold px-2 py-0.5">Você</span>}
    </div>
  )
}

function CaixaNumero({ icone: Icone, valor, rotulo }: { icone: LucideIcon; valor: number; rotulo: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-white/[0.09] border border-white/15 backdrop-blur px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Icone className="h-[18px] w-[18px] text-white/65 shrink-0" strokeWidth={1.7} />
        <p className="font-titulo text-[20px] font-extrabold leading-none">{valor}</p>
      </div>
      <p className="text-[11px] text-white/65 mt-1.5">{rotulo}</p>
    </div>
  )
}

function CardLouvor({ equipe, hinos, podeEditar, onEditar, onEquipe }: { equipe?: Equipe; hinos: ItemRepertorio[]; podeEditar: boolean; onEditar: () => void; onEquipe: () => void }) {
  const instrumentos = useMemo(() => {
    const m = new Map<string, number>()
    ativos(equipe?.alocacoes ?? []).sort((a, b) => a.funcao_ordem - b.funcao_ordem).forEach((a) => { const k = a.funcao ?? 'Equipe'; m.set(k, (m.get(k) ?? 0) + 1) })
    return [...m.entries()]
  }, [equipe])
  return (
    <section className="relative overflow-hidden rounded-[24px] bloco-marca text-white shadow-[0_18px_40px_-24px_rgba(11,46,38,0.9)]">
      <Music2 className="absolute -left-6 -bottom-8 h-44 w-44 text-white/[0.04]" strokeWidth={1} />
      <div className="relative p-5">
        <div className="grid grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-4">
          <div className="flex flex-col">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-ouro">Louvor</p>
            <p className="font-titulo text-[21px] leading-[1.1] font-extrabold mt-1.5">Repertório<br />do culto</p>
            <button onClick={podeEditar ? onEditar : onEquipe} className="mt-auto pt-4 self-start" aria-label={podeEditar ? 'Editar hinos' : 'Ver equipe'}>
              <span className="h-9 w-9 rounded-full border border-ouro/80 text-ouro grid place-items-center">{podeEditar ? <Pencil className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}</span>
            </button>
          </div>
          <div className="border-l border-white/10 pl-4">
            {hinos.length ? (
              <ol>
                {hinos.map((h, i) => (
                  <li key={h.id} className={clsx('flex items-center gap-2.5 py-2', i > 0 && 'border-t border-white/10')}>
                    <Music2 className="h-3.5 w-3.5 shrink-0 text-white/60" />
                    <span className="text-[13.5px] leading-tight">{h.musicas.titulo}</span>
                  </li>
                ))}
              </ol>
            ) : <p className="text-[13px] text-white/50 py-2">{podeEditar ? 'Toque no lápis para colocar os hinos.' : 'Hinos ainda não definidos.'}</p>}
          </div>
        </div>
        {instrumentos.length > 0 && (
          <button onClick={onEquipe} className="w-full mt-4 pt-4 border-t border-white/10 grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(instrumentos.length, 5)}, minmax(0, 1fr))` }}>
            {instrumentos.slice(0, 5).map(([f, n]) => {
              const I = iconeFuncao(f)
              return (
                <span key={f} className="flex flex-col items-center gap-1">
                  <span className="h-8 w-8 rounded-full bg-white/10 grid place-items-center"><I className="h-4 w-4 text-white/85" strokeWidth={1.7} /></span>
                  <span className="text-[10.5px] text-white/70 truncate max-w-full">{f}</span>
                  <span className="text-[13px] font-bold leading-none">{n}</span>
                </span>
              )
            })}
          </button>
        )}
      </div>
    </section>
  )
}

function LinhaAcomp({ icone, texto, valor, sub, cor, seta }: { icone: ReactNode; texto: string; valor?: string; sub?: string; cor?: string; seta?: boolean }) {
  return (
    <div className="flex items-center gap-3.5 px-4 py-3.5">
      <span className="shrink-0">{icone}</span>
      <div className="flex-1 min-w-0">
        <p className={clsx('text-[15px] font-medium', cor ?? 'text-grafite/90')}>{texto}</p>
        {sub && <p className="text-xs text-grafite/50 truncate">{sub}</p>}
      </div>
      {valor && <span className="text-sm font-bold text-verde-2">{valor}</span>}
      {(seta || valor) && <ChevronRight className="h-[18px] w-[18px] text-grafite/30" />}
    </div>
  )
}

function ListaEquipe({ equipe, meuId, titulo }: { equipe: Equipe; meuId?: string; titulo?: boolean }) {
  const grupos = new Map<string, Aloc[]>()
  ;[...equipe.alocacoes].sort((a, b) => a.funcao_ordem - b.funcao_ordem).forEach((a) => { const k = a.funcao ?? 'Equipe'; grupos.set(k, [...(grupos.get(k) ?? []), a]) })
  return (
    <div>
      {titulo && <p className="flex items-center gap-2 font-titulo font-bold text-verde mb-2"><IconeMinisterio nome={equipe.nome} className="h-4 w-4" />{equipe.nome}</p>}
      <div className="space-y-3">
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
    </div>
  )
}

function PainelEquipe({ equipe, onFechar, meuId, gere, eventoId, passado }: { equipe: Equipe | null; onFechar: () => void; meuId?: string; gere: boolean; eventoId: string; passado: boolean }) {
  if (!equipe) return null
  return (
    <Painel aberto onFechar={onFechar} titulo={equipe.nome}
      rodape={gere && !passado ? <Link to={`/ministerios/${equipe.org_id}/escala/${eventoId}`}><Botao className="w-full"><Pencil className="h-4 w-4" />Editar escala</Botao></Link> : undefined}>
      <div className="pb-2"><ListaEquipe equipe={equipe} meuId={meuId} /></div>
    </Painel>
  )
}
