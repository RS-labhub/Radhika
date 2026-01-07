"use client"

import { jsPDF } from "jspdf"
import { saveAs } from "file-saver"
import type { ChatMessage } from "@/types/database"

interface ExportOptions {
  title?: string
  includeTimestamps?: boolean
  includeMetadata?: boolean
}

// Export a single message as PDF
export async function exportMessageAsPdf(
  content: string,
  options?: ExportOptions
): Promise<void> {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 20
  const maxWidth = pageWidth - margin * 2
  const maxImageWidth = maxWidth // Full width for better image visibility
  
  let yPosition = margin

  // Add title if provided
  if (options?.title) {
    doc.setFontSize(16)
    doc.setFont("helvetica", "bold")
    doc.text(options.title, margin, yPosition)
    yPosition += 15
  }

  // Extract images from content
  const images = extractImagesFromMarkdown(content)
  
  // Parse markdown segments
  const markdownSegments = parseMarkdownSegments(content)

  // Render markdown text
  if (markdownSegments.length > 0) {
    yPosition = renderMarkdownSegments(
      doc,
      markdownSegments,
      yPosition,
      margin,
      maxWidth,
      pageHeight
    )
  }

  // Add images
  for (const image of images) {
    try {
      const base64Image = await loadImageAsBase64(image.url)
      
      if (base64Image) {
        const imgData = await new Promise<{ width: number; height: number }>((resolve) => {
          const img = new Image()
          img.onload = () => resolve({ width: img.width, height: img.height })
          img.onerror = () => resolve({ width: 800, height: 600 })
          img.src = base64Image
        })

        let imgWidth = imgData.width
        let imgHeight = imgData.height
        const aspectRatio = imgWidth / imgHeight

        // Target a larger display width in PDF points
        const targetPdfWidth = maxWidth // Use 100% of page width
        
        // Calculate height based on aspect ratio
        let pdfWidth = targetPdfWidth
        let pdfHeight = pdfWidth / aspectRatio
        
        // If height is too large, scale down
        const maxPdfHeight = pageHeight - margin * 3
        if (pdfHeight > maxPdfHeight) {
          pdfHeight = maxPdfHeight
          pdfWidth = pdfHeight * aspectRatio
        }

        if (yPosition + pdfHeight > pageHeight - margin) {
          doc.addPage()
          yPosition = margin
        }

        doc.addImage(base64Image, "JPEG", margin, yPosition, pdfWidth, pdfHeight)
        yPosition += pdfHeight + 5

        if (image.alt) {
          doc.setFontSize(9)
          doc.setTextColor(100)
          const altLines = doc.splitTextToSize(`Image: ${image.alt}`, maxWidth)
          for (const altLine of altLines) {
            if (yPosition > pageHeight - margin) {
              doc.addPage()
              yPosition = margin
            }
            doc.text(altLine, margin, yPosition)
            yPosition += 5
          }
          doc.setTextColor(0)
          doc.setFontSize(11)
        }
      }
    } catch (error) {
      console.error("Failed to add image to PDF:", error)
    }
  }

  // Add timestamp
  doc.setFontSize(9)
  doc.setTextColor(128)
  doc.text(
    `Exported from Radhika on ${new Date().toLocaleString()}`,
    margin,
    pageHeight - 10
  )

  doc.save(`radhika-message-${Date.now()}.pdf`)
}

// Helper function to clean emojis from text for PDF rendering
function cleanTextForPdf(text: string): string {
  return text
    .replace(/[\u{1F600}-\u{1F64F}]/gu, '') // Emoticons
    .replace(/[\u{1F300}-\u{1F5FF}]/gu, '') // Misc Symbols and Pictographs
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, '') // Transport and Map
    .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '') // Flags
    .replace(/[\u{2600}-\u{26FF}]/gu, '')   // Misc symbols
    .replace(/[\u{2700}-\u{27BF}]/gu, '')   // Dingbats
    .replace(/[\u{1F900}-\u{1F9FF}]/gu, '') // Supplemental Symbols and Pictographs
    .replace(/[\u{1FA70}-\u{1FAFF}]/gu, '') // Symbols and Pictographs Extended-A
}

