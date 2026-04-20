import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Rotas públicas — não exigem autenticação
  const publicPaths = ['/login', '/api/leads']
  const isPublic = publicPaths.some(path => pathname.startsWith(path))

  if (isPublic) return NextResponse.next()

  // Verificar presença do cookie de sessão
  const session = request.cookies.get('__session')
  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
