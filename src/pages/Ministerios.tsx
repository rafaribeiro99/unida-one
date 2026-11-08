import { Link } from 'react-router-dom'
import { ChevronRight, Layers } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { Cabecalho, Card, Selo, Vazio } from '../components/ui'
import { PAPEL_LABEL } from '../lib/types'

export default function Ministerios() {
  const { minhasAreas, vinculos, gerencio, caminho } = useAuth()
  const grupos = new Map<string, typeof minhasAreas>()
  minhasAreas.forEach((o) => {
    const g = caminho(o.id).split(' › ').slice(0, -1).join(' › ') || 'Igreja'
    if (!grupos.has(g)) grupos.set(g, [])
    grupos.get(g)!.push(o)
  })
  return (
    <div>
      <Cabecalho titulo="Ministérios" sub="Onde você serve e lidera" />
      {minhasAreas.length === 0 ? <Card><Vazio icone={<Layers className="h-6 w-6" />} titulo="Nenhum ministério" /></Card> : (
        <div className="space-y-6">
          {[...grupos.entries()].map(([g, lista]) => (
            <section key={g}>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-white/50 mb-2">{g}</h2>
              <div className="space-y-2">
                {lista.map((o) => {
                  const meu = vinculos.find((v) => v.org_id === o.id)
                  return (
                    <Link key={o.id} to={`/ministerios/${o.id}`}>
                      <Card className="p-4 flex items-center gap-3 mb-2">
                        <div className="h-10 w-10 rounded-xl bg-verde-glow/10 text-verde-glow grid place-items-center font-titulo font-bold">{o.nome[0]}</div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-white">{o.nome}</p>
                          <div className="mt-1 flex gap-1.5">
                            {meu && <Selo cor="claro">{PAPEL_LABEL[meu.papel]}</Selo>}
                            {!meu && gerencio(o.id) && <Selo>Supervisão</Selo>}
                          </div>
                        </div>
                        <ChevronRight className="h-5 w-5 text-white/30" />
                      </Card>
                    </Link>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
