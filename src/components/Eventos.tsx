import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { addDays, format } from 'date-fns'
import { CalendarPlus, ClipboardList, MapPin, Pencil, Trash2 } from 'lucide-react'
import { Botao, Campo, Entrada, Painel, Selecao, Selo, Texto, Iniciais, StatusAloc, useAviso } from './ui'
import { supabase, msgErro, dispararWhatsApp } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { d, fmtDiaHora, fmtHora } from '../lib/datas'
import { TIPO_EVENTO_LABEL, type Evento, type EventoTipo } from '../lib/types'

const TIPOS: EventoTipo[] = ['culto', 'evento', 'ensaio', 'reuniao', 'ebd', 'curso', 'gp', 'pastoral']

export function FormEvento({ aberto, onFechar, evento, orgPadrao, dataPadrao, onSalvo }: {
  aberto: boolean; onFechar: () => void; evento?: Evento | null; orgPadrao?: string | null; dataPadrao?: Date; onSalvo: () => void
}) {
  const { secretaria, supervisiono, gerencio, areasQueGerencio, pastor, caminho } = useAuth()
  const avisar = useAviso()
  const [f, setF] = useState({ titulo: '', tipo: 'evento' as EventoTipo, org_id: '', local: '', descricao: '', data: '', hi: '19:00', hf: '21:00', repetir_ate: '' })
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (!aberto) return
    if (evento) {
      setF({ titulo: evento.titulo, tipo: evento.tipo, org_id: evento.org_id ?? '', local: evento.local ?? '', descricao: evento.descricao ?? '',
        data: format(d(evento.inicio), 'yyyy-MM-dd'), hi: format(d(evento.inicio), 'HH:mm'), hf: format(d(evento.fim), 'HH:mm'), repetir_ate: '' })
    } else {
      setF({ titulo: '', tipo: orgPadrao ? 'ensaio' : 'evento', org_id: orgPadrao ?? (secretaria ? '' : areasQueGerencio[0]?.id ?? ''), local: '', descricao: '',
        data: format(dataPadrao ?? addDays(new Date(), 1), 'yyyy-MM-dd'), hi: '19:00', hf: '21:00', repetir_ate: '' })
    }
  }, [aberto, evento, orgPadrao, dataPadrao, secretaria, areasQueGerencio])

  const org = f.org_id || null
  const direto = secretaria || (!!org && supervisiono(org)) || (!!org && ['ensaio', 'reuniao'].includes(f.tipo) && gerencio(org))
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }))

  async function salvar() {
    if (!f.titulo.trim()) return avisar('Informe o título.', 'erro')
    if (!secretaria && !org) return avisar('Escolha o ministério.', 'erro')
    const inicio = new Date(`${f.data}T${f.hi}`)
    let fim = new Date(`${f.data}T${f.hf}`)
    if (fim <= inicio) fim = addDays(fim, 1)
    const dados: Record<string, unknown> = { titulo: f.titulo.trim(), tipo: f.tipo, org_id: org, local: f.local, descricao: f.descricao,
      inicio: inicio.toISOString(), fim: fim.toISOString() }
    if (!evento && f.repetir_ate) dados.repetir_ate = f.repetir_ate
    setEnviando(true)
    const { data, error } = await supabase.rpc('salvar_evento', { p_acao: evento ? 'alterar' : 'criar', p_evento: evento?.id ?? null, p_dados: dados })
    setEnviando(false)
    if (error) return avisar(msgErro(error), 'erro')
    dispararWhatsApp()
    avisar(data?.status === 'pendente' ? 'Pedido enviado para aprovação.' : evento ? 'Evento alterado.' : `Evento criado${data?.criados > 1 ? ` (${data.criados} datas)` : ''}.`)
    onFechar(); onSalvo()
  }

  return (
    <Painel aberto={aberto} onFechar={onFechar} titulo={evento ? 'Editar evento' : 'Novo evento'}
      rodape={<Botao className="w-full" onClick={salvar} carregando={enviando}>{direto ? 'Salvar' : 'Enviar para aprovação'}</Botao>}>
      <div className="space-y-4">
        {!direto && <p className="text-xs rounded-xl bg-amber-50 text-amber-800 px-3 py-2">Este pedido vai para aprovação da secretaria ou do supervisor.</p>}
        <Campo rotulo="Título"><Entrada value={f.titulo} onChange={set('titulo')} placeholder="Ex.: Ensaio geral" /></Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Tipo">
            <Selecao value={f.tipo} onChange={set('tipo')}>
              {TIPOS.filter((t) => t !== 'pastoral' || pastor).map((t) => <option key={t} value={t}>{TIPO_EVENTO_LABEL[t]}</option>)}
            </Selecao>
          </Campo>
          <Campo rotulo="Responsável">
            <Selecao value={f.org_id} onChange={set('org_id')} disabled={!!evento}>
              {secretaria && <option value="">Agenda geral da igreja</option>}
              {areasQueGerencio.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
            </Selecao>
          </Campo>
        </div>
        {org && <p className="text-xs text-grafite/50 -mt-2">{caminho(org)}</p>}
        <Campo rotulo="Data"><Entrada type="date" value={f.data} onChange={set('data')} /></Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Início"><Entrada type="time" value={f.hi} onChange={set('hi')} /></Campo>
          <Campo rotulo="Fim"><Entrada type="time" value={f.hf} onChange={set('hf')} /></Campo>
        </div>
        {!evento && <Campo rotulo="Repetir toda semana até (opcional)"><Entrada type="date" value={f.repetir_ate} onChange={set('repetir_ate')} min={f.data} /></Campo>}
        <Campo rotulo="Local"><Entrada value={f.local} onChange={set('local')} placeholder="Ex.: Templo" /></Campo>
        <Campo rotulo="Observações"><Texto value={f.descricao} onChange={set('descricao')} /></Campo>
      </div>
    </Painel>
  )
}

