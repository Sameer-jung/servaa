export function roundCents(value: number): number {
  return Math.round(value * 100) / 100
}

// Bill total mirrors invoices.grand_total (subtotal + tax) — that's the actual
// amount owed, so payments must validate against this, not the raw pre-tax
// sum of orders.total_amount.
export function computeBillTotals(subtotal: number, taxRatePercent: number) {
  const roundedSubtotal = roundCents(subtotal)
  const taxAmount = roundCents(roundedSubtotal * (taxRatePercent / 100))
  return { subtotal: roundedSubtotal, taxAmount, total: roundCents(roundedSubtotal + taxAmount) }
}
