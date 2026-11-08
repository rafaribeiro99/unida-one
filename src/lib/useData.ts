import { useCallback, useEffect, useState } from 'react'

export function useData<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick((t) => t + 1), [])
  useEffect(() => {
    let vivo = true
    setLoading(true)
    fn().then(
      (r) => { if (vivo) { setData(r); setError(null); setLoading(false) } },
      (e) => { if (vivo) { setError(e?.message ?? String(e)); setLoading(false) } },
    )
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])
  return { data, loading, error, reload, setData }
}

/** Lança o erro do Supabase, devolve os dados. */
export async function q<T>(p: PromiseLike<{ data: T | null; error: any }>): Promise<T> {
  const { data, error } = await p
  if (error) throw error
  return data as T
}