// Helper to process markdown text segments
interface MarkdownSegment {
  type: 'text' | 'code' | 'heading' | 'list'
  content: string
  level?: number
  language?: string
}

function parseMarkdownSegments(content: string): MarkdownSegment[] {
  const segments: MarkdownSegment[] = []
  
  // Remove images first (handled separately)
  let textContent = removeMarkdownImages(content)
  textContent = cleanTextForPdf(textContent)
  
  // Split by code blocks
  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g
  let lastIndex = 0
  let match
  
  while ((match = codeBlockRegex.exec(textContent)) !== null) {
    // Add text before code block
    if (match.index > lastIndex) {
      const beforeText = textContent.slice(lastIndex, match.index)
      segments.push(...parseTextSegments(beforeText))
    }
    // Add code block
    segments.push({ 
      type: 'code', 
      content: match[2].trim(), 
      language: match[1] || undefined 
    })
    lastIndex = match.index + match[0].length
  }
  
  // Add remaining text
  if (lastIndex < textContent.length) {
    const remainingText = textContent.slice(lastIndex)
    segments.push(...parseTextSegments(remainingText))
  }
  
  return segments
}

function parseTextSegments(text: string): MarkdownSegment[] {
  const segments: MarkdownSegment[] = []
  const paragraphs = text.split(/\n\n+/)
  
  for (const para of paragraphs) {
    if (!para.trim()) continue
    
    // Check for headings
    const headingMatch = para.match(/^(#{1,3})\s+(.+)/)
    if (headingMatch) {
      segments.push({
        type: 'heading',
        content: headingMatch[2],
        level: headingMatch[1].length
      })
      continue
    }
    
    // Check for list items
    const lines = para.split('\n').filter(l => l.trim())
    const isList = lines.every(l => /^[\*\-\+]\s/.test(l.trim()))
    
    if (isList && lines.length > 0) {
      const listItems = lines.map(l => l.replace(/^[\*\-\+]\s+/, '').trim())
      segments.push({
        type: 'list',
        content: listItems.join('\n')
      })
      continue
    }
    
    // Regular text
    segments.push({
      type: 'text',
      content: para
    })
  }
  
  return segments
}

// Helper to render markdown segments to PDF
function renderMarkdownSegments(
  doc: jsPDF,
  segments: MarkdownSegment[],
  yPosition: number,
  margin: number,
  maxWidth: number,
  pageHeight: number
): number {
  let y = yPosition
  
  const checkPageBreak = (neededSpace: number) => {
    if (y + neededSpace > pageHeight - margin) {
      doc.addPage()
      y = margin
    }
  }
  
  for (const segment of segments) {
    if (segment.type === 'code') {
      // Code block styling
      checkPageBreak(20)
      y += 4
      
      // Code block header
      if (segment.language) {
        doc.setFontSize(8)
        doc.setTextColor(100)
        doc.text(segment.language.toUpperCase(), margin, y)
        y += 4
      }
      
      // Code content
      doc.setFontSize(9)
      doc.setFont("courier", "normal")
      doc.setTextColor(40)
      
      const codeLines = segment.content.split('\n')
      const lineHeight = 4
      const blockHeight = codeLines.length * lineHeight + 8
      
      checkPageBreak(blockHeight)
      doc.setFillColor(245, 245, 245)
      doc.rect(margin - 2, y - 2, maxWidth + 4, blockHeight, 'F')
      
      y += 4
      for (const line of codeLines) {
        checkPageBreak(lineHeight)
        const wrappedLines = doc.splitTextToSize(line || ' ', maxWidth - 4)
        for (const wLine of wrappedLines) {
          doc.text(wLine, margin + 2, y)
          y += lineHeight
        }
      }
      y += 6
      
      // Reset font
      doc.setFont("helvetica", "normal")
      doc.setTextColor(0)
      doc.setFontSize(11)
      
    } else if (segment.type === 'heading') {
      checkPageBreak(12)
      const level = segment.level || 1
      doc.setFontSize(level === 1 ? 14 : level === 2 ? 12 : 11)
      doc.setFont("helvetica", "bold")
      
      const headingLines = doc.splitTextToSize(segment.content, maxWidth)
      for (const line of headingLines) {
        doc.text(line, margin, y)
        y += level === 1 ? 7 : 6
      }
      y += 3
      doc.setFont("helvetica", "normal")
      doc.setFontSize(11)
      
    } else if (segment.type === 'list') {
      doc.setFontSize(11)
      const items = segment.content.split('\n')
      for (const item of items) {
        checkPageBreak(7)
        // Render bullet point with formatting support
        doc.setFont("helvetica", "normal")
        doc.text('•', margin, y)
        
        // Render the item text with formatting (offset by bullet width)
        const bulletWidth = doc.getTextWidth('• ')
        const itemX = margin + bulletWidth
        const itemMaxWidth = maxWidth - bulletWidth
        
        // Check if item has formatting
        if (item.includes('**') || item.includes('`') || item.includes('*') || item.includes('_')) {
          const linesRendered = renderLineWithFormatting(doc, item, itemX, y, itemMaxWidth)
          y += linesRendered * 6
        } else {
          // Simple item without formatting
          const wrappedText = doc.splitTextToSize(item, itemMaxWidth)
          for (let i = 0; i < wrappedText.length; i++) {
            if (i > 0) {
              y += 5
              checkPageBreak(5)
            }
            doc.text(wrappedText[i], itemX, y)
          }
          y += 6
        }
      }
      y += 3
      doc.setFontSize(11)
      
    } else {
      // Regular text
      doc.setFontSize(11)
      doc.setFont("helvetica", "normal")
      
      const lines = segment.content.split('\n')
      for (const line of lines) {
        if (!line.trim()) {
          y += 3
          continue
        }
        checkPageBreak(6)
        
        // Process line for bold/italic and render with mixed fonts
        const linesRendered = renderLineWithFormatting(doc, line, margin, y, maxWidth)
        y += linesRendered * 6
      }
      y += 4
    }
  }
  
  return y
}

// Helper to render a line with mixed bold/italic formatting
// Returns the number of lines rendered
function renderLineWithFormatting(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number
): number {
  // Split text into parts based on formatting markers
  const parts: Array<{ text: string; bold?: boolean; italic?: boolean; code?: boolean }> = []
  
  let currentText = text
  let position = 0
  
  // Regex patterns for different formatting
  const patterns = [
    { regex: /\*\*`([^`]+)`\*\*/, type: 'boldcode' },  // **`code`**
    { regex: /\*\*([^*]+?)\*\*/, type: 'bold' },       // **bold**
    { regex: /\*([^*]+?)\*/, type: 'italic' },         // *italic*
    { regex: /_([^_]+?)_/, type: 'italic' },           // _italic_
    { regex: /`([^`]+)`/, type: 'code' },              // `code`
  ]
  
  while (position < currentText.length) {
    let found = false
    let earliestMatch: { index: number; length: number; text: string; type: string } | null = null
    
    // Find the earliest match
    for (const pattern of patterns) {
      const match = currentText.slice(position).match(pattern.regex)
      if (match && match.index !== undefined) {
        const absoluteIndex = position + match.index
        if (!earliestMatch || absoluteIndex < earliestMatch.index) {
          earliestMatch = {
            index: absoluteIndex,
            length: match[0].length,
            text: match[1],
            type: pattern.type
          }
        }
      }
    }
    
    if (earliestMatch) {
      // Add text before the match
      if (earliestMatch.index > position) {
        const beforeText = currentText.slice(position, earliestMatch.index)
        if (beforeText.trim()) {
          parts.push({ text: beforeText })
        }
      }
      
      // Add the formatted text
      if (earliestMatch.type === 'bold') {
        parts.push({ text: earliestMatch.text, bold: true })
      } else if (earliestMatch.type === 'italic') {
        parts.push({ text: earliestMatch.text, italic: true })
      } else if (earliestMatch.type === 'code') {
        parts.push({ text: `"${earliestMatch.text}"`, code: true })
      } else if (earliestMatch.type === 'boldcode') {
        parts.push({ text: `"${earliestMatch.text}"`, bold: true, code: true })
      }
      
      position = earliestMatch.index + earliestMatch.length
      found = true
    } else {
      // No more matches, add remaining text
      const remainingText = currentText.slice(position)
      if (remainingText.trim()) {
        parts.push({ text: remainingText })
      }
      break
    }
  }
  
  // If no special formatting found, just render the line normally
  if (parts.length === 0) {
    const wrappedLines = doc.splitTextToSize(text, maxWidth)
    for (let i = 0; i < wrappedLines.length; i++) {
      doc.text(wrappedLines[i] || '', x, y + (i * 6))
    }
    return wrappedLines.length
  }
  
  // Render parts with formatting - handle wrapping
  let currentX = x
  let currentLineY = y
  let linesRendered = 1
  const spaceWidth = doc.getTextWidth(' ')
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    
    // Set font style
    if (part.bold && part.italic) {
      doc.setFont("helvetica", "bolditalic")
    } else if (part.bold) {
      doc.setFont("helvetica", "bold")
    } else if (part.italic) {
      doc.setFont("helvetica", "italic")
    } else {
      doc.setFont("helvetica", "normal")
    }
    
    // Split long parts into words for better wrapping
    const words = part.text.split(' ')
    
    for (let w = 0; w < words.length; w++) {
      const word = words[w]
      const wordWidth = doc.getTextWidth(word)
      const needsSpace = w < words.length - 1 || i < parts.length - 1
      
      // Check if we need to wrap to next line
      if (currentX + wordWidth > x + maxWidth && currentX > x) {
        // Move to next line
        currentLineY += 6
        currentX = x
        linesRendered++
      }
      
      // Render the word
      doc.text(word, currentX, currentLineY)
      currentX += wordWidth
      
      // Add space if needed
      if (needsSpace && currentX + spaceWidth <= x + maxWidth) {
        currentX += spaceWidth
      }
    }
  }
  
  // Reset to normal font
  doc.setFont("helvetica", "normal")
  
  return linesRendered
}

// Helper function to extract images from markdown
function extractImagesFromMarkdown(content: string): Array<{ url: string; alt: string; index: number }> {
  const imageRegex = /!\[(.*?)\]\((.*?)\)/g
  const images: Array<{ url: string; alt: string; index: number }> = []
  let match

  while ((match = imageRegex.exec(content)) !== null) {
    images.push({
      alt: match[1],
      url: match[2],
      index: match.index
    })
  }

  return images
}

// Helper function to load image as base64
async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    // Try to load the image through a proxy or directly
    let imageUrl = url
    
    // If it's a relative URL, make it absolute
    if (url.startsWith('/')) {
      imageUrl = window.location.origin + url
    }
    
    // Try using a CORS proxy for external images if direct fetch fails
    const response = await fetch(imageUrl, { 
      mode: 'cors',
      credentials: 'omit'
    }).catch(async (error) => {
      console.warn("Direct fetch failed, trying alternative method:", error)
      // Try loading via proxy API
      try {
        const proxyResponse = await fetch(`/api/proxy-image?url=${encodeURIComponent(imageUrl)}`)
        if (proxyResponse.ok) {
          return proxyResponse
        }
      } catch (proxyError) {
        console.error("Proxy fetch also failed:", proxyError)
      }
      throw error
    })
    
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`)
    }
    
    const blob = await response.blob()
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        const result = reader.result as string
        resolve(result)
      }
      reader.onerror = (error) => {
        console.error("FileReader error:", error)
        reject(error)
      }
      reader.readAsDataURL(blob)
    })
  } catch (error) {
    console.error("Failed to load image:", url, error)
    return null
  }
}

// Helper function to remove markdown image syntax from text
function removeMarkdownImages(content: string): string {
  return content.replace(/!\[(.*?)\]\((.*?)\)/g, "")
}

// Export full chat as PDF
export async function exportChatAsPdf(
  messages: ChatMessage[],
  options?: ExportOptions
): Promise<void> {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 20
  const maxWidth = pageWidth - margin * 2
  const maxImageWidth = maxWidth // Images take up full available width for better visibility
  
  let yPosition = margin

  // Add title
  doc.setFontSize(18)
  doc.setFont("helvetica", "bold")
  doc.text(options?.title || "Chat Export", margin, yPosition)
  yPosition += 15

  // Add export date
  doc.setFontSize(10)
  doc.setFont("helvetica", "normal")
  doc.setTextColor(128)
  doc.text(`Exported on ${new Date().toLocaleString()}`, margin, yPosition)
  yPosition += 15
  doc.setTextColor(0)

  // Add messages
  for (const message of messages) {
    // Check if we need a new page
    if (yPosition > pageHeight - 40) {
      doc.addPage()
      yPosition = margin
    }

    // Role header
    doc.setFontSize(10)
    doc.setFont("helvetica", "bold")
    const roleLabel = message.role === "user" ? "You" : "Radhika"
    doc.text(roleLabel, margin, yPosition)
    
    // Timestamp if enabled
    if (options?.includeTimestamps && message.created_at) {
      doc.setFont("helvetica", "normal")
      doc.setTextColor(128)
      const timestamp = new Date(message.created_at).toLocaleString()
      doc.text(` • ${timestamp}`, margin + doc.getTextWidth(roleLabel) + 2, yPosition)
      doc.setTextColor(0)
    }
    yPosition += 8

    // Extract images from content
    const images = extractImagesFromMarkdown(message.content)
    
    // Parse markdown segments (text without images)
    const markdownSegments = parseMarkdownSegments(message.content)
    
    // Render markdown text
    if (markdownSegments.length > 0) {
      yPosition = renderMarkdownSegments(
        doc,
        markdownSegments,
        yPosition,
        margin,
        maxWidth,
        pageHeight
      )
    }

    // Add images
    for (const image of images) {
      try {
        const base64Image = await loadImageAsBase64(image.url)
        
        if (base64Image) {
          // Determine image dimensions
          const imgData = await new Promise<{ width: number; height: number }>((resolve) => {
            const img = new Image()
            img.onload = () => resolve({ width: img.width, height: img.height })
            img.onerror = () => resolve({ width: 800, height: 600 }) // Default size
            img.src = base64Image
          })

          // Calculate scaled dimensions - make images much larger
          let imgWidth = imgData.width
          let imgHeight = imgData.height
          const aspectRatio = imgWidth / imgHeight

          // Target a larger display width in PDF points (not pixels)
          const targetPdfWidth = maxWidth * 0.9 // Use 90% of page width
          
          // Calculate height based on aspect ratio
          let pdfWidth = targetPdfWidth
          let pdfHeight = pdfWidth / aspectRatio
          
          // If height is too large, scale down
          const maxPdfHeight = pageHeight - margin * 3
          if (pdfHeight > maxPdfHeight) {
            pdfHeight = maxPdfHeight
            pdfWidth = pdfHeight * aspectRatio
          }

          // Check if image fits on current page
          if (yPosition + pdfHeight > pageHeight - margin) {
            doc.addPage()
            yPosition = margin
          }

          // Add image to PDF
          doc.addImage(base64Image, "JPEG", margin, yPosition, pdfWidth, pdfHeight)
          yPosition += pdfHeight + 5

          // Add alt text below image if available
          if (image.alt) {
            doc.setFontSize(9)
            doc.setTextColor(100)
            const altLines = doc.splitTextToSize(`Image: ${image.alt}`, maxWidth)
            for (const altLine of altLines) {
              if (yPosition > pageHeight - margin) {
                doc.addPage()
                yPosition = margin
              }
              doc.text(altLine, margin, yPosition)
              yPosition += 5
            }
            doc.setTextColor(0)
            doc.setFontSize(11)
          }

          yPosition += 5 // Extra space after image
        }
      } catch (error) {
        console.error("Failed to add image to PDF:", error)
        // Fallback: show image URL
        doc.setFontSize(9)
        doc.setTextColor(100)
        doc.text(`[Image: ${image.url}]`, margin, yPosition)
        doc.setTextColor(0)
        doc.setFontSize(11)
        yPosition += 6
      }
    }
    
    yPosition += 10 // Space between messages
  }

  doc.save(`radhika-chat-${Date.now()}.pdf`)
}

// Export chat as plain text
export function exportChatAsText(
  messages: ChatMessage[],
  options?: ExportOptions
): void {
  let content = ""
  
  if (options?.title) {
    content += `${options.title}\n`
    content += "=".repeat(options.title.length) + "\n\n"
  }

  content += `Exported on ${new Date().toLocaleString()}\n\n`
  content += "-".repeat(50) + "\n\n"

  for (const message of messages) {
    const roleLabel = message.role === "user" ? "You" : "Radhika"
    content += `[${roleLabel}]`
    
    if (options?.includeTimestamps && message.created_at) {
      content += ` (${new Date(message.created_at).toLocaleString()})`
    }
    
    content += `\n${message.content}\n\n`
  }

  const blob = new Blob([content], { type: "text/plain;charset=utf-8" })
  saveAs(blob, `radhika-chat-${Date.now()}.txt`)
}

// Export chat as Word document (simplified - creates HTML that can be opened in Word)
export function exportChatAsWord(
  messages: ChatMessage[],
  options?: ExportOptions
): void {
  let htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${options?.title || "Chat Export"}</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    h1 { color: #0891b2; }
    .meta { color: #666; font-size: 12px; margin-bottom: 20px; }
    .message { margin-bottom: 20px; padding: 15px; border-radius: 8px; }
    .user { background: #f0f9ff; border-left: 4px solid #0891b2; }
    .assistant { background: #f8fafc; border-left: 4px solid #64748b; }
    .role { font-weight: bold; margin-bottom: 8px; }
    .timestamp { color: #666; font-size: 11px; margin-left: 10px; }
    .content { white-space: pre-wrap; line-height: 1.6; }
    .content img { max-width: 100%; height: auto; margin: 10px 0; border-radius: 8px; }
    .image-caption { color: #666; font-size: 11px; font-style: italic; margin-top: 5px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(options?.title || "Chat Export")}</h1>
  <p class="meta">Exported from Radhika on ${new Date().toLocaleString()}</p>
`

  for (const message of messages) {
    const roleLabel = message.role === "user" ? "You" : "Radhika"
    const roleClass = message.role === "user" ? "user" : "assistant"
    
    // Process content to convert markdown images to HTML
    let processedContent = message.content.replace(
      /!\[(.*?)\]\((.*?)\)/g, 
      (match, alt, url) => {
        const escapedUrl = escapeHtml(url)
        const escapedAlt = escapeHtml(alt)
        return `<img src="${escapedUrl}" alt="${escapedAlt}" />${alt ? `<div class="image-caption">${escapedAlt}</div>` : ''}`
      }
    )
    
    // Escape other HTML in the content (but not our img tags)
    const parts = processedContent.split(/(<img[^>]*>(?:<div[^>]*>.*?<\/div>)?)/)
    processedContent = parts.map((part, index) => {
      // Keep img tags and captions as-is (odd indices after split)
      if (part.startsWith('<img')) {
        return part
      }
      // Escape text content
      return escapeHtml(part)
    }).join('')
    
    htmlContent += `
  <div class="message ${roleClass}">
    <div class="role">${roleLabel}`
    
    if (options?.includeTimestamps && message.created_at) {
      htmlContent += `<span class="timestamp">${new Date(message.created_at).toLocaleString()}</span>`
    }
    
    htmlContent += `</div>
    <div class="content">${processedContent}</div>
  </div>`
  }

  htmlContent += `
</body>
</html>`

  const blob = new Blob([htmlContent], { type: "application/msword;charset=utf-8" })
  saveAs(blob, `radhika-chat-${Date.now()}.doc`)
}

// Copy message to clipboard
export async function copyMessageToClipboard(content: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(content)
    return true
  } catch (error) {
    console.error("Failed to copy to clipboard:", error)
    return false
  }
}

// Helper function to escape HTML
function escapeHtml(text: string): string {
  const div = document.createElement("div")
  div.textContent = text
  return div.innerHTML
}

// Format message for sharing
export function formatMessageForSharing(
  content: string,
  role: "user" | "assistant",
  timestamp?: string
): string {
  const roleLabel = role === "user" ? "You" : "Radhika"
  let formatted = `[${roleLabel}]`
  
  if (timestamp) {
    formatted += ` (${new Date(timestamp).toLocaleString()})`
  }
  
  formatted += `\n${content}`
  
  return formatted
}
