import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { addDays } from 'date-fns'
import { ArrowLeft, ChevronRight, Plus, Trash2, UserPlus } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { carregarContatos } from '../lib/contatos'
import { useData, q } from '../lib/useData'
import { supabase, msgErro } from '../lib/supabase'
import { fmtDiaHora } from '../lib/datas'
import { fmtTel } from '../lib/whats'
import { PAPEL_LABEL, TIPO_EVENTO_LABEL, type Evento, type Funcao, type Papel } from '../lib/types'
import { Abas, Botao, Cabecalho, Campo, Card, Carregando, Entrada, Iniciais, Painel, Selecao, Selo, Vazio, useAviso } from '../components/ui'
import { FormEvento } from '../components/Eventos'
import { LinkConvite, PainelConvidar, SeletorFuncoes } from '../components/Pessoas'

interface Membro { id: string; papel: Papel; funcao_ids: string[]; ativo: boolean; pessoas: { id: string; nome: string; telefone: string | null; user_id: string | null } }

export default function Ministerio() {
  const { id = '' } = useParams()
  const { orgPorId, gerencio, caminho } = useAuth()
  const org = orgPorId.get(id)
  const [aba, setAba] = useState<'escalas' | 'pessoas' | 'funcoes'>('escalas')
  const gere = gerencio(id)

  const { data, loading, reload } = useData(async () => {
    const ate = addDays(new Date(), 60).toISOString()
    const [eventos, escalas, membros, funcoes] = await Promise.all([
      q(supabase.from('eventos').select('*').gte('fim', new Date().toISOString()).lte('inicio', ate).eq('cancelado', false).or(`org_id.is.null,org_id.eq.${id}`).order('inicio')),
      q(supabase.from('escalas').select('id,evento_id,publicada,alocacoes(status)').eq('org_id', id)),
      q(supabase.from('vinculos').select('id,papel,funcao_ids,ativo,pessoas(id,nome,user_id)').eq('org_id', id).eq('ativo', true)),
      q(supabase.from('funcoes').select('*').eq('org_id', id).order('ordem').order('nome')),
    ])
    const escalaPorEvento = new Map((escalas as any[]).map((s) => [s.evento_id, s]))
    const cs = await carregarContatos((membros as any[]).map((m) => m.pessoas.id))
    const ms = (membros as unknown as Membro[]).map((m) => ({ ...m, pessoas: { ...m.pessoas, telefone: cs.get(m.pessoas.id)?.telefone ?? null } }))
      .sort((a, b) => a.pessoas.nome.localeCompare(b.pessoas.nome))
    return { eventos: eventos as Evento[], escalaPorEvento, membros: ms, funcoes: funcoes as Funcao[] }
  }, [id])

  if (!org) return <Carregando />
  return (
    <div>
      <Cabecalho titulo={org.nome} sub={caminho(org.id)}
        voltar={<Link to="/ministerios" className="inline-flex items-center gap-1 text-sm text-grafite/50 mb-2"><ArrowLeft className="h-4 w-4" />Ministérios</Link>} />
      <Abas valor={aba} onChange={setAba} opcoes={[{ v: 'escalas', rotulo: 'Escalas' }, { v: 'pessoas', rotulo: 'Pessoas', n: data?.membros.length }, { v: 'funcoes', rotulo: 'Funções' }]} />
      {loading || !data ? <Carregando /> : aba === 'escalas' ? <AbaEscalas orgId={id} gere={gere} {...data} onMudou={reload} />
        : aba === 'pessoas' ? <AbaPessoas orgId={id} gere={gere} membros={data.membros} funcoes={data.funcoes} onMudou={reload} />
        : <AbaFuncoes orgId={id} gere={gere} funcoes={data.funcoes} onMudou={reload} />}
    </div>
  )
}

