import type { Metadata } from "next"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { AuthProvider } from "@/contexts/auth-context"
import { Toaster } from "@/components/ui/sonner"
import { Plus_Jakarta_Sans, Space_Grotesk, Press_Start_2P } from "next/font/google"

const sans = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-sans" })
const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display" })
const pixel = Press_Start_2P({ subsets: ["latin"], weight: "400", variable: "--font-pixel" })

export const metadata: Metadata = {
  title: 'Radhika',
  description:
    'Radhika is a versatile AI chatbot designed to assist with a wide range of tasks, from answering questions to providing recommendations and engaging in casual conversation.',
  generator: 'Rohan Sharma',
  icons: {
    icon: '/favicon.ico',
  },
  openGraph: {
    title: 'Radhika',
    siteName: 'radhika-sharma',
    url: 'https://radhika-sharma.vercel.app/',
    description:
      'Radhika is a versatile AI chatbot designed to assist with a wide range of tasks, from answering questions to providing recommendations and engaging in casual conversation.',
    type: 'website',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Radhika AI Chatbot',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Radhika',
    description:
      'Radhika is a versatile AI chatbot designed to assist with a wide range of tasks, from answering questions to providing recommendations and engaging in casual conversation.',
    images: ['/og-image.jpg'],
  },
  // metadataBase is used to resolve relative URLs in openGraph/twitter images
  // during static metadata generation. Use an env var in production and
  // fallback to localhost in dev.
  metadataBase: new URL(process.env.NEXT_PUBLIC_METADATA_BASE ?? `http://localhost:${process.env.PORT ?? 3000}`),
}


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${sans.variable} ${display.variable} ${pixel.variable} font-sans antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <AuthProvider>
            {children}
            <Toaster />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
