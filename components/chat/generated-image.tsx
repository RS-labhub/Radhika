"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Download, Copy, RotateCcw, Check } from "lucide-react"

interface GeneratedImageProps {
  src: string
  alt: string
  onRetry?: () => void
  isPixel?: boolean
}

export function GeneratedImage({ src, alt, onRetry, isPixel }: GeneratedImageProps) {
  const [copied, setCopied] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)

  const handleCopy = async () => {
    try {
      // Try to copy image as PNG to avoid JPEG clipboard issues
      const response = await fetch(src)
      const blob = await response.blob()
      
      // Convert to PNG if it's JPEG
      if (blob.type === 'image/jpeg' || blob.type === 'image/jpg') {
        // Create an image element and canvas to convert
        const img = new Image()
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        
        await new Promise((resolve, reject) => {
          img.onload = resolve
          img.onerror = reject
          img.src = URL.createObjectURL(blob)
        })
        
        canvas.width = img.width
        canvas.height = img.height
        ctx?.drawImage(img, 0, 0)
        
        // Convert canvas to PNG blob
        const pngBlob = await new Promise<Blob>((resolve) => {
          canvas.toBlob((b) => resolve(b!), 'image/png')
        })
        
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': pngBlob })
        ])
      } else {
        await navigator.clipboard.write([
          new ClipboardItem({ [blob.type]: blob })
        ])
      }
      
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy image:', error)
      // Fallback: copy URL
      try {
        await navigator.clipboard.writeText(src)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch (fallbackError) {
        console.error('Failed to copy URL:', fallbackError)
      }
    }
  }

  const handleDownload = async () => {
    setIsDownloading(true)
    try {
      const response = await fetch(src)
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `radhika-generated-${Date.now()}.png`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to download image:', error)
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <span className="relative group my-3 inline-block">
      <span
        className={cn(
          "relative overflow-hidden inline-block",
          isPixel
            ? "pixel-border border-2 border-slate-500/80 dark:border-slate-600"
            : "rounded-2xl border border-white/40 dark:border-white/10 shadow-lg"
        )}
      >
        <img
          src={src}
          alt={alt}
          className="w-full h-auto"
          loading="lazy"
        />
        
        {/* Action buttons overlay */}
        <span
          className={cn(
            "absolute top-2 right-2 flex gap-2 transition-all duration-200",
            "opacity-0 group-hover:opacity-100 translate-y-[-4px] group-hover:translate-y-0"
          )}
        >
          {onRetry && (
            <Button
              type="button"
              size="icon"
              onClick={onRetry}
              className={cn(
                "h-8 w-8 shadow-lg backdrop-blur-sm",
                isPixel
                  ? "pixel-border border-cyan-400 bg-cyan-500 text-white hover:bg-cyan-600"
                  : "rounded-xl bg-white/90 text-slate-700 hover:bg-white dark:bg-slate-900/90 dark:text-slate-100 dark:hover:bg-slate-800"
              )}
              title="Retry generation"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          )}
          
          <Button
            type="button"
            size="icon"
            onClick={handleCopy}
            className={cn(
              "h-8 w-8 shadow-lg backdrop-blur-sm",
              isPixel
                ? "pixel-border border-emerald-400 bg-emerald-500 text-white hover:bg-emerald-600"
                : "rounded-xl bg-white/90 text-slate-700 hover:bg-white dark:bg-slate-900/90 dark:text-slate-100 dark:hover:bg-slate-800"
            )}
            title={copied ? "Copied!" : "Copy image"}
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
          
          <Button
            type="button"
            size="icon"
            onClick={handleDownload}
            disabled={isDownloading}
            className={cn(
              "h-8 w-8 shadow-lg backdrop-blur-sm",
              isPixel
                ? "pixel-border border-violet-400 bg-violet-500 text-white hover:bg-violet-600"
                : "rounded-xl bg-white/90 text-slate-700 hover:bg-white dark:bg-slate-900/90 dark:text-slate-100 dark:hover:bg-slate-800"
            )}
            title="Download image"
          >
            <Download className="h-4 w-4" />
          </Button>
        </span>
      </span>
    </span>
  )
}
