import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { Copy, MessageCircle } from 'lucide-react'
import { Botao, Campo, Entrada, Painel, Selecao, useAviso } from './ui'
import { supabase, msgErro, dispararWhatsApp } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { linkWhats, textoConvite } from '../lib/whats'
import { PAPEL_LABEL, type Funcao, type Papel } from '../lib/types'

export function SeletorFuncoes({ funcoes, valor, onChange }: { funcoes: Funcao[]; valor: string[]; onChange: (v: string[]) => void }) {
  if (!funcoes.length) return <p className="text-xs text-white/50">Este ministério ainda não tem funções cadastradas.</p>
  return (
    <div className="flex flex-wrap gap-2">
      {funcoes.map((f) => {
        const on = valor.includes(f.id)
        return (
          <button key={f.id} type="button" onClick={() => onChange(on ? valor.filter((x) => x !== f.id) : [...valor, f.id])}
            className={clsx('rounded-full px-3 h-8 text-sm border transition', on ? 'bg-verde-claro text-escuro border-verde-claro' : 'bg-white/[0.04] border-white/[0.08] text-white/70')}>
            {f.nome}
          </button>
        )
      })}
    </div>
  )
}

/** Mostra o link do convite com botões de copiar e enviar pelo WhatsApp */
export function LinkConvite({ nome, telefone, token }: { nome: string; telefone: string | null; token: string }) {
  const avisar = useAviso()
  const texto = textoConvite(nome, token)
  return (
    <div className="rounded-xl bg-verde-glow/10 border border-verde-glow/20 p-3 space-y-2">
      <p className="text-sm text-verde-glow font-medium">Link de acesso de {nome.split(' ')[0]}</p>
      <p className="text-xs break-all text-white/70">{location.origin}/convite/{token}</p>
      <div className="flex gap-2">
        <Botao variante="secundario" className="h-9 flex-1" onClick={() => { navigator.clipboard.writeText(texto); avisar('Mensagem copiada.') }}><Copy className="h-4 w-4" />Copiar</Botao>
        {telefone && <a className="flex-1" href={linkWhats(telefone, texto)} target="_blank" rel="noreferrer"><Botao className="h-9 w-full"><MessageCircle className="h-4 w-4" />WhatsApp</Botao></a>}
      </div>
    </div>
  )
}

