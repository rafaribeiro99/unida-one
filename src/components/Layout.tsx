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
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-verde text-white">
        <div className="px-6 py-6 flex items-center gap-3">
          <img src="/symbol.png" alt="" className="h-9" />
          <div className="font-titulo text-2xl font-bold tracking-tight">unida<span className="font-normal text-verde-claro">one</span></div>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {[...itens, ...(admin ? [{ to: '/admin', rotulo: 'Administração', icone: Settings }] : [])].map((i) => (
            <NavLink key={i.to} to={i.to} end={'fim' in i}
              className={({ isActive }) => clsx('flex items-center gap-3 rounded-xl px-3 h-11 text-sm font-medium transition',
                isActive ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5')}>
              <i.icone className="h-[18px] w-[18px]" />
              <span className="flex-1">{i.rotulo}</span>
              {'n' in i && i.n ? <span className="rounded-full bg-verde-claro text-verde text-[11px] font-bold px-2">{i.n}</span> : null}
            </NavLink>
          ))}
        </nav>
        <p className="px-6 py-5 text-xs text-white/40">Igreja Batista Unida da Graça</p>
      </aside>

      <main className="flex-1 md:ml-64">
        <div className="mx-auto max-w-3xl px-4 pt-[max(20px,env(safe-area-inset-top))] pb-nav md:pb-10 md:pt-10">
          <Outlet />
        </div>
      </main>

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-black/5 pb-[env(safe-area-inset-bottom)]">
        <div className="flex">
          {itens.map((i) => (
            <NavLink key={i.to} to={i.to} end={'fim' in i}
              className={({ isActive }) => clsx('relative flex-1 flex flex-col items-center gap-1 pt-2.5 pb-2 text-[11px] font-medium',
                isActive ? 'text-verde' : 'text-grafite/45')}>
              {({ isActive }) => (<>
                <span className={clsx('grid place-items-center h-7 w-12 rounded-full transition', isActive && 'bg-verde-claro/50')}>
                  <i.icone className="h-[19px] w-[19px]" />
                </span>
                {i.rotulo}
                {'n' in i && i.n ? <span className="absolute top-1.5 right-[22%] rounded-full bg-red-500 text-white text-[10px] font-bold px-1.5">{i.n}</span> : null}
              </>)}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
