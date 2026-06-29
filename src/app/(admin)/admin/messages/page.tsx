import { supabaseAdmin } from '@/lib/supabase/admin'
import { MarkHandledButton } from '@/components/admin/MarkHandledButton'
import { cn } from '@/utils/cn'

interface PageProps {
  searchParams: Promise<{ status?: string }>
}

export default async function AdminMessagesPage({ searchParams }: PageProps) {
  const { status = 'new' } = await searchParams

  let query = supabaseAdmin.from('support_messages').select('*').order('created_at', { ascending: false })
  if (status === 'new' || status === 'handled') {
    query = query.eq('status', status)
  }

  const { data: messages } = await query

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Support messages</h1>
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
          Contact form submissions from the public site.
        </p>
      </div>

      <div className="flex gap-2 text-sm">
        {(['new', 'handled', 'all'] as const).map((option) => (
          <a
            key={option}
            href={`/admin/messages?status=${option}`}
            className={cn(
              'rounded-lg px-3 py-1.5 font-medium',
              status === option
                ? 'bg-brand-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200'
            )}
          >
            {option === 'all' ? 'All' : option === 'new' ? 'New' : 'Handled'}
          </a>
        ))}
      </div>

      <div className="space-y-3">
        {(messages || []).map((message) => (
          <div
            key={message.id}
            className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-gray-900 dark:text-gray-100">{message.name}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {message.email}
                  {message.phone ? ` · ${message.phone}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-semibold',
                    message.status === 'handled'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                  )}
                >
                  {message.status === 'handled' ? 'Handled' : 'New'}
                </span>
                {message.status !== 'handled' && <MarkHandledButton messageId={message.id} />}
              </div>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">{message.message}</p>
            <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
              {new Date(message.created_at).toLocaleString()}
            </p>
          </div>
        ))}

        {(messages || []).length === 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500 shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
            No messages here.
          </div>
        )}
      </div>
    </div>
  )
}