interface EscalaDet { id: string; org_id: string; publicada: boolean; org: { nome: string }; alocacoes: { id: string; status: string; pessoas: { nome: string }; funcoes: { nome: string } | null }[] }

export function DetalheEvento({ evento, onFechar, onMudou }: { evento: Evento | null; onFechar: () => void; onMudou: () => void }) {
  const { areasQueGerencio, secretaria, supervisiono, gerencio, orgPorId } = useAuth()
  const nav = useNavigate()
  const avisar = useAviso()
  const [escalas, setEscalas] = useState<EscalaDet[] | null>(null)
  const [editando, setEditando] = useState(false)
  const [cancelando, setCancelando] = useState(false)

  useEffect(() => {
    if (!evento) return
    setEscalas(null)
    supabase.from('escalas').select('id,org_id,publicada,org(nome),alocacoes(id,status,pessoas!alocacoes_pessoa_id_fkey(nome),funcoes(nome))')
      .eq('evento_id', evento.id).then(({ data }) => setEscalas((data ?? []) as unknown as EscalaDet[]))
  }, [evento])

  if (!evento) return null
  const podeEditar = secretaria || (!!evento.org_id && gerencio(evento.org_id))
  const direto = secretaria || (!!evento.org_id && supervisiono(evento.org_id)) || (!!evento.org_id && ['ensaio', 'reuniao'].includes(evento.tipo) && gerencio(evento.org_id))

  async function cancelar(serie: boolean) {
    const { data, error } = await supabase.rpc('salvar_evento', { p_acao: 'cancelar', p_evento: evento!.id, p_dados: { serie } })
    if (error) return avisar(msgErro(error), 'erro')
    dispararWhatsApp()
    avisar(data?.status === 'pendente' ? 'Pedido de cancelamento enviado.' : 'Evento cancelado.')
    setCancelando(false); onFechar(); onMudou()
  }

  return (
    <>
      <Painel aberto={!!evento && !editando} onFechar={onFechar} titulo={evento.titulo}>
        <div className="space-y-5">
          <div className="space-y-1.5">
            <div className="flex gap-2 flex-wrap">
              <Selo cor="claro">{TIPO_EVENTO_LABEL[evento.tipo]}</Selo>
              {evento.org_id && <Selo>{orgPorId.get(evento.org_id)?.nome}</Selo>}
              {evento.cancelado && <Selo cor="vermelho">Cancelado</Selo>}
            </div>
            <p className="text-sm text-grafite/80">{fmtDiaHora(evento.inicio)} – {fmtHora(evento.fim)}</p>
            {evento.local && <p className="text-sm text-grafite/60 flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{evento.local}</p>}
            {evento.descricao && <p className="text-sm text-grafite/70 whitespace-pre-line">{evento.descricao}</p>}
          </div>

          {!evento.cancelado && areasQueGerencio.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-grafite/50 uppercase tracking-wide">Montar escala</p>
              <div className="flex flex-wrap gap-2">
                {areasQueGerencio.map((o) => (
                  <Botao key={o.id} variante="secundario" className="h-9 text-xs" onClick={() => nav(`/ministerios/${o.id}/escala/${evento.id}`)}>
                    <ClipboardList className="h-3.5 w-3.5" />{o.nome}
                  </Botao>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <p className="text-xs font-semibold text-grafite/50 uppercase tracking-wide">Quem serve</p>
            {escalas === null ? <p className="text-sm text-grafite/50">Carregando…</p> : escalas.length === 0 ? <p className="text-sm text-grafite/50">Nenhuma escala publicada ainda.</p> : escalas.map((s) => (
              <div key={s.id} className="rounded-xl bg-white p-3 border border-black/5">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-semibold text-sm text-verde">{s.org.nome}</p>
                  {!s.publicada && <Selo cor="amarelo">Rascunho</Selo>}
                </div>
                <div className="space-y-1.5">
                  {s.alocacoes.map((a) => (
                    <div key={a.id} className="flex items-center gap-2 text-sm">
                      <Iniciais nome={a.pessoas.nome} className="h-7 w-7 text-[10px]" />
                      <span className="flex-1 truncate">{a.pessoas.nome}{a.funcoes ? <span className="text-grafite/50"> · {a.funcoes.nome}</span> : null}</span>
                      <StatusAloc status={a.status} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {podeEditar && !evento.cancelado && (
            <div className="flex gap-2 pt-1">
              <Botao variante="secundario" className="flex-1" onClick={() => setEditando(true)}><Pencil className="h-4 w-4" />{direto ? 'Editar' : 'Pedir alteração'}</Botao>
              <Botao variante="perigo" onClick={() => setCancelando(true)}><Trash2 className="h-4 w-4" />Cancelar</Botao>
            </div>
          )}
          {cancelando && (
            <div className="rounded-xl bg-red-50 p-3 space-y-2">
              <p className="text-sm text-red-800">{direto ? 'Cancelar este evento? Quem está escalado será avisado.' : 'Pedir o cancelamento deste evento?'}</p>
              <div className="flex gap-2 flex-wrap">
                <Botao variante="perigo" className="h-9" onClick={() => cancelar(false)}>Só este</Botao>
                {evento.serie_id && <Botao variante="perigo" className="h-9" onClick={() => cancelar(true)}>Este e os próximos</Botao>}
                <Botao variante="fantasma" className="h-9" onClick={() => setCancelando(false)}>Voltar</Botao>
              </div>
            </div>
          )}
        </div>
      </Painel>
      <FormEvento aberto={editando} onFechar={() => setEditando(false)} evento={evento} onSalvo={() => { onFechar(); onMudou() }} />
    </>
  )
}

export function BotaoNovoEvento({ onClick }: { onClick: () => void }) {
  return <Botao onClick={onClick} className="h-10"><CalendarPlus className="h-4 w-4" /><span className="hidden sm:inline">Novo evento</span></Botao>
}
