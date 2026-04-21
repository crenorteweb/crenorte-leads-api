export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { Timestamp } from 'firebase-admin/firestore'
import { getDb, getAuth } from '@/lib/firebase-admin'

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
    await getAuth().verifyIdToken(sessionToken)
  } catch {
    return NextResponse.json({ error: 'Token inválido ou expirado.' }, { status: 401 })
  }

  // --- Fuso horário: America/Manaus (UTC-4, sem horário de verão) ---
  const TZ = 'America/Manaus'
  const tzFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: TZ })

  function parseDayStart(dateStr: string): Date {
    return new Date(`${dateStr}T00:00:00-04:00`)
  }

  function parseDayEnd(dateStr: string): Date {
    return new Date(`${dateStr}T23:59:59.999-04:00`)
  }

  function todayInTZ(): string {
    return tzFormatter.format(new Date())
  }

  // --- Parâmetros de data ---
  const { searchParams } = new URL(request.url)
  const startDateParam = searchParams.get('startDate')
  const endDateParam = searchParams.get('endDate')

  let startDate: Date
  let endDate: Date

  if (startDateParam && endDateParam) {
    startDate = parseDayStart(startDateParam)
    endDate = parseDayEnd(endDateParam)
  } else {
    // Padrão: últimos 30 dias calculados no fuso de Manaus
    const todayStr = todayInTZ()
    const [y, m, d] = todayStr.split('-').map(Number)
    const startObj = new Date(y, m - 1, d - 29)
    const startStr = [
      startObj.getFullYear(),
      String(startObj.getMonth() + 1).padStart(2, '0'),
      String(startObj.getDate()).padStart(2, '0'),
    ].join('-')
    startDate = parseDayStart(startStr)
    endDate = parseDayEnd(todayStr)
  }

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return NextResponse.json(
      { error: 'Datas inválidas. Use o formato YYYY-MM-DD.' },
      { status: 400 }
    )
  }

  // --- Consulta Firestore ---
  try {
    const snapshot = await getDb()
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
      const key = tzFormatter.format(date) // "YYYY-MM-DD" no fuso de Manaus
      countsByDay[key] = (countsByDay[key] ?? 0) + 1
    })

    // Ordenar por data crescente
    const result: DayCount[] = Object.entries(countsByDay)
      .map(([data, total]) => ({ data, total }))
      .sort((a, b) => b.data.localeCompare(a.data))

    return NextResponse.json(result, { status: 200 })
  } catch (err) {
    console.error('[GET /api/dashboard] Erro interno:', err)
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
  }
}