function AbaEscalas({ orgId, gere, eventos, escalaPorEvento, onMudou }: { orgId: string; gere: boolean; eventos: Evento[]; escalaPorEvento: Map<string, any>; onMudou: () => void }) {
  const nav = useNavigate()
  const [novo, setNovo] = useState(false)
  const [so, setSo] = useState(!gere)
  const lista = so ? eventos.filter((e) => escalaPorEvento.has(e.id)) : eventos
  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-2">
        <label className="flex items-center gap-2 text-sm text-grafite/70"><input type="checkbox" checked={so} onChange={(e) => setSo(e.target.checked)} className="accent-[#145C46] h-4 w-4" />Só com escala</label>
        {gere && <Botao variante="secundario" className="h-9" onClick={() => setNovo(true)}><Plus className="h-4 w-4" />Ensaio / reunião</Botao>}
      </div>
      {lista.length === 0 ? <Card><Vazio titulo="Nenhum evento nos próximos 60 dias" /></Card> : (
        <div className="space-y-2">
          {lista.map((e) => {
            const s = escalaPorEvento.get(e.id)
            const tot = s?.alocacoes.filter((a: any) => a.status !== 'recusada').length ?? 0
            const conf = s?.alocacoes.filter((a: any) => a.status === 'confirmada').length ?? 0
            const rec = s?.alocacoes.filter((a: any) => a.status === 'recusada').length ?? 0
            return (
              <Card key={e.id} className="p-3.5 flex items-center gap-3" onClick={() => gere ? nav(`/ministerios/${orgId}/escala/${e.id}`) : nav(`/culto/${e.id}`)}>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{e.titulo}</p>
                  <p className="text-xs text-grafite/55 mt-0.5">{fmtDiaHora(e.inicio)} · {TIPO_EVENTO_LABEL[e.tipo]}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {!s ? (gere ? <Selo>Sem escala</Selo> : null) : !s.publicada ? <Selo cor="amarelo">Rascunho</Selo> : gere ? <Selo cor="verde">{conf}/{tot} confirmados</Selo> : <Selo cor="claro">Escala publicada</Selo>}
                  {gere && rec > 0 && <Selo cor="vermelho">{rec} não pode{rec > 1 ? 'm' : ''}</Selo>}
                </div>
                {gere && <ChevronRight className="h-5 w-5 text-grafite/30" />}
              </Card>
            )
          })}
        </div>
      )}
      <FormEvento aberto={novo} onFechar={() => setNovo(false)} orgPadrao={orgId} onSalvo={onMudou} />
    </div>
  )
}

function AbaPessoas({ orgId, gere, membros, funcoes, onMudou }: { orgId: string; gere: boolean; membros: Membro[]; funcoes: Funcao[]; onMudou: () => void }) {
  const [convidar, setConvidar] = useState(false)
  const [editando, setEditando] = useState<Membro | null>(null)
  const nomeFuncao = useMemo(() => new Map(funcoes.map((f) => [f.id, f.nome])), [funcoes])
  const ordem: Papel[] = ['coordenador', 'supervisor', 'lider', 'pastor', 'secretaria', 'membro']
  const lista = [...membros].sort((a, b) => ordem.indexOf(a.papel) - ordem.indexOf(b.papel))
  return (
    <div>
      {gere && <Botao className="w-full mb-4" onClick={() => setConvidar(true)}><UserPlus className="h-4 w-4" />Adicionar pessoa</Botao>}
      {lista.length === 0 ? <Card><Vazio titulo="Ninguém por aqui ainda" /></Card> : (
        <Card className="divide-y divide-black/[0.06]">
          {lista.map((m) => (
            <div key={m.id} className="p-3.5 flex items-center gap-3" onClick={() => gere && setEditando(m)} role={gere ? 'button' : undefined}>
              <Iniciais nome={m.pessoas.nome} />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{m.pessoas.nome}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {m.papel !== 'membro' && <Selo cor="claro">{PAPEL_LABEL[m.papel]}</Selo>}
                  {m.funcao_ids.map((f) => nomeFuncao.get(f) && <Selo key={f}>{nomeFuncao.get(f)}</Selo>)}
                  {!m.pessoas.user_id && <Selo cor="amarelo">Sem acesso ainda</Selo>}
                </div>
              </div>
              {gere && <ChevronRight className="h-5 w-5 text-grafite/30" />}
            </div>
          ))}
        </Card>
      )}
      <PainelConvidar aberto={convidar} onFechar={() => setConvidar(false)} orgId={orgId} funcoes={funcoes} onFeito={onMudou} />
      <PainelMembro membro={editando} onFechar={() => setEditando(null)} orgId={orgId} funcoes={funcoes} onMudou={onMudou} />
    </div>
  )
}

