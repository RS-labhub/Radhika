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
  const margin = 20
  const maxWidth = pageWidth - margin * 2
  
  let yPosition = margin

  // Add title if provided
  if (options?.title) {
    doc.setFontSize(16)
    doc.setFont("helvetica", "bold")
    doc.text(options.title, margin, yPosition)
    yPosition += 15
  }

  // Add content
  doc.setFontSize(11)
  doc.setFont("helvetica", "normal")
  
  const lines = doc.splitTextToSize(content, maxWidth)
  
  for (const line of lines) {
    if (yPosition > doc.internal.pageSize.getHeight() - margin) {
      doc.addPage()
      yPosition = margin
    }
    doc.text(line, margin, yPosition)
    yPosition += 6
  }

  // Add timestamp
  doc.setFontSize(9)
  doc.setTextColor(128)
  doc.text(
    `Exported from Radhika on ${new Date().toLocaleString()}`,
    margin,
    doc.internal.pageSize.getHeight() - 10
  )

  doc.save(`radhika-message-${Date.now()}.pdf`)
}

// Export full chat as PDF
export async function exportChatAsPdf(
  messages: ChatMessage[],
  options?: ExportOptions
): Promise<void> {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 20
  const maxWidth = pageWidth - margin * 2
  
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
    if (yPosition > doc.internal.pageSize.getHeight() - 40) {
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

    // Message content
    doc.setFontSize(11)
    doc.setFont("helvetica", "normal")
    const lines = doc.splitTextToSize(message.content, maxWidth)
    
    for (const line of lines) {
      if (yPosition > doc.internal.pageSize.getHeight() - margin) {
        doc.addPage()
        yPosition = margin
      }
      doc.text(line, margin, yPosition)
      yPosition += 6
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
  </style>
</head>
<body>
  <h1>${options?.title || "Chat Export"}</h1>
  <p class="meta">Exported from Radhika on ${new Date().toLocaleString()}</p>
`

  for (const message of messages) {
    const roleLabel = message.role === "user" ? "You" : "Radhika"
    const roleClass = message.role === "user" ? "user" : "assistant"
    
    htmlContent += `
  <div class="message ${roleClass}">
    <div class="role">${roleLabel}`
    
    if (options?.includeTimestamps && message.created_at) {
      htmlContent += `<span class="timestamp">${new Date(message.created_at).toLocaleString()}</span>`
    }
    
    htmlContent += `</div>
    <div class="content">${escapeHtml(message.content)}</div>
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
