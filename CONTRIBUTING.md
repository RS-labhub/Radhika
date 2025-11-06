## Contributing & Developer Documentation

Note for contributors: the repository README has been kept minimal. Full development instructions, configuration, usage details, model selection notes, and contribution guidelines live in this file. If you plan to contribute, update this document instead of the main README.

Below is a short project summary followed by the detailed content moved from the README (kept in sequence for contributors).

Project summary (brief)
- Name: RADHIKA — Adaptive Reasoning & Intelligence Assistant
- Purpose: A multi-mode AI assistant built with Next.js that supports multiple LLM/image providers, voice I/O, and a polished UI.
- Stack: Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui, Three.js for visualizations.

---

## Smart Model Selection

RADHIKA automatically selects the best model based on your query complexity:

```typescript
// Determine which model to use based on conversation context
let modelType = "fast"; // llama-3.1-8b-instant for quick responses

// Use reasoning model for complex analytical tasks
if (query.includes("analyze", "compare", "plan", "strategy", "decision", "problem")) {
  modelType = "reasoning"; // llama-3.3-70b-versatile
}

// Use creative model for artistic and innovative tasks
if (query.includes("creative", "brainstorm", "idea", "write", "design", "story")) {
  modelType = "creative"; // qwen/qwen3-32b
}
```

## Getting Started

### Prerequisites
- Node.js 18+
- Modern web browser with speech API support
- Optional: API keys for OpenAI/Claude (Groq and Gemini work without keys)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/RS-labhub/radhika.git
   cd radhika
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   bun install
   ```

3. **Set up environment variables (check `.env.example`)**
   ```bash
   touch .env
   ```

   Add your API keys (optional for full functionality):
   ```env
   # Required for Groq (free tier available)
   GROQ_API_KEY=your_groq_api_key_here
   
   # Required for Gemini (free tier available)
   GOOGLE_GENERATIVE_AI_API_KEY=your_gemini_api_key_here
   
   # Optional: Add via UI for OpenAI/Claude
   # OPENAI_API_KEY=your_openai_api_key_here
   # ANTHROPIC_API_KEY=your_claude_api_key_here
   ```

4. **Run the development server**
   ```bash
   npm run dev
   # or
   bun run dev
   ```

5. **Open your browser**
   Navigate to `http://localhost:3000`

## Usage Guide

### **Selecting AI Modes**
Click on any of the six mode buttons to switch RADHIKA's personality and expertise:

- 🧠 **General** - Everyday questions, problem-solving, and general conversations
- 🎯 **Productivity** - Task management, planning, time optimization, and organization
- ❤️ **Wellness** - Health guidance, fitness routines, mental well-being, and self-care
- 📚 **Learning** - Educational support, study plans, skill development, and tutoring
- 💡 **Creative** - Brainstorming, content creation, artistic projects, and innovation
- 💕 **BFF** - Your GenZ bestie for emotional support, casual chats, and life advice

### **AI Provider Selection**
Choose from multiple AI providers in the bottom-right corner:

- **Groq Cloud** (Default): Fast responses, no API key required
- **Gemini**: Google's advanced AI, no API key required  
- **OpenAI**: Premium models, requires API key (enter via dialog)
- **Claude**: Anthropic's assistant, requires API key (enter via dialog)

### **Voice Features**
- **Voice Input**: Click the microphone button to speak your message
- **Voice Output**: Toggle the speaker icon to enable/disable AI voice responses
- **Multi-Language**: Speak in any language - RADHIKA adapts automatically
- **Voice Controls**: Stop speaking mid-response with the stop button

### **Quick Actions**
Each mode provides quick action buttons with pre-defined prompts:
- Click any quick action to instantly populate the input field
- Actions are tailored to each mode's specialty
- Perfect for getting started or exploring capabilities

### **Chat Management**
- **Auto-Save**: Conversations are automatically saved per mode
- **Clear Chat**: Use the trash button to clear current mode's history (with confirmation)
- **Mode Switching**: Switch between modes without losing conversation context
- **Persistent Storage**: Chat history persists across browser sessions

### **Themes & Customization**
- **Dark/Light Mode**: Toggle themes with the sun/moon button
- **Responsive Design**: Optimized for desktop, tablet, and mobile
- **Mode Colors**: UI adapts colors based on selected mode
- **Accessibility**: Full keyboard navigation and screen reader support


## Configuration

### **System Prompts**
Each mode has a carefully crafted system prompt in `app/api/chat/route.ts`:

- **Productivity**: GTD methodology, Eisenhower Matrix, time management
- **Wellness**: Physical/mental health, habit formation, empathetic support
- **Learning**: Adaptive teaching, personalized study plans, progress tracking
- **Creative**: Idea generation, creative blocks, artistic inspiration
- **General**: Balanced, helpful, and insightful responses
- **BFF**: GenZ language, emotional support, casual and fun interactions

### **Model Configuration**
Customize model selection in the API route:

```typescript
const MODELS = {
  groq: {
    fast: "llama-3.1-8b-instant",
    reasoning: "llama-3.3-70b-versatile", 
    creative: "openai/gpt-oss-120b"
  },
  gemini: { default: "gemini-2.5-flash" },
  openai: { default: "gpt-5" },
  claude: { default: "claude-3-5-sonnet-20241022" }
}
```

### **Customization Options**
- **Quick Actions**: Modify `QUICK_ACTIONS` in `app/page.tsx`
- **Mode Styling**: Update `MODES` configuration for colors and descriptions
- **Particle Effects**: Adjust visualization parameters in `ai-visualization.tsx`
- **Voice Settings**: Configure speech synthesis options in `use-speech.ts`

