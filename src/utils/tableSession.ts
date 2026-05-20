import crypto from 'crypto'

const tokenBytes = 24

export function generateTableAccessToken() {
  return crypto.randomBytes(tokenBytes).toString('base64url')
}

export function hashTableAccessToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export function getBearerToken(request: Request) {
  const header = request.headers.get('authorization')
  if (!header?.toLowerCase().startsWith('bearer ')) return null
  return header.slice(7).trim() || null
}
