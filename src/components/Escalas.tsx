import { useEffect, useState } from 'react'
import { Check, MapPin, Repeat, X } from 'lucide-react'
import { Botao, Campo, Card, Entrada, Painel, Selecao, StatusAloc, Selo, useAviso } from './ui'
import { supabase, msgErro, dispararWhatsApp } from '../lib/supabase'
import { fmtDiaHora, fmtHora } from '../lib/datas'
import { useAuth } from '../lib/auth'

export interface MinhaAloc {
  id: string; status: string; motivo: string | null; token: string
  funcoes: { nome: string } | null
  escalas: { id: string; org_id: string; org: { nome: string }; eventos: { id: string; titulo: string; inicio: string; fim: string; local: string | null; cancelado: boolean } }
}

export async function carregarMinhasAlocacoes(pessoaId: string, desde = new Date()) {
  const { data, error } = await supabase.from('alocacoes')
    .select('id,status,motivo,token,funcoes(nome),escalas!inner(id,org_id,publicada,org(nome),eventos!inner(id,titulo,inicio,fim,local,cancelado))')
    .eq('pessoa_id', pessoaId).eq('escalas.publicada', true).gte('escalas.eventos.fim', desde.toISOString())
  if (error) throw error
  return ((data ?? []) as unknown as MinhaAloc[])
    .filter((a) => !a.escalas.eventos.cancelado)
    .sort((a, b) => a.escalas.eventos.inicio.localeCompare(b.escalas.eventos.inicio))
}

export function CartaoAlocacao({ a, trocaPendente, onMudou }: { a: MinhaAloc; trocaPendente?: boolean; onMudou: () => void }) {
  const avisar = useAviso()
  const [painel, setPainel] = useState<'recusar' | 'troca' | null>(null)
  const [enviando, setEnviando] = useState(false)
  const ev = a.escalas.eventos

  async function confirmar() {
    setEnviando(true)
    const { error } = await supabase.rpc('responder_alocacao', { p_alocacao: a.id, p_confirmar: true })
    setEnviando(false)
    if (error) return avisar(msgErro(error), 'erro')
    avisar('Presença confirmada. Obrigado por servir!'); onMudou()
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-verde-glow">{a.escalas.org.nome}{a.funcoes ? ` · ${a.funcoes.nome}` : ''}</p>
          <p className="font-titulo font-semibold text-white mt-1 leading-snug">{ev.titulo}</p>
          <p className="text-sm text-white/70 mt-1">{fmtDiaHora(ev.inicio)} – {fmtHora(ev.fim)}</p>
          {ev.local && <p className="text-xs text-white/50 mt-0.5 flex items-center gap-1"><MapPin className="h-3 w-3" />{ev.local}</p>}
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusAloc status={a.status} />
          {trocaPendente && <Selo cor="cinza">Troca pedida</Selo>}
        </div>
      </div>
      {a.status !== 'recusada' && (
        <div className="flex gap-2 mt-4">
          {a.status === 'pendente' && <Botao className="flex-1" onClick={confirmar} carregando={enviando}><Check className="h-4 w-4" />Confirmar</Botao>}
          {a.status === 'pendente' && <Botao variante="secundario" onClick={() => setPainel('recusar')}><X className="h-4 w-4" />Não posso</Botao>}
          {a.status === 'confirmada' && !trocaPendente && <Botao variante="secundario" className="flex-1" onClick={() => setPainel('troca')}><Repeat className="h-4 w-4" />Pedir troca</Botao>}
        </div>
      )}
      <PainelRecusar aberto={painel === 'recusar'} onFechar={() => setPainel(null)} alocacaoId={a.id} onFeito={onMudou} />
      <PainelTroca aberto={painel === 'troca'} onFechar={() => setPainel(null)} aloc={a} onFeito={onMudou} />
    </Card>
  )
}

function PainelRecusar({ aberto, onFechar, alocacaoId, onFeito }: { aberto: boolean; onFechar: () => void; alocacaoId: string; onFeito: () => void }) {
  const avisar = useAviso()
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  async function enviar() {
    setEnviando(true)
    const { error } = await supabase.rpc('responder_alocacao', { p_alocacao: alocacaoId, p_confirmar: false, p_motivo: motivo || null })
    setEnviando(false)
    if (error) return avisar(msgErro(error), 'erro')
    dispararWhatsApp(); avisar('Seu líder foi avisado.'); onFechar(); onFeito()
  }
  return (
    <Painel aberto={aberto} onFechar={onFechar} titulo="Não poderei servir" rodape={<Botao className="w-full" onClick={enviar} carregando={enviando}>Avisar o líder</Botao>}>
      <Campo rotulo="Motivo (opcional)"><Entrada value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: viagem, trabalho…" /></Campo>
    </Painel>
  )
}

function PainelTroca({ aberto, onFechar, aloc, onFeito }: { aberto: boolean; onFechar: () => void; aloc: MinhaAloc; onFeito: () => void }) {
  const avisar = useAviso()
  const { eu } = useAuth()
  const [motivo, setMotivo] = useState('')
  const [sub, setSub] = useState('')
  const [membros, setMembros] = useState<{ id: string; nome: string }[]>([])
  const [enviando, setEnviando] = useState(false)
  useEffect(() => {
    if (!aberto) return
    supabase.from('vinculos').select('pessoas(id,nome)').eq('org_id', aloc.escalas.org_id).eq('ativo', true).then(({ data }) => {
      const lista = ((data ?? []) as any[]).map((v) => v.pessoas).filter((p) => p && p.id !== eu?.id)
      const unicos = Array.from(new Map(lista.map((p: any) => [p.id, p])).values()) as { id: string; nome: string }[]
      setMembros(unicos.sort((a, b) => a.nome.localeCompare(b.nome)))
    })
  }, [aberto, aloc.escalas.org_id, eu?.id])
  async function enviar() {
    if (!motivo.trim()) return avisar('Conte o motivo da troca.', 'erro')
    setEnviando(true)
    const { error } = await supabase.rpc('pedir_troca', { p_alocacao: aloc.id, p_motivo: motivo, p_substituto: sub || null })
    setEnviando(false)
    if (error) return avisar(msgErro(error), 'erro')
    dispararWhatsApp(); avisar('Pedido enviado ao líder.'); onFechar(); onFeito()
  }
  return (
    <Painel aberto={aberto} onFechar={onFechar} titulo="Pedir troca" rodape={<Botao className="w-full" onClick={enviar} carregando={enviando}>Enviar pedido ao líder</Botao>}>
      <div className="space-y-4">
        <p className="text-sm text-white/70">{aloc.escalas.eventos.titulo} · {fmtDiaHora(aloc.escalas.eventos.inicio)}</p>
        <Campo rotulo="Motivo"><Entrada value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: vou viajar" /></Campo>
        <Campo rotulo="Quem pode te substituir? (opcional)" dica="Combine antes com a pessoa. O líder aprova a troca.">
          <Selecao value={sub} onChange={(e) => setSub(e.target.value)}>
            <option value="">Deixar o líder escolher</option>
            {membros.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </Selecao>
        </Campo>
      </div>
    </Painel>
  )
}
