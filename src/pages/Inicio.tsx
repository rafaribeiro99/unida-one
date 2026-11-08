import { useState } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { addDays, addWeeks, format, isSameDay, startOfWeek } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CalendarDays, CalendarOff, CheckSquare, ChevronLeft, ChevronRight, ClipboardList, Hourglass, Layers, UserRound, XCircle } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useData, q } from '../lib/useData'
import { supabase } from '../lib/supabase'
import { d, fmtHora } from '../lib/datas'
import { Carregando, Iniciais, StatusAloc } from '../components/ui'
import { CartaoAlocacao, carregarMinhasAlocacoes, type MinhaAloc } from '../components/Escalas'
import { Marca, usePendentes } from '../components/Layout'

export default function Inicio() {
  const { eu, areasQueGerencio, aprovador } = useAuth()
  const pend = usePendentes()
  const [semana, setSemana] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }))
  const [dia, setDia] = useState(() => new Date())

  const { data, loading, reload } = useData(async () => {
    const desde = startOfWeek(new Date(), { weekStartsOn: 0 })
    const [alocs, trocas] = await Promise.all([
      carregarMinhasAlocacoes(eu!.id, desde),
      supabase.from('solicitacoes').select('alocacao_id').eq('tipo', 'troca').eq('status', 'pendente').eq('solicitante_id', eu!.id),
    ])
    return { alocs, trocas: new Set((trocas.data ?? []).map((t) => t.alocacao_id as string)) }
  }, [eu?.id])

  const hora = new Date().getHours()
  const saud = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'
  const futuras = (data?.alocs ?? []).filter((a) => d(a.escalas.eventos.fim) > new Date())
  const aConfirmar = futuras.filter((a) => a.status === 'pendente')
  const doDia = (data?.alocs ?? []).filter((a) => isSameDay(d(a.escalas.eventos.inicio), dia))
  const dias = Array.from({ length: 7 }, (_, i) => addDays(semana, i))
  const temNoDia = (x: Date) => (data?.alocs ?? []).some((a) => isSameDay(d(a.escalas.eventos.inicio), x) && a.status !== 'recusada')

  return (
    <div className="space-y-7">
      <header className="flex items-center justify-between md:hidden">
        <Marca tamanho="sm" />
        <Link to="/perfil" aria-label="Perfil"><Iniciais nome={eu!.nome} className="h-9 w-9" /></Link>
      </header>

      <section>
        <p className="text-sm text-white/50">{saud},</p>
        <h1 className="font-titulo text-[30px] leading-tight font-extrabold tracking-tight">{eu!.nome.split(' ')[0]}</h1>
        {!loading && (
          <p className="mt-1.5 text-sm text-white/55">
            {aConfirmar.length
              ? <>Você tem <span className="text-verde-glow font-semibold">{aConfirmar.length} escala{aConfirmar.length > 1 ? 's' : ''}</span> para confirmar.</>
              : futuras.length ? 'Tudo confirmado. Bom serviço!' : 'Nenhuma escala por enquanto.'}
          </p>
        )}
      </section>

      {/* Minha semana */}
      <section className="rounded-3xl border border-white/[0.07] bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-titulo font-bold text-[15px]">Minha semana</h2>
          <div className="flex items-center gap-1">
            <span className="text-xs text-white/40 capitalize mr-1">{format(semana, "MMM", { locale: ptBR })}</span>
            <button onClick={() => { const s = addWeeks(semana, -1); setSemana(s); setDia(s) }} className="h-8 w-8 grid place-items-center rounded-full text-white/50 hover:bg-white/5" aria-label="Semana anterior"><ChevronLeft className="h-4 w-4" /></button>
            <button onClick={() => { const s = addWeeks(semana, 1); setSemana(s); setDia(s) }} className="h-8 w-8 grid place-items-center rounded-full text-white/50 hover:bg-white/5" aria-label="Próxima semana"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {dias.map((x) => {
            const sel = isSameDay(x, dia), hoje = isSameDay(x, new Date()), tem = temNoDia(x)
            return (
              <button key={x.toISOString()} onClick={() => setDia(x)}
                className={clsx('flex flex-col items-center rounded-2xl py-2.5 transition',
                  sel ? 'bg-verde-claro text-escuro shadow-[0_8px_24px_-8px_rgba(110,231,183,0.6)]' : 'hover:bg-white/[0.05]')}>
                <span className={clsx('text-[10px] uppercase font-semibold tracking-wide', sel ? 'text-escuro/60' : 'text-white/40')}>
                  {format(x, 'EEEEE', { locale: ptBR })}
                </span>
                <span className={clsx('font-titulo text-[17px] font-bold mt-0.5', !sel && hoje && 'text-verde-glow')}>{format(x, 'd')}</span>
                <span className={clsx('h-1.5 w-1.5 rounded-full mt-1', tem ? (sel ? 'bg-escuro' : 'bg-verde-glow shadow-[0_0_8px_#6EE7B7]') : 'bg-transparent')} />
              </button>
            )
          })}
        </div>
        <div className="mt-4 pt-4 border-t border-white/[0.06]">
          <p className="text-xs text-white/40 mb-2.5 first-letter:uppercase">{format(dia, "EEEE, d 'de' MMMM", { locale: ptBR })}</p>
          {loading ? <p className="text-sm text-white/40">Carregando…</p> : doDia.length === 0 ? (
            <p className="text-sm text-white/45">Você está livre neste dia.</p>
          ) : (
            <div className="space-y-2">{doDia.map((a) => <LinhaDia key={a.id} a={a} />)}</div>
          )}
        </div>
      </section>

      {/* Atalhos */}
      <section className="grid grid-cols-4 gap-2.5">
        <Atalho to="/agenda" icone={<CalendarDays />} rotulo="Agenda" />
        <Atalho to="/ministerios" icone={<Layers />} rotulo="Ministérios" />
        {aprovador
          ? <Atalho to="/aprovacoes" icone={<CheckSquare />} rotulo="Aprovações" n={pend} />
          : <Atalho to="/perfil" icone={<UserRound />} rotulo="Perfil" />}
        <Atalho to="/perfil#folgas" icone={<CalendarOff />} rotulo="Folgas" />
      </section>

      {/* Para confirmar */}
      {aConfirmar.length > 0 && (
        <section>
          <h2 className="font-titulo font-bold text-[15px] mb-3">Para confirmar</h2>
          <div className="space-y-3">{aConfirmar.map((a) => <CartaoAlocacao key={a.id} a={a} onMudou={reload} />)}</div>
        </section>
      )}

      {areasQueGerencio.length > 0 && <PainelLider />}

      {/* Próximas */}
      {!loading && futuras.filter((a) => a.status !== 'pendente').length > 0 && (
        <section>
          <h2 className="font-titulo font-bold text-[15px] mb-3">Próximas escalas</h2>
          <div className="space-y-3">
            {futuras.filter((a) => a.status !== 'pendente').slice(0, 5).map((a) =>
              <CartaoAlocacao key={a.id} a={a} trocaPendente={data?.trocas.has(a.id)} onMudou={reload} />)}
          </div>
        </section>
      )}
      {loading && <Carregando />}
    </div>
  )
}

