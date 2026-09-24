export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { Timestamp, FieldValue } from 'firebase-admin/firestore'
import { getDb } from '@/lib/firebase-admin'

// Cabeçalhos CORS — rota pública consumida pelo site Crenorte
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

// Converte textos como "Não sei" ou "Produção ou artesanato" em slugs: nao_sei, producao_artesanato
function slugificar(valor: unknown): string {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/_ou_/g, '_')
}

function normalizarOpcao<T extends string>(valor: unknown, aceitos: readonly T[]): T | null {
  const v = slugificar(valor)
  return (aceitos as readonly string[]).includes(v) ? (v as T) : null
}

// Valores aceitos para o campo "cadunico" (Sim / Não / Não sei)
const CADUNICO_VALORES = ['sim', 'nao', 'nao_sei'] as const

// Valores aceitos para o campo "ocupacao" (O que você faz ou vende?)
const OCUPACAO_VALORES = [
  'comercio',
  'servicos',
  'producao_artesanato',
  'agricultura_extrativismo',
  'outro',
] as const

const OCUPACAO_DESCRICAO_MAX = 200

// Valores aceitos para o campo "tempoOcupacao" (Há quanto tempo você tem essa atividade?)
const TEMPO_OCUPACAO_VALORES = [
  'ainda_vou_comecar',
  'menos_de_1_ano',
  'de_1_a_3_anos',
  'mais_de_3_anos',
] as const

// Valores aceitos para o campo "objetivoCredito" (Para que você quer usar o crédito?)
const OBJETIVO_CREDITO_VALORES = [
  'comprar_mercadoria_estoque',
  'comprar_equipamentos_ferramentas',
  'melhorar_o_espaco_do_negocio',
  'capital_de_giro_para_o_dia_a_dia',
  'outro',
] as const

// Valores aceitos para o campo "valorSolicitado" (Qual valor você pretende solicitar?)
const VALOR_SOLICITADO_VALORES = ['300_a_2000', '2000_a_5000', '5000_a_10000', 'ainda_nao_sei'] as const
type ValorSolicitado = (typeof VALOR_SOLICITADO_VALORES)[number]

// Converte "De R$300 a R$2000", "De R$ 2 mil a R$ 5 mil", "R$ 5.000 a R$ 10.000" etc. em 300_a_2000 / 2000_a_5000 / 5000_a_10000
function normalizarValorSolicitado(valor: unknown): ValorSolicitado | null {
  const v = slugificar(valor)
    .replace(/r\$/g, '')
    .replace(/[.,]/g, '')
    .replace(/(\d+)_?mil(?=_|$)/g, '$1000')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .replace(/^de_/, '')
  return (VALOR_SOLICITADO_VALORES as readonly string[]).includes(v) ? (v as ValorSolicitado) : null
}

// Valores aceitos para o campo "turnoVisita" (Qual período você prefere agendar a visita?)
const TURNO_VISITA_VALORES = ['manha', 'tarde'] as const

// Resultado de análises automáticas (opcionais): "aprovacao" e "elegivel"
const APROVACAO_STATUS = ['apto', 'inapto'] as const
const ELEGIVEL_STATUS = ['nao_verificado', 'sim', 'nao'] as const
const ANALISE_TEXTO_MAX = 500

// Autor fixo das análises recebidas por esta rota (não vem do corpo da requisição)
const ANALISE_POR_NOME = 'Crenorte Agente IA'
const ANALISE_POR_UID = 'm9JrDdYRzmdvxIj759NeEUUZxLJ3'

type Analise = { em: Timestamp; status: string; [k: string]: unknown }
type ResultadoAnalise = { ok: true; valor: Analise | null } | { ok: false; erro: string }

// Valida um bloco de análise (aprovacao/elegivel). Se não vier, retorna null (a API usa o padrão).
function lerAnalise(
  entrada: unknown,
  campo: string,
  statusAceitos: readonly string[],
  camposTexto: readonly string[]
): ResultadoAnalise {
  if (entrada === undefined || entrada === null || entrada === '') return { ok: true, valor: null }
  if (typeof entrada !== 'object' || Array.isArray(entrada)) {
    return { ok: false, erro: `"${campo}" deve ser um objeto.` }
  }
  const obj = entrada as Record<string, unknown>

  const status = normalizarOpcao(obj.status, statusAceitos)
  if (!status) {
    return {
      ok: false,
      erro: `"${campo}.status" inválido. Valores aceitos: ${statusAceitos.map(v => `"${v}"`).join(', ')}.`,
    }
  }

  let em = Timestamp.now()
  if (obj.em !== undefined && obj.em !== null && obj.em !== '') {
    const data = new Date(String(obj.em))
    if (isNaN(data.getTime())) {
      return { ok: false, erro: `"${campo}.em" inválido. Use data/hora ISO 8601 (ex.: 2026-08-28T18:48:40.770Z).` }
    }
    em = Timestamp.fromDate(data)
  }

  const valor: Analise = { em, status, porNome: ANALISE_POR_NOME, porUid: ANALISE_POR_UID }
  for (const k of camposTexto) {
    if (obj[k] === undefined || obj[k] === null) continue
    const texto = String(obj[k]).trim()
    if (texto.length > ANALISE_TEXTO_MAX) {
      return { ok: false, erro: `"${campo}.${k}" muito longo (máx. ${ANALISE_TEXTO_MAX} caracteres).` }
    }
    valor[k] = texto
  }
  return { ok: true, valor }
}

