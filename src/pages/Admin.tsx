import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { ChevronRight, Plus, RefreshCw, Search, UserPlus } from 'lucide-react'
import { COLUNAS_PESSOA, useAuth } from '../lib/auth'
import { carregarContatos } from '../lib/contatos'
import { useData, q } from '../lib/useData'
import { supabase, msgErro } from '../lib/supabase'
import { fmtDiaHora } from '../lib/datas'
import { fmtTel } from '../lib/whats'
import { ORG_TIPO_LABEL, PAPEL_LABEL, type Org, type OrgTipo, type Papel, type Pessoa } from '../lib/types'
import { Abas, Botao, Cabecalho, Campo, Card, Carregando, Entrada, Iniciais, Painel, Selecao, Selo, Vazio, useAviso } from '../components/ui'
import { LinkConvite, PainelConvidar } from '../components/Pessoas'

const FILHOS: Record<OrgTipo, OrgTipo[]> = {
  igreja: ['pilar'], pilar: ['setor', 'ministerio', 'curso', 'turma', 'gp'], setor: ['ministerio'], ministerio: ['equipe'],
  equipe: [], curso: ['turma'], turma: [], gp: [],
}

export default function Admin() {
  const { admin } = useAuth()
  const [aba, setAba] = useState<'estrutura' | 'pessoas' | 'avisos'>('estrutura')
  if (!admin) return <Card><Vazio titulo="Somente administradores" /></Card>
  return (
    <div>
      <Cabecalho titulo="Administração" />
      <Abas valor={aba} onChange={setAba} opcoes={[{ v: 'estrutura', rotulo: 'Estrutura' }, { v: 'pessoas', rotulo: 'Pessoas' }, { v: 'avisos', rotulo: 'WhatsApp' }]} />
      {aba === 'estrutura' ? <Estrutura /> : aba === 'pessoas' ? <Pessoas /> : <Avisos />}
    </div>
  )
}

function Estrutura() {
  const { orgs, recarregar } = useAuth()
  const [sel, setSel] = useState<Org | null>(null)
  const { data: resp, reload } = useData(async () =>
    (await q(supabase.from('vinculos').select('org_id,papel,pessoas(nome)').neq('papel', 'membro').eq('ativo', true))) as unknown as { org_id: string; papel: Papel; pessoas: { nome: string } }[], [])
  const filhos = (id: string | null) => orgs.filter((o) => o.parent_id === id)
  const raiz = orgs.filter((o) => !o.parent_id)
  const linha = (o: Org, nivel: number): JSX.Element => {
    const rs = (resp ?? []).filter((r) => r.org_id === o.id)
    return (
      <div key={o.id}>
        <button onClick={() => setSel(o)} className="w-full text-left flex items-center gap-2 py-2.5 pr-3 hover:bg-white" style={{ paddingLeft: 12 + nivel * 18 }}>
          <span className={clsx('flex-1 min-w-0', nivel <= 1 ? 'font-semibold text-verde' : 'font-medium')}>
            {o.nome}
            {rs.length > 0 && <span className="block text-xs font-normal text-grafite/50 truncate">{rs.map((r) => `${r.pessoas.nome.split(' ')[0]} (${PAPEL_LABEL[r.papel]})`).join(', ')}</span>}
          </span>
          <Selo>{ORG_TIPO_LABEL[o.tipo]}</Selo>
          <ChevronRight className="h-4 w-4 text-grafite/30" />
        </button>
        {filhos(o.id).map((f) => linha(f, nivel + 1))}
      </div>
    )
  }
  return (
    <>
      <p className="text-sm text-grafite/60 mb-3">Toque num item para renomear, criar itens abaixo ou definir líderes e supervisores.</p>
      <Card className="divide-y divide-black/[0.06] overflow-hidden">{raiz.map((o) => linha(o, 0))}</Card>
      <PainelOrg org={sel} onFechar={() => setSel(null)} onMudou={() => { recarregar(); reload() }} />
    </>
  )
}

