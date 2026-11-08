import clsx from 'clsx'
import { NavLink, Outlet } from 'react-router-dom'
import { CalendarDays, CheckSquare, Home, Layers, Settings, UserRound } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function usePendentes() {
  const { aprovador, eu } = useAuth()
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!aprovador || !eu) return
    const carregar = () => supabase.from('solicitacoes').select('id', { count: 'exact', head: true })
      .eq('status', 'pendente').neq('solicitante_id', eu.id).then(({ count }) => setN(count ?? 0))
    carregar()
    const t = setInterval(carregar, 60000)
    window.addEventListener('focus', carregar)
    return () => { clearInterval(t); window.removeEventListener('focus', carregar) }
  }, [aprovador, eu])
  return n
}

export function Marca({ tamanho = 'md', clara = true }: { tamanho?: 'sm' | 'md'; clara?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <img src="/symbol.png" alt="" className={clsx(tamanho === 'sm' ? 'h-6' : 'h-8', !clara && 'invert-[.85] sepia hue-rotate-[100deg]')} />
      <span className={clsx('font-titulo font-extrabold tracking-tight', clara ? 'text-white' : 'text-verde', tamanho === 'sm' ? 'text-lg' : 'text-[22px]')}>
        unida<span className={clsx('font-medium', clara ? 'text-verde-glow' : 'text-verde-2')}>one</span>
      </span>
    </div>
  )
}

export default function Layout() {
  const { aprovador, admin, minhasAreas } = useAuth()
  const pend = usePendentes()
  const itens = [
    { to: '/', rotulo: 'Início', icone: Home, fim: true },
    { to: '/agenda', rotulo: 'Agenda', icone: CalendarDays },
    ...(minhasAreas.length ? [{ to: '/ministerios', rotulo: 'Ministérios', icone: Layers }] : []),
    ...(aprovador ? [{ to: '/aprovacoes', rotulo: 'Aprovações', icone: CheckSquare, n: pend }] : []),
    { to: '/perfil', rotulo: 'Perfil', icone: UserRound },
  ]
  return (
    <div className="min-h-screen md:flex">
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bloco-marca text-white">
        <div className="px-6 py-7"><Marca /></div>
        <nav className="flex-1 px-3 space-y-1">
          {[...itens, ...(admin ? [{ to: '/admin', rotulo: 'Administração', icone: Settings }] : [])].map((i) => (
            <NavLink key={i.to} to={i.to} end={'fim' in i}
              className={({ isActive }) => clsx('flex items-center gap-3 rounded-xl px-3 h-11 text-sm font-medium transition',
                isActive ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white')}>
              <i.icone className="h-[18px] w-[18px]" />
              <span className="flex-1">{i.rotulo}</span>
              {'n' in i && i.n ? <span className="rounded-full bg-verde-glow text-verde text-[11px] font-bold px-2">{i.n}</span> : null}
            </NavLink>
          ))}
        </nav>
        <p className="px-6 py-5 text-xs text-white/35">Igreja Batista Unida da Graça</p>
      </aside>

      <main className="flex-1 md:ml-64">
        <div className="mx-auto max-w-3xl px-4 pt-[max(16px,env(safe-area-inset-top))] pb-nav md:pb-12 md:pt-10">
          <Outlet />
        </div>
      </main>

      <nav className="md:hidden fixed bottom-3 inset-x-3 z-40 rounded-[26px] bg-white/95 backdrop-blur-xl border border-black/[0.05] shadow-[0_10px_30px_-10px_rgba(11,46,38,0.35)] mb-[env(safe-area-inset-bottom)]">
        <div className="flex px-1.5 py-1.5">
          {itens.map((i) => (
            <NavLink key={i.to} to={i.to} end={'fim' in i}
              className={({ isActive }) => clsx('relative flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-[20px] text-[10.5px] font-semibold transition',
                isActive ? 'text-verde bg-verde-claro/45' : 'text-grafite/40')}>
              <i.icone className="h-[21px] w-[21px]" strokeWidth={1.9} />
              {i.rotulo}
              {'n' in i && i.n ? <span className="absolute top-0.5 right-[18%] min-w-[18px] text-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1">{i.n}</span> : null}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
