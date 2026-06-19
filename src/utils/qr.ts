import QRCode from 'qrcode'

export async function generateQRCodeDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    width: 400,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  })
}

export function getAppBaseUrl(request?: Request): string {
  // Always prefer env vars over request headers to prevent host-header injection.
  // A forged x-forwarded-host header could cause QR codes to point to an attacker's domain.
  const configuredUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined)

  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, '')
  }

  // Fallback to request host only in local dev where NEXT_PUBLIC_APP_URL is unset
  if (request) {
    const host = request.headers.get('host')
    if (host) {
      const protocol = host.includes('localhost') ? 'http' : 'https'
      return `${protocol}://${host}`.replace(/\/$/, '')
    }
  }

  return 'http://localhost:3000'
}

export function getTableQRUrl(slug: string, tableNumber: string, request?: Request, token?: string): string {
  const baseUrl = getAppBaseUrl(request)
  const url = new URL(`${baseUrl}/menu/${slug}`)
  url.searchParams.set('table', tableNumber)
  if (token) url.searchParams.set('t', token)
  return url.toString()
}
