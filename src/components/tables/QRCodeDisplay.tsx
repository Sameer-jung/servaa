'use client'

/* eslint-disable @next/next/no-img-element */

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'

interface QRCodeDisplayProps {
  tableNumber: string
  qrCodeUrl: string
  restaurantName: string
}

export function QRCodeDisplay({ tableNumber, qrCodeUrl, restaurantName }: QRCodeDisplayProps) {
  const [showModal, setShowModal] = useState(false)

  const handleDownload = () => {
    const link = document.createElement('a')
    link.href = qrCodeUrl
    link.download = `table-${tableNumber}-qr.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handlePrint = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return
    printWindow.document.write(`
      <html>
        <head><title>Table ${tableNumber} QR Code</title></head>
        <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;">
          <h2>${restaurantName}</h2>
          <h3>Table ${tableNumber}</h3>
          <img src="${qrCodeUrl}" style="width:300px;height:300px;" />
          <p style="margin-top:20px;color:#666;">Scan to order</p>
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.print()
  }

  return (
    <>
      <div
        onClick={() => setShowModal(true)}
        className="cursor-pointer rounded-lg border border-gray-200 bg-white p-3 transition-shadow hover:shadow-md"
      >
        <div className="mx-auto aspect-square w-24">
          <img
            src={qrCodeUrl}
            alt={`Table ${tableNumber} QR`}
            className="h-full w-full rounded-lg object-contain"
          />
        </div>
        <p className="mt-2 text-center text-sm font-medium text-gray-700">
          Table {tableNumber}
        </p>
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={`Table ${tableNumber} QR Code`}>
        <div className="flex flex-col items-center space-y-4">
          <div className="aspect-square w-64">
            <img
              src={qrCodeUrl}
              alt={`Table ${tableNumber} QR`}
              className="h-full w-full rounded-xl object-contain"
            />
          </div>
          <p className="text-sm text-gray-500">{restaurantName} - Table {tableNumber}</p>
          <div className="flex w-full gap-2">
            <Button variant="outline" className="flex-1" onClick={handleDownload}>
              Download
            </Button>
            <Button variant="outline" className="flex-1" onClick={handlePrint}>
              Print
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
