import { useState } from "react"
import { ExternalLink, ChevronDown, ChevronUp, Globe, FileText, Book } from "lucide-react"
import { cn } from "@/lib/utils"

export interface Source {
  title: string
  url: string
  type?: "documentation" | "wikipedia" | "article" | "other"
  snippet?: string
}

interface SourcesDisplayProps {
  sources: Source[]
  className?: string
}

export function SourcesDisplay({ sources, className }: SourcesDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  if (!sources || sources.length === 0) {
    return null
  }

  const getSourceIcon = (type?: string) => {
    switch (type) {
      case "documentation":
        return <FileText className="h-3.5 w-3.5" />
      case "wikipedia":
        return <Book className="h-3.5 w-3.5" />
      case "article":
        return <Globe className="h-3.5 w-3.5" />
      default:
        return <ExternalLink className="h-3.5 w-3.5" />
    }
  }

  return (
    <div className={cn("mt-3 border-t border-slate-200 pt-3 dark:border-slate-700", className)}>
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-2 text-left text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
      >
        <Globe className="h-4 w-4" />
        <span>Sources ({sources.length})</span>
        {isExpanded ? (
          <ChevronUp className="ml-auto h-4 w-4" />
        ) : (
          <ChevronDown className="ml-auto h-4 w-4" />
        )}
      </button>

      {isExpanded && (
        <div className="mt-2 space-y-2">
          {sources.map((source, index) => (
            <a
              key={index}
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:bg-slate-800"
            >
              <div className="mt-0.5 flex-shrink-0 text-slate-500 dark:text-slate-400">
                {getSourceIcon(source.type)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-slate-900 dark:text-slate-100">
                  {source.title}
                </div>
                {source.snippet && (
                  <div className="mt-1 line-clamp-2 text-slate-600 dark:text-slate-400">
                    {source.snippet}
                  </div>
                )}
                <div className="mt-1 truncate text-blue-600 dark:text-blue-400">
                  {source.url}
                </div>
              </div>
              <ExternalLink className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
