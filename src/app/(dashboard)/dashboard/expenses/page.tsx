'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import toast from 'react-hot-toast'
import { Lock, Plus, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRestaurant } from '@/hooks/useRestaurant'
import { useRole } from '@/hooks/useRole'
import { isServiceRequestOrder } from '@/utils/orders'
import { PageLoading } from '@/components/dashboard/PageLoading'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { StatCard } from '@/components/dashboard/StatCard'
import { Card, CardContent } from '@/components/ui/Card'
import { formatCurrency, formatTime } from '@/utils/format'
import type { Expense, ExpenseCategory } from '@/types'

type Period = 'today' | 'week' | 'month' | 'custom'

// Expense rows embed their linked stock movement (when created from a stock
// purchase) so the list can show the actual item name, not just "ingredients".
type ExpenseRow = Expense & {
  movements?: { quantity_delta: number; inventory_item: { name: string; unit: string } | null }[] | null
}

const PERIOD_LABELS: Record<Period, string> = {
  today: 'Today',
  week: 'This Week',
  month: 'This Month',
  custom: 'Selected Day',
}

const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'ingredients',
  'supplies',
  'rent',
  'salaries',
  'utilities',
  'equipment',
  'marketing',
  'other',
]

function getPeriodStart(period: Period): Date {
  const now = new Date()
  if (period === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const d = new Date(now)
  d.setDate(d.getDate() - (period === 'week' ? 6 : 29))
  d.setHours(0, 0, 0, 0)
  return d
}

function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Parse a YYYY-MM-DD expense_date as a LOCAL calendar date. Using new Date(str)
// would parse it as UTC midnight and shift the day in non-UTC timezones.
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

// Section header for an expense_date: "Today", "Yesterday", else "18 June 2026".
function dateGroupLabel(dateStr: string): string {
  const date = parseLocalDate(dateStr)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diffDays = Math.round((today.getTime() - date.getTime()) / 86_400_000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
}

function ExpensesContent() {
  const { restaurant, loading: restaurantLoading } = useRestaurant()
  const { isOwner, loading: roleLoading } = useRole(restaurant?.id)
  const currency = restaurant?.currency || 'NPR'

  const [period, setPeriod] = useState<Period>('today')
  const [customDate, setCustomDate] = useState(toDateInput(new Date()))
  const [search, setSearch] = useState('')
  const [payFilter, setPayFilter] = useState<'all' | 'Cash' | 'Online'>('all')
  const [expenses, setExpenses] = useState<ExpenseRow[]>([])
  const [revenue, setRevenue] = useState(0)
  const [loading, setLoading] = useState(true)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [deleting, setDeleting] = useState<Expense | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)

  const fetchData = useCallback(async () => {
    if (!restaurant || !isOwner) {
      setLoading(false)
      return
    }
    setLoading(true)

    let rangeStart: Date
    let rangeEnd: Date
    if (period === 'custom') {
      rangeStart = new Date(`${customDate}T00:00:00`)
      rangeEnd = new Date(`${customDate}T23:59:59.999`)
    } else {
      rangeStart = getPeriodStart(period)
      rangeEnd = new Date()
    }
    const fromDate = toDateInput(rangeStart)
    const toDate = toDateInput(rangeEnd)
    const supabase = createClient()

    // Read expenses directly from Supabase (RLS owner-gated) alongside the
    // revenue query — the same single-round-trip pattern the orders page uses,
    // instead of the slower API-route + server re-auth path. Mutations still go
    // through /api/expenses.
    const [expenseRes, revenueRes] = await Promise.all([
      supabase
        .from('expenses')
        .select('*, movements:stock_movements(quantity_delta, inventory_item:inventory_items(name, unit))')
        .eq('restaurant_id', restaurant.id)
        .gte('expense_date', fromDate)
        .lte('expense_date', toDate)
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('orders')
        .select('id, total_amount, special_instructions')
        .eq('restaurant_id', restaurant.id)
        .eq('status', 'completed')
        .gte('created_at', rangeStart.toISOString())
        .lte('created_at', rangeEnd.toISOString()),
    ])

    if (expenseRes.error) {
      toast.error('Failed to load expenses')
      setExpenses([])
    } else {
      setExpenses((expenseRes.data as ExpenseRow[]) || [])
    }

    const completed = ((revenueRes.data as { total_amount: number | null; special_instructions?: string | null }[] | null) ?? [])
      .filter((o) => !isServiceRequestOrder(o))
    setRevenue(completed.reduce((sum, o) => sum + Number(o.total_amount ?? 0), 0))

    setLoading(false)
  }, [restaurant, isOwner, period, customDate])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleDelete = async () => {
    if (!deleting || !restaurant) return
    setDeletingBusy(true)
    const res = await fetch(
      `/api/expenses?expenseId=${encodeURIComponent(deleting.id)}&restaurantId=${encodeURIComponent(restaurant.id)}`,
      { method: 'DELETE' }
    )
    setDeletingBusy(false)
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      toast.error(data?.error || 'Could not delete expense')
      return
    }
    toast.success('Expense deleted')
    setDeleting(null)
    fetchData()
  }

  if (restaurantLoading || roleLoading) return <PageLoading />

  if (!isOwner) {
    return (
      <EmptyState
        title="Owners only"
        description="Expense tracking is restricted to the restaurant owner."
        icon={<Lock className="h-8 w-8" />}
      />
    )
  }

  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0)
  const net = revenue - totalExpenses
  const periodLabel = PERIOD_LABELS[period]

  const query = search.trim().toLowerCase()
  const visibleExpenses = expenses.filter((e) => {
    if (payFilter !== 'all' && (e.payment_method ?? '').toLowerCase() !== payFilter.toLowerCase()) return false
    if (!query) return true
    return (
      e.category.toLowerCase().includes(query) ||
      (e.vendor ?? '').toLowerCase().includes(query) ||
      (e.note ?? '').toLowerCase().includes(query) ||
      (e.payment_method ?? '').toLowerCase().includes(query)
    )
  })
  const visibleTotal = visibleExpenses.reduce((sum, e) => sum + Number(e.amount), 0)

  // Group the (already newest-first) expenses under Today / Yesterday / date
  // headers. Consecutive grouping works because the query sorts by expense_date
  // desc, then created_at desc.
  const groupedExpenses: { key: string; label: string; items: ExpenseRow[]; total: number }[] = []
  for (const e of visibleExpenses) {
    const last = groupedExpenses[groupedExpenses.length - 1]
    if (last && last.key === e.expense_date) {
      last.items.push(e)
      last.total += Number(e.amount)
    } else {
      groupedExpenses.push({
        key: e.expense_date,
        label: dateGroupLabel(e.expense_date),
        items: [e],
        total: Number(e.amount),
      })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Expenses</h1>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Track spending and see your net profit at a glance.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
            {(['today', 'week', 'month', 'custom'] as Period[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  period === p ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800'
                }`}
              >
                {p === 'today' ? 'Today' : p === 'week' ? 'Week' : p === 'month' ? 'Month' : 'Custom'}
              </button>
            ))}
          </div>
          <Button onClick={() => { setEditing(null); setModalOpen(true) }}>
            <Plus className="mr-1.5 h-4 w-4" /> Add
          </Button>
        </div>
      </div>

      {period === 'custom' && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="w-48">
            <Input
              label="Pick a day"
              type="date"
              value={customDate}
              max={toDateInput(new Date())}
              onChange={(e) => setCustomDate(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Money report */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          title={`Revenue · ${periodLabel}`}
          value={loading ? '…' : formatCurrency(revenue, currency)}
          subtitle="Completed orders"
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <StatCard
          title={`Expenses · ${periodLabel}`}
          value={loading ? '…' : formatCurrency(totalExpenses, currency)}
          subtitle={`${expenses.length} ${expenses.length === 1 ? 'entry' : 'entries'}`}
          icon={<TrendingDown className="h-5 w-5" />}
        />
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-500 dark:text-gray-400">Net · {periodLabel}</p>
                <p className={`mt-1 whitespace-nowrap text-base font-bold sm:text-2xl ${
                  net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                }`}>
                  {loading ? '…' : formatCurrency(net, currency)}
                </p>
                <p className="mt-1 text-xs font-medium text-gray-400 dark:text-gray-500">Revenue − Expenses</p>
              </div>
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-300 sm:h-12 sm:w-12">
                <Wallet className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search + payment filter */}
      {expenses.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full sm:max-w-xs">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by category, vendor, note…"
            />
          </div>
          <div className="flex w-fit overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
            {(['all', 'Cash', 'Online'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPayFilter(p)}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                  payFilter === p
                    ? 'bg-brand-600 text-white'
                    : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800'
                }`}
              >
                {p === 'all' ? 'All' : p}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Expense list */}
      {loading ? (
        <p className="py-6 text-center text-sm text-gray-400">Loading…</p>
      ) : expenses.length === 0 ? (
        <EmptyState
          title="No expenses recorded"
          description={`Nothing logged for ${periodLabel.toLowerCase()}.`}
          action={<Button onClick={() => { setEditing(null); setModalOpen(true) }}><Plus className="mr-1.5 h-4 w-4" /> Add Expense</Button>}
        />
      ) : visibleExpenses.length === 0 ? (
        <EmptyState
          title="No matching expenses"
          description={
            search.trim()
              ? `Nothing matches “${search.trim()}”.`
              : `No ${payFilter.toLowerCase()} payments in this period.`
          }
        />
      ) : (
        <div className="space-y-3">
          {/* Filtered summary */}
          <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-2.5 dark:border-gray-800 dark:bg-gray-900">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {payFilter === 'all' ? 'All payments' : `${payFilter} payments`} · {visibleExpenses.length}
            </span>
            <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{formatCurrency(visibleTotal, currency)}</span>
          </div>

          {/* Date-grouped list */}
          {groupedExpenses.map((group) => (
            <div key={group.key} className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
              <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-2 dark:border-gray-800 dark:bg-gray-950">
                <span className="text-xs font-bold uppercase tracking-wide text-gray-700 dark:text-gray-300">{group.label}</span>
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{formatCurrency(group.total, currency)}</span>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {group.items.map((e) => {
                  const linked = e.movements && e.movements.length > 0 ? e.movements[0] : null
                  const itemName = linked?.inventory_item?.name ?? null
                  const qtyText = linked
                    ? `${Number(linked.quantity_delta)} ${linked.inventory_item?.unit ?? ''}`.trim()
                    : null
                  const title = itemName || e.category
                  return (
                  <div key={e.id} className="flex flex-wrap items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold capitalize text-gray-900 dark:text-gray-100">{title}</span>
                        {itemName && (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium capitalize text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                            {e.category}
                          </span>
                        )}
                        {e.source === 'inventory_purchase' && (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                            from stock
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs font-medium text-gray-500 dark:text-gray-400">
                        {formatTime(e.created_at)}
                        {qtyText ? ` · ${qtyText}` : ''}
                        {e.vendor ? ` · ${e.vendor}` : ''}
                        {e.note ? ` · ${e.note}` : ''}
                      </p>
                    </div>
                    <p className="flex-shrink-0 text-sm font-bold text-gray-900 dark:text-gray-100">
                      {formatCurrency(Number(e.amount), currency)}
                    </p>
                    <div className="flex w-full flex-shrink-0 justify-end gap-1 sm:w-auto">
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(e); setModalOpen(true) }}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleting(e)}>Delete</Button>
                    </div>
                  </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {restaurant && (
        <ExpenseModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          restaurantId={restaurant.id}
          expense={editing}
          onSaved={() => { setModalOpen(false); fetchData() }}
        />
      )}

      <ConfirmDialog
        isOpen={Boolean(deleting)}
        title="Delete expense?"
        description="This cannot be undone."
        confirmLabel="Delete"
        isLoading={deletingBusy}
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}

function ExpenseModal({
  isOpen,
  onClose,
  restaurantId,
  expense,
  onSaved,
}: {
  isOpen: boolean
  onClose: () => void
  restaurantId: string
  expense: Expense | null
  onSaved: () => void
}) {
  const today = toDateInput(new Date())
  const [category, setCategory] = useState<ExpenseCategory>('ingredients')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today)
  const [vendor, setVendor] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<{ amount?: string; date?: string }>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setCategory(expense?.category ?? 'ingredients')
      setAmount(expense ? String(expense.amount) : '')
      setDate(expense?.expense_date ?? today)
      setVendor(expense?.vendor ?? '')
      setPaymentMethod(expense?.payment_method ?? '')
      setNote(expense?.note ?? '')
      setErrors({})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, expense])

  const validate = () => {
    const next: { amount?: string; date?: string } = {}
    const amt = Number(amount)
    if (amount.trim() === '' || Number.isNaN(amt)) next.amount = 'Enter an amount'
    else if (amt <= 0) next.amount = 'Must be greater than 0'
    else if (amt > 99999999.99) next.amount = 'Amount is too large'

    if (!date) next.date = 'Pick a date'
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) next.date = 'Invalid date'
    else if (date > today) next.date = 'Date cannot be in the future'
    return next
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const next = validate()
    setErrors(next)
    if (Object.keys(next).length > 0) return
    setSaving(true)
    const payload = {
      restaurantId,
      category,
      amount: Number(amount),
      expense_date: date,
      vendor: vendor.trim() || null,
      payment_method: paymentMethod.trim() || null,
      note: note.trim() || null,
    }
    const res = await fetch('/api/expenses', {
      method: expense ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(expense ? { ...payload, expenseId: expense.id } : payload),
    })
    const data = await res.json().catch(() => null)
    setSaving(false)
    if (!res.ok) {
      toast.error(data?.error || 'Could not save expense')
      return
    }
    toast.success(expense ? 'Expense updated' : 'Expense added')
    onSaved()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={expense ? 'Edit Expense' : 'Add Expense'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700 dark:text-gray-200">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-base capitalize text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c} className="capitalize">{c}</option>
              ))}
            </select>
          </div>
          <Input
            label="Amount"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={amount}
            onChange={(e) => { setAmount(e.target.value); setErrors((p) => ({ ...p, amount: undefined })) }}
            placeholder="0"
            error={errors.amount}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Date"
            type="date"
            value={date}
            max={today}
            onChange={(e) => { setDate(e.target.value); setErrors((p) => ({ ...p, date: undefined })) }}
            error={errors.date}
          />
          <Input label="Vendor" value={vendor} maxLength={120} onChange={(e) => setVendor(e.target.value)} placeholder="Optional" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-gray-700 dark:text-gray-200">Payment method</label>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-base text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          >
            <option value="">Not specified</option>
            <option value="Cash">Cash</option>
            <option value="Online">Online</option>
          </select>
        </div>
        <Input label="Note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" className="flex-1" isLoading={saving}>{expense ? 'Save' : 'Add Expense'}</Button>
        </div>
      </form>
    </Modal>
  )
}

export default function ExpensesPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <ExpensesContent />
    </Suspense>
  )
}