function LinhaDia({ a }: { a: MinhaAloc }) {
  const ev = a.escalas.eventos
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white/[0.04] px-3 py-2.5">
      <div className="text-center w-12 shrink-0">
        <p className="font-titulo font-bold text-[15px]">{fmtHora(ev.inicio)}</p>
        <p className="text-[10px] text-white/35">{fmtHora(ev.fim)}</p>
      </div>
      <div className="w-px self-stretch bg-verde-glow/40" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{ev.titulo}</p>
        <p className="text-xs text-white/50 truncate">{a.escalas.org.nome}{a.funcoes ? ` · ${a.funcoes.nome}` : ''}</p>
      </div>
      <StatusAloc status={a.status} />
    </div>
  )
}

function Atalho({ to, icone, rotulo, n }: { to: string; icone: React.ReactNode; rotulo: string; n?: number }) {
  return (
    <Link to={to} className="relative flex flex-col items-center gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.035] py-3.5 hover:bg-white/[0.07] transition active:scale-[0.97]">
      <span className="text-verde-glow [&>svg]:h-[22px] [&>svg]:w-[22px] [&>svg]:stroke-[1.7]">{icone}</span>
      <span className="text-[11px] font-medium text-white/75">{rotulo}</span>
      {n ? <span className="absolute top-1.5 right-1.5 min-w-[18px] text-center rounded-full bg-verde-glow text-escuro text-[10px] font-bold px-1">{n}</span> : null}
    </Link>
  )
}

