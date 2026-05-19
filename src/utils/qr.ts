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
  if (request) {
    const forwardedHost = request.headers.get('x-forwarded-host')
    const host = forwardedHost || request.headers.get('host')

    if (host) {
      const forwardedProto = request.headers.get('x-forwarded-proto')
      const protocol = forwardedProto || (host.includes('localhost') ? 'http' : 'https')
      return `${protocol}://${host}`.replace(/\/$/, '')
    }
  }

  const configuredUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ||
    'http://localhost:3000'

  return configuredUrl.replace(/\/$/, '')
}

export function getTableQRUrl(slug: string, tableNumber: string, request?: Request): string {
  const baseUrl = getAppBaseUrl(request)
  return `${baseUrl}/menu/${slug}?table=${encodeURIComponent(tableNumber)}`
}
