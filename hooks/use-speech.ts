"use client";

import { useState, useEffect, useCallback, useRef } from "react";

type Mode = "general" | "productivity" | "wellness" | "learning" | "creative" | "bff";

// Browser TTS settings per mode
const MODE_BROWSER_TTS_SETTINGS: Record<Mode, { rate: number; pitch: number; volume: number }> = {
  general: { rate: 0.95, pitch: 1.05, volume: 0.9 },
  productivity: { rate: 1.0, pitch: 1.0, volume: 0.9 },      // Clear, professional
  wellness: { rate: 0.85, pitch: 1.0, volume: 0.85 },        // Calm, soothing, slower
  learning: { rate: 0.90, pitch: 1.0, volume: 0.9 },         // Clear, moderate pace for comprehension
  creative: { rate: 0.95, pitch: 1.1, volume: 0.9 },         // Expressive, dynamic
  bff: { rate: 1.0, pitch: 1.15, volume: 0.95 },             // Energetic, fun
};

export function useSpeech() {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentMessageId, setCurrentMessageId] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const synthesisRef = useRef<SpeechSynthesis | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const onTranscriptRef = useRef<((transcript: string) => void) | null>(null);
  const useFallbackRef = useRef(false);

  // Initialize speech recognition and synthesis
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Speech Recognition
    if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
      const SpeechRecognition =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;
      const recognitionInstance = new SpeechRecognition();
      recognitionInstance.continuous = false;
      recognitionInstance.interimResults = false;
      recognitionInstance.lang = "en-US";

      recognitionInstance.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (onTranscriptRef.current) {
          onTranscriptRef.current(transcript);
        }
        setIsListening(false);
      };

      recognitionInstance.onerror = (event: any) => {
        setIsListening(false);
      };

      recognitionInstance.onend = () => setIsListening(false);

      recognitionRef.current = recognitionInstance;
    } else {
      setError("Speech recognition is not supported in your browser.");
    }

    // Speech Synthesis (fallback)
    if ("speechSynthesis" in window) {
      synthesisRef.current = window.speechSynthesis;
      window.speechSynthesis.getVoices();
    }

    // Cleanup audio on unmount
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Fallback browser TTS
  const speakWithBrowserTTS = useCallback((text: string, mode: Mode = "general") => {
    const synthesis = synthesisRef.current;
    if (!synthesis) {
      setError("Speech synthesis is not available.");
      return;
    }

    synthesis.cancel();

    const cleanedText = text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/https?:\/\/[^\s]+/g, "")
      .replace(/[*_~`#]+/g, "")
      .replace(/```[\s\S]*?```/g, "")
      .replace(/`[^`]+`/g, "")
      .replace(/[\p{Emoji_Presentation}\p{Emoji}\u200D]+/gu, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!cleanedText) return;

    const settings = MODE_BROWSER_TTS_SETTINGS[mode] || MODE_BROWSER_TTS_SETTINGS.general;
    const utterance = new SpeechSynthesisUtterance(cleanedText);
    utterance.rate = settings.rate;
    utterance.pitch = settings.pitch;
    utterance.volume = settings.volume;

    const voices = synthesis.getVoices();
    const femaleVoice = voices.find(v => 
      v.lang.startsWith("en") && 
      (v.name.toLowerCase().includes("female") || 
       v.name.toLowerCase().includes("samantha") ||
       v.name.toLowerCase().includes("zira"))
    ) ?? voices.find(v => v.lang.startsWith("en")) ?? voices[0];

    if (femaleVoice) {
      utterance.voice = femaleVoice;
    }

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      setCurrentMessageId(null);
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      setCurrentMessageId(null);
    };

    synthesis.speak(utterance);
  }, []);

  // ElevenLabs TTS
  const speakWithElevenLabs = useCallback(async (text: string, mode: Mode = "general"): Promise<boolean> => {
    try {
      const response = await fetch("/api/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, mode }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (errorData.fallback) {
          console.warn("ElevenLabs unavailable, using fallback TTS");
          useFallbackRef.current = true;
          return false;
        }
        throw new Error(errorData.error || "Speech API error");
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      // Stop any existing audio
      if (audioRef.current) {
        audioRef.current.pause();
        URL.revokeObjectURL(audioRef.current.src);
      }

      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onplay = () => setIsSpeaking(true);
      audio.onended = () => {
        setIsSpeaking(false);
        setCurrentMessageId(null);
        URL.revokeObjectURL(audioUrl);
      };
      audio.onerror = () => {
        setIsSpeaking(false);
        setCurrentMessageId(null);
        URL.revokeObjectURL(audioUrl);
      };
      audio.onpause = () => {
        setIsSpeaking(false);
      };

      await audio.play();
      return true;
    } catch (err) {
      console.error("ElevenLabs TTS error:", err);
      return false;
    }
  }, []);

  // Main speak function - tries ElevenLabs first, falls back to browser TTS
  const speakMessage = useCallback(async (text: string, messageId?: string, mode: Mode = "general") => {
    if (!text) return;

    // Stop any ongoing speech
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (synthesisRef.current) {
      synthesisRef.current.cancel();
    }

    if (messageId) {
      setCurrentMessageId(messageId);
    }

    // If we've already determined ElevenLabs is unavailable, use fallback immediately
    if (useFallbackRef.current) {
      speakWithBrowserTTS(text, mode);
      return;
    }

    // Try ElevenLabs first
    const success = await speakWithElevenLabs(text, mode);
    
    // If ElevenLabs failed, use browser fallback
    if (!success) {
      speakWithBrowserTTS(text, mode);
    }
  }, [speakWithElevenLabs, speakWithBrowserTTS]);

  const stopSpeaking = useCallback(() => {
    // Stop ElevenLabs audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    // Stop browser TTS
    const synthesis = synthesisRef.current;
    if (synthesis) {
      synthesis.cancel();
    }

    setIsSpeaking(false);
    setCurrentMessageId(null);
  }, []);

  const startListening = useCallback(
    (onTranscript: (transcript: string) => void) => {
      const recognition = recognitionRef.current;
      if (!recognition) {
        setError("Speech recognition is not supported in your browser.");
        return;
      }

      if (isListening) {
        recognition.stop();
        return;
      }

      onTranscriptRef.current = onTranscript;
      recognition.start();
      setIsListening(true);
      setError(null);
    },
    [isListening]
  );

  const stopListening = useCallback(() => {
    const recognition = recognitionRef.current;
    if (recognition && isListening) {
      recognition.stop();
    }
  }, [isListening]);

  return {
    isListening,
    isSpeaking,
    voiceEnabled,
    error,
    currentMessageId,
    setVoiceEnabled,
    speakMessage,
    stopSpeaking,
    startListening,
    stopListening,
    clearError: () => setError(null),
  };
}
