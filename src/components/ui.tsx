import clsx from 'clsx'
import { createContext, useCallback, useContext, useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { Loader2, X } from 'lucide-react'

type Variante = 'primario' | 'secundario' | 'fantasma' | 'perigo' | 'claro'
export function Botao({ variante = 'primario', carregando, className, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; carregando?: boolean }) {
  return (
    <button
      {...p}
      disabled={p.disabled || carregando}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-full px-5 h-11 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none',
        variante === 'primario' && 'bg-verde-claro text-escuro hover:bg-verde-suave shadow-[0_8px_24px_-8px_rgba(110,231,183,0.45)]',
        variante === 'secundario' && 'border border-white/[0.12] text-white bg-white/[0.04] hover:bg-white/[0.08]',
        variante === 'fantasma' && 'text-verde-claro hover:bg-white/5',
        variante === 'perigo' && 'border border-red-400/25 text-red-300 bg-red-500/[0.06] hover:bg-red-500/10',
        variante === 'claro' && 'bg-white/10 text-white hover:bg-white/15',
        className,
      )}
    >
      {carregando && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  )
}

export function Card({ className, children, onClick }: { className?: string; children: ReactNode; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={clsx('rounded-2xl bg-white/[0.035] border border-white/[0.07] backdrop-blur-sm', onClick && 'cursor-pointer hover:bg-white/[0.06] active:scale-[0.995] transition', className)}>
      {children}
    </div>
  )
}

export function Selo({ cor = 'cinza', children }: { cor?: 'verde' | 'cinza' | 'amarelo' | 'vermelho' | 'claro'; children: ReactNode }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap',
      cor === 'verde' && 'bg-verde-glow/[0.12] text-verde-glow',
      cor === 'claro' && 'bg-verde-claro/[0.12] text-verde-claro',
      cor === 'cinza' && 'bg-white/[0.06] text-white/60',
      cor === 'amarelo' && 'bg-amber-400/[0.12] text-amber-200',
      cor === 'vermelho' && 'bg-red-500/15 text-red-300',
    )}>{children}</span>
  )
}

const campo = 'w-full rounded-xl border border-white/10 bg-white/[0.05] px-3.5 h-11 text-[15px] text-white placeholder:text-white/35 outline-none focus:border-verde-glow/60 focus:ring-2 focus:ring-verde-glow/15'
export function Campo({ rotulo, dica, children }: { rotulo?: string; dica?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      {rotulo && <span className="text-[13px] font-medium text-white/70">{rotulo}</span>}
      {children}
      {dica && <span className="block text-xs text-white/40">{dica}</span>}
    </label>
  )
}
export const Entrada = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={clsx(campo, p.className)} />
export const Selecao = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={clsx(campo, 'pr-8', p.className)} />
export const Texto = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={clsx(campo, 'h-auto py-2.5 min-h-[80px]', p.className)} />

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return <div className="flex items-center justify-center gap-2 py-16 text-sm text-white/40"><Loader2 className="h-4 w-4 animate-spin" />{texto}</div>
}

export function Vazio({ icone, titulo, texto, acao }: { icone?: ReactNode; titulo: string; texto?: string; acao?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center py-12 px-6 gap-2">
      {icone && <div className="h-12 w-12 rounded-2xl bg-verde-glow/10 text-verde-glow grid place-items-center mb-1 shadow-glow">{icone}</div>}
      <p className="font-titulo font-semibold text-white">{titulo}</p>
      {texto && <p className="text-sm text-white/50 max-w-xs">{texto}</p>}
      {acao && <div className="mt-2">{acao}</div>}
    </div>
  )
}

export function Cabecalho({ titulo, sub, acao, voltar }: { titulo: string; sub?: string; acao?: ReactNode; voltar?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-5">
      <div className="min-w-0">
        {voltar}
        <h1 className="font-titulo text-[24px] font-bold text-white leading-tight tracking-tight truncate">{titulo}</h1>
        {sub && <p className="text-sm text-white/50 mt-1">{sub}</p>}
      </div>
      {acao}
    </div>
  )
}

