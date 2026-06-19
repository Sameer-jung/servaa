import type { Metadata } from 'next'
import { Toaster } from 'react-hot-toast'
import './globals.css'

export const metadata: Metadata = {
  title: 'Servaa - Restaurant Management System',
  description: 'In-restaurant QR ordering and management system for cafes and restaurants',
  icons: {
    icon: '/logo/servaa.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
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
