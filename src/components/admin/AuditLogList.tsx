interface AuditLogEntry {
  id: string
  admin_user_id: string | null
  action: string
  target_type: string
  target_id: string
  before: unknown
  after: unknown
  created_at: string
}

function formatAction(action: string): string {
  return action
    .replace(/[._]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function diffSummary(before: unknown, after: unknown): string {
  const beforeObj = (before || {}) as Record<string, unknown>
  const afterObj = (after || {}) as Record<string, unknown>
  const keys = Array.from(new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]))

  if (keys.length === 0) return ''

  return keys
    .map((key) => `${key}: ${JSON.stringify(beforeObj[key])} → ${JSON.stringify(afterObj[key])}`)
    .join(', ')
}

interface AuditLogListProps {
  logs: AuditLogEntry[]
  adminEmails: Map<string, string>
  showTarget?: boolean
}

export function AuditLogList({ logs, adminEmails, showTarget }: AuditLogListProps) {
  if (logs.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">No activity recorded yet.</p>
  }

  return (
    <ul className="space-y-3 text-sm">
      {logs.map((log) => (
        <li key={log.id} className="border-b border-gray-100 pb-3 last:border-0 dark:border-gray-800">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {formatAction(log.action)}
              {showTarget && (
                <span className="ml-2 text-xs font-normal text-gray-400 dark:text-gray-500">
                  {log.target_type} · {log.target_id}
                </span>
              )}
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {new Date(log.created_at).toLocaleString()}
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            by {log.admin_user_id ? adminEmails.get(log.admin_user_id) || log.admin_user_id : 'unknown admin'}
          </p>
          {diffSummary(log.before, log.after) && (
            <p className="mt-1 break-all text-xs text-gray-500 dark:text-gray-400">
              {diffSummary(log.before, log.after)}
            </p>
          )}
        </li>
      ))}
    </ul>
  )
}