function PainelLider() {
  const { areasQueGerencio } = useAuth()
  const ids = areasQueGerencio.map((o) => o.id)
  const destino = ids.length === 1 ? `/ministerios/${ids[0]}` : '/ministerios'
  const { data } = useData(async () => {
    const agora = new Date(), ate = addDays(agora, 14)
    const escalas = await q(supabase.from('escalas')
      .select('id,org_id,publicada,eventos!inner(inicio,cancelado),alocacoes(status,notificado_em)')
      .in('org_id', ids).gte('eventos.inicio', agora.toISOString()).lte('eventos.inicio', ate.toISOString()).eq('eventos.cancelado', false))
    let aguardando = 0, recusas = 0, rascunhos = 0, confirmados = 0, total = 0
    ;(escalas as any[]).forEach((s) => {
      if (!s.publicada) { rascunhos++; return }
      s.alocacoes.forEach((a: any) => {
        if (a.status === 'recusada') recusas++
        else { total++; if (a.status === 'confirmada') confirmados++; else aguardando++ }
      })
    })
    return { aguardando, recusas, rascunhos, confirmados, total }
  }, [ids.join()])
  const pct = data && data.total ? Math.round((data.confirmados / data.total) * 100) : 0

  return (
    <section className="rounded-3xl border border-verde-glow/15 bg-[radial-gradient(120%_120%_at_100%_0%,rgba(110,231,183,0.12),transparent_60%)] bg-white/[0.02] p-4">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="font-titulo font-bold text-[15px]">Painel do líder</h2>
          <p className="text-xs text-white/45 mt-0.5">{areasQueGerencio.length === 1 ? areasQueGerencio[0].nome : `${areasQueGerencio.length} áreas`} · próximos 14 dias</p>
        </div>
        <div className="text-right">
          <p className="font-titulo text-2xl font-extrabold text-verde-glow leading-none">{data ? `${pct}%` : '–'}</p>
          <p className="text-[10px] text-white/40 mt-1">confirmados</p>
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden mb-4">
        <div className="h-full rounded-full bg-gradient-to-r from-verde-2 to-verde-glow transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Indicador to={destino} icone={<Hourglass />} valor={data?.aguardando} rotulo="Aguardando" />
        <Indicador to={destino} icone={<XCircle />} valor={data?.recusas} rotulo="Recusas" alerta={!!data?.recusas} />
        <Indicador to={destino} icone={<ClipboardList />} valor={data?.rascunhos} rotulo="Rascunhos" />
      </div>
    </section>
  )
}

function Indicador({ to, icone, valor, rotulo, alerta }: { to: string; icone: React.ReactNode; valor?: number; rotulo: string; alerta?: boolean }) {
  return (
    <Link to={to} className={clsx('rounded-2xl px-3 py-3 bg-white/[0.04] hover:bg-white/[0.07] transition', alerta && 'ring-1 ring-red-400/30 bg-red-500/[0.06]')}>
      <span className={clsx('[&>svg]:h-4 [&>svg]:w-4', alerta ? 'text-red-300' : 'text-white/40')}>{icone}</span>
      <p className={clsx('font-titulo text-[22px] font-extrabold mt-1.5 leading-none', alerta && 'text-red-200')}>{valor ?? '–'}</p>
      <p className="text-[11px] text-white/50 mt-1">{rotulo}</p>
    </Link>
  )
}
