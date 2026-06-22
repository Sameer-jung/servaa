import type { ReceiptData } from '@/lib/billing/receipt'
import { formatCurrency, formatDate } from '@/utils/format'

// ============================================
// ESC/POS renderer — PHASE 2 (encoding only, no transport)
// ============================================
// Produces a real ESC/POS byte buffer from the same ReceiptData used by the
// browser-print renderer, so a thermal printer prints the identical content.
// This module intentionally stops at the byte buffer: actually delivering it
// to a printer (a local network socket to a LAN thermal printer, a USB/serial
// bridge, or a print-spooler service running on restaurant hardware) is NOT
// implemented here — that requires a server-side bridge process this Next.js
// app can reach, which is out of scope for this pass. Wire `buildEscPosReceipt`'s
// output into that bridge once it exists.

const ESC = 0x1b
const GS = 0x1d

function textToBytes(text: string): number[] {
  // Plain ASCII only for now — printers needing extended codepages (accents,
  // non-Latin scripts) will need a codepage table before this is wired to a
  // real bridge in phase 2.
  return Array.from(text).map((char) => char.charCodeAt(0) & 0xff)
}

function line(text: string): number[] {
  return [...textToBytes(text), 0x0a]
}

function center(): number[] {
  return [ESC, 0x61, 0x01]
}

function leftAlign(): number[] {
  return [ESC, 0x61, 0x00]
}

function bold(on: boolean): number[] {
  return [ESC, 0x45, on ? 1 : 0]
}

function doubleHeight(on: boolean): number[] {
  return [GS, 0x21, on ? 0x01 : 0x00]
}

function cutPaper(): number[] {
  return [GS, 0x56, 0x01, 0x00]
}

function padRow(left: string, right: string, width = 32): string {
  const space = Math.max(1, width - left.length - right.length)
  return `${left}${' '.repeat(space)}${right}`
}

export function buildEscPosReceipt(data: ReceiptData): Uint8Array {
  const bytes: number[] = []
  const money = (value: number) => formatCurrency(value, data.currency)

  bytes.push(ESC, 0x40) // initialize printer

  bytes.push(...center(), ...doubleHeight(true), ...bold(true))
  bytes.push(...line(data.restaurantName))
  bytes.push(...doubleHeight(false), ...bold(false))
  if (data.restaurantAddress) bytes.push(...line(data.restaurantAddress))
  if (data.restaurantPhone) bytes.push(...line(data.restaurantPhone))

  bytes.push(...leftAlign())
  bytes.push(...line('-'.repeat(32)))
  bytes.push(...line(padRow('Table', data.tableNumber)))
  bytes.push(...line(padRow('Bill', `#${data.billId.slice(0, 8)}`)))
  bytes.push(...line(padRow('Date', formatDate(data.generatedAt))))
  bytes.push(...line('-'.repeat(32)))

  for (const item of data.items) {
    bytes.push(...line(`${item.quantity}x ${item.name}`))
    bytes.push(...line(padRow('', money(item.lineTotal))))
  }

  bytes.push(...line('-'.repeat(32)))
  bytes.push(...line(padRow('Subtotal', money(data.subtotal))))
  bytes.push(...line(padRow('Tax', money(data.taxAmount))))
  bytes.push(...bold(true), ...doubleHeight(true))
  bytes.push(...line(padRow('Total', money(data.total))))
  bytes.push(...doubleHeight(false), ...bold(false))

  if (data.payments.length > 0) {
    bytes.push(...line('-'.repeat(32)))
    bytes.push(...bold(true))
    bytes.push(...line('Payments'))
    bytes.push(...bold(false))
    for (const payment of data.payments) {
      bytes.push(...line(padRow(payment.method, money(payment.amount))))
    }
    bytes.push(...bold(true))
    bytes.push(...line(padRow('Owed', money(data.owed))))
    bytes.push(...bold(false))
  }

  bytes.push(...center())
  bytes.push(...line(''))
  bytes.push(...line('Thank you!'))
  bytes.push(...line('Powered by Servaa'))
  bytes.push(...line(''))
  bytes.push(...cutPaper())

  return Uint8Array.from(bytes)
}

// Stub entry point for the eventual print bridge. Throws clearly rather than
// silently no-op-ing so phase-1 callers can't mistake this for a working send.
export async function sendToThermalPrinter(): Promise<never> {
  throw new Error(
    'Thermal printer bridge is not implemented yet. buildEscPosReceipt() produces the byte buffer; ' +
      'wire it to a network/USB print bridge running on restaurant hardware to complete phase 2.'
  )
}
