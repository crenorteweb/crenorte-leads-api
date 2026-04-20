export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { Timestamp } from 'firebase-admin/firestore'
import { db } from '@/lib/firebase-admin'

// Cabeçalhos CORS — rota pública consumida pelo site Crenorte
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

// Preflight CORS
export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const { nomeCompleto, cpf, telefone, municipio, uf, bairro } = body

    // --- Validações ---
    const missing = [
      !nomeCompleto && 'nomeCompleto',
      !cpf && 'cpf',
      !telefone && 'telefone',
      !municipio && 'municipio',
      !uf && 'uf',
      !bairro && 'bairro',
    ].filter(Boolean)

    if (missing.length > 0) {
      return NextResponse.json(
        { error: 'Campos obrigatórios ausentes', campos: missing },
        { status: 400, headers: corsHeaders }
      )
    }

    const cpfDigits = String(cpf).replace(/\D/g, '')
    if (cpfDigits.length !== 11) {
      return NextResponse.json(
        { error: 'CPF inválido. Informe 11 dígitos numéricos.' },
        { status: 400, headers: corsHeaders }
      )
    }

    const telefoneDigits = String(telefone).replace(/\D/g, '')
    if (telefoneDigits.length < 10 || telefoneDigits.length > 11) {
      return NextResponse.json(
        { error: 'Telefone inválido. Informe 10 ou 11 dígitos numéricos.' },
        { status: 400, headers: corsHeaders }
      )
    }

    if (String(uf).trim().length !== 2) {
      return NextResponse.json(
        { error: 'UF inválida. Informe a sigla com 2 caracteres (ex: AM).' },
        { status: 400, headers: corsHeaders }
      )
    }

    // --- Montar documento ---
    const now = Timestamp.now()

    const docData = {
      agendamentoStatus: 'nao_agendado',
      aprovacao: {
        em: null,
        motivo: '',
        observacao: '',
        porNome: '',
        porUid: '',
        status: 'pendente',
      },
      atualizadoEm: now,
      bairro: String(bairro).trim(),
      caixaAtual: 'triagem',
      caixaUid: '',
      cidade: String(municipio).trim(),
      cpf: cpfDigits,
      createdAt: now,
      createdByNome: 'Site Crenorte',
      createdByUid: 'site_portal',
      desistencia: {
        status: 'nao_desistiu',
      },
      email: '',
      encaminhamento: null,
      formalizacao: {
        status: 'nao_formalizado',
      },
      modalidade: '',
      nomeCompleto: String(nomeCompleto).trim(),
      origem: 'Site / portal',
      sexo: '',
      telefone: telefoneDigits,
      uf: String(uf).trim().toUpperCase(),
    }

    const docRef = await db.collection('pre_cadastros').add(docData)

    return NextResponse.json(
      { message: 'Cadastro realizado com sucesso.', id: docRef.id },
      { status: 201, headers: corsHeaders }
    )
  } catch (err) {
    console.error('[POST /api/leads] Erro interno:', err)
    return NextResponse.json(
      { error: 'Erro interno do servidor.' },
      { status: 500, headers: corsHeaders }
    )
  }
}

// Rejeitar outros métodos
export async function GET() {
  return NextResponse.json(
    { error: 'Método não permitido.' },
    { status: 405, headers: corsHeaders }
  )
}
