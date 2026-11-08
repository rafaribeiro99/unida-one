import { Link } from 'react-router-dom'
import { CalendarCheck, CheckSquare, ChevronRight } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useData } from '../lib/useData'
import { supabase } from '../lib/supabase'
import { Card, Carregando, Vazio } from '../components/ui'
import { CartaoAlocacao, carregarMinhasAlocacoes } from '../components/Escalas'
import { usePendentes } from '../components/Layout'

export default function Inicio() {
  const { eu } = useAuth()
  const pend = usePendentes()
  const { data, loading, reload } = useData(async () => {
    const [alocs, trocas] = await Promise.all([
      carregarMinhasAlocacoes(eu!.id),
      supabase.from('solicitacoes').select('alocacao_id').eq('tipo', 'troca').eq('status', 'pendente').eq('solicitante_id', eu!.id),
    ])
    return { alocs, trocas: new Set((trocas.data ?? []).map((t) => t.alocacao_id as string)) }
  }, [eu?.id])

  const hora = new Date().getHours()
  const saud = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'
  const aConfirmar = data?.alocs.filter((a) => a.status === 'pendente') ?? []
  const proximas = data?.alocs.filter((a) => a.status !== 'pendente') ?? []

  return (
    <div>
      <div className="flex items-center gap-3 mb-6 md:hidden">
        <img src="/icon-192.png" alt="" className="h-10 w-10 rounded-xl" />
        <div className="font-titulo text-xl font-bold text-verde">unida<span className="font-normal text-verde-2">one</span></div>
      </div>
      <h1 className="font-titulo text-2xl font-bold text-verde">{saud}, {eu?.nome.split(' ')[0]}!</h1>
      <p className="text-sm text-grafite/60 mt-1 mb-6">
        {loading ? '…' : aConfirmar.length ? `Você tem ${aConfirmar.length} escala${aConfirmar.length > 1 ? 's' : ''} para confirmar.` : 'Tudo em dia por aqui.'}
      </p>

      {pend > 0 && (
        <Link to="/aprovacoes">
          <Card className="p-4 mb-6 flex items-center gap-3 bg-verde text-white border-0">
            <CheckSquare className="h-5 w-5 text-verde-claro" />
            <span className="flex-1 text-sm font-medium">{pend} pedido{pend > 1 ? 's' : ''} aguardando sua aprovação</span>
            <ChevronRight className="h-5 w-5 text-white/60" />
          </Card>
        </Link>
      )}

      {loading ? <Carregando /> : (
        <>
          {aConfirmar.length > 0 && (
            <section className="mb-8">
              <h2 className="text-sm font-semibold text-grafite/60 mb-3">Para confirmar</h2>
              <div className="space-y-3">{aConfirmar.map((a) => <CartaoAlocacao key={a.id} a={a} onMudou={reload} />)}</div>
            </section>
          )}
          <section>
            <h2 className="text-sm font-semibold text-grafite/60 mb-3">Próximas escalas</h2>
            {proximas.length ? (
              <div className="space-y-3">{proximas.map((a) => <CartaoAlocacao key={a.id} a={a} trocaPendente={data?.trocas.has(a.id)} onMudou={reload} />)}</div>
            ) : (
              <Card><Vazio icone={<CalendarCheck className="h-6 w-6" />} titulo="Nenhuma escala por enquanto" texto="Quando seu líder publicar uma escala com você, ela aparece aqui e você recebe um aviso no WhatsApp." /></Card>
            )}
          </section>
        </>
      )}
    </div>
  )
}
