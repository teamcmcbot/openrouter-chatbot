export const dynamic = 'force-dynamic'
export const revalidate = 0

import SubscriptionPageClient from './SubscriptionPageClient'
import { Suspense } from 'react'

export default function SubscriptionPage() {
  return (
    <Suspense fallback={<div className="max-w-3xl mx-auto p-6">Loading…</div>}>
      <SubscriptionPageClient />
    </Suspense>
  )
}
