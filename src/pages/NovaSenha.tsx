import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import TelaMarca, { botaoClaro, campoEscuro } from '../components/TelaMarca'
import { supabase, msgErro } from '../lib/supabase'

export default function NovaSenha() {
  const nav = useNavigate()
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (senha.length < 6) return setErro('A senha precisa ter pelo menos 6 caracteres.')
    const { error } = await supabase.auth.updateUser({ password: senha })
    if (error) return setErro(msgErro(error))
    nav('/', { replace: true })
  }
  return (
    <TelaMarca sub="Nova senha">
      <form onSubmit={salvar} className="space-y-3">
        <input className={campoEscuro} type="password" placeholder="Nova senha" value={senha} onChange={(e) => setSenha(e.target.value)} />
        {erro && <p className="text-sm text-red-200">{erro}</p>}
        <button className={botaoClaro}>Salvar senha</button>
      </form>
    </TelaMarca>
  )
}
