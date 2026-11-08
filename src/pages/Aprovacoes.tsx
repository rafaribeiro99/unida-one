import { useState } from 'react'
import { CheckSquare, Check, X } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useData, q } from '../lib/useData'
import { supabase, msgErro, dispararWhatsApp } from '../lib/supabase'
import { fmtDiaHora } from '../lib/datas'
import { fmtTel } from '../lib/whats'
import { PAPEL_LABEL, TIPO_EVENTO_LABEL, type Papel, type Solicitacao } from '../lib/types'
import { Abas, Botao, Cabecalho, Card, Carregando, Entrada, Selo, Vazio, useAviso } from '../components/ui'
import { LinkConvite } from '../components/Pessoas'

type Sol = Solicitacao & { solicitante: { nome: string } | null; org: { nome: string } | null; eventos: { titulo: string; inicio: string } | null }

const TITULO: Record<Solicitacao['tipo'], string> = {
  convite: 'Incluir pessoa', evento_criar: 'Novo evento', evento_alterar: 'Alterar evento', evento_cancelar: 'Cancelar evento', troca: 'Troca de escala',
}

export default function Aprovacoes() {
  const { eu, aprovador } = useAuth()
  const [aba, setAba] = useState<'decidir' | 'meus'>(aprovador ? 'decidir' : 'meus')
  const { data, loading, reload } = useData(async () => {
    const r = await q(supabase.from('solicitacoes')
      .select('*,solicitante:pessoas!solicitacoes_solicitante_id_fkey(nome),org(nome),eventos(titulo,inicio)')
      .order('criado_em', { ascending: false }).limit(100))
    return r as unknown as Sol[]
  }, [])
  const decidir = (data ?? []).filter((s) => s.status === 'pendente' && s.solicitante_id !== eu?.id)
  const meus = (data ?? []).filter((s) => s.solicitante_id === eu?.id)
  const historico = (data ?? []).filter((s) => s.status !== 'pendente' && s.solicitante_id !== eu?.id).slice(0, 20)

  return (
    <div>
      <Cabecalho titulo="Aprovações" />
      <Abas valor={aba} onChange={setAba} opcoes={[...(aprovador ? [{ v: 'decidir' as const, rotulo: 'Para decidir', n: decidir.length }] : []), { v: 'meus' as const, rotulo: 'Meus pedidos' }]} />
      {loading ? <Carregando /> : aba === 'decidir' ? (
        <>
          {decidir.length === 0 ? <Card><Vazio icone={<CheckSquare className="h-6 w-6" />} titulo="Nada pendente" texto="Quando alguém pedir uma inclusão, evento ou troca, aparece aqui." /></Card>
            : <div className="space-y-3">{decidir.map((s) => <CartaoSol key={s.id} s={s} podeDecidir onMudou={reload} />)}</div>}
          {historico.length > 0 && (<>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-white/50 mt-8 mb-2">Decididas recentemente</h2>
            <div className="space-y-2">{historico.map((s) => <CartaoSol key={s.id} s={s} onMudou={reload} />)}</div>
          </>)}
        </>
      ) : meus.length === 0 ? <Card><Vazio titulo="Você ainda não fez pedidos" /></Card>
        : <div className="space-y-3">{meus.map((s) => <CartaoSol key={s.id} s={s} meu onMudou={reload} />)}</div>}
    </div>
  )
}

