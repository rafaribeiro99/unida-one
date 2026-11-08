import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import TelaMarca, { botaoClaro, campoEscuro } from '../components/TelaMarca'
import { supabase, msgErro } from '../lib/supabase'

export default function Convite() {
  const { token = '' } = useParams()
  const nav = useNavigate()
  const [info, setInfo] = useState<{ nome: string; email: string | null; valido: boolean } | null | undefined>(undefined)
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    supabase.rpc('info_convite', { p_token: token }).then(({ data }) => {
      setInfo(data ?? null)
      if (data?.email) setEmail(data.email)
    })
  }, [token])

  async function ativar(e: FormEvent) {
    e.preventDefault(); setErro('')
    if (senha.length < 6) return setErro('A senha precisa ter pelo menos 6 caracteres.')
    setEnviando(true)
    const { data, error } = await supabase.functions.invoke('ativar-convite', { body: { token, email: email.trim(), senha } })
    if (error || data?.erro) { setEnviando(false); return setErro(data?.erro ?? msgErro(error)) }
    const r = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha })
    setEnviando(false)
    if (r.error) return setErro(msgErro(r.error))
    nav('/', { replace: true })
  }

  if (info === undefined) return <TelaMarca><p className="text-center text-white/60">Carregando…</p></TelaMarca>
  if (!info || !info.valido) return (
    <TelaMarca sub="Convite">
      <p className="text-center text-white/80">Este convite não é mais válido. Peça um novo link ao seu líder.</p>
    </TelaMarca>
  )
  return (
    <TelaMarca sub="Criar meu acesso">
      <p className="text-center mb-5 text-white/80">Olá, <b className="text-white">{info.nome.split(' ')[0]}</b>! Crie seu acesso para ver suas escalas.</p>
      <form onSubmit={ativar} className="space-y-3">
        <input className={campoEscuro} type="email" placeholder="Seu e-mail" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className={campoEscuro} type="password" placeholder="Crie uma senha (mín. 6)" value={senha} onChange={(e) => setSenha(e.target.value)} required />
        {erro && <p className="text-sm text-red-200">{erro}</p>}
        <button className={botaoClaro} disabled={enviando}>{enviando ? 'Criando…' : 'Criar acesso'}</button>
      </form>
    </TelaMarca>
  )
}
