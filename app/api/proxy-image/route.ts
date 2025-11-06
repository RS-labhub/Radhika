import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const imageUrl = searchParams.get("url")

  if (!imageUrl) {
    return new NextResponse("Unable to create image: URL parameter is required", {
      status: 400,
      headers: { "Content-Type": "text/plain" },
    })
  }

  try {
    const response = await fetch(imageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    })

    if (!response.ok) {
      return new NextResponse("Unable to create image: Failed to fetch image from source", {
        status: response.status,
        headers: { "Content-Type": "text/plain" },
      })
    }

    const contentType = response.headers.get("content-type")
    if (!contentType || !contentType.startsWith("image/")) {
      return new NextResponse("Unable to create image: Source URL does not contain valid image data", {
        status: 400,
        headers: { "Content-Type": "text/plain" },
      })
    }

    const imageBuffer = await response.arrayBuffer()

    return new NextResponse(imageBuffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      },
    })
  } catch (error) {
    console.error("Proxy image error:", error)
    return new NextResponse("Unable to create image: Proxy service temporarily unavailable", {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    })
  }
}
