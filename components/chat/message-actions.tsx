"use client"

import { useState } from "react"
import { Copy, Download, Star, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { chatService } from "@/lib/supabase/chat-service"
import { toast } from "sonner"
import jsPDF from "jspdf"

interface MessageActionsProps {
  messageId: string
  content: string
  isFavorite?: boolean
  onFavoriteChange?: (isFavorite: boolean) => void
}

export function MessageActions({ messageId, content, isFavorite = false, onFavoriteChange }: MessageActionsProps) {
  const [copied, setCopied] = useState(false)
  const [isTogglingFavorite, setIsTogglingFavorite] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      toast.success("Copied to clipboard")
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      toast.error("Failed to copy")
    }
  }

  const handleDownloadPDF = () => {
    try {
      const doc = new jsPDF()
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const margin = 15
      const maxWidth = pageWidth - (margin * 2)
      let yPos = 20
      
      // Helper to add new page if needed
      const checkPageBreak = (height: number) => {
        if (yPos + height > pageHeight - 20) {
          doc.addPage()
          yPos = 20
        }
      }
      
      // Helper to clean emojis
      const cleanText = (text: string) => text
        .replace(/[\u{1F600}-\u{1F64F}]/gu, '')
        .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')
        .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')
        .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '')
        .replace(/[\u{2600}-\u{26FF}]/gu, '')
        .replace(/[\u{2700}-\u{27BF}]/gu, '')
        .replace(/[\u{1F900}-\u{1F9FF}]/gu, '')
        .replace(/[\u{1FA70}-\u{1FAFF}]/gu, '')
      
      // Title
      doc.setFontSize(16)
      doc.setFont("helvetica", "bold")
      doc.text("AI Response", margin, yPos)
      yPos += 8
      
      // Date
      doc.setFontSize(10)
      doc.setFont("helvetica", "normal")
      doc.setTextColor(100)
      doc.text(new Date().toLocaleString(), margin, yPos)
      yPos += 12
      
      doc.setTextColor(0)
      
      // Process content - handle markdown-like syntax
      const processedContent = cleanText(content)
      
      // Split by code blocks first
      const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g
      let lastIndex = 0
      let match
      const segments: { type: 'text' | 'code', content: string, lang?: string }[] = []
      
      while ((match = codeBlockRegex.exec(processedContent)) !== null) {
        // Add text before code block
        if (match.index > lastIndex) {
          segments.push({ type: 'text', content: processedContent.slice(lastIndex, match.index) })
        }
        // Add code block
        segments.push({ type: 'code', content: match[2].trim(), lang: match[1] })
        lastIndex = match.index + match[0].length
      }
      // Add remaining text
      if (lastIndex < processedContent.length) {
        segments.push({ type: 'text', content: processedContent.slice(lastIndex) })
      }
      
      // Render segments
      for (const segment of segments) {
        if (segment.type === 'code') {
          // Code block styling
          checkPageBreak(20)
          yPos += 4
          
          // Code block header
          if (segment.lang) {
            doc.setFontSize(8)
            doc.setTextColor(100)
            doc.text(segment.lang.toUpperCase(), margin, yPos)
            yPos += 4
          }
          
          // Code content with monospace feel
          doc.setFontSize(9)
          doc.setFont("courier", "normal")
          doc.setTextColor(40)
          
          // Background for code
          const codeLines = segment.content.split('\n')
          const lineHeight = 4
          const blockHeight = codeLines.length * lineHeight + 8
          
          checkPageBreak(blockHeight)
          doc.setFillColor(245, 245, 245)
          doc.rect(margin - 2, yPos - 2, maxWidth + 4, blockHeight, 'F')
          
          yPos += 4
          for (const line of codeLines) {
            checkPageBreak(lineHeight)
            const wrappedLines = doc.splitTextToSize(line || ' ', maxWidth - 4)
            for (const wLine of wrappedLines) {
              doc.text(wLine, margin + 2, yPos)
              yPos += lineHeight
            }
          }
          yPos += 6
          
          // Reset font
          doc.setFont("helvetica", "normal")
          doc.setTextColor(0)
        } else {
          // Regular text - process paragraphs and headings
          const textContent = segment.content
          
          // Split by paragraphs (double newline)
          const paragraphs = textContent.split(/\n\n+/)
          
          for (const para of paragraphs) {
            if (!para.trim()) continue
            
            // Check for headings
            const headingMatch = para.match(/^(#{1,3})\s+(.+)/)
            if (headingMatch) {
              checkPageBreak(12)
              const level = headingMatch[1].length
              doc.setFontSize(level === 1 ? 14 : level === 2 ? 12 : 11)
              doc.setFont("helvetica", "bold")
              const headingLines = doc.splitTextToSize(headingMatch[2], maxWidth)
              for (const line of headingLines) {
                doc.text(line, margin, yPos)
                yPos += level === 1 ? 7 : 6
              }
              yPos += 3
              doc.setFont("helvetica", "normal")
              doc.setFontSize(10)
              continue
            }
            
            // Check for bullet points
            const bulletLines = para.split('\n').filter(l => l.trim())
            let isBulletList = bulletLines.every(l => /^[\*\-]\s/.test(l.trim()))
            
            if (isBulletList) {
              doc.setFontSize(10)
              for (const bulletLine of bulletLines) {
                checkPageBreak(6)
                const cleanBullet = bulletLine.replace(/^[\*\-]\s+/, '').trim()
                const bulletText = doc.splitTextToSize(`• ${cleanBullet}`, maxWidth - 8)
                for (let i = 0; i < bulletText.length; i++) {
                  doc.text(bulletText[i], margin + (i === 0 ? 0 : 6), yPos)
                  yPos += 5
                }
              }
              yPos += 4
              continue
            }
            
            // Regular paragraph - preserve line breaks within
            doc.setFontSize(10)
            const singleLines = para.split('\n')
            for (const singleLine of singleLines) {
              if (!singleLine.trim()) {
                yPos += 3
                continue
              }
              // Handle inline code and links
              let processedLine = singleLine
                .replace(/`([^`]+)`/g, '"$1"') // Inline code to quotes
                .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)') // Links
                .replace(/\*\*([^*]+)\*\*/g, '$1') // Bold (can't style in jsPDF easily)
                .replace(/\*([^*]+)\*/g, '$1') // Italic
              
              checkPageBreak(6)
              const wrappedLines = doc.splitTextToSize(processedLine.trim(), maxWidth)
              for (const wLine of wrappedLines) {
                doc.text(wLine, margin, yPos)
                yPos += 5
              }
            }
            yPos += 4
          }
        }
      }
      
      // Save
      doc.save(`ai-response-${Date.now()}.pdf`)
      toast.success("Downloaded as PDF")
    } catch (err) {
      console.error("PDF generation error:", err)
      toast.error("Failed to download PDF")
    }
  }

  const handleToggleFavorite = async () => {
    try {
      setIsTogglingFavorite(true)
      if (isFavorite) {
        await chatService.removeFromFavorites(messageId)
        toast.success("Removed from favorites")
        onFavoriteChange?.(false)
      } else {
        await chatService.addToFavorites(messageId)
        toast.success("Added to favorites")
        onFavoriteChange?.(true)
      }
    } catch (err) {
      toast.error("Failed to update favorite")
    } finally {
      setIsTogglingFavorite(false)
    }
  }

  return (
    <div className="flex items-center gap-0.5">
      <TooltipProvider delayDuration={300}>
        {/* Copy */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCopy}
              className="h-7 w-7 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Copy text</p>
          </TooltipContent>
        </Tooltip>

        {/* Download PDF */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDownloadPDF}
              className="h-7 w-7 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Download as PDF</p>
          </TooltipContent>
        </Tooltip>

        {/* Favorite */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleToggleFavorite}
              disabled={isTogglingFavorite}
              className="h-7 w-7 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <Star className={`h-3.5 w-3.5 ${isFavorite ? "fill-yellow-500 text-yellow-500" : ""}`} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{isFavorite ? "Remove from favorites" : "Add to favorites"}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  )
}
