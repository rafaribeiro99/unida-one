import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { addDays, addWeeks, format, isSameDay, startOfWeek } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { AlertTriangle, CheckSquare, ChevronLeft, ChevronRight, Hourglass, ClipboardList, XCircle } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useData, q } from '../lib/useData'
import { supabase, msgErro, dispararWhatsApp } from '../lib/supabase'
import { d, fmtHora } from '../lib/datas'
import { Botao, Card, Iniciais, StatusAloc, useAviso } from '../components/ui'
import { carregarMinhasAlocacoes, type MinhaAloc } from '../components/Escalas'
import { Marca, usePendentes } from '../components/Layout'

export default function Inicio() {
  const { eu, areasQueGerencio, visaoGeral } = useAuth()
  const pend = usePendentes()
  const { data, loading, reload } = useData(async () => {
    const desde = startOfWeek(addWeeks(new Date(), -1), { weekStartsOn: 0 })
    return carregarMinhasAlocacoes(eu!.id, desde)
  }, [eu?.id])

  const futuras = (data ?? []).filter((a) => d(a.escalas.eventos.fim) > new Date() && a.status !== 'recusada')
  const proxima = futuras[0]
  const aConfirmar = futuras.filter((a) => a.status === 'pendente' && a.id !== proxima?.id)
  const hora = new Date().getHours()
  const saud = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'

  return (
    <div className="space-y-6">
      {/* Topo da marca + próximo compromisso */}
      <section className="bloco-marca -mx-4 -mt-[max(16px,env(safe-area-inset-top))] px-5 pt-[max(20px,env(safe-area-inset-top))] pb-6 rounded-b-[32px] text-white md:mx-0 md:mt-0 md:rounded-[32px]">
        <div className="flex items-center justify-between">
          <Marca tamanho="sm" />
          <Link to="/perfil" aria-label="Perfil"><Iniciais nome={eu!.nome} className="h-9 w-9 bg-white/15 text-white ring-white/20" /></Link>
        </div>
        <p className="mt-6 text-white/60 text-sm">{saud},</p>
        <h1 className="font-titulo text-[28px] leading-tight font-extrabold tracking-tight">{eu!.nome.split(' ')[0]}</h1>
        <div className="mt-5">
          {loading ? <div className="h-[108px] rounded-[22px] bg-white/[0.06] animate-pulse" />
            : proxima ? <ProximoCompromisso a={proxima} onMudou={reload} />
            : <div className="rounded-[22px] bg-white/[0.07] border border-white/10 p-4"><p className="text-sm text-white/70">Você não tem escalas marcadas. Quando seu líder te escalar, aparece aqui.</p></div>}
        </div>
      </section>

      {aConfirmar.length > 0 && (
        <section>
          <Titulo>Para confirmar</Titulo>
          <Card className="divide-y divide-black/[0.05]">
            {aConfirmar.map((a) => <LinhaConfirmar key={a.id} a={a} onMudou={reload} />)}
          </Card>
        </section>
      )}

      {pend > 0 && (
        <Link to="/aprovacoes">
          <Card className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-[14px] bg-amber-50 text-amber-600 grid place-items-center"><CheckSquare className="h-5 w-5" /></div>
            <p className="flex-1 text-sm font-semibold text-verde">{pend} pedido{pend > 1 ? 's' : ''} aguardando sua aprovação</p>
            <ChevronRight className="h-5 w-5 text-grafite/30" />
          </Card>
        </Link>
      )}

      {visaoGeral && <ProximosCultos />}
      {areasQueGerencio.length > 0 && !visaoGeral && <PainelLider />}
      <MinhaSemana alocs={data ?? []} />
    </div>
  )
}

function Titulo({ children, acao }: { children: React.ReactNode; acao?: React.ReactNode }) {
  return <div className="flex items-center justify-between mb-2.5 px-1"><h2 className="font-titulo font-bold text-verde">{children}</h2>{acao}</div>
}