function PainelMembro({ membro, onFechar, orgId, funcoes, onMudou }: { membro: Membro | null; onFechar: () => void; orgId: string; funcoes: Funcao[]; onMudou: () => void }) {
  const { supervisiono } = useAuth()
  const avisar = useAviso()
  const [fun, setFun] = useState<string[]>([])
  const [papel, setPapel] = useState<Papel>('membro')
  const [token, setToken] = useState<string | null>(null)
  const [ultimo, setUltimo] = useState<string | null>(null)
  if (membro && ultimo !== membro.id) { setUltimo(membro.id); setFun(membro.funcao_ids); setPapel(membro.papel); setToken(null) }
  if (!membro) return null
  const sup = supervisiono(orgId)

  async function salvar() {
    const { error } = await supabase.from('vinculos').update({ funcao_ids: fun, ...(sup ? { papel } : {}) }).eq('id', membro!.id)
    if (error) return avisar(msgErro(error), 'erro')
    avisar('Salvo.'); onFechar(); onMudou()
  }
  async function remover() {
    if (!confirm(`Remover ${membro!.pessoas.nome} deste ministério?`)) return
    const { error } = await supabase.from('vinculos').update({ ativo: false }).eq('id', membro!.id)
    if (error) return avisar(msgErro(error), 'erro')
    avisar('Removido do ministério.'); onFechar(); onMudou()
  }
  async function gerarLink() {
    const { data, error } = await supabase.rpc('novo_link_convite', { p_pessoa: membro!.pessoas.id })
    if (error) return avisar(msgErro(error), 'erro')
    setToken(data as string)
  }
  return (
    <Painel aberto onFechar={() => { setUltimo(null); onFechar() }} titulo={membro.pessoas.nome}
      rodape={<div className="flex gap-2"><Botao variante="perigo" onClick={remover}><Trash2 className="h-4 w-4" /></Botao><Botao className="flex-1" onClick={salvar}>Salvar</Botao></div>}>
      <div className="space-y-4">
        {membro.pessoas.telefone && <p className="text-sm text-grafite/60">WhatsApp: {fmtTel(membro.pessoas.telefone)}</p>}
        <Campo rotulo="Funções"><SeletorFuncoes funcoes={funcoes} valor={fun} onChange={setFun} /></Campo>
        {sup && (
          <Campo rotulo="Papel">
            <Selecao value={papel} onChange={(e) => setPapel(e.target.value as Papel)}>
              {(['membro', 'lider', 'supervisor', 'coordenador', 'pastor', 'secretaria'] as Papel[]).map((p) => <option key={p} value={p}>{PAPEL_LABEL[p]}</option>)}
            </Selecao>
          </Campo>
        )}
        {!membro.pessoas.user_id && (token ? <LinkConvite nome={membro.pessoas.nome} telefone={membro.pessoas.telefone} token={token} />
          : <Botao variante="secundario" className="w-full" onClick={gerarLink}>Gerar link de acesso</Botao>)}
      </div>
    </Painel>
  )
}

function AbaFuncoes({ orgId, gere, funcoes, onMudou }: { orgId: string; gere: boolean; funcoes: Funcao[]; onMudou: () => void }) {
  const avisar = useAviso()
  const [nome, setNome] = useState('')
  const [painel, setPainel] = useState(false)
  async function adicionar() {
    if (!nome.trim()) return
    const { error } = await supabase.from('funcoes').insert({ org_id: orgId, nome: nome.trim(), ordem: funcoes.length + 1 })
    if (error) return avisar(msgErro(error), 'erro')
    setNome(''); setPainel(false); onMudou()
  }
  async function remover(f: Funcao) {
    if (!confirm(`Remover a função "${f.nome}"?`)) return
    const { error } = await supabase.from('funcoes').delete().eq('id', f.id)
    if (error) return avisar(msgErro(error), 'erro')
    onMudou()
  }
  return (
    <div>
      <p className="text-sm text-grafite/60 mb-3">Funções são as posições da escala (ex.: Vocal, Bateria, Câmera, Sala Berçário).</p>
      {gere && <Botao variante="secundario" className="w-full mb-3" onClick={() => setPainel(true)}><Plus className="h-4 w-4" />Nova função</Botao>}
      {funcoes.length === 0 ? <Card><Vazio titulo="Nenhuma função ainda" /></Card> : (
        <Card className="divide-y divide-black/[0.06]">
          {funcoes.map((f) => (
            <div key={f.id} className="p-3.5 flex items-center">
              <span className="flex-1 font-medium">{f.nome}</span>
              {gere && <button onClick={() => remover(f)} className="p-2 text-grafite/40 hover:text-red-600" aria-label="Remover"><Trash2 className="h-4 w-4" /></button>}
            </div>
          ))}
        </Card>
      )}
      <Painel aberto={painel} onFechar={() => setPainel(false)} titulo="Nova função" rodape={<Botao className="w-full" onClick={adicionar}>Adicionar</Botao>}>
        <Campo rotulo="Nome"><Entrada value={nome} onChange={(e) => setNome(e.target.value)} autoFocus /></Campo>
      </Painel>
    </div>
  )
}
