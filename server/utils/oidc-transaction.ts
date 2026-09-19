import { useSession, type H3Event } from 'h3'
export function useOIDCTransaction(event: H3Event) {
  return useSession<{
    state: string
    nonce: string
    verifier: string
    expiresAt: number
  }>(event, {
    name: 'chronoframe-oidc',
    password: process.env.NUXT_SESSION_PASSWORD!,
    maxAge: 300,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/api/auth/oidc',
    },
  })
}