const EMAIL_MAX = 254
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Texto do termo exibido no site. Se o texto mudar, atualize aqui e a versão,
// para que cada cadastro guarde exatamente o que o cliente autorizou.
const AUTORIZACAO_VERSAO = '2026-09'
const AUTORIZACAO_TEXTO =
  'Autorizo a Crenorte a consultar informações em meu nome (CPF/CNPJ) nos sistemas de crédito ' +
  '(SCR, Cadin e Serasa) para fins de análise cadastral e de crédito, conforme a LGPD, e a entrar ' +
  'em contato pelo WhatsApp informado.'

// Preflight CORS
export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const { nomeCompleto, cpf, telefone, municipio, uf, bairro, endereco, cadunico, ocupacao, ocupacaoDescricao, tempoOcupacao, objetivoCredito, valorSolicitado, email, autorizacaoConsulta, turnoVisita, aprovacao, elegivel } = body

    // --- Validações ---
    const missing = [
      !nomeCompleto && 'nomeCompleto',
      !cpf && 'cpf',
      !telefone && 'telefone',
      !municipio && 'municipio',
      !uf && 'uf',
      !bairro && 'bairro',
      !endereco && 'endereco',
      !cadunico && 'cadunico',
      !ocupacao && 'ocupacao',
      !tempoOcupacao && 'tempoOcupacao',
      !objetivoCredito && 'objetivoCredito',
      !valorSolicitado && 'valorSolicitado',
      !turnoVisita && 'turnoVisita',
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

    const cadunicoNormalizado = normalizarOpcao(cadunico, CADUNICO_VALORES)
    if (!cadunicoNormalizado) {
      return NextResponse.json(
        { error: 'CadÚnico inválido. Valores aceitos: "sim", "nao" ou "nao_sei".' },
        { status: 400, headers: corsHeaders }
      )
    }

    const ocupacaoNormalizada = normalizarOpcao(ocupacao, OCUPACAO_VALORES)
    if (!ocupacaoNormalizada) {
      return NextResponse.json(
        {
          error:
            'Ocupação inválida. Valores aceitos: "comercio", "servicos", "producao_artesanato", "agricultura_extrativismo" ou "outro".',
        },
        { status: 400, headers: corsHeaders }
      )
    }

    const descricao = ocupacaoDescricao ? String(ocupacaoDescricao).trim() : ''
    if (ocupacaoNormalizada === 'outro' && !descricao) {
      return NextResponse.json(
        { error: 'Descreva a ocupação quando a opção for "outro".', campos: ['ocupacaoDescricao'] },
        { status: 400, headers: corsHeaders }
      )
    }
    if (descricao.length > OCUPACAO_DESCRICAO_MAX) {
      return NextResponse.json(
        { error: `Descrição da ocupação muito longa (máx. ${OCUPACAO_DESCRICAO_MAX} caracteres).` },
        { status: 400, headers: corsHeaders }
      )
    }

    const tempoOcupacaoNormalizado = normalizarOpcao(tempoOcupacao, TEMPO_OCUPACAO_VALORES)
    if (!tempoOcupacaoNormalizado) {
      return NextResponse.json(
        {
          error:
            'Tempo de ocupação inválido. Valores aceitos: "ainda_vou_comecar", "menos_de_1_ano", "de_1_a_3_anos" ou "mais_de_3_anos".',
        },
        { status: 400, headers: corsHeaders }
      )
    }

    const objetivoCreditoNormalizado = normalizarOpcao(objetivoCredito, OBJETIVO_CREDITO_VALORES)
    if (!objetivoCreditoNormalizado) {
      return NextResponse.json(
        {
          error:
            'Objetivo do crédito inválido. Valores aceitos: "comprar_mercadoria_estoque", "comprar_equipamentos_ferramentas", "melhorar_o_espaco_do_negocio", "capital_de_giro_para_o_dia_a_dia" ou "outro".',
        },
        { status: 400, headers: corsHeaders }
      )
    }

    const valorSolicitadoNormalizado = normalizarValorSolicitado(valorSolicitado)
    if (!valorSolicitadoNormalizado) {
      return NextResponse.json(
        {
          error:
            'Valor solicitado inválido. Valores aceitos: "300_a_2000", "2000_a_5000", "5000_a_10000" ou "ainda_nao_sei".',
        },
        { status: 400, headers: corsHeaders }
      )
    }

    const emailLimpo = email ? String(email).trim().toLowerCase() : ''
    if (emailLimpo && (emailLimpo.length > EMAIL_MAX || !EMAIL_REGEX.test(emailLimpo))) {
      return NextResponse.json(
        { error: 'E-mail inválido.', campos: ['email'] },
        { status: 400, headers: corsHeaders }
      )
    }

    if (autorizacaoConsulta !== true && autorizacaoConsulta !== 'true') {
      return NextResponse.json(
        {
          error: 'É necessário autorizar a consulta de dados para prosseguir.',
          campos: ['autorizacaoConsulta'],
        },
        { status: 400, headers: corsHeaders }
      )
    }

    const turnoVisitaNormalizado = normalizarOpcao(turnoVisita, TURNO_VISITA_VALORES)
    if (!turnoVisitaNormalizado) {
      return NextResponse.json(
        { error: 'Turno da visita inválido. Valores aceitos: "manha" ou "tarde".' },
        { status: 400, headers: corsHeaders }
      )
    }

    const aprovacaoLida = lerAnalise(aprovacao, 'aprovacao', APROVACAO_STATUS, ['motivo', 'motivoTipo', 'observacao'])
    if (!aprovacaoLida.ok) {
      return NextResponse.json(
        { error: aprovacaoLida.erro, campos: ['aprovacao'] },
        { status: 400, headers: corsHeaders }
      )
    }

    const elegivelLido = lerAnalise(elegivel, 'elegivel', ELEGIVEL_STATUS, [])
    if (!elegivelLido.ok) {
      return NextResponse.json(
        { error: elegivelLido.erro, campos: ['elegivel'] },
        { status: 400, headers: corsHeaders }
      )
    }

    // --- Verificar CPF duplicado ---
    const existing = await getDb()
      .collection('pre_cadastros')
      .where('cpf', '==', cpfDigits)
      .limit(1)
      .get()

    if (!existing.empty) {
      const docRef = existing.docs[0].ref
      await docRef.update({
        atualizadoEm: Timestamp.now(),
        tentativasContato: FieldValue.arrayUnion(Timestamp.now()),
      })
      return NextResponse.json(
        { message: 'Nova tentativa de contato registrada.', id: docRef.id },
        { status: 200, headers: corsHeaders }
      )
    }

    // --- Montar documento ---
    const now = Timestamp.now()

    const docData = {
      agendamentoStatus: 'nao_agendado',
      aprovacao: aprovacaoLida.valor ?? { status: 'nao_verificado' },
      atualizadoEm: now,
      autorizacaoConsulta: {
        aceita: true,
        aceitaEm: now,
        versao: AUTORIZACAO_VERSAO,
        texto: AUTORIZACAO_TEXTO,
        ip: request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? '',
        userAgent: request.headers.get('user-agent') ?? '',
      },
      bairro: String(bairro).trim(),
      cadunico: cadunicoNormalizado,
      endereco: String(endereco).trim(),
      caixaAtual: 'triagem',
      caixaUid: '',
      cidade: String(municipio).trim(),
      cpf: cpfDigits,
      createdAt: now,
      createdByNome: 'Crenorte Admin',
      createdByUid: 'cctRWCsi3jSnqYVUK3mjbrVaP372',
      desistencia: {
        status: 'nao_desistiu',
      },
      elegivel: elegivelLido.valor ?? { status: 'nao_verificado' },
      email: emailLimpo,
      encaminhamento: null,
      formalizacao: {
        status: 'nao_formalizado',
      },
      modalidade: '',
      nomeCompleto: String(nomeCompleto).trim(),
      ocupacao: ocupacaoNormalizada,
      ocupacaoDescricao: descricao,
      tempoOcupacao: tempoOcupacaoNormalizado,
      objetivoCredito: objetivoCreditoNormalizado,
      valorSolicitado: valorSolicitadoNormalizado,
      turnoVisita: turnoVisitaNormalizado,
      origem: 'Site / portal',
      sexo: '',
      telefone: telefoneDigits,
      uf: String(uf).trim().toUpperCase(),
    }

    const docRef = await getDb().collection('pre_cadastros').add(docData)

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
