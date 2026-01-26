import { NextRequest, NextResponse } from "next/server"
import { getAccount } from "@/lib/appwrite/client"

/**
 * POST /api/auth/confirm
 * Confirms email verification using userId and secret from the verification link
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, secret } = body

    if (!userId || !secret) {
      return NextResponse.json(
        { error: "Missing userId or secret" },
        { status: 400 }
      )
    }

    // Get the account service
    const account = getAccount()

    // Update verification status using the provided userId and secret
    await account.updateVerification(userId, secret)

    return NextResponse.json(
      { success: true, message: "Email verified successfully" },
      { status: 200 }
    )
  } catch (error: any) {
    console.error("[API] Email verification error:", error)
    
    // Handle specific Appwrite errors
    if (error.code === 401) {
      return NextResponse.json(
        { error: "Invalid or expired verification link" },
        { status: 401 }
      )
    }

    if (error.code === 404) {
      return NextResponse.json(
        { error: "Verification link not found" },
        { status: 404 }
      )
    }

    return NextResponse.json(
      { error: error.message || "Failed to verify email" },
      { status: 500 }
    )
  }
}
