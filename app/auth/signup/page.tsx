"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, Mail, Lock, User, AlertCircle, ArrowLeft, Eye, EyeOff } from "lucide-react"

export default function SignupPage() {
  const [displayName, setDisplayName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const { signUp } = useAuth()
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError("Passwords do not match")
      return
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters")
      return
    }

    setIsLoading(true)

    try {
      const result = await signUp(email, password, displayName || undefined)
      const error = result?.error
      if (error) {
        setError(error.message)
      } else {
        // setSuccess(true)
        // Redirect to home page after successful signup
        router.push("/")
      }
    } catch (err) {
      setError("An unexpected error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  // if (success) {
  //   return (
  //     <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 p-4">
  //       <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.15),_transparent_55%),radial-gradient(circle_at_bottom,_rgba(139,92,246,0.12),_transparent_55%)]" />
        
  //       <Card className="w-full max-w-md shadow-xl border-white/60 dark:border-white/10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl">
  //         <CardHeader className="space-y-1 text-center">
  //           <div className="mx-auto w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center mb-4">
  //             <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
  //           </div>
  //           <CardTitle className="text-2xl font-bold text-slate-900 dark:text-slate-100">
  //             Check your email
  //           </CardTitle>
  //           <CardDescription className="text-slate-500 dark:text-slate-400">
  //             We&apos;ve sent a verification link to <strong>{email}</strong>. 
  //             Please check your inbox and click the link to verify your account.
  //           </CardDescription>
  //         </CardHeader>
  //         <CardFooter className="flex flex-col gap-4">
  //           <Button 
  //             onClick={() => router.push("/auth/login")}
  //             className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white"
  //           >
  //             Go to Sign In
  //           </Button>
  //         </CardFooter>
  //       </Card>
  //     </div>
  //   )
  // }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 p-4">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.15),_transparent_55%),radial-gradient(circle_at_bottom,_rgba(139,92,246,0.12),_transparent_55%)]" />
      
      <Card className="w-full max-w-md shadow-xl border-white/60 dark:border-white/10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl">
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2 mb-2">
            <Link href="/" className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </div>
          <CardTitle className="text-2xl font-bold bg-gradient-to-r from-cyan-600 to-blue-600 bg-clip-text text-transparent">
            Create an account
          </CardTitle>
          <CardDescription className="text-slate-500 dark:text-slate-400">
            Sign up to unlock all features
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive" className="bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-800">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="displayName" className="text-slate-700 dark:text-slate-300">Display Name (optional)</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  id="displayName"
                  type="text"
                  placeholder="Your name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="pl-10 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-slate-700 dark:text-slate-300">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-700 dark:text-slate-300">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-slate-700 dark:text-slate-300">Confirm Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-10 pr-10 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((s) => !s)}
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button 
              type="submit" 
              className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white shadow-lg shadow-cyan-500/25"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating account...
                </>
              ) : (
                "Create account"
              )}
            </Button>
            <p className="text-center text-sm text-slate-500 dark:text-slate-400">
              Already have an account?{" "}
              <Link href="/auth/login" className="text-cyan-600 hover:text-cyan-700 dark:text-cyan-400 font-medium">
                Sign in
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
