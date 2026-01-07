"use client"

import { useState, useEffect } from "react"
import { Key, Check, X, Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { toast } from "sonner"
import { Info } from "lucide-react"

interface Provider {
  id: string
  name: string
  description: string
  storageKey: string
}

const PROVIDERS: Provider[] = [
  {
    id: "openai",
    name: "OpenAI",
    description: "GPT models and DALL·E image generation",
    storageKey: "openai_api_key"
  },
  {
    id: "claude",
    name: "Anthropic Claude",
    description: "Claude 3 models",
    storageKey: "claude_api_key"
  },
  {
    id: "groq",
    name: "Groq",
    description: "Fast LLM inference",
    storageKey: "groq_api_key"
  },
  {
    id: "gemini",
    name: "Google Gemini",
    description: "Gemini models",
    storageKey: "gemini_api_key"
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    description: "Image generation models",
    storageKey: "huggingface_api_key"
  },
]

export function ProvidersTab() {
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({})
  const [editingProvider, setEditingProvider] = useState<string | null>(null)
  const [tempKey, setTempKey] = useState("")
  const [showKey, setShowKey] = useState(false)

  useEffect(() => {
    loadApiKeys()
  }, [])

  const loadApiKeys = () => {
    const keys: Record<string, string> = {}
    PROVIDERS.forEach(provider => {
      try {
        const key = localStorage.getItem(provider.storageKey) || ""
        keys[provider.id] = key
      } catch (e) {
        keys[provider.id] = ""
      }
    })
    setApiKeys(keys)
  }

  const handleSaveKey = (providerId: string, storageKey: string) => {
    try {
      if (tempKey.trim()) {
        localStorage.setItem(storageKey, tempKey.trim())
        setApiKeys(prev => ({ ...prev, [providerId]: tempKey.trim() }))
        toast.success(`${PROVIDERS.find(p => p.id === providerId)?.name} API key saved`)
      } else {
        localStorage.removeItem(storageKey)
        setApiKeys(prev => ({ ...prev, [providerId]: "" }))
        toast.success(`${PROVIDERS.find(p => p.id === providerId)?.name} API key removed`)
      }
      setEditingProvider(null)
      setTempKey("")
      setShowKey(false)
    } catch (e) {
      toast.error("Failed to save API key")
    }
  }

  const handleEdit = (providerId: string) => {
    setEditingProvider(providerId)
    setTempKey(apiKeys[providerId] || "")
    setShowKey(false)
  }

  const handleCancel = () => {
    setEditingProvider(null)
    setTempKey("")
    setShowKey(false)
  }

  return (
    <div className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs">
          <strong>Privacy:</strong> API keys are stored locally in your browser and never sent to our servers.
        </AlertDescription>
      </Alert>

      <div className="space-y-4">
        {PROVIDERS.map(provider => {
          const hasKey = Boolean(apiKeys[provider.id])
          const isEditing = editingProvider === provider.id

          return (
            <div
              key={provider.id}
              className="flex flex-col gap-3 p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700">
                    <Key className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium text-slate-900 dark:text-slate-100">
                        {provider.name}
                      </h4>
                      <Badge
                        variant={hasKey ? "default" : "secondary"}
                        className={`text-xs ${
                          hasKey
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                            : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                        }`}
                      >
                        {hasKey ? (
                          <>
                            <Check className="h-3 w-3 mr-1" />
                            Configured
                          </>
                        ) : (
                          <>
                            <X className="h-3 w-3 mr-1" />
                            Not configured
                          </>
                        )}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {provider.description}
                    </p>
                  </div>
                </div>

                {!isEditing && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleEdit(provider.id)}
                  >
                    {hasKey ? "Update" : "Add Key"}
                  </Button>
                )}
              </div>

              {isEditing && (
                <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-700">
                  <div className="space-y-2">
                    <Label htmlFor={`key-${provider.id}`}>API Key</Label>
                    <div className="flex gap-2">
                      <Input
                        id={`key-${provider.id}`}
                        type={showKey ? "text" : "password"}
                        value={tempKey}
                        onChange={(e) => setTempKey(e.target.value)}
                        placeholder="sk-..."
                        className="flex-1 font-mono text-sm"
                      />
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => setShowKey(!showKey)}
                      >
                        {showKey ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleSaveKey(provider.id, provider.storageKey)}
                      className="flex-1"
                    >
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleCancel}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