export function Abas<T extends string>({ valor, opcoes, onChange }: { valor: T; opcoes: { v: T; rotulo: string; n?: number }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1 p-1 rounded-full bg-white/[0.05] border border-white/[0.06] mb-5 overflow-x-auto sem-barra">
      {opcoes.map((o) => (
        <button key={o.v} onClick={() => onChange(o.v)}
          className={clsx('flex-1 whitespace-nowrap rounded-full px-3 h-9 text-sm font-medium transition',
            valor === o.v ? 'bg-white/[0.1] text-white' : 'text-white/50')}>
          {o.rotulo}{o.n ? <span className="ml-1.5 rounded-full bg-verde-glow text-escuro text-[10px] font-bold px-1.5 py-0.5">{o.n}</span> : null}
        </button>
      ))}
    </div>
  )
}

/** Painel que sobe de baixo no celular e vira modal no computador */
export function Painel({ aberto, onFechar, titulo, children, rodape }: { aberto: boolean; onFechar: () => void; titulo: string; children: ReactNode; rodape?: ReactNode }) {
  useEffect(() => {
    if (!aberto) return
    const f = (e: KeyboardEvent) => e.key === 'Escape' && onFechar()
    window.addEventListener('keydown', f)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', f); document.body.style.overflow = '' }
  }, [aberto, onFechar])
  if (!aberto) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onFechar} />
      <div className="relative w-full sm:max-w-lg max-h-[92vh] flex flex-col rounded-t-[28px] sm:rounded-[28px] bg-painel border border-white/[0.08] shadow-2xl animate-[subir_.18s_ease-out]">
        <div className="sm:hidden mx-auto mt-2.5 h-1 w-10 rounded-full bg-white/15" />
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <h2 className="font-titulo font-bold text-lg text-white">{titulo}</h2>
          <button onClick={onFechar} className="h-9 w-9 grid place-items-center rounded-full text-white/60 hover:bg-white/5" aria-label="Fechar"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-5 pb-4 overflow-y-auto flex-1">{children}</div>
        {rodape && <div className="px-5 py-3 border-t border-white/[0.06] pb-[max(12px,env(safe-area-inset-bottom))]">{rodape}</div>}
      </div>
    </div>
  )
}

// Avisos rápidos
type Aviso = { id: number; texto: string; tipo: 'ok' | 'erro' }
const AvisoCtx = createContext<(texto: string, tipo?: 'ok' | 'erro') => void>(() => {})
export function AvisosProvider({ children }: { children: ReactNode }) {
  const [lista, setLista] = useState<Aviso[]>([])
  const avisar = useCallback((texto: string, tipo: 'ok' | 'erro' = 'ok') => {
    const id = Date.now() + Math.random()
    setLista((l) => [...l, { id, texto, tipo }])
    setTimeout(() => setLista((l) => l.filter((a) => a.id !== id)), tipo === 'erro' ? 6000 : 3500)
  }, [])
  return (
    <AvisoCtx.Provider value={avisar}>
      {children}
      <div className="fixed z-[60] left-0 right-0 top-3 flex flex-col items-center gap-2 px-4 pointer-events-none">
        {lista.map((a) => (
          <div key={a.id} className={clsx('pointer-events-auto max-w-md w-full rounded-xl px-4 py-3 text-sm font-medium shadow-lg',
            a.tipo === 'ok' ? 'bg-verde-claro text-escuro' : 'bg-red-500 text-white')}>{a.texto}</div>
        ))}
      </div>
    </AvisoCtx.Provider>
  )
}
export const useAviso = () => useContext(AvisoCtx)

export function Iniciais({ nome, className }: { nome: string; className?: string }) {
  const ini = nome.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
  return <div className={clsx('shrink-0 grid place-items-center rounded-full bg-gradient-to-br from-verde-2 to-verde text-verde-claro ring-1 ring-white/10 font-semibold text-xs', className ?? 'h-9 w-9')}>{ini}</div>
}

export function StatusAloc({ status }: { status: string }) {
  if (status === 'confirmada') return <Selo cor="verde">Confirmado</Selo>
  if (status === 'recusada') return <Selo cor="vermelho">Não pode</Selo>
  return <Selo cor="amarelo">Aguardando</Selo>
}