function ProximoCompromisso({ a, onMudou }: { a: MinhaAloc; onMudou: () => void }) {
  const nav = useNavigate()
  const avisar = useAviso()
  const ev = a.escalas.eventos
  async function confirmar(e: React.MouseEvent) {
    e.stopPropagation()
    const { error } = await supabase.rpc('responder_alocacao', { p_alocacao: a.id, p_confirmar: true })
    if (error) return avisar(msgErro(error), 'erro')
    avisar('Presença confirmada!'); onMudou()
  }
  return (
    <div onClick={() => nav(`/culto/${ev.id}`)} className="cursor-pointer rounded-[22px] bg-white text-grafite p-4 shadow-[0_12px_30px_-12px_rgba(0,0,0,0.5)] active:scale-[0.99] transition">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-verde-2">Seu próximo compromisso</p>
          <p className="font-titulo text-lg font-extrabold text-verde mt-1 leading-snug">{ev.titulo}</p>
        </div>
        <div className="text-center rounded-2xl bg-verde text-white px-3 py-1.5 shrink-0">
          <p className="text-[10px] uppercase text-verde-claro font-semibold">{format(d(ev.inicio), 'EEE', { locale: ptBR }).slice(0, 3)}</p>
          <p className="font-titulo text-xl font-extrabold leading-none">{format(d(ev.inicio), 'dd')}</p>
        </div>
      </div>
      <p className="text-sm text-grafite/70 mt-2">{fmtHora(ev.inicio)} · {a.escalas.org.nome}{a.funcoes ? ` · ${a.funcoes.nome}` : ''}</p>
      <div className="flex items-center justify-between mt-3">
        <StatusAloc status={a.status} />
        {a.status === 'pendente'
          ? <Botao className="h-9 px-4" onClick={confirmar}>Confirmar presença</Botao>
          : <span className="text-xs font-semibold text-verde-2">Ver culto completo →</span>}
      </div>
    </div>
  )
}

function LinhaConfirmar({ a, onMudou }: { a: MinhaAloc; onMudou: () => void }) {
  const nav = useNavigate()
  const avisar = useAviso()
  const ev = a.escalas.eventos
  async function responder(confirmar: boolean) {
    const motivo = confirmar ? null : prompt('Motivo (opcional):') ?? undefined
    if (motivo === undefined) return
    const { error } = await supabase.rpc('responder_alocacao', { p_alocacao: a.id, p_confirmar: confirmar, p_motivo: motivo })
    if (error) return avisar(msgErro(error), 'erro')
    if (!confirmar) dispararWhatsApp()
    avisar(confirmar ? 'Presença confirmada!' : 'Seu líder foi avisado.'); onMudou()
  }
  return (
    <div className="p-3.5 flex items-center gap-3">
      <button onClick={() => nav(`/culto/${ev.id}`)} className="flex-1 min-w-0 text-left">
        <p className="text-sm font-semibold text-verde truncate">{ev.titulo}</p>
        <p className="text-xs text-grafite/55 first-letter:uppercase">{format(d(ev.inicio), "EEE, dd/MM", { locale: ptBR })} · {fmtHora(ev.inicio)} · {a.escalas.org.nome}</p>
      </button>
      <button onClick={() => responder(false)} className="h-9 w-9 grid place-items-center rounded-full border border-black/10 text-grafite/50" aria-label="Não posso">✕</button>
      <button onClick={() => responder(true)} className="h-9 px-3.5 rounded-full bg-verde text-white text-sm font-semibold">Confirmar</button>
    </div>
  )
}

