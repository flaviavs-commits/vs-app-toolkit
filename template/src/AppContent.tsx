import { useState } from 'react'
import { Home, Settings } from 'lucide-react'

import { useAuth } from './auth/AuthContext'
import { Shell, type Aba } from './components/Shell'
import { Card, CardContent, CardHeader, CardTitle } from './ui'

// ── Conteúdo do app (só visível para assinantes) ───────────────────────────────
// Este é o ponto de partida do {{APP_NAME}}. Troque as abas e o conteúdo pelo app real; a marca
// (nome, ícone) fica em src/marca.tsx e as cores em src/index.css. O gate de assinatura já garante
// que só assinantes chegam aqui (frontend) e a API já está protegida por requireMember (backend).
type Area = 'inicio' | 'ajustes'

const ABAS: Array<Aba<Area>> = [
  { id: 'inicio', rotulo: 'Início', Icone: Home },
  { id: 'ajustes', rotulo: 'Ajustes', Icone: Settings },
]

export default function AppContent() {
  const { user } = useAuth()
  const [area, setArea] = useState<Area>('inicio')

  return (
    <Shell abas={ABAS} abaAtiva={area} onTrocarAba={setArea}>
      <Card className="animate-fade-in">
        <CardHeader>
          <CardTitle>Olá, {user?.nome || user?.email}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-apoio">
            Você é assinante. Comece a construir o {'{{APP_NAME}}'} aqui (<code className="text-marca-texto">src/AppContent.tsx</code>
            ). Área atual: {area}.
          </p>
        </CardContent>
      </Card>
    </Shell>
  )
}
