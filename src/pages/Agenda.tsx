import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { addMonths, endOfMonth, format, isSameDay, startOfMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, CalendarX } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useData, q } from '../lib/useData'
import { supabase } from '../lib/supabase'
import { d, fmtHora, fmtMes } from '../lib/datas'
import { TIPO_EVENTO_LABEL, type Evento } from '../lib/types'
import { Card, Carregando, Selo, Vazio } from '../components/ui'
import { BotaoNovoEvento, FormEvento } from '../components/Eventos'
import { useNavigate } from 'react-router-dom'

export default function Agenda() {
  const { eu, minhasAreas, areasQueGerencio, secretaria } = useAuth()
  const [mes, setMes] = useState(startOfMonth(new Date()))
  const [filtro, setFiltro] = useState<string>('minhas')
  const nav = useNavigate()
  const [novo, setNovo] = useState(false)

  const { data, loading, reload } = useData(async () => {
    const ini = mes.toISOString(), fim = endOfMonth(mes).toISOString()
    const [eventos, escalas, minhas] = await Promise.all([
      q(supabase.from('eventos').select('*').gte('inicio', ini).lte('inicio', fim).order('inicio')),
      q(supabase.from('escalas').select('evento_id,org_id,publicada,eventos!inner(inicio)').gte('eventos.inicio', ini).lte('eventos.inicio', fim)),
      q(supabase.from('alocacoes').select('status,escalas!inner(evento_id,publicada)').eq('pessoa_id', eu!.id).eq('escalas.publicada', true)),
    ])
    const meuStatus = new Map<string, string>()
    ;(minhas as any[]).forEach((a) => meuStatus.set(a.escalas.evento_id, a.status))
    const escalasPorEvento = new Map<string, Set<string>>()
    ;(escalas as any[]).forEach((s) => { if (!escalasPorEvento.has(s.evento_id)) escalasPorEvento.set(s.evento_id, new Set()); escalasPorEvento.get(s.evento_id)!.add(s.org_id) })
    return { eventos: eventos as Evento[], meuStatus, escalasPorEvento }
  }, [mes.getTime(), eu?.id])

  const lista = useMemo(() => {
    if (!data) return []
    return data.eventos.filter((e) => {
      if (filtro === 'tudo') return true
      if (filtro === 'minhas') return data.meuStatus.has(e.id)
      return e.org_id === filtro || data.escalasPorEvento.get(e.id)?.has(filtro)
    })
  }, [data, filtro])

  const dias = useMemo(() => {
    const g: { dia: Date; eventos: Evento[] }[] = []
    lista.forEach((e) => {
      const dia = d(e.inicio)
      const ult = g[g.length - 1]
      if (ult && isSameDay(ult.dia, dia)) ult.eventos.push(e); else g.push({ dia, eventos: [e] })
    })
    return g
  }, [lista])

  const chips = [{ v: 'minhas', r: 'Minhas escalas' }, { v: 'tudo', r: 'Toda a igreja' }, ...minhasAreas.map((o) => ({ v: o.id, r: o.nome }))]

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-titulo text-[22px] font-bold text-verde">Agenda</h1>
        {(secretaria || areasQueGerencio.length > 0) && <BotaoNovoEvento onClick={() => setNovo(true)} />}
      </div>
      <div className="flex items-center justify-between mb-3">
        <button className="h-10 w-10 grid place-items-center rounded-full hover:bg-black/[0.04]" onClick={() => setMes(addMonths(mes, -1))} aria-label="Mês anterior"><ChevronLeft className="h-5 w-5" /></button>
        <p className="font-titulo font-bold text-verde first-letter:uppercase">{fmtMes(mes)}</p>
        <button className="h-10 w-10 grid place-items-center rounded-full hover:bg-black/[0.04]" onClick={() => setMes(addMonths(mes, 1))} aria-label="Próximo mês"><ChevronRight className="h-5 w-5" /></button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2 mb-3 -mx-4 px-4">
        {chips.map((c) => (
          <button key={c.v} onClick={() => setFiltro(c.v)}
            className={clsx('shrink-0 rounded-full px-3.5 h-8 text-sm font-medium border transition',
              filtro === c.v ? 'bg-verde text-white border-verde' : 'bg-white text-grafite/70 border-black/[0.07]')}>{c.r}</button>
        ))}
      </div>

      {loading ? <Carregando /> : dias.length === 0 ? (
        <Card><Vazio icone={<CalendarX className="h-6 w-6" />} titulo={filtro === 'minhas' ? 'Você não serve neste mês' : 'Nada neste mês'} texto={filtro === 'minhas' ? 'Toque em "Toda a igreja" para ver a agenda completa.' : 'Não há eventos para este filtro.'} /></Card>
      ) : (
        <div className="space-y-5">
          {dias.map(({ dia, eventos }) => (
            <div key={dia.toISOString()} className="flex gap-3">
              <div className="w-11 shrink-0 text-center pt-1">
                <p className="text-[11px] uppercase text-grafite/50 font-medium">{format(dia, "EEE", { locale: ptBR }).slice(0, 3)}</p>
                <p className={clsx('font-titulo text-xl font-bold', isSameDay(dia, new Date()) ? 'text-verde-2' : 'text-verde')}>{format(dia, 'dd')}</p>
              </div>
              <div className="flex-1 space-y-2 min-w-0">
                {eventos.map((e) => {
                  const st = data?.meuStatus.get(e.id)
                  return (
                    <Card key={e.id} onClick={() => nav(`/culto/${e.id}`)} className={clsx('p-3.5 flex items-center gap-3', e.cancelado && 'opacity-50')}>
                      <div className={clsx('w-1 self-stretch rounded-full', st ? 'bg-verde-2' : e.tipo === 'culto' ? 'bg-verde/40' : 'bg-verde-claro')} />
                      <div className="flex-1 min-w-0">
                        <p className={clsx('font-medium text-[15px] truncate', e.cancelado && 'line-through')}>{e.titulo}</p>
                        <p className="text-xs text-grafite/55 mt-0.5">{fmtHora(e.inicio)} – {fmtHora(e.fim)} · {TIPO_EVENTO_LABEL[e.tipo]}</p>
                      </div>
                      {st && <Selo cor={st === 'confirmada' ? 'verde' : st === 'recusada' ? 'vermelho' : 'amarelo'}>Você serve</Selo>}
                    </Card>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      <FormEvento aberto={novo} onFechar={() => setNovo(false)} onSalvo={reload} />
    </div>
  )
}
