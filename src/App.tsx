import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { AuthProvider, useAuth } from './lib/auth'
import { AvisosProvider, Carregando } from './components/ui'
import Layout from './components/Layout'
import Entrar from './pages/Entrar'
import Convite from './pages/Convite'
import Resposta from './pages/Resposta'
import NovaSenha from './pages/NovaSenha'
import Inicio from './pages/Inicio'
import Agenda from './pages/Agenda'
import Ministerios from './pages/Ministerios'
import Ministerio from './pages/Ministerio'
import EscalaEditor from './pages/EscalaEditor'
import Aprovacoes from './pages/Aprovacoes'
import Perfil from './pages/Perfil'
import Admin from './pages/Admin'

function Protegida({ children }: { children: ReactNode }) {
  const { session, carregando, eu } = useAuth()
  const loc = useLocation()
  if (carregando) return <Carregando />
  if (!session) return <Navigate to="/entrar" state={{ de: loc.pathname }} replace />
  if (!eu) return <SemCadastro />
  return <>{children}</>
}

function SemCadastro() {
  const { sair } = useAuth()
  return (
    <div className="min-h-screen grid place-items-center p-6 text-center">
      <div className="max-w-sm space-y-3">
        <h1 className="font-titulo text-xl font-bold text-verde">Acesso não vinculado</h1>
        <p className="text-sm text-grafite/70">Seu login não está ligado a nenhum cadastro do UNIDA ONE. Peça ao seu líder um link de convite.</p>
        <button onClick={sair} className="text-verde-2 font-semibold text-sm">Sair</button>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <AvisosProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/entrar" element={<Entrar />} />
            <Route path="/convite/:token" element={<Convite />} />
            <Route path="/r/:token" element={<Resposta />} />
            <Route path="/nova-senha" element={<NovaSenha />} />
            <Route element={<Protegida><Layout /></Protegida>}>
              <Route index element={<Inicio />} />
              <Route path="agenda" element={<Agenda />} />
              <Route path="ministerios" element={<Ministerios />} />
              <Route path="ministerios/:id" element={<Ministerio />} />
              <Route path="ministerios/:orgId/escala/:eventoId" element={<EscalaEditor />} />
              <Route path="aprovacoes" element={<Aprovacoes />} />
              <Route path="perfil" element={<Perfil />} />
              <Route path="admin" element={<Admin />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </AvisosProvider>
  )
}