## Image Generation

RADHIKA ships with an image generation API and a small client helper to display and interact with generated images. This section explains how it works and how to use it when developing or contributing.

Core files
- API route: `app/api/image/route.ts` — the main POST endpoint to generate images
- Client component: `components/chat/generated-image.tsx` — displays generated images and provides copy/download/retry actions
- Proxy image route: `app/api/proxy-image/route.ts` (used when providers return external URLs)

Supported providers (examples)
- `pollinations_free` — Pollinations-based free generator (no API key required)
- `free_alternatives` — aggregate of free services (no API key required)
- `openai` — OpenAI DALL·E (requires `OPENAI_API_KEY`)
- `huggingface` — Hugging Face inference API (requires `HUGGINGFACE_API_KEY`)
- `gemini` — Google Generative AI (requires `GOOGLE_GENERATIVE_AI_API_KEY`)

Request shape (POST JSON)
- provider: string (provider id)
- prompt: optional string (custom prompt overrides auto-generated prompt)
- content: optional string (used to auto-generate a prompt from article/content)
- title: optional string (used for blog-cover style prompts)
- size: string (provider size id like `square_small`, `post`, `square_large`, or `custom`)
- customWidth / customHeight: numbers used when size is `custom` (validated between 64 and 2048)
- model: optional model id for the provider
- apiKey: optional API key in request body (falls back to env vars)
- style / customStyle: optional style presets (e.g. `realistic`, `cartoon`, `ghibli`, `custom`)

Response shape (JSON)
- success: boolean
- imageUrl: string (data URL or proxied URL `/api/proxy-image?url=...`)
- originalUrl: provider's original URL (if returned)
- credits: number (estimated cost or 0 for free providers)
- model: model id used
- prompt: final prompt used to generate the image
- provider: human-readable provider name
- size: string like `1024x1024`

Notes & behavior
- If a provider returns an external image link (OpenAI), the route may return a proxied URL (`/api/proxy-image`) to avoid CORS issues.
- Custom sizes are validated (64–2048 px). Invalid dimensions return a 400 error.
- The server will try provider-specific generation functions and may fall back to free services (Pollinations) if a provider fails.
- Hugging Face and Gemini generation functions may return base64 data URLs; OpenAI returns external URLs.

Environment variables (set in `.env` or platform settings)
- `OPENAI_API_KEY` — for OpenAI DALL·E
- `HUGGINGFACE_API_KEY` — for Hugging Face models
- `GOOGLE_GENERATIVE_AI_API_KEY` — for Google Gemini

Example client usage

```js
const res = await fetch('/api/image', {
   method: 'POST',
   headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({
      provider: 'pollinations_free',
      content: 'A modern tech blog article about AI and web development',
      title: 'Building a Modern AI Assistant',
      size: 'post',
      style: 'minimalist',
   }),
})

const data = await res.json()
if (data.success) {
   // Use components/chat/generated-image.tsx to display `data.imageUrl`
   console.log('Image URL:', data.imageUrl)
} else {
   console.error('Image generation failed', data.error)
}
```

If you add or change providers, update the provider registry inside `app/api/image/route.ts` and include tests or notes in this file.

## Tech Stack

### **Frontend**
- **Framework**: Next.js 14 with App Router and React 18
- **Styling**: Tailwind CSS with custom design system
- **Components**: shadcn/ui component library
- **Icons**: Lucide React icon library
- **3D Graphics**: Three.js for particle visualizations
- **Animations**: CSS transitions and keyframe animations

### **AI & Backend**
- **AI Integration**: Vercel AI SDK for unified LLM access
- **Providers**: Groq, Google Gemini, OpenAI, Claude
- **Speech**: WebKit Speech Recognition and Synthesis APIs
- **Storage**: Browser localStorage for chat persistence and settings
- **API**: Next.js API routes for secure LLM communication

## Key Features Explained

### **Adaptive Model Selection**
RADHIKA intelligently chooses the best model for your query:
- **Fast Model**: Quick responses for casual conversations
- **Reasoning Model**: Complex analysis, planning, and problem-solving
- **Creative Model**: Brainstorming, writing, and artistic tasks

### **Persistent Chat History**
- Each mode maintains separate conversation history
- Stored locally in browser with automatic cleanup
- Seamless switching between modes without context loss
- Export functionality for backup and sharing

### **Advanced Voice Integration**
- **Multi-language Support**: Automatic language detection
- **Natural Voices**: Gender and accent preferences
- **Emoji Filtering**: Clean text-to-speech without emoji artifacts
- **Interrupt Capability**: Stop speaking mid-response

### **Real-time Analytics**
- **Usage Patterns**: Track which modes you use most
- **Performance Metrics**: Response times and message counts
- **AI Status**: Live monitoring of system components

### **Responsive Design**
- **Mobile-First**: Optimized touch interfaces
- **Progressive Enhancement**: Works on all devices
- **Accessibility**: WCAG compliant with keyboard navigation
- **Performance**: Optimized loading and smooth animations

## Contributing

We welcome contributions! Here's how to get started:

1. **Fork the repository**
2. **Create a feature branch**
   ```bash
   git checkout -b feature/amazing-feature
   ```
3. **Make your changes**
   - Follow TypeScript best practices
   - Add tests for new functionality
   - Update documentation as needed
4. **Commit your changes**
   ```bash
   git commit -m 'Add amazing feature'
   ```
5. **Push to your branch**
   ```bash
   git push origin feature/amazing-feature
   ```
6. **Open a Pull Request**