function MinhaSemana({ alocs }: { alocs: MinhaAloc[] }) {
  const nav = useNavigate()
  const [semana, setSemana] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }))
  const [dia, setDia] = useState(() => new Date())
  const dias = Array.from({ length: 7 }, (_, i) => addDays(semana, i))
  const doDia = alocs.filter((a) => isSameDay(d(a.escalas.eventos.inicio), dia) && a.status !== 'recusada')
  return (
    <section>
      <Titulo acao={
        <div className="flex items-center">
          <button onClick={() => { const s = addWeeks(semana, -1); setSemana(s); setDia(s) }} className="h-8 w-8 grid place-items-center rounded-full text-grafite/40 hover:bg-black/5" aria-label="Semana anterior"><ChevronLeft className="h-4 w-4" /></button>
          <button onClick={() => { const s = addWeeks(semana, 1); setSemana(s); setDia(s) }} className="h-8 w-8 grid place-items-center rounded-full text-grafite/40 hover:bg-black/5" aria-label="Próxima semana"><ChevronRight className="h-4 w-4" /></button>
        </div>}>Minha semana</Titulo>
      <Card className="p-3">
        <div className="grid grid-cols-7 gap-1">
          {dias.map((x) => {
            const sel = isSameDay(x, dia), hoje = isSameDay(x, new Date())
            const tem = alocs.some((a) => isSameDay(d(a.escalas.eventos.inicio), x) && a.status !== 'recusada')
            return (
              <button key={x.toISOString()} onClick={() => setDia(x)} className={clsx('flex flex-col items-center rounded-2xl py-2 transition', sel ? 'bg-verde text-white' : 'hover:bg-black/[0.03]')}>
                <span className={clsx('text-[10px] font-semibold uppercase', sel ? 'text-verde-claro' : 'text-grafite/40')}>{format(x, 'EEEEE', { locale: ptBR })}</span>
                <span className={clsx('font-titulo text-base font-bold', !sel && (hoje ? 'text-verde-2' : 'text-grafite/80'))}>{format(x, 'd')}</span>
                <span className={clsx('h-1.5 w-1.5 rounded-full', tem ? (sel ? 'bg-verde-glow' : 'bg-verde-2') : 'bg-transparent')} />
              </button>
            )
          })}
        </div>
        <div className="mt-2 px-1">
          {doDia.length === 0 ? <p className="text-sm text-grafite/45 py-2 text-center">Livre neste dia.</p> : doDia.map((a) => (
            <button key={a.id} onClick={() => nav(`/culto/${a.escalas.eventos.id}`)} className="w-full flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-black/[0.03] text-left">
              <p className="font-titulo font-bold text-verde w-12">{fmtHora(a.escalas.eventos.inicio)}</p>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{a.escalas.eventos.titulo}</p>
                <p className="text-xs text-grafite/55 truncate">{a.escalas.org.nome}{a.funcoes ? ` · ${a.funcoes.nome}` : ''}</p>
              </div>
              <StatusAloc status={a.status} />
            </button>
          ))}
        </div>
      </Card>
    </section>
  )
}

/** Pastores, secretaria, supervisores e coordenadores: cobertura dos próximos cultos */
function ProximosCultos() {
  const nav = useNavigate()
  const { data } = useData(async () => {
    const agora = new Date()
    const eventos = await q(supabase.from('eventos').select('id,titulo,tipo,inicio,fim,cancelado')
      .gte('fim', agora.toISOString()).lte('inicio', addDays(agora, 10).toISOString()).eq('cancelado', false)
      .in('tipo', ['culto', 'evento', 'ebd']).order('inicio').limit(6)) as any[]
    const ids = eventos.map((e) => e.id)
    const escalas = ids.length ? await q(supabase.from('escalas').select('evento_id,publicada,alocacoes(status)').in('evento_id', ids)) as any[] : []
    return eventos.map((e) => {
      const es = escalas.filter((s) => s.evento_id === e.id && s.publicada)
      const al = es.flatMap((s) => s.alocacoes)
      const ativas = al.filter((a: any) => a.status !== 'recusada')
      return { ...e, min: es.length, pessoas: ativas.length, conf: ativas.filter((a: any) => a.status === 'confirmada').length, rec: al.length - ativas.length }
    })
  }, [])
  return (
    <section>
      <Titulo>Próximos cultos</Titulo>
      <div className="space-y-2.5">
        {(data ?? []).map((e) => {
          const pct = e.pessoas ? Math.round((e.conf / e.pessoas) * 100) : 0
          return (
            <Card key={e.id} onClick={() => nav(`/culto/${e.id}`)} className="p-3.5 flex items-center gap-3.5">
              <div className="w-12 shrink-0 text-center rounded-2xl bg-verde-claro/35 py-1.5">
                <p className="text-[10px] uppercase font-semibold text-verde-2">{format(d(e.inicio), 'EEE', { locale: ptBR }).slice(0, 3)}</p>
                <p className="font-titulo text-lg font-extrabold text-verde leading-none">{format(d(e.inicio), 'dd')}</p>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-verde truncate">{e.titulo}</p>
                <p className="text-xs text-grafite/55">{fmtHora(e.inicio)} · {e.min ? `${e.min} ministério${e.min > 1 ? 's' : ''} · ${e.pessoas} pessoas` : 'Nenhuma escala publicada'}</p>
                {e.pessoas > 0 && (
                  <div className="h-1 rounded-full bg-black/[0.06] mt-2 overflow-hidden"><div className="h-full rounded-full bg-verde-2" style={{ width: `${pct}%` }} /></div>
                )}
              </div>
              {e.rec > 0 ? <span className="flex items-center gap-1 text-xs font-semibold text-red-600"><AlertTriangle className="h-3.5 w-3.5" />{e.rec}</span>
                : e.pessoas > 0 ? <span className="text-xs font-bold text-verde-2">{pct}%</span> : null}
            </Card>
          )
        })}
        {data && data.length === 0 && <p className="text-sm text-grafite/45 px-1">Nenhum culto nos próximos dias.</p>}
      </div>
    </section>
  )
}

