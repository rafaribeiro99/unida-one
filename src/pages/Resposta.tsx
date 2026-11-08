import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Check, X } from 'lucide-react'
import TelaMarca, { botaoClaro, campoEscuro } from '../components/TelaMarca'
import { supabase, msgErro, dispararWhatsApp } from '../lib/supabase'
import { fmtDiaHora } from '../lib/datas'

interface Info { nome: string; ministerio: string; funcao: string | null; evento: string; inicio: string; local: string | null; status: string; cancelado: boolean; passado: boolean }

/** Confirmação em um toque pelo link do WhatsApp — não exige login */
export default function Resposta() {
  const { token = '' } = useParams()
  const [info, setInfo] = useState<Info | null | undefined>(undefined)
  const [recusando, setRecusando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => { supabase.rpc('info_alocacao_token', { p_token: token }).then(({ data }) => setInfo(data ?? null)) }, [token])

  async function responder(confirmar: boolean) {
    setErro(''); setEnviando(true)
    const { data, error } = await supabase.rpc('responder_por_token', { p_token: token, p_confirmar: confirmar, p_motivo: motivo || null })
    setEnviando(false)
    if (error) return setErro(msgErro(error))
    setInfo(data); setRecusando(false)
    if (!confirmar) dispararWhatsApp()
  }

  if (info === undefined) return <TelaMarca sub="Minha escala"><p className="text-center text-white/60">Carregando…</p></TelaMarca>
  if (!info) return <TelaMarca sub="Minha escala"><p className="text-center text-white/80">Link inválido.</p></TelaMarca>

  const encerrada = info.cancelado || info.passado
  return (
    <TelaMarca sub="Minha escala">
      <div className="rounded-3xl bg-white/[0.07] border border-white/10 p-5 text-center">
        <p className="text-white/70 text-sm">Olá, {info.nome}! Você está escalado(a) em</p>
        <p className="font-titulo text-xl font-semibold mt-2">{info.ministerio}{info.funcao ? ` · ${info.funcao}` : ''}</p>
        <p className="mt-3 font-medium">{info.evento}</p>
        <p className="text-verde-claro text-sm mt-1">{fmtDiaHora(info.inicio)}{info.local ? ` · ${info.local}` : ''}</p>
      </div>
      <div className="mt-6 space-y-3">
        {info.cancelado && <p className="text-center text-red-200">Este evento foi cancelado.</p>}
        {!info.cancelado && info.status === 'confirmada' && <p className="text-center text-verde-claro font-semibold">Presença confirmada. Obrigado por servir!</p>}
        {!info.cancelado && info.status === 'recusada' && <p className="text-center text-white/80">Você avisou que não poderá servir. Seu líder já foi avisado.</p>}
        {!encerrada && !recusando && (
          <>
            {info.status !== 'confirmada' && <button className={botaoClaro} disabled={enviando} onClick={() => responder(true)}><Check className="h-5 w-5" />Confirmar presença</button>}
            {info.status !== 'recusada' && <button className="w-full h-12 rounded-full border border-white/25 text-white font-semibold flex items-center justify-center gap-2" onClick={() => setRecusando(true)}><X className="h-5 w-5" />Não poderei</button>}
          </>
        )}
        {recusando && (
          <div className="space-y-3">
            <input className={campoEscuro} placeholder="Motivo (opcional)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            <button className={botaoClaro} disabled={enviando} onClick={() => responder(false)}>Avisar meu líder</button>
            <button className="w-full text-sm text-white/60 py-2" onClick={() => setRecusando(false)}>Voltar</button>
          </div>
        )}
        {erro && <p className="text-center text-red-200 text-sm">{erro}</p>}
        <Link to="/" className="block text-center text-sm text-white/60 pt-4">Abrir o app</Link>
      </div>
    </TelaMarca>
  )
}
