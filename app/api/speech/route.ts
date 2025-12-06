import { NextRequest, NextResponse } from "next/server";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = "7cETWFmFhbuQzaSKPpec";
const MODEL_ID = "eleven_multilingual_v2";

// Voice settings per mode for expressive, natural speech
type Mode = "general" | "productivity" | "wellness" | "learning" | "creative" | "bff";

const MODE_VOICE_SETTINGS: Record<Mode, { stability: number; similarity_boost: number; style: number; use_speaker_boost: boolean }> = {
  general: {
    stability: 0.45,        // Slightly varied for natural conversation
    similarity_boost: 0.75,
    style: 0.35,            // Moderate expressiveness
    use_speaker_boost: true,
  },
  productivity: {
    stability: 0.60,        // More stable, professional tone
    similarity_boost: 0.70,
    style: 0.20,            // Less expressive, clear and focused
    use_speaker_boost: true,
  },
  wellness: {
    stability: 0.50,        // Calm and soothing
    similarity_boost: 0.80,
    style: 0.45,            // Warm and empathetic
    use_speaker_boost: true,
  },
  learning: {
    stability: 0.55,        // Clear and articulate
    similarity_boost: 0.75,
    style: 0.30,            // Engaging but not over the top
    use_speaker_boost: true,
  },
  creative: {
    stability: 0.35,        // More variation for creativity
    similarity_boost: 0.70,
    style: 0.60,            // Very expressive and dynamic
    use_speaker_boost: true,
  },
  bff: {
    stability: 0.30,        // Most natural, casual variation
    similarity_boost: 0.85,
    style: 0.70,            // Very expressive, fun, energetic
    use_speaker_boost: true,
  },
};

export async function POST(req: NextRequest) {
  try {
    const { text, mode = "general" } = await req.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "Text is required" },
        { status: 400 }
      );
    }

    if (!ELEVENLABS_API_KEY) {
      return NextResponse.json(
        { error: "ElevenLabs API key not configured", fallback: true },
        { status: 503 }
      );
    }

    // Clean text for TTS - remove markdown, URLs, emojis
    const cleanedText = text
      // Convert markdown links [text](url) to just text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      // Remove raw URLs
      .replace(/https?:\/\/[^\s]+/g, "")
      // Remove markdown formatting
      .replace(/[*_~`#]+/g, "")
      // Remove code blocks
      .replace(/```[\s\S]*?```/g, "")
      // Remove inline code
      .replace(/`[^`]+`/g, "")
      // Remove emojis
      .replace(/[\p{Emoji_Presentation}\p{Emoji}\u200D]+/gu, "")
      // Clean up extra whitespace
      .replace(/\s+/g, " ")
      .trim();

    if (!cleanedText) {
      return NextResponse.json(
        { error: "No speakable text after cleaning" },
        { status: 400 }
      );
    }

    // Limit text length to avoid excessive API usage (ElevenLabs charges per character)
    const maxLength = 5000;
    const truncatedText = cleanedText.length > maxLength 
      ? cleanedText.substring(0, maxLength) + "..."
      : cleanedText;

    // Get voice settings based on mode
    const voiceSettings = MODE_VOICE_SETTINGS[mode as Mode] || MODE_VOICE_SETTINGS.general;

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text: truncatedText,
          model_id: MODEL_ID,
          voice_settings: voiceSettings,
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("ElevenLabs API error:", response.status, errorData);
      
      // Return fallback flag for quota/auth errors
      if (response.status === 401 || response.status === 403 || response.status === 429) {
        return NextResponse.json(
          { error: "ElevenLabs quota exceeded or unauthorized", fallback: true },
          { status: 503 }
        );
      }
      
      return NextResponse.json(
        { error: errorData.detail?.message || "ElevenLabs API error", fallback: true },
        { status: response.status }
      );
    }

    // Return audio as binary stream
    const audioBuffer = await response.arrayBuffer();
    
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.byteLength.toString(),
      },
    });
  } catch (error) {
    console.error("Speech API error:", error);
    return NextResponse.json(
      { error: "Internal server error", fallback: true },
      { status: 500 }
    );
  }
}
