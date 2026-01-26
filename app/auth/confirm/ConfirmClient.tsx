"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, CheckCircle, XCircle, ArrowLeft } from "lucide-react"

export default function ConfirmClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading")
  const [message, setMessage] = useState("")

  useEffect(() => {
    const confirmEmail = async () => {
      const userId = searchParams.get("userId")
      const secret = searchParams.get("secret")

      if (!userId || !secret) {
        setStatus("error")
        setMessage("Invalid confirmation link. Please check your email and try again.")
        return
      }

      try {
        const response = await fetch("/api/auth/confirm", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ userId, secret }),
        })

        const data = await response.json()

        if (response.ok) {
          setStatus("success")
          setMessage("Your email has been successfully verified! You can now sign in to your account.")
        } else {
          setStatus("error")
          setMessage(data.error || "Failed to verify your email. The link may have expired.")
        }
      } catch (error) {
        setStatus("error")
        setMessage("An unexpected error occurred. Please try again later.")
      }
    }

    confirmEmail()
  }, [searchParams])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 p-4">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.15),_transparent_55%),radial-gradient(circle_at_bottom,_rgba(139,92,246,0.12),_transparent_55%)]" />
      
      <Card className="w-full max-w-md shadow-xl border-white/60 dark:border-white/10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl">
        <CardHeader className="space-y-1 text-center">
          <div className="flex items-center gap-2 mb-2">
            <Link href="/" className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </div>
          
          {status === "loading" && (
            <>
              <div className="mx-auto w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center mb-4">
                <Loader2 className="h-6 w-6 text-blue-600 dark:text-blue-400 animate-spin" />
              </div>
              <CardTitle className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                Verifying your email
              </CardTitle>
              <CardDescription className="text-slate-500 dark:text-slate-400">
                Please wait while we confirm your email address...
              </CardDescription>
            </>
          )}

          {status === "success" && (
            <>
              <div className="mx-auto w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center mb-4">
                <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <CardTitle className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                Email verified!
              </CardTitle>
              <CardDescription className="text-slate-500 dark:text-slate-400">
                {message}
              </CardDescription>
            </>
          )}

          {status === "error" && (
            <>
              <div className="mx-auto w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center mb-4">
                <XCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <CardTitle className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                Verification failed
              </CardTitle>
              <CardDescription className="text-slate-500 dark:text-slate-400">
                {message}
              </CardDescription>
            </>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          {status === "success" && (
            <Button 
              onClick={() => router.push("/auth/login")}
              className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white"
            >
              Sign In
            </Button>
          )}

          {status === "error" && (
            <div className="space-y-2">
              <Button 
                onClick={() => router.push("/auth/signup")}
                className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white"
              >
                Try Signing Up Again
              </Button>
              <Button 
                variant="outline"
                onClick={() => router.push("/auth/login")}
                className="w-full"
              >
                Back to Sign In
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
