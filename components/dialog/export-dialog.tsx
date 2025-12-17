"use client"

import { useState } from "react"
import { Download, FileText, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"
import jsPDF from "jspdf"

interface Message {
  role: "user" | "assistant" | "system"
  content: string
  timestamp?: string
}

interface ExportDialogProps {
  messages: Message[]
  chatTitle?: string
  children?: React.ReactNode
}

export function ExportDialog({ messages, chatTitle = "Chat Conversation", children }: ExportDialogProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [format, setFormat] = useState<"pdf" | "txt">("pdf")
  const [includeTimestamps, setIncludeTimestamps] = useState(true)
  const [includeSystemMessages, setIncludeSystemMessages] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  const exportAsPDF = () => {
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const margin = 15
    const maxWidth = pageWidth - (margin * 2)
    let y = 20

    // Helper to remove emojis and special unicode
    const cleanText = (text: string) => {
      return text
        .replace(/[\u{1F600}-\u{1F64F}]/gu, '') // Emoticons
        .replace(/[\u{1F300}-\u{1F5FF}]/gu, '') // Misc Symbols and Pictographs
        .replace(/[\u{1F680}-\u{1F6FF}]/gu, '') // Transport and Map
        .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '') // Flags
        .replace(/[\u{2600}-\u{26FF}]/gu, '')   // Misc symbols
        .replace(/[\u{2700}-\u{27BF}]/gu, '')   // Dingbats
        .replace(/[\u{1F900}-\u{1F9FF}]/gu, '') // Supplemental Symbols and Pictographs
        .replace(/[\u{1FA70}-\u{1FAFF}]/gu, '') // Symbols and Pictographs Extended-A
        .replace(/\s+/g, ' ')                    // Clean up extra whitespace
        .trim()
    }

    // Helper to check if we need a new page
    const checkPageBreak = (neededSpace: number) => {
      if (y + neededSpace > pageHeight - margin) {
        doc.addPage()
        y = 20
      }
    }

    // Title
    doc.setFontSize(18)
    doc.setFont("helvetica", "bold")
    doc.text(cleanText(chatTitle), margin, y)
    y += 10

    // Date
    doc.setFontSize(10)
    doc.setFont("helvetica", "normal")
    doc.setTextColor(100)
    doc.text(new Date().toLocaleDateString(), margin, y)
    y += 15

    // Messages
    const filteredMessages = messages.filter(
      (msg) => includeSystemMessages || msg.role !== "system"
    )

    filteredMessages.forEach((msg, index) => {
      doc.setTextColor(0)

      // Role header
      checkPageBreak(25)
      doc.setFontSize(12)
      doc.setFont("helvetica", "bold")
      const roleLabel = msg.role === "user" ? "You" : msg.role === "assistant" ? "AI" : "System"
      const color = msg.role === "user" ? [14, 165, 233] : msg.role === "assistant" ? [139, 92, 246] : [100, 100, 100]
      doc.setTextColor(color[0], color[1], color[2])
      doc.text(roleLabel, margin, y)

      // Timestamp
      if (includeTimestamps && msg.timestamp) {
        doc.setFontSize(9)
        doc.setTextColor(150)
        doc.text(new Date(msg.timestamp).toLocaleString(), margin + 25, y)
      }
      y += 7

      // Content - clean emojis
      doc.setFontSize(11)
      doc.setFont("helvetica", "normal")
      doc.setTextColor(0)
      const cleanedContent = cleanText(msg.content)
      const lines = doc.splitTextToSize(cleanedContent, maxWidth)
      
      lines.forEach((line: string) => {
        checkPageBreak(7)
        doc.text(line, margin, y)
        y += 6
      })

      // Space between messages
      y += 8
    })

    // Save
    const filename = `${chatTitle.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}.pdf`
    doc.save(filename)
  }

  const exportAsText = () => {
    const filteredMessages = messages.filter(
      (msg) => includeSystemMessages || msg.role !== "system"
    )

    let text = `${chatTitle}\n`
    text += `Exported: ${new Date().toLocaleDateString()}\n`
    text += "=".repeat(50) + "\n\n"

    filteredMessages.forEach((msg) => {
      const roleLabel = msg.role === "user" ? "YOU" : msg.role === "assistant" ? "AI" : "SYSTEM"
      text += `[${roleLabel}]`
      
      if (includeTimestamps && msg.timestamp) {
        text += ` - ${new Date(msg.timestamp).toLocaleString()}`
      }
      text += "\n"
      text += msg.content + "\n\n"
      text += "-".repeat(50) + "\n\n"
    })

    // Create and download
    const blob = new Blob([text], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${chatTitle.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleExport = async () => {
    setIsExporting(true)
    try {
      if (format === "pdf") {
        exportAsPDF()
      } else {
        exportAsText()
      }
      toast.success(`Exported as ${format.toUpperCase()}`)
      setIsOpen(false)
    } catch (err) {
      toast.error("Failed to export chat")
      console.error(err)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="h-4 w-4" />
            Export Chat
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Export Conversation</DialogTitle>
          <DialogDescription>
            Choose your export format and options.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          {/* Format selection */}
          <div className="space-y-3">
            <Label>Export Format</Label>
            <RadioGroup value={format} onValueChange={(v) => setFormat(v as "pdf" | "txt")}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="pdf" id="pdf" />
                <Label htmlFor="pdf" className="font-normal cursor-pointer flex items-center gap-2">
                  <FileText className="h-4 w-4 text-red-500" />
                  PDF Document
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="txt" id="txt" />
                <Label htmlFor="txt" className="font-normal cursor-pointer flex items-center gap-2">
                  <FileText className="h-4 w-4 text-slate-500" />
                  Plain Text
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Options */}
          <div className="space-y-3">
            <Label>Export Options</Label>
            
            <div className="flex items-center justify-between">
              <Label htmlFor="timestamps" className="font-normal cursor-pointer">
                Include timestamps
              </Label>
              <Switch
                id="timestamps"
                checked={includeTimestamps}
                onCheckedChange={setIncludeTimestamps}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="system" className="font-normal cursor-pointer">
                Include system messages
              </Label>
              <Switch
                id="system"
                checked={includeSystemMessages}
                onCheckedChange={setIncludeSystemMessages}
              />
            </div>
          </div>

          {/* Info */}
          <div className="text-sm text-slate-500 dark:text-slate-400">
            Exporting {messages.filter(m => includeSystemMessages || m.role !== "system").length} messages
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={isExporting || messages.length === 0}>
            {isExporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Export
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