function CartaoSol({ s, podeDecidir, meu, onMudou }: { s: Sol; podeDecidir?: boolean; meu?: boolean; onMudou: () => void }) {
  const avisar = useAviso()
  const [resp, setResp] = useState('')
  const [enviando, setEnviando] = useState<'sim' | 'nao' | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const dd = s.dados ?? {}

  async function decidir(aprovar: boolean) {
    setEnviando(aprovar ? 'sim' : 'nao')
    const { data, error } = await supabase.rpc('decidir_solicitacao', { p_id: s.id, p_aprovar: aprovar, p_resposta: resp || null })
    setEnviando(null)
    if (error) return avisar(msgErro(error), 'erro')
    dispararWhatsApp()
    avisar(aprovar ? 'Aprovado.' : 'Recusado.')
    if (aprovar && s.tipo === 'convite' && data?.token) setToken(data.token)
    else onMudou()
  }
  async function cancelar() {
    const { error } = await supabase.rpc('cancelar_solicitacao', { p_id: s.id })
    if (error) return avisar(msgErro(error), 'erro')
    onMudou()
  }

  const status = s.status === 'pendente' ? <Selo cor="amarelo">Pendente</Selo> : s.status === 'aprovada' ? <Selo cor="verde">Aprovado</Selo>
    : s.status === 'recusada' ? <Selo cor="vermelho">Recusado</Selo> : <Selo>Cancelado</Selo>

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-verde-glow">{TITULO[s.tipo]}{s.org ? ` · ${s.org.nome}` : ''}</p>
          {!meu && <p className="text-xs text-white/50 mt-0.5">Pedido de {s.solicitante?.nome ?? '—'} · {fmtDiaHora(s.criado_em)}</p>}
        </div>
        {status}
      </div>
      <div className="mt-3 text-sm space-y-1">
        {s.tipo === 'convite' && (<>
          <p className="font-semibold text-white">{dd.nome}</p>
          {dd.telefone && <p className="text-white/60">WhatsApp: {fmtTel(dd.telefone)}</p>}
          {dd.papel && dd.papel !== 'membro' && <p className="text-white/60">Papel: {PAPEL_LABEL[dd.papel as Papel]}</p>}
        </>)}
        {s.tipo.startsWith('evento') && (<>
          <p className="font-semibold text-white">{dd.titulo ?? s.eventos?.titulo}</p>
          {dd.inicio && <p className="text-white/60">{fmtDiaHora(dd.inicio)}{dd.tipo ? ` · ${TIPO_EVENTO_LABEL[dd.tipo as keyof typeof TIPO_EVENTO_LABEL]}` : ''}{dd.repetir_ate ? ` · toda semana até ${dd.repetir_ate.split('-').reverse().join('/')}` : ''}</p>}
          {s.tipo !== 'evento_criar' && s.eventos && <p className="text-white/60">Evento atual: {fmtDiaHora(s.eventos.inicio)}</p>}
          {dd.local && <p className="text-white/60">Local: {dd.local}</p>}
        </>)}
        {s.tipo === 'troca' && (<>
          <p className="font-semibold text-white">{dd.resumo}</p>
          <p className="text-white/70">Motivo: {dd.motivo}</p>
          <p className="text-white/70">{dd.substituto_nome ? `Substituto sugerido: ${dd.substituto_nome}` : 'Sem substituto: você escolhe depois de aprovar.'}</p>
        </>)}
        {s.resposta && <p className="text-white/60 italic">“{s.resposta}”</p>}
      </div>
      {token && <div className="mt-3"><LinkConvite nome={dd.nome} telefone={dd.telefone} token={token} /><Botao variante="fantasma" className="w-full mt-2" onClick={onMudou}>Concluir</Botao></div>}
      {podeDecidir && s.status === 'pendente' && !token && (
        <div className="mt-4 space-y-2">
          <Entrada value={resp} onChange={(e) => setResp(e.target.value)} placeholder="Mensagem (opcional)" className="h-10" />
          <div className="flex gap-2">
            <Botao className="flex-1" onClick={() => decidir(true)} carregando={enviando === 'sim'}><Check className="h-4 w-4" />Aprovar</Botao>
            <Botao variante="perigo" className="flex-1" onClick={() => decidir(false)} carregando={enviando === 'nao'}><X className="h-4 w-4" />Recusar</Botao>
          </div>
        </div>
      )}
      {meu && s.status === 'pendente' && <Botao variante="fantasma" className="w-full mt-3 h-9" onClick={cancelar}>Cancelar pedido</Botao>}
    </Card>
  )
}
