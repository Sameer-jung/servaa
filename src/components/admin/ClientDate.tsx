'use client'

import { useEffect, useState } from 'react'

// Server Components render with the server's timezone (often UTC), not the
// viewer's — formatting dates there silently shows the wrong local time.
// These defer formatting to after mount so it always reflects the browser's
// timezone, matching how every other date display in this app (inside
// 'use client' dashboard components) already behaves. Rendering null until
// then avoids a server/client hydration mismatch.

export function ClientDate({ value }: { value: string }) {
  const [formatted, setFormatted] = useState<string | null>(null)

  useEffect(() => {
    setFormatted(new Date(value).toLocaleDateString())
  }, [value])

  return <>{formatted}</>
}

export function ClientDateTime({ value }: { value: string }) {
  const [formatted, setFormatted] = useState<string | null>(null)

  useEffect(() => {
    setFormatted(new Date(value).toLocaleString())
  }, [value])

  return <>{formatted}</>
}
