import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(req: NextRequest) {
  // If we are on the server side in Docker, process.env is available
  // But middleware runs in Edge runtime by default where process.env might be restricted
  // However, in standard 'output: standalone' or 'next start', it should work.
  // Checking auth header
  const basicAuth = req.headers.get('authorization')

  if (basicAuth) {
    const authValue = basicAuth.split(' ')[1]
    const [user, pwd] = atob(authValue).split(':')

    const validUser = process.env.UI_USERNAME || 'admin'
    const validPass = process.env.UI_PASSWORD || 'metalhive-secure'

    if (user === validUser && pwd === validPass) {
      return NextResponse.next()
    }
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Secure Area"',
    },
  })
}

export const config = {
  matcher: '/:path*',
}
