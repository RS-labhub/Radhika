import type { Source } from "@/types/chat"

/**
 * Extract sources from AI response content
 * Looks for markdown-style citations like [1](url) or **Source:** patterns
 */
export function extractSourcesFromContent(content: string): Source[] {
  const sources: Source[] = []
  const seenUrls = new Set<string>()

  // Pattern 1: Markdown links that look like citations [text](url)
  const mdLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g
  let match
  
  while ((match = mdLinkRegex.exec(content)) !== null) {
    const title = match[1]
    const url = match[2]
    
    if (!seenUrls.has(url) && isValidSourceUrl(url)) {
      sources.push({
        title: cleanTitle(title),
        url,
        type: detectSourceType(url),
      })
      seenUrls.add(url)
    }
  }

  // Pattern 2: **Source:** or **Reference:** followed by URL
  const sourcePatternRegex = /\*\*(?:Source|Reference|Citation)s?:?\*\*\s*(?:\[([^\]]+)\]\((https?:\/\/[^\)]+)\)|(https?:\/\/[^\s]+))/gi
  
  while ((match = sourcePatternRegex.exec(content)) !== null) {
    const title = match[1] || extractDomainName(match[2] || match[3])
    const url = match[2] || match[3]
    
    if (!seenUrls.has(url) && isValidSourceUrl(url)) {
      sources.push({
        title: cleanTitle(title),
        url,
        type: detectSourceType(url),
      })
      seenUrls.add(url)
    }
  }

  // Pattern 3: Numbered citations [1] text - url pattern
  const numberedCitationRegex = /\[(\d+)\][\s\S]{0,100}?(https?:\/\/[^\s\)]+)/g
  
  while ((match = numberedCitationRegex.exec(content)) !== null) {
    const url = match[2]
    
    if (!seenUrls.has(url) && isValidSourceUrl(url)) {
      sources.push({
        title: extractDomainName(url),
        url,
        type: detectSourceType(url),
      })
      seenUrls.add(url)
    }
  }

  return sources
}

function isValidSourceUrl(url: string): boolean {
  try {
    const urlObj = new URL(url)
    // Filter out common non-source domains
    const domain = urlObj.hostname.toLowerCase()
    const ignoreDomains = ['localhost', '127.0.0.1', 'example.com', 'test.com']
    return !ignoreDomains.some(d => domain.includes(d))
  } catch {
    return false
  }
}

function detectSourceType(url: string): Source['type'] {
  const urlLower = url.toLowerCase()
  
  if (urlLower.includes('wikipedia.org')) return 'wikipedia'
  if (urlLower.includes('docs.') || urlLower.includes('/docs/') || urlLower.includes('/documentation/')) {
    return 'documentation'
  }
  if (urlLower.includes('blog') || urlLower.includes('article') || urlLower.includes('medium.com')) {
    return 'article'
  }
  
  return 'other'
}

function extractDomainName(url: string): string {
  try {
    const urlObj = new URL(url)
    const hostname = urlObj.hostname
    // Remove www. prefix
    const domain = hostname.replace(/^www\./, '')
    // Capitalize first letter
    return domain.charAt(0).toUpperCase() + domain.slice(1)
  } catch {
    return 'Source'
  }
}

function cleanTitle(title: string): string {
  // Remove common prefixes and clean up
  return title
    .replace(/^\[?\d+\]?\.?\s*/, '') // Remove [1] or 1. prefixes
    .replace(/^(?:Source|Reference|Citation):?\s*/i, '')
    .trim()
}

/**
 * Add topic-based sources when no explicit citations are found
 * This helps provide relevant documentation links based on content
 */
