import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { LogIn } from 'lucide-react'
import TelaMarca, { botaoClaro, campoEscuro } from '../components/TelaMarca'
import { supabase, msgErro } from '../lib/supabase'
import { useAuth } from '../lib/auth'

export default function Entrar() {
  const { session } = useAuth()
  const nav = useNavigate()
  const loc = useLocation() as { state?: { de?: string } }
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [info, setInfo] = useState('')
  const [enviando, setEnviando] = useState(false)
  if (session) return <Navigate to={loc.state?.de ?? '/'} replace />

  async function entrar(e: FormEvent) {
    e.preventDefault(); setErro(''); setEnviando(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha })
    setEnviando(false)
    if (error) return setErro(msgErro(error))
    nav(loc.state?.de ?? '/', { replace: true })
  }
  async function esqueci() {
    setErro(''); setInfo('')
    if (!email.trim()) return setErro('Digite seu e-mail acima e toque em "Esqueci minha senha".')
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/nova-senha` })
    if (error) return setErro(msgErro(error))
    setInfo('Enviamos um link para redefinir sua senha. Confira seu e-mail.')
  }

  return (
    <TelaMarca>
      <form onSubmit={entrar} className="space-y-3">
        <input className={campoEscuro} type="email" autoComplete="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className={campoEscuro} type="password" autoComplete="current-password" placeholder="Senha" value={senha} onChange={(e) => setSenha(e.target.value)} required />
        {erro && <p className="text-sm text-red-200">{erro}</p>}
        {info && <p className="text-sm text-verde-claro">{info}</p>}
        <button className={botaoClaro} disabled={enviando}><LogIn className="h-4 w-4" />{enviando ? 'Entrando…' : 'Entrar'}</button>
        <button type="button" onClick={esqueci} className="w-full text-center text-sm text-white/60 py-2">Esqueci minha senha</button>
      </form>
      <p className="text-center text-xs text-white/40 mt-8">Primeiro acesso? Use o link de convite que você recebeu no WhatsApp.</p>
    </TelaMarca>
  )
}