export function PainelConvidar({ aberto, onFechar, orgId, funcoes, onFeito }: { aberto: boolean; onFechar: () => void; orgId: string; funcoes: Funcao[]; onFeito: () => void }) {
  const { supervisiono, orgPorId } = useAuth()
  const avisar = useAviso()
  const [modo, setModo] = useState<'nova' | 'existente'>('nova')
  const [f, setF] = useState({ nome: '', telefone: '', email: '', papel: 'membro' as Papel, pessoa_id: '' })
  const [fun, setFun] = useState<string[]>([])
  const [pessoas, setPessoas] = useState<{ id: string; nome: string }[]>([])
  const [busca, setBusca] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<{ nome: string; telefone: string | null; token: string } | null>(null)
  const sup = supervisiono(orgId)

  useEffect(() => {
    if (!aberto) return
    setF({ nome: '', telefone: '', email: '', papel: 'membro', pessoa_id: '' }); setFun([]); setResultado(null); setBusca(''); setModo('nova')
    supabase.from('pessoas').select('id,nome').eq('ativo', true).order('nome').then(({ data }) => setPessoas(data ?? []))
  }, [aberto])

  const filtradas = useMemo(() => {
    const b = busca.trim().toLowerCase()
    return b ? pessoas.filter((p) => p.nome.toLowerCase().includes(b)).slice(0, 8) : []
  }, [busca, pessoas])

  async function enviar() {
    if (modo === 'nova' && (!f.nome.trim() || f.telefone.replace(/\D/g, '').length < 10)) return avisar('Informe nome e WhatsApp com DDD.', 'erro')
    if (modo === 'existente' && !f.pessoa_id) return avisar('Escolha a pessoa.', 'erro')
    setEnviando(true)
    const { data, error } = await supabase.rpc('convidar_pessoa', {
      p_org: orgId, p_nome: f.nome, p_telefone: f.telefone, p_email: f.email || null, p_papel: f.papel, p_funcao_ids: fun,
      p_pessoa_id: modo === 'existente' ? f.pessoa_id : null,
    })
    setEnviando(false)
    if (error) return avisar(msgErro(error), 'erro')
    dispararWhatsApp(); onFeito()
    if (data?.status === 'pendente') { avisar('Pedido enviado para aprovação do supervisor.'); onFechar(); return }
    if (data?.token) setResultado({ nome: f.nome, telefone: f.telefone, token: data.token })
    else { avisar('Pessoa adicionada.'); onFechar() }
  }

  return (
    <Painel aberto={aberto} onFechar={onFechar} titulo={`Adicionar em ${orgPorId.get(orgId)?.nome ?? ''}`}
      rodape={resultado ? <Botao className="w-full" variante="secundario" onClick={onFechar}>Concluir</Botao> :
        <Botao className="w-full" onClick={enviar} carregando={enviando}>{sup ? 'Adicionar' : 'Enviar para aprovação'}</Botao>}>
      {resultado ? (
        <div className="space-y-3">
          <p className="text-sm text-white/70">Pessoa adicionada. Ela recebe o convite pelo WhatsApp automaticamente; se preferir, envie você mesmo:</p>
          <LinkConvite {...resultado} />
        </div>
      ) : (
        <div className="space-y-4">
          {!sup && <p className="text-xs rounded-xl bg-amber-400/10 text-amber-200 px-3 py-2">A inclusão será aprovada pelo supervisor do setor.</p>}
          <div className="flex gap-1 p-1 rounded-xl bg-white/[0.05]">
            {(['nova', 'existente'] as const).map((m) => (
              <button key={m} onClick={() => setModo(m)} className={clsx('flex-1 h-9 rounded-lg text-sm font-medium', modo === m ? 'bg-white/[0.04] text-white shadow-sm' : 'text-white/60')}>
                {m === 'nova' ? 'Pessoa nova' : 'Já cadastrada'}
              </button>
            ))}
          </div>
          {modo === 'nova' ? (
            <>
              <Campo rotulo="Nome completo"><Entrada value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></Campo>
              <Campo rotulo="WhatsApp (com DDD)"><Entrada inputMode="tel" value={f.telefone} onChange={(e) => setF({ ...f, telefone: e.target.value })} placeholder="(11) 99999-9999" /></Campo>
              <Campo rotulo="E-mail (opcional)"><Entrada type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Campo>
            </>
          ) : (
            <Campo rotulo="Buscar pessoa">
              <Entrada value={busca} onChange={(e) => { setBusca(e.target.value); setF({ ...f, pessoa_id: '' }) }} placeholder="Digite o nome" />
              <div className="space-y-1 mt-2">
                {filtradas.map((p) => (
                  <button key={p.id} onClick={() => { setF({ ...f, pessoa_id: p.id, nome: p.nome }); setBusca(p.nome) }}
                    className={clsx('w-full text-left rounded-lg px-3 py-2 text-sm', f.pessoa_id === p.id ? 'bg-verde-claro text-escuro' : 'bg-white/[0.04] hover:bg-white/5')}>{p.nome}</button>
                ))}
              </div>
            </Campo>
          )}
          <Campo rotulo="Funções"><SeletorFuncoes funcoes={funcoes} valor={fun} onChange={setFun} /></Campo>
          {sup && (
            <Campo rotulo="Papel">
              <Selecao value={f.papel} onChange={(e) => setF({ ...f, papel: e.target.value as Papel })}>
                {(['membro', 'lider', 'supervisor', 'coordenador', 'pastor', 'secretaria'] as Papel[]).map((p) => <option key={p} value={p}>{PAPEL_LABEL[p]}</option>)}
              </Selecao>
            </Campo>
          )}
        </div>
      )}
    </Painel>
  )
}
