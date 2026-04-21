'use client'

import { useState, useEffect } from 'react'
import { signOut } from 'firebase/auth'
import { useRouter } from 'next/navigation'
import { auth } from '@/lib/firebase-client'
import { useAuth } from '@/hooks/useAuth'

interface DayCount {
  data: string
  total: number
}

// Formata "YYYY-MM-DD" → "DD/MM/YYYY"
function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-')
  return `${day}/${month}/${year}`
}

// Retorna data em formato "YYYY-MM-DD" para inputs type="date"
function toInputDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export default function DashboardPage() {
  const router = useRouter()
  const { user, loading } = useAuth()

  const today = new Date()
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(today.getDate() - 29)

  const [startDate, setStartDate] = useState(toInputDate(thirtyDaysAgo))
  const [endDate, setEndDate] = useState(toInputDate(today))
  const [data, setData] = useState<DayCount[]>([])
  const [fetching, setFetching] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const total = data.reduce((sum, row) => sum + row.total, 0)

  async function fetchData(start: string, end: string) {
    setFetching(true)
    setErrorMsg('')
    try {
      const res = await fetch(
        `/api/dashboard?startDate=${start}&endDate=${end}`
      )
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error ?? 'Erro ao buscar dados.')
      }
      const json: DayCount[] = await res.json()
      setData(json)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro desconhecido.')
    } finally {
      setFetching(false)
    }
  }

  // Carregar dados ao montar (apenas quando autenticado)
  useEffect(() => {
    if (user) fetchData(startDate, endDate)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  async function handleSignOut() {
    await signOut(auth)
    // Remover cookie de sessão
    document.cookie = '__session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
    router.replace('/login')
  }

  async function handleGeneratePDF() {
    // Import dinâmico para não afetar o bundle SSR
    const jsPDF = (await import('jspdf')).default
    await import('jspdf-autotable')

    const doc = new jsPDF()

    // Título
    doc.setFontSize(16)
    doc.setTextColor(21, 128, 61) // green-700
    doc.text('Relatório de Cadastros — Crenorte', 14, 20)

    // Subtítulo com período
    doc.setFontSize(10)
    doc.setTextColor(100)
    doc.text(
      `Período: ${formatDate(startDate)} a ${formatDate(endDate)}`,
      14,
      28
    )
    doc.text(
      `Total de cadastros: ${total}`,
      14,
      34
    )

    // Tabela
    const tableBody = data.map((row) => [formatDate(row.data), row.total.toString()])
    tableBody.push(['Total', total.toString()])

    // @ts-expect-error — jspdf-autotable adiciona autoTable ao prototype
    doc.autoTable({
      startY: 42,
      head: [['Data', 'Quantidade']],
      body: tableBody,
      headStyles: { fillColor: [21, 128, 61] },
      foot: [],
      styles: { fontSize: 10 },
      columnStyles: { 1: { halign: 'center' } },
      didDrawRow: (data: { row: { index: number } }) => {
        // Última linha (Total) em negrito
        if (data.row.index === tableBody.length - 1) {
          // handled by styles
        }
      },
    })

    const fileName = `relatorio-cadastros-${toInputDate(new Date())}.pdf`
    doc.save(fileName)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500 text-sm">Carregando...</p>
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-green-700">Crenorte</h1>
            <p className="text-xs text-gray-500">Dashboard de Cadastros</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600 hidden sm:block">{user.email}</span>
            <button
              onClick={handleSignOut}
              className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium
                         px-4 py-2 rounded-lg transition"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Filtros */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Filtrar por período</h2>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Data início</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Data fim</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <button
              onClick={() => fetchData(startDate, endDate)}
              disabled={fetching}
              className="bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white
                         font-semibold px-5 py-2 rounded-lg text-sm transition"
            >
              {fetching ? 'Buscando...' : 'Filtrar'}
            </button>
          </div>
          {errorMsg && (
            <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
              {errorMsg}
            </p>
          )}
        </div>

        {/* Card total */}
        <div className="bg-green-600 text-white rounded-2xl shadow-sm p-6 flex items-center justify-between">
          <div>
            <p className="text-green-100 text-sm">Total de cadastros no período</p>
            <p className="text-4xl font-bold mt-1">{total}</p>
          </div>
          <div className="text-5xl opacity-20 select-none">&#128101;</div>
        </div>

        {/* Tabela */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">
              Cadastros por dia
            </h2>
            <button
              onClick={handleGeneratePDF}
              disabled={data.length === 0}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white
                         font-semibold px-4 py-2 rounded-lg text-sm transition"
            >
              Emitir Relatório PDF
            </button>
          </div>

          {data.length === 0 ? (
            <div className="px-6 py-10 text-center text-gray-400 text-sm">
              {fetching ? 'Carregando dados...' : 'Nenhum cadastro encontrado no período.'}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3 text-left font-medium">Data</th>
                  <th className="px-6 py-3 text-right font-medium">Quantidade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.map((row) => (
                  <tr key={row.data} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-3 text-gray-700">{formatDate(row.data)}</td>
                    <td className="px-6 py-3 text-right font-semibold text-gray-800">
                      {row.total}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                <tr>
                  <td className="px-6 py-3 font-bold text-gray-700">Total</td>
                  <td className="px-6 py-3 text-right font-bold text-green-700">{total}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </main>
    </div>
  )
}
