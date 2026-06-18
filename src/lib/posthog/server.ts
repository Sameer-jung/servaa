import { PostHog } from 'posthog-node'

let client: PostHog | null = null

export function getPostHogServerClient(): PostHog | null {
  if (!process.env.POSTHOG_KEY) return null

  if (!client) {
    client = new PostHog(process.env.POSTHOG_KEY, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      flushAt: 1,
      flushInterval: 0,
    })
  }

  return client
}
