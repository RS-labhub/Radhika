"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { FileText, FileIcon, FileType, Loader2 } from "lucide-react"
import { 
  exportChatAsPdf, 
  exportChatAsText, 
  exportChatAsWord 
} from "@/lib/services/exports"
import type { ChatMessage } from "@/types/database"

type ExportFormat = "pdf" | "txt" | "doc"

interface ExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  messages: ChatMessage[]
  chatTitle?: string
}

export function ExportDialog({
  open,
  onOpenChange,
  messages,
  chatTitle,
}: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>("pdf")
  const [title, setTitle] = useState(chatTitle || "Chat Export")
  const [includeTimestamps, setIncludeTimestamps] = useState(true)
  const [isExporting, setIsExporting] = useState(false)

  const handleExport = async () => {
    setIsExporting(true)
    
    try {
      const options = {
        title,
        includeTimestamps,
      }

      switch (format) {
        case "pdf":
          await exportChatAsPdf(messages, options)
          break
        case "txt":
          exportChatAsText(messages, options)
          break
        case "doc":
          exportChatAsWord(messages, options)
          break
      }
      
      onOpenChange(false)
    } catch (error) {
      console.error("Export failed:", error)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export Chat</DialogTitle>
          <DialogDescription>
            Choose your export format and preferences
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-6 py-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Document Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter a title for your export"
            />
          </div>

          {/* Format Selection */}
          <div className="space-y-3">
            <Label>Export Format</Label>
            <RadioGroup
              value={format}
              onValueChange={(value) => setFormat(value as ExportFormat)}
              className="grid grid-cols-3 gap-3"
            >
              <div>
                <RadioGroupItem
                  value="pdf"
                  id="pdf"
                  className="peer sr-only"
                />
                <Label
                  htmlFor="pdf"
                  className="flex flex-col items-center justify-center rounded-lg border-2 border-slate-200 bg-white p-4 hover:bg-slate-50 peer-data-[state=checked]:border-cyan-500 peer-data-[state=checked]:bg-cyan-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:peer-data-[state=checked]:border-cyan-500 dark:peer-data-[state=checked]:bg-cyan-950 cursor-pointer transition-colors"
                >
                  <FileText className="h-6 w-6 mb-2 text-red-500" />
                  <span className="text-sm font-medium">PDF</span>
                </Label>
              </div>
              <div>
                <RadioGroupItem
                  value="txt"
                  id="txt"
                  className="peer sr-only"
                />
                <Label
                  htmlFor="txt"
                  className="flex flex-col items-center justify-center rounded-lg border-2 border-slate-200 bg-white p-4 hover:bg-slate-50 peer-data-[state=checked]:border-cyan-500 peer-data-[state=checked]:bg-cyan-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:peer-data-[state=checked]:border-cyan-500 dark:peer-data-[state=checked]:bg-cyan-950 cursor-pointer transition-colors"
                >
                  <FileIcon className="h-6 w-6 mb-2 text-slate-500" />
                  <span className="text-sm font-medium">Text</span>
                </Label>
              </div>
              <div>
                <RadioGroupItem
                  value="doc"
                  id="doc"
                  className="peer sr-only"
                />
                <Label
                  htmlFor="doc"
                  className="flex flex-col items-center justify-center rounded-lg border-2 border-slate-200 bg-white p-4 hover:bg-slate-50 peer-data-[state=checked]:border-cyan-500 peer-data-[state=checked]:bg-cyan-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:peer-data-[state=checked]:border-cyan-500 dark:peer-data-[state=checked]:bg-cyan-950 cursor-pointer transition-colors"
                >
                  <FileType className="h-6 w-6 mb-2 text-blue-500" />
                  <span className="text-sm font-medium">Word</span>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Options */}
          <div className="space-y-3">
            <Label>Options</Label>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="timestamps"
                checked={includeTimestamps}
                onCheckedChange={(checked) => setIncludeTimestamps(checked as boolean)}
              />
              <Label
                htmlFor="timestamps"
                className="text-sm font-normal cursor-pointer"
              >
                Include timestamps
              </Label>
            </div>
          </div>

          {/* Message count info */}
          <div className="text-sm text-slate-500 dark:text-slate-400">
            {messages.length} message{messages.length !== 1 ? "s" : ""} will be exported
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            disabled={isExporting}
            className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white"
          >
            {isExporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <FileText className="mr-2 h-4 w-4" />
                Export
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
