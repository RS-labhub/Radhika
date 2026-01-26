import React, { Suspense } from "react"
import ConfirmClient from "./ConfirmClient"

export default function ConfirmPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Verifying...</div>}>
      {/* ConfirmClient is a client component that uses useSearchParams and navigation hooks.
          Wrapping it in Suspense prevents the CSR bailout warning during prerendering. */}
      <ConfirmClient />
    </Suspense>
  )
}