export function addExampleSources(content: string): Source[] {
  const sources: Source[] = []
  const contentLower = content.toLowerCase()
  
  // React topics
  if (contentLower.includes('react') || contentLower.includes('hook') || contentLower.includes('usestate') || contentLower.includes('useeffect')) {
    if (!sources.find(s => s.url.includes('react.dev'))) {
      sources.push({
        title: 'React Documentation',
        url: 'https://react.dev',
        type: 'documentation',
        snippet: 'Official React documentation and guides'
      })
    }
  }
  
  // JavaScript/TypeScript
  if (contentLower.includes('javascript') || contentLower.includes('js ') || contentLower.includes('array') || contentLower.includes('object') || contentLower.includes('function')) {
    if (!sources.find(s => s.url.includes('developer.mozilla.org'))) {
      sources.push({
        title: 'MDN Web Docs',
        url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
        type: 'documentation',
        snippet: 'JavaScript reference and tutorials'
      })
    }
  }
  
  if (contentLower.includes('typescript') || contentLower.includes('type ') || contentLower.includes('interface')) {
    if (!sources.find(s => s.url.includes('typescriptlang.org'))) {
      sources.push({
        title: 'TypeScript Documentation',
        url: 'https://www.typescriptlang.org/docs/',
        type: 'documentation',
        snippet: 'Official TypeScript documentation'
      })
    }
  }
  
  // Next.js
  if (contentLower.includes('next.js') || contentLower.includes('nextjs') || contentLower.includes('app router') || contentLower.includes('server component')) {
    if (!sources.find(s => s.url.includes('nextjs.org'))) {
      sources.push({
        title: 'Next.js Documentation',
        url: 'https://nextjs.org/docs',
        type: 'documentation',
        snippet: 'Official Next.js documentation'
      })
    }
  }
  
  // CSS/Tailwind
  if (contentLower.includes('tailwind') || contentLower.includes('css class')) {
    if (!sources.find(s => s.url.includes('tailwindcss.com'))) {
      sources.push({
        title: 'Tailwind CSS Documentation',
        url: 'https://tailwindcss.com/docs',
        type: 'documentation',
        snippet: 'Official Tailwind CSS documentation'
      })
    }
  }
  
  if (contentLower.includes('css') || contentLower.includes('flexbox') || contentLower.includes('grid')) {
    if (!sources.find(s => s.url.includes('developer.mozilla.org') && s.url.includes('CSS'))) {
      sources.push({
        title: 'MDN CSS Reference',
        url: 'https://developer.mozilla.org/en-US/docs/Web/CSS',
        type: 'documentation',
        snippet: 'CSS reference and guides'
      })
    }
  }
  
  // Node.js
  if (contentLower.includes('node.js') || contentLower.includes('nodejs') || contentLower.includes('npm') || contentLower.includes('package.json')) {
    if (!sources.find(s => s.url.includes('nodejs.org'))) {
      sources.push({
        title: 'Node.js Documentation',
        url: 'https://nodejs.org/docs',
        type: 'documentation',
        snippet: 'Official Node.js documentation'
      })
    }
  }
  
  // Python
  if (contentLower.includes('python') || contentLower.includes('pip ') || contentLower.includes('django') || contentLower.includes('flask')) {
    if (!sources.find(s => s.url.includes('python.org'))) {
      sources.push({
        title: 'Python Documentation',
        url: 'https://docs.python.org/3/',
        type: 'documentation',
        snippet: 'Official Python documentation'
      })
    }
  }
  
  // Git/GitHub
  if (contentLower.includes('git ') || contentLower.includes('github') || contentLower.includes('commit') || contentLower.includes('branch')) {
    if (!sources.find(s => s.url.includes('git-scm.com'))) {
      sources.push({
        title: 'Git Documentation',
        url: 'https://git-scm.com/doc',
        type: 'documentation',
        snippet: 'Official Git documentation'
      })
    }
  }
  
  // HTML
  if (contentLower.includes('html') || contentLower.includes('semantic') || contentLower.includes('<div>') || contentLower.includes('element')) {
    if (!sources.find(s => s.url.includes('developer.mozilla.org') && s.url.includes('HTML'))) {
      sources.push({
        title: 'MDN HTML Reference',
        url: 'https://developer.mozilla.org/en-US/docs/Web/HTML',
        type: 'documentation',
        snippet: 'HTML reference and guides'
      })
    }
  }
  
  // Limit to most relevant 2-3 sources
  return sources.slice(0, 3)
}

/**
 * Filter sources by type preference
 */
export function filterSourcesByType(sources: Source[], typeFilter: "wikipedia" | "documentation" | "any"): Source[] {
  if (typeFilter === "any") {
    return sources
  }
  
  return sources.filter(source => source.type === typeFilter)
}
