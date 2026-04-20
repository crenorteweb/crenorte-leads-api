export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { Timestamp } from 'firebase-admin/firestore'
import { db, auth } from '@/lib/firebase-admin'

interface DayCount {
  data: string
  total: number
}

export async function GET(request: NextRequest) {
  // --- Autenticação ---
  const cookieHeader = request.headers.get('cookie') ?? ''
  const sessionMatch = cookieHeader.match(/(?:^|;\s*)__session=([^;]+)/)
  const sessionToken = sessionMatch ? sessionMatch[1] : null

  if (!sessionToken) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  try {
    await auth.verifyIdToken(sessionToken)
  } catch {
    return NextResponse.json({ error: 'Token inválido ou expirado.' }, { status: 401 })
  }

  // --- Parâmetros de data ---
  const { searchParams } = new URL(request.url)
  const startDateParam = searchParams.get('startDate')
  const endDateParam = searchParams.get('endDate')

  let startDate: Date
  let endDate: Date

  if (startDateParam && endDateParam) {
    startDate = new Date(`${startDateParam}T00:00:00`)
    endDate = new Date(`${endDateParam}T23:59:59`)
  } else {
    // Padrão: últimos 30 dias
    endDate = new Date()
    endDate.setHours(23, 59, 59, 999)
    startDate = new Date()
    startDate.setDate(startDate.getDate() - 29)
    startDate.setHours(0, 0, 0, 0)
  }

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return NextResponse.json(
      { error: 'Datas inválidas. Use o formato YYYY-MM-DD.' },
      { status: 400 }
    )
  }

  // --- Consulta Firestore ---
  try {
    const snapshot = await db
      .collection('pre_cadastros')
      .where('createdAt', '>=', Timestamp.fromDate(startDate))
      .where('createdAt', '<=', Timestamp.fromDate(endDate))
      .get()

    // Agrupar por dia (YYYY-MM-DD)
    const countsByDay: Record<string, number> = {}

    snapshot.forEach((doc) => {
      const data = doc.data()
      const ts: Timestamp = data.createdAt
      if (!ts?.toDate) return

      const date = ts.toDate()
      const key = date.toISOString().slice(0, 10) // "YYYY-MM-DD"
      countsByDay[key] = (countsByDay[key] ?? 0) + 1
    })

    // Ordenar por data crescente
    const result: DayCount[] = Object.entries(countsByDay)
      .map(([data, total]) => ({ data, total }))
      .sort((a, b) => a.data.localeCompare(b.data))

    return NextResponse.json(result, { status: 200 })
  } catch (err) {
    console.error('[GET /api/dashboard] Erro interno:', err)
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
  }
}