function PainelLider() {
  const { areasQueGerencio } = useAuth()
  const ids = areasQueGerencio.map((o) => o.id)
  const destino = ids.length === 1 ? `/ministerios/${ids[0]}` : '/ministerios'
  const { data } = useData(async () => {
    const agora = new Date()
    const escalas = await q(supabase.from('escalas')
      .select('id,org_id,publicada,eventos!inner(inicio,cancelado),alocacoes(status,notificado_em)')
      .in('org_id', ids).gte('eventos.inicio', agora.toISOString()).lte('eventos.inicio', addDays(agora, 14).toISOString()).eq('eventos.cancelado', false))
    let aguardando = 0, recusas = 0, rascunhos = 0
    ;(escalas as any[]).forEach((s) => {
      if (!s.publicada) { rascunhos++; return }
      s.alocacoes.forEach((a: any) => { if (a.status === 'recusada') recusas++; else if (a.status === 'pendente') aguardando++ })
    })
    return { aguardando, recusas, rascunhos }
  }, [ids.join()])
  return (
    <section>
      <Titulo acao={<Link to={destino} className="text-xs font-semibold text-verde-2">Abrir →</Link>}>
        {areasQueGerencio.length === 1 ? areasQueGerencio[0].nome : 'Minhas equipes'}
      </Titulo>
      <div className="grid grid-cols-3 gap-2.5">
        <Indicador to={destino} icone={<Hourglass />} valor={data?.aguardando} rotulo="aguardando" />
        <Indicador to={destino} icone={<XCircle />} valor={data?.recusas} rotulo="recusas" alerta={!!data?.recusas} />
        <Indicador to={destino} icone={<ClipboardList />} valor={data?.rascunhos} rotulo="rascunhos" />
      </div>
    </section>
  )
}

function Indicador({ to, icone, valor, rotulo, alerta }: { to: string; icone: React.ReactNode; valor?: number; rotulo: string; alerta?: boolean }) {
  return (
    <Link to={to} className={clsx('rounded-[20px] px-3.5 py-3 border transition', alerta ? 'bg-red-50 border-red-100' : 'bg-white border-black/[0.05]')}>
      <span className={clsx('[&>svg]:h-4 [&>svg]:w-4', alerta ? 'text-red-500' : 'text-grafite/35')}>{icone}</span>
      <p className={clsx('font-titulo text-2xl font-extrabold mt-1 leading-none', alerta ? 'text-red-600' : 'text-verde')}>{valor ?? '–'}</p>
      <p className="text-[11px] text-grafite/55 mt-1">{rotulo}</p>
    </Link>
  )
}
