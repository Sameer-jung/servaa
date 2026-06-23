import type { ReceiptData } from '@/lib/billing/receipt'
import { formatCurrency, formatDate } from '@/utils/format'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Renders a self-contained, receipt-width HTML document for the browser
// print fallback. Zero restaurant-side setup: open this in a new tab/window
// and call window.print() — works on any device with a printer driver.
export function renderReceiptHtml(data: ReceiptData): string {
  const money = (value: number) => formatCurrency(value, data.currency)

  const itemRows = data.items
    .map(
      (item) => `
        <div class="row">
          <span class="item-name">${item.quantity}&times; ${escapeHtml(item.name)}</span>
          <span class="item-amount">${money(item.lineTotal)}</span>
        </div>`
    )
    .join('')

  const paymentRows = data.payments
    .map(
      (p) => `
        <div class="row muted">
          <span>${escapeHtml(p.method)} - ${formatDate(p.createdAt)}</span>
          <span>${money(p.amount)}</span>
        </div>`
    )
    .join('')

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Receipt</title>
<style>
  @page { margin: 0; }
  body {
    margin: 0;
    padding: 12px;
    width: 280px;
    font-family: 'Courier New', monospace;
    font-size: 12px;
    color: #000;
  }
  .center { text-align: center; }
  .bold { font-weight: 700; }
  .divider { border-top: 1px dashed #000; margin: 8px 0; }
  .row { display: flex; justify-content: space-between; gap: 8px; padding: 2px 0; }
  .row.muted { color: #444; font-size: 11px; }
  .item-name { flex: 1; }
  .item-amount { white-space: nowrap; }
  .total-row { font-size: 14px; font-weight: 700; }
  .footer { margin-top: 10px; font-size: 11px; }
  .branding { margin-top: 6px; font-size: 9px; color: #888; }
  @media print {
    body { width: auto; }
  }
</style>
</head>
<body>
  <div class="center bold">${escapeHtml(data.restaurantName)}</div>
  ${data.restaurantAddress ? `<div class="center">${escapeHtml(data.restaurantAddress)}</div>` : ''}
  ${data.restaurantPhone ? `<div class="center">${escapeHtml(data.restaurantPhone)}</div>` : ''}
  <div class="divider"></div>
  <div class="row"><span>Table</span><span>${escapeHtml(data.tableNumber)}</span></div>
  <div class="row"><span>Bill</span><span>#${data.billId.slice(0, 8)}</span></div>
  <div class="row"><span>Date</span><span>${formatDate(data.generatedAt)}</span></div>
  <div class="divider"></div>
  ${itemRows}
  <div class="divider"></div>
  <div class="row"><span>Subtotal</span><span>${money(data.subtotal)}</span></div>
  <div class="row"><span>Tax</span><span>${money(data.taxAmount)}</span></div>
  <div class="row total-row"><span>Total</span><span>${money(data.total)}</span></div>
  ${
    data.payments.length > 0
      ? `<div class="divider"></div><div class="bold">Payments</div>${paymentRows}
         <div class="row bold"><span>Owed</span><span>${money(data.owed)}</span></div>`
      : ''
  }
  <div class="divider"></div>
  <div class="footer center">Thank you!</div>
  <div class="branding center">Powered by Servaa</div>
</body>
</html>`
}

// Opens the receipt in a new window and triggers the browser print dialog.
// Caller is responsible for invoking this from a user gesture (button click).
export function printReceiptInBrowser(data: ReceiptData) {
  const html = renderReceiptHtml(data)
  const printWindow = window.open('', '_blank', 'width=360,height=640')
  if (!printWindow) return

  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()
  printWindow.focus()
  printWindow.onload = () => {
    printWindow.print()
  }
}