function PainelOrg({ org, onFechar, onMudou }: { org: Org | null; onFechar: () => void; onMudou: () => void }) {
  const avisar = useAviso()
  const [nome, setNome] = useState('')
  const [novo, setNovo] = useState({ nome: '', tipo: '' as OrgTipo | '' })
  const [convidar, setConvidar] = useState(false)
  const [ult, setUlt] = useState<string | null>(null)
  if (org && ult !== org.id) { setUlt(org.id); setNome(org.nome); setNovo({ nome: '', tipo: FILHOS[org.tipo][0] ?? '' }) }
  if (!org) return null

  async function renomear() {
    const { error } = await supabase.from('org').update({ nome: nome.trim() }).eq('id', org!.id)
    if (error) return avisar(msgErro(error), 'erro')
    avisar('Salvo.'); onMudou()
  }
  async function criar() {
    if (!novo.nome.trim() || !novo.tipo) return
    const { error } = await supabase.from('org').insert({ unidade_id: org!.unidade_id, parent_id: org!.id, tipo: novo.tipo, nome: novo.nome.trim(), ordem: 99 })
    if (error) return avisar(msgErro(error), 'erro')
    avisar(`${ORG_TIPO_LABEL[novo.tipo]} criado.`); setNovo({ ...novo, nome: '' }); onMudou()
  }
  async function desativar() {
    if (!confirm(`Desativar "${org!.nome}" e tudo abaixo dele?`)) return
    const { error } = await supabase.from('org').update({ ativo: false }).eq('id', org!.id)
    if (error) return avisar(msgErro(error), 'erro')
    onFechar(); onMudou()
  }
  return (
    <>
      <Painel aberto={!convidar} onFechar={() => { setUlt(null); onFechar() }} titulo={org.nome}>
        <div className="space-y-5">
          <div className="flex gap-2 items-end">
            <Campo rotulo="Nome"><Entrada value={nome} onChange={(e) => setNome(e.target.value)} /></Campo>
            <Botao variante="secundario" onClick={renomear}>Salvar</Botao>
          </div>
          <Botao variante="secundario" className="w-full" onClick={() => setConvidar(true)}><UserPlus className="h-4 w-4" />Adicionar pessoa / responsável</Botao>
          {['pilar', 'ministerio', 'equipe', 'curso', 'turma', 'gp'].includes(org.tipo) && (
            <Link to={`/ministerios/${org.id}`} className="block"><Botao variante="fantasma" className="w-full">Abrir pessoas, funções e escalas</Botao></Link>
          )}
          {FILHOS[org.tipo].length > 0 && (
            <div className="rounded-xl bg-white p-3 border border-black/[0.07] space-y-3">
              <p className="text-sm font-semibold text-verde">Criar dentro de {org.nome}</p>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <Entrada value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} placeholder="Nome" />
                <Selecao value={novo.tipo} onChange={(e) => setNovo({ ...novo, tipo: e.target.value as OrgTipo })} className="w-36">
                  {FILHOS[org.tipo].map((t) => <option key={t} value={t}>{ORG_TIPO_LABEL[t]}</option>)}
                </Selecao>
              </div>
              <Botao className="w-full h-10" onClick={criar}><Plus className="h-4 w-4" />Criar</Botao>
            </div>
          )}
          {org.tipo !== 'igreja' && <Botao variante="perigo" className="w-full" onClick={desativar}>Desativar</Botao>}
        </div>
      </Painel>
      {convidar && <PainelConvidar aberto onFechar={() => { setConvidar(false); onMudou() }} orgId={org.id} funcoes={[]} onFeito={onMudou} />}
    </>
  )
}

function Pessoas() {
  const [busca, setBusca] = useState('')
  const [sel, setSel] = useState<Pessoa | null>(null)
  const { data, loading, reload } = useData(async () => {
    const ps = (await q(supabase.from('pessoas').select(COLUNAS_PESSOA).order('nome'))) as unknown as Pessoa[]
    const cs = await carregarContatos(ps.map((p) => p.id))
    return ps.map((p) => ({ ...p, telefone: cs.get(p.id)?.telefone ?? null, email: cs.get(p.id)?.email ?? null }))
  }, [])
  const lista = useMemo(() => (data ?? []).filter((p) => p.nome.toLowerCase().includes(busca.toLowerCase())), [data, busca])
  const semAcesso = (data ?? []).filter((p) => !p.user_id && p.ativo).length
  return (
    <>
      <div className="relative mb-3">
        <Search className="h-4 w-4 absolute left-3 top-3.5 text-grafite/40" />
        <Entrada className="pl-9" placeholder="Buscar pessoa" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      <p className="text-xs text-grafite/50 mb-3">{data?.length ?? 0} pessoas · {semAcesso} ainda sem acesso</p>
      {loading ? <Carregando /> : (
        <Card className="divide-y divide-black/[0.06]">
          {lista.map((p) => (
            <button key={p.id} onClick={() => setSel(p)} className={clsx('w-full text-left p-3.5 flex items-center gap-3', !p.ativo && 'opacity-40')}>
              <Iniciais nome={p.nome} />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{p.nome}</p>
                <p className="text-xs text-grafite/50">{fmtTel(p.telefone)}</p>
              </div>
              {p.is_admin && <Selo cor="claro">Admin</Selo>}
              {!p.user_id && <Selo cor="amarelo">Sem acesso</Selo>}
            </button>
          ))}
        </Card>
      )}
      <PainelPessoa pessoa={sel} onFechar={() => setSel(null)} onMudou={reload} />
    </>
  )
}

