'use client'

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

function getTableErrorMessage(error: { code?: string; message?: string } | null) {
  if (!error) return ''

  const message = error.message || ''
  if (error.code === '23505' || message.includes('tables_restaurant_id_table_number_key')) {
    return 'Table number already exists for this restaurant.'
  }

  return message || 'Failed to save table.'
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
    const form = e.currentTarget
    const tableNumber = (form.elements.namedItem('table_number') as HTMLInputElement).value

    const { data: newTable, error: tableError } = await supabase
      .from('tables')
      .insert({ restaurant_id: restaurant!.id, table_number: tableNumber })
      .select()
      .single()

    if (tableError) {
      setError(getTableErrorMessage(tableError))
      return
    }

    if (newTable) {
      await generateQRForTable(newTable)
    }

    setShowModal(false)
    fetchTables()
  }

  const generateQRForTable = async (table: Table) => {
    setError('')
    setGeneratingQR(table.id)
    try {
      const response = await fetch('/api/qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableId: table.id,
          restaurantSlug: restaurant!.slug,
          tableNumber: table.table_number,
        }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) {
        setError(result?.error || 'Failed to generate QR code')
        return
      }
      fetchTables()
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to generate QR code')
    } finally {
      setGeneratingQR(null)
    }
  }

  const handleDeleteTable = async (id: string) => {
    if (!confirm('Delete this table?')) return
    await supabase.from('tables').delete().eq('id', id)
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
