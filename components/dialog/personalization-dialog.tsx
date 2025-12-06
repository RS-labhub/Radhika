"use client"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import type { UIStyle, UserGender, UserAge, UserPersonalization } from "@/types/chat"
import { User, Baby, GraduationCap, Briefcase, Heart } from "lucide-react"

interface PersonalizationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  personalization: UserPersonalization
  onSave: (personalization: UserPersonalization) => void
  uiStyle: UIStyle
}

const GENDER_OPTIONS: { value: UserGender; label: string; emoji: string }[] = [
  { value: "boy", label: "Boy", emoji: "👦" },
  { value: "girl", label: "Girl", emoji: "👧" },
  { value: "other", label: "Other", emoji: "🧑" },
]

const AGE_OPTIONS: { value: UserAge; label: string; description: string; emoji: string }[] = [
  { value: "kid", label: "Kid", description: "Simple & fun language", emoji: "🧒" },
  { value: "teenage", label: "Teenage", description: "GenZ slang & vibes 🔥", emoji: "🎒" },
  { value: "mature", label: "Mature", description: "Professional & clear", emoji: "💼" },
  { value: "senior", label: "Senior", description: "Respectful & warm", emoji: "👴" },
]

export function PersonalizationDialog({
  open,
  onOpenChange,
  personalization,
  onSave,
  uiStyle,
}: PersonalizationDialogProps) {
  const isPixel = uiStyle === "pixel"

  const handleGenderChange = (gender: UserGender) => {
    onSave({ ...personalization, gender })
  }

  const handleAgeChange = (age: UserAge) => {
    onSave({ ...personalization, age })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "w-[90vw] max-w-md border px-5 py-6 sm:px-6",
          isPixel
            ? "pixel-border pixel-surface pixel-shadow border-slate-500 bg-slate-200 dark:border-slate-600 dark:bg-slate-900"
            : "rounded-2xl border-white/40 bg-white/90 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/90"
        )}
      >
        <DialogHeader>
          <DialogTitle
            className={cn(
              "flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100",
              isPixel && "pixel-font text-base"
            )}
          >
            <User className="h-5 w-5 text-cyan-500" />
            Personalize Radhika
          </DialogTitle>
          <DialogDescription
            className={cn(
              "text-sm text-slate-500 dark:text-slate-400",
              isPixel && "pixel-font text-xs"
            )}
          >
            Help Radhika understand you better for personalized conversations! ✨
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Gender Selection */}
          <div className="space-y-3">
            <Label
              className={cn(
                "text-sm font-medium text-slate-700 dark:text-slate-300",
                isPixel && "pixel-font text-xs"
              )}
            >
              I am a...
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {GENDER_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleGenderChange(option.value)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-xl border p-3 transition-all",
                    isPixel
                      ? "pixel-border"
                      : "hover:shadow-md",
                    personalization.gender === option.value
                      ? isPixel
                        ? "border-cyan-500 bg-cyan-100 dark:bg-cyan-900/40"
                        : "border-cyan-500 bg-gradient-to-br from-cyan-50 to-blue-50 shadow-sm dark:from-cyan-950/50 dark:to-blue-950/50"
                      : isPixel
                        ? "border-slate-400 bg-slate-100 dark:border-slate-600 dark:bg-slate-800"
                        : "border-slate-200 bg-white/70 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800/50"
                  )}
                >
                  <span className="text-2xl">{option.emoji}</span>
                  <span
                    className={cn(
                      "text-sm font-medium text-slate-700 dark:text-slate-300",
                      isPixel && "pixel-font text-xs"
                    )}
                  >
                    {option.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Age/Maturity Selection */}
          <div className="space-y-3">
            <Label
              className={cn(
                "text-sm font-medium text-slate-700 dark:text-slate-300",
                isPixel && "pixel-font text-xs"
              )}
            >
              My vibe is...
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {AGE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleAgeChange(option.value)}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all",
                    isPixel
                      ? "pixel-border"
                      : "hover:shadow-md",
                    personalization.age === option.value
                      ? isPixel
                        ? "border-cyan-500 bg-cyan-100 dark:bg-cyan-900/40"
                        : "border-cyan-500 bg-gradient-to-br from-cyan-50 to-blue-50 shadow-sm dark:from-cyan-950/50 dark:to-blue-950/50"
                      : isPixel
                        ? "border-slate-400 bg-slate-100 dark:border-slate-600 dark:bg-slate-800"
                        : "border-slate-200 bg-white/70 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800/50"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{option.emoji}</span>
                    <span
                      className={cn(
                        "text-sm font-medium text-slate-700 dark:text-slate-300",
                        isPixel && "pixel-font text-xs"
                      )}
                    >
                      {option.label}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "text-xs text-slate-500 dark:text-slate-400",
                      isPixel && "pixel-font text-[10px]"
                    )}
                  >
                    {option.description}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Current Selection Summary */}
          <div
            className={cn(
              "rounded-xl border p-3",
              isPixel
                ? "pixel-border border-slate-400 bg-slate-100 dark:border-slate-600 dark:bg-slate-800"
                : "border-slate-200 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-800/50"
            )}
          >
            <p
              className={cn(
                "text-center text-sm text-slate-600 dark:text-slate-400",
                isPixel && "pixel-font text-xs"
              )}
            >
              Radhika will talk to you as a{" "}
              <span className="font-semibold text-cyan-600 dark:text-cyan-400">
                {GENDER_OPTIONS.find((g) => g.value === personalization.gender)?.emoji}{" "}
                {personalization.gender === "boy" ? "guy" : personalization.gender === "girl" ? "girl" : "friend"}
              </span>{" "}
              with{" "}
              <span className="font-semibold text-cyan-600 dark:text-cyan-400">
                {AGE_OPTIONS.find((a) => a.value === personalization.age)?.emoji}{" "}
                {personalization.age}
              </span>{" "}
              vibes!
            </p>
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            onClick={() => onOpenChange(false)}
            className={cn(
              "h-9 px-4",
              isPixel
                ? "pixel-border pixel-shadow border-cyan-400 bg-cyan-500 text-white hover:bg-cyan-600"
                : "rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:opacity-90"
            )}
          >
            Done ✨
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
