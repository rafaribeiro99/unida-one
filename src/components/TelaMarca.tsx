import type { ReactNode } from 'react'

/** Fundo verde da marca, usado no login, convite e confirmação rápida */
export default function TelaMarca({ children, sub = 'A plataforma da nossa igreja' }: { children: ReactNode; sub?: string }) {
  return (
    <div className="min-h-screen relative overflow-hidden bg-verde text-white flex flex-col">
      <div className="pointer-events-none absolute -top-40 -right-40 h-[420px] w-[420px] rounded-full bg-verde-glow/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-48 -left-32 h-[380px] w-[380px] rounded-full bg-verde-2/50 blur-3xl" />
      <div className="relative flex-1 flex flex-col items-center justify-center px-6 py-10">
        <img src="/logo-horizontal-branco.png" alt="Igreja Batista Unida da Graça" className="h-12 mb-8 opacity-95" />
        <div className="font-titulo text-[44px] leading-none font-bold tracking-tight">unida<span className="font-normal text-verde-claro">one</span></div>
        <div className="h-1 w-8 rounded-full bg-verde-claro mt-4" />
        <p className="mt-3 text-[11px] tracking-[0.3em] uppercase text-white/60">{sub}</p>
        <div className="w-full max-w-sm mt-10">{children}</div>
      </div>
    </div>
  )
}

export const campoEscuro = 'w-full rounded-xl bg-white/[0.07] border border-white/15 px-4 h-12 text-[15px] text-white placeholder:text-white/40 outline-none focus:border-verde-claro/70'
export const botaoClaro = 'w-full h-12 rounded-full bg-verde-claro text-verde font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition disabled:opacity-60'
