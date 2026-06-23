import type { Metadata } from 'next'
import { Toaster } from 'react-hot-toast'
import './globals.css'

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://servaa.app'
const title = 'Servaa - Restaurant Management System & QR Ordering Software'
const description =
  'Servaa is a restaurant management system with QR menu ordering, live order tracking, table management, billing, and inventory & expense tracking — all from one dashboard. Built for restaurants, cafes, and cloud kitchens.'

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: title,
    template: '%s | Servaa',
  },
  description,
  keywords: [
    'restaurant management system',
    'restaurant management software',
    'QR menu ordering',
    'QR code ordering system',
    'restaurant ordering software',
    'restaurant POS Nepal',
    'cafe management software',
    'cloud kitchen management system',
    'digital menu for restaurants',
    'table management software',
  ],
  authors: [{ name: 'Servaa' }],
  alternates: {
    canonical: '/',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
    },
  },
  icons: {
    icon: '/logo/servaa.png',
  },
  openGraph: {
    title,
    description,
    url: appUrl,
    siteName: 'Servaa',
    images: [{ url: '/view/1.png', width: 1920, height: 1080, alt: 'Servaa restaurant management dashboard with live orders, menu, and billing' }],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: ['/view/1.png'],
  },
}

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${appUrl}/#organization`,
      name: 'Servaa',
      url: appUrl,
      logo: `${appUrl}/logo/servaa.png`,
      sameAs: ['https://www.instagram.com/_servaa/'],
    },
    {
      '@type': 'SoftwareApplication',
      name: 'Servaa',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description,
      url: appUrl,
      offers: {
        '@type': 'AggregateOffer',
        priceCurrency: 'NPR',
        lowPrice: '0',
        highPrice: '3999',
        offerCount: '3',
      },
    },
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </head>
      <body className="antialiased">
        {children}
        <Toaster 
          position="bottom-center"
          toastOptions={{
            duration: 1500,
            style: {
              background: '#1f2937',
              color: '#fff',
              fontSize: '14px',
            },
          }}
        />
      </body>
    </html>
  )
}
