'use client'

import toast from "react-hot-toast";
import { MESSAGES } from "@/utils/messages";
import { useState, useEffect, useCallback, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRestaurant } from '@/hooks/useRestaurant'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageLoading } from '@/components/dashboard/PageLoading'
import { QRCodeDisplay } from '@/components/tables/QRCodeDisplay'
import { Table } from '@/types'
import { validateSlug, validateTableNumber } from '@/utils/validation'

function getTableErrorMessage(error: { code?: string; message?: string } | null) {
  if (!error) return ''

  const message = error.message || ''
  console.error('[TablesPage] table save error:', message)

  if (error.code === '23505' || message.includes('tables_restaurant_id_table_number_key')) {
    return 'Table number already exists for this restaurant.'
  }

  return 'Failed to save table.'
}

function TablesContent() {
  const [tables, setTables] = useState<Table[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [generatingQR, setGeneratingQR] = useState<string | null>(null)
  const [error, setError] = useState('')
  const { restaurant, loading: restaurantLoading } = useRestaurant()
  const supabase = createClient()

  const fetchTables = useCallback(async () => {
    if (!restaurant) {
      setTables([])
      setLoading(false)
      return
    }

    setLoading(true)
    const { data } = await supabase
      .from('tables')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .order('table_number')
    setTables(data || [])
    setLoading(false)
  }, [restaurant, supabase])

  useEffect(() => {
    fetchTables()
  }, [fetchTables])

  const handleAddTable = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    if (!restaurant) return

    const form = e.currentTarget
    const tableNumber = validateTableNumber((form.elements.namedItem('table_number') as HTMLInputElement).value)

    if (!tableNumber) {
      setError('Table number must be 1 to 32 letters, numbers, spaces, periods, dashes, or underscores.')
      return
    }

    const { data: newTable, error: tableError } = await supabase
      .from('tables')
      .insert({ restaurant_id: restaurant.id, table_number: tableNumber })
      .select()
      .single()

    if (tableError) {
      setError(getTableErrorMessage(tableError))
      toast.error(MESSAGES.tables.addFailed);
      return
    }

    if (newTable) {
      await generateQRForTable(newTable)
      toast.success(MESSAGES.tables.addSuccess);
    }

    setShowModal(false)
    fetchTables()
  }

  const generateQRForTable = async (table: Table) => {
    setError('')
    const restaurantSlug = validateSlug(restaurant?.slug)
    const tableNumber = validateTableNumber(table.table_number)
    if (!restaurantSlug || !tableNumber) {
      setError('Failed to generate QR code')
      return
    }

    setGeneratingQR(table.id)
    try {
      const response = await fetch('/api/qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableId: table.id,
          restaurantSlug,
          tableNumber,
        }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) {
        console.error('[TablesPage] QR generation error:', result?.error || response.statusText)
        setError('Failed to generate QR code')
        return
      }
      fetchTables()
    } catch (error) {
      console.error('[TablesPage] QR generation request error:', error)
      setError('Failed to generate QR code')
    } finally {
      setGeneratingQR(null)
    }
  }

  const handleDeleteTable = async (id: string) => {
    if (!confirm('Delete this table?')) return
    setError('')
    const { error: tableError } = await supabase.from('tables').delete().eq('id', id)
    if (tableError) {
      console.error('[TablesPage] table delete error:', tableError.message)
      toast.error(MESSAGES.tables.deleteFailed);
      return
    }
    toast.success(MESSAGES.tables.deleteSuccess);
    fetchTables()
  }

  if (restaurantLoading || loading) {
    return <PageLoading />
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tables</h1>
          <p className="text-sm text-gray-500">Manage tables and QR codes</p>
        </div>
        <Button disabled={!restaurant} onClick={() => setShowModal(true)}>+ Add Table</Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {tables.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {tables.map((table) => (
            <div key={table.id} className="relative">
              {table.qr_code ? (
                <QRCodeDisplay tableNumber={table.table_number} qrCodeUrl={table.qr_code} restaurantName={restaurant?.name || ''} />
              ) : (
                <div className="rounded-lg border border-gray-200 bg-white p-3">
                  <div className="flex aspect-square items-center justify-center rounded-lg bg-gray-50">
                    <Button size="sm" isLoading={generatingQR === table.id} onClick={() => generateQRForTable(table)}>
                      Generate QR
                    </Button>
                  </div>
                  <p className="mt-2 text-center text-sm font-medium text-gray-700">Table {table.table_number}</p>
                </div>
              )}
              <button
                onClick={() => handleDeleteTable(table.id)}
                className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-red-600 hover:bg-red-200"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No tables"
          description="Add tables to generate QR codes for customers."
          icon={
            <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
          }
          action={<Button disabled={!restaurant} onClick={() => setShowModal(true)}>Add First Table</Button>}
        />
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Add New Table">
        <form onSubmit={handleAddTable} className="space-y-4">
          <Input name="table_number" label="Table Number" placeholder="e.g., 1, A1, Patio-2" required />
          <Button type="submit" className="w-full">Add Table & Generate QR</Button>
        </form>
      </Modal>
    </div>
  )
}

export default function TablesPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <TablesContent />
    </Suspense>
  )
}