function PainelPessoa({ pessoa, onFechar, onMudou }: { pessoa: Pessoa | null; onFechar: () => void; onMudou: () => void }) {
  const avisar = useAviso()
  const { orgPorId } = useAuth()
  const [f, setF] = useState({ nome: '', telefone: '', email: '', is_admin: false, ativo: true })
  const [vinc, setVinc] = useState<{ id: string; org_id: string; papel: Papel }[]>([])
  const [token, setToken] = useState<string | null>(null)
  const [ult, setUlt] = useState<string | null>(null)
  if (pessoa && ult !== pessoa.id) {
    setUlt(pessoa.id); setToken(null)
    setF({ nome: pessoa.nome, telefone: fmtTel(pessoa.telefone), email: pessoa.email ?? '', is_admin: pessoa.is_admin, ativo: pessoa.ativo })
    supabase.from('vinculos').select('id,org_id,papel').eq('pessoa_id', pessoa.id).eq('ativo', true).then(({ data }) => setVinc((data ?? []) as any))
  }
  if (!pessoa) return null
  async function salvar() {
    const dig = f.telefone.replace(/\D/g, '')
    const { error } = await supabase.from('pessoas').update({ nome: f.nome.trim(), telefone: dig ? (dig.length <= 11 ? '55' + dig : dig) : null,
      email: f.email.trim() || null, is_admin: f.is_admin, ativo: f.ativo }).eq('id', pessoa!.id)
    if (error) return avisar(msgErro(error), 'erro')
    avisar('Salvo.'); setUlt(null); onFechar(); onMudou()
  }
  async function link() {
    const { data, error } = await supabase.rpc('novo_link_convite', { p_pessoa: pessoa!.id })
    if (error) return avisar(msgErro(error), 'erro')
    setToken(data as string)
  }
  return (
    <Painel aberto onFechar={() => { setUlt(null); onFechar() }} titulo={pessoa.nome} rodape={<Botao className="w-full" onClick={salvar}>Salvar</Botao>}>
      <div className="space-y-4">
        <Campo rotulo="Nome"><Entrada value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></Campo>
        <Campo rotulo="WhatsApp"><Entrada value={f.telefone} onChange={(e) => setF({ ...f, telefone: e.target.value })} /></Campo>
        <Campo rotulo="E-mail"><Entrada value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Campo>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-[#145C46] h-4 w-4" checked={f.is_admin} onChange={(e) => setF({ ...f, is_admin: e.target.checked })} />Administrador do sistema</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-[#145C46] h-4 w-4" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} />Ativo</label>
        <div>
          <p className="text-[13px] font-medium text-grafite/80 mb-1.5">Vínculos</p>
          <div className="flex flex-wrap gap-1.5">
            {vinc.length ? vinc.map((v) => <Selo key={v.id} cor={v.papel === 'membro' ? 'cinza' : 'claro'}>{orgPorId.get(v.org_id)?.nome}{v.papel !== 'membro' ? ` · ${PAPEL_LABEL[v.papel]}` : ''}</Selo>)
              : <span className="text-sm text-grafite/50">Nenhum</span>}
          </div>
        </div>
        {!pessoa.user_id && (token ? <LinkConvite nome={pessoa.nome} telefone={pessoa.telefone} token={token} />
          : <Botao variante="secundario" className="w-full" onClick={link}>Gerar link de acesso</Botao>)}
      </div>
    </Painel>
  )
}

function Avisos() {
  const avisar = useAviso()
  const [proc, setProc] = useState(false)
  const { data, loading, reload } = useData(async () =>
    (await q(supabase.rpc('fila_whatsapp'))) as { resumo: Record<string, number>; ultimas: { nome: string; titulo: string; whatsapp_status: string; erro: string | null; criado_em: string }[] }, [])
  async function processar() {
    setProc(true)
    const { data: r, error } = await supabase.functions.invoke('whatsapp', { body: {} })
    setProc(false)
    if (error) return avisar(msgErro(error), 'erro')
    avisar(r?.configurado === false ? 'WhatsApp ainda não configurado (Evolution).' : `Enviadas: ${r?.enviadas ?? 0} · erros: ${r?.erros ?? 0}`)
    reload()
  }
  if (loading || !data) return <Carregando />
  return (
    <>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {(['pendente', 'enviada', 'erro'] as const).map((k) => (
          <Card key={k} className="p-3 text-center"><p className="font-titulo text-2xl font-bold text-verde">{data.resumo?.[k] ?? 0}</p><p className="text-xs text-grafite/50 capitalize">{k === 'enviada' ? 'enviadas' : k === 'erro' ? 'com erro' : 'na fila'}</p></Card>
        ))}
      </div>
      <Botao variante="secundario" className="w-full mb-4" onClick={processar} carregando={proc}><RefreshCw className="h-4 w-4" />Enviar fila agora</Botao>
      <Card className="divide-y divide-black/[0.06]">
        {data.ultimas?.map((n, i) => (
          <div key={i} className="p-3">
            <div className="flex items-center gap-2">
              <p className="flex-1 text-sm font-medium truncate">{n.nome} · {n.titulo}</p>
              <Selo cor={n.whatsapp_status === 'enviada' ? 'verde' : n.whatsapp_status === 'erro' ? 'vermelho' : 'amarelo'}>{n.whatsapp_status}</Selo>
            </div>
            <p className="text-[11px] text-grafite/40">{fmtDiaHora(n.criado_em)}{n.erro ? ` · ${n.erro}` : ''}</p>
          </div>
        ))}
      </Card>
    </>
  )
}
