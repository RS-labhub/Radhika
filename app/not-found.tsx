"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Home, ArrowLeft, Search } from "lucide-react"
import { useEffect, useState } from "react"

export default function NotFound() {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return null
  }

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4 overflow-hidden">
      <div className="mx-auto max-w-2xl text-center space-y-6">
        {/* 404 Animation */}
        <div className="relative">
          <h1 className="text-7xl sm:text-8xl font-bold bg-gradient-to-r from-primary via-purple-500 to-pink-500 bg-clip-text text-transparent animate-pulse">
            404
          </h1>
          <div className="absolute inset-0 blur-3xl bg-gradient-to-r from-primary/20 via-purple-500/20 to-pink-500/20 -z-10"></div>
        </div>

        {/* Message */}
        <div className="space-y-3">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Page Not Found</h2>
          <p className="text-muted-foreground text-base sm:text-lg max-w-md mx-auto">
            Oops! The page you're looking for seems to have wandered off into the digital void.
          </p>
        </div>

        {/* Illustration or Icon */}
        <div className="flex justify-center py-4">
          <div className="relative">
            <div className="h-24 w-24 sm:h-28 sm:w-28 rounded-full bg-gradient-to-r from-primary/20 to-purple-500/20 flex items-center justify-center animate-bounce">
              <Search className="h-12 w-12 sm:h-14 sm:w-14 text-muted-foreground" />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center items-center pt-2">
          <Button
            onClick={() => router.back()}
            variant="outline"
            size="lg"
            className="gap-2 min-w-[160px]"
          >
            <ArrowLeft className="h-4 w-4" />
            Go Back
          </Button>
          <Link href="/">
            <Button size="lg" className="gap-2 min-w-[160px]">
              <Home className="h-4 w-4" />
              Home Page
            </Button>
          </Link>
        </div>

        {/* Helpful Links */}
        <div className="pt-4 border-t border-border/40">
          <p className="text-sm text-muted-foreground mb-3">You might want to try:</p>
          <div className="flex flex-wrap gap-2 justify-center">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm">Dashboard</Button>
            </Link>
            <Link href="/favorites">
              <Button variant="ghost" size="sm">Favorites</Button>
            </Link>
            <Link href="/settings">
              <Button variant="ghost" size="sm">Settings</Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
