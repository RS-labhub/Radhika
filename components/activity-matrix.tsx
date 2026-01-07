"use client"

import { useEffect, useRef, useState } from "react"
import * as THREE from "three"
import { Activity, MessageSquare, Clock, Zap, Brain } from "lucide-react"
import { cn } from "@/lib/utils"
import type { UIStyle } from "@/types/chat"

interface ActivityMatrixProps {
  messages?: any[]
  currentMode?: string
  uiStyle?: UIStyle
  isAuthenticated?: boolean
}

export function ActivityMatrix({ messages = [], currentMode = "general", uiStyle = "modern", isAuthenticated = false }: ActivityMatrixProps) {
  const isPixel = uiStyle === "pixel"
  const mountRef = useRef<HTMLDivElement>(null)
  const nodeMaterialRef = useRef<THREE.Material | null>(null)
  const lineMaterialRef = useRef<THREE.Material | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const networkRef = useRef<THREE.Group | null>(null)
  const animationRef = useRef<number | null>(null)
  const DEBUG = true
  const resumeBoostRef = useRef<number>(0)
  const [instance, setInstance] = useState(0)
  const [stats, setStats] = useState({
    totalMessages: 0,
    avgResponseTime: 0,
    mostUsedMode: "general",
    sessionsToday: 0,
  })

  // central animation loop using refs so it survives re-renders
  const animateLoop = () => {
    animationRef.current = requestAnimationFrame(animateLoop)

    const net = networkRef.current
    const rend = rendererRef.current
    const scn = sceneRef.current
    const cam = cameraRef.current

    // support a short resume boost so movement is visible after re-init
    const boost = resumeBoostRef.current || 0
    if (net) {
      if (boost > 0) {
        net.rotation.y += 0.02
        net.rotation.x += 0.008
        resumeBoostRef.current = boost - 1
      } else {
        net.rotation.y += 0.005
        net.rotation.x += 0.002
      }
    }

    if (rend && scn && cam) {
      try {
        // clear before render to avoid artifacts after resize/context changes
        try { rend.clear() } catch (e) {}
        rend.render(scn, cam)
      } catch (err) {
        console.warn("[ActivityMatrix] render error", err)
      }
    }
  }

  // Calculate real application stats
  useEffect(() => {
    const totalMessages = messages.length
    const avgResponseTime = totalMessages > 0 ? Math.random() * 2 + 1 : 0 // Simulated for now
    const mostUsedMode = currentMode
    const sessionsToday = totalMessages > 0 ? Math.floor(totalMessages / 3) + 1 : 0

    setStats({
      totalMessages,
      avgResponseTime,
      mostUsedMode,
      sessionsToday,
    })
  }, [messages, currentMode])

  useEffect(() => {
    if (!mountRef.current) return
    if (DEBUG) console.debug("[ActivityMatrix] mount effect")

    // Scene setup
    const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000)
  cameraRef.current = camera
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })

    // Make renderer size match the wrapper so it stays within the layout and is responsive
    const resizeRenderer = () => {
      if (!mountRef.current || !renderer) return
      const width = Math.max(1, mountRef.current.clientWidth)
      const height = Math.max(1, mountRef.current.clientHeight)
      if (DEBUG) console.debug("[ActivityMatrix] resizeRenderer", width, height)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      renderer.setSize(width, height, false)
      // update camera aspect so projection matches DOM canvas
      if (cameraRef.current) {
        cameraRef.current.aspect = width / height
        cameraRef.current.updateProjectionMatrix()
      }
      // ensure DOM canvas fills its container
      renderer.domElement.style.width = "100%"
      renderer.domElement.style.height = "100%"
      renderer.domElement.style.display = "block"
    }

    // initial sizing and append
    resizeRenderer()
    renderer.setClearColor(0x000000, 0)
    // ensure the canvas fills and gets clipped by the wrapper
    renderer.domElement.style.borderRadius = "inherit"
    renderer.domElement.style.pointerEvents = "none"
    // append renderer DOM element into wrapper
    mountRef.current.appendChild(renderer.domElement)

    try {
      // some three builds expose resetState to clear GL state
      // @ts-ignore
      if (typeof renderer.resetState === "function") renderer.resetState()
    } catch (e) {}

    // update on window resize and use ResizeObserver for container changes
    window.addEventListener("resize", resizeRenderer)
    let ro: ResizeObserver | null = null
    try {
      if (typeof ResizeObserver !== "undefined") {
        ro = new ResizeObserver(resizeRenderer)
        ro.observe(mountRef.current)
      }
    } catch (e) {
      ro = null
    }
    // Pause/resume when the tile is not visible (e.g., collapsed) to avoid RAF getting throttled
    let io: IntersectionObserver | null = null
    try {
        if (typeof IntersectionObserver !== "undefined") {
          io = new IntersectionObserver((entries) => {
            const e = entries[0]
            if (!e) return
            if (DEBUG) console.debug("[ActivityMatrix] intersection", e.isIntersecting)
            if (e.isIntersecting) {
              // prefer a full recreate to avoid partial-suspended WebGL states
              if (DEBUG) console.debug("[ActivityMatrix] scheduling recreate via IntersectionObserver")
              // delay slightly to let parent expand transition finish
              setTimeout(() => setInstance((s) => s + 1), 120)
            } else {
              // pause animation when not visible
              if (animationRef.current) {
                if (DEBUG) console.debug("[ActivityMatrix] pausing animation via IntersectionObserver")
                cancelAnimationFrame(animationRef.current)
                animationRef.current = null
              }
            }
          }, { threshold: 0.05 })
          io.observe(mountRef.current)
        }
    } catch (e) {
      io = null
    }

    // Create neural network visualization
    const networkGroup = new THREE.Group()

    // Create nodes
    const nodeGeometry = new THREE.SphereGeometry(0.05, 8, 8)
    const getColorForMode = (m: string) => {
      switch (m) {
        case "productive":
        case "productivity":
          return 0x10b981 // emerald
        case "wellness":
          return 0xf43f5e // rose
        case "learning":
          return 0x7c3aed // purple
        case "creative":
          return 0xf59e0b // amber
        case "bff":
          return 0xec4899 // pink
        case "general":
        default:
          return 0x0080ff // cyan/blue
      }
    }

    const initialColor = getColorForMode(currentMode)
    const nodeMaterial = new THREE.MeshBasicMaterial({
      color: initialColor,
      transparent: true,
      opacity: 0.9,
    })

    // Create connections between nodes
    const positions = []
    for (let i = 0; i < 20; i++) {
      const node = new THREE.Mesh(nodeGeometry, nodeMaterial)
      const angle = (i / 20) * Math.PI * 2
      const radius = 0.8 + Math.random() * 0.4
      node.position.set(Math.cos(angle) * radius, (Math.random() - 0.5) * 0.5, Math.sin(angle) * radius)
      networkGroup.add(node)
      positions.push(node.position)
    }

    // Create connections
    const lineGeometry = new THREE.BufferGeometry()
    const linePositions = []
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        if (Math.random() > 0.7) {
          // Only some connections
          linePositions.push(positions[i].x, positions[i].y, positions[i].z)
          linePositions.push(positions[j].x, positions[j].y, positions[j].z)
        }
      }
    }

    lineGeometry.setAttribute("position", new THREE.Float32BufferAttribute(linePositions, 3))
    const lineMaterial = new THREE.LineBasicMaterial({
      color: initialColor,
      transparent: true,
      opacity: 0.6,
    })
    // store refs so color can be updated when mode changes
    nodeMaterialRef.current = nodeMaterial
    lineMaterialRef.current = lineMaterial
    const lines = new THREE.LineSegments(lineGeometry, lineMaterial)
    networkGroup.add(lines)

    scene.add(networkGroup)
    camera.position.z = 2
  // give a short boost so movement is obvious after init/resume
  resumeBoostRef.current = 60

  sceneRef.current = scene
  rendererRef.current = renderer
  networkRef.current = networkGroup

    // Animation loop
    const animate = () => {
      animationRef.current = requestAnimationFrame(animate)

      const net = networkRef.current
      const rend = rendererRef.current
      const scn = sceneRef.current
      const cam = cameraRef.current || camera

      if (net) {
        net.rotation.y += 0.005
        net.rotation.x += 0.002
      }

      if (rend && scn && cam) {
        rend.render(scn, cam)
      }
    }

  // start the central animation loop
  if (DEBUG) console.debug("[ActivityMatrix] start animateLoop")
  animateLoop()

    // restart animation when the document becomes visible again (some browsers throttle)
    const onVisibility = () => {
      if (DEBUG) console.debug("[ActivityMatrix] visibilitychange", document.visibilityState)
      if (document.visibilityState === "visible" && !animationRef.current) {
        if (DEBUG) console.debug("[ActivityMatrix] visibility -> restarting animation")
        animateLoop()
      }
    }
    document.addEventListener("visibilitychange", onVisibility)

    // handle WebGL context lost to attempt to recover
    const onContextLost = (e: Event) => {
      if (DEBUG) console.warn("[ActivityMatrix] webglcontextlost")
      try { e.preventDefault() } catch (e) {}
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
    }
    const onContextRestored = () => {
      if (DEBUG) console.debug("[ActivityMatrix] webglcontextrestored")
      if (!animationRef.current) animateLoop()
    }
    try {
      renderer.domElement.addEventListener("webglcontextlost", onContextLost)
      renderer.domElement.addEventListener("webglcontextrestored", onContextRestored)
    } catch (e) {
      // ignore if not supported
    }

    // periodic check to restart animation if it stops unexpectedly (e.g., due to layout shifts)
    const recoveryInterval = setInterval(() => {
      if (rendererRef.current && !animationRef.current) {
        if (DEBUG) console.debug("[ActivityMatrix] recoveryInterval restarting animation")
        animateLoop()
      }
    }, 1000)
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      document.removeEventListener("visibilitychange", onVisibility)
      try {
        renderer.domElement.removeEventListener("webglcontextlost", onContextLost)
        renderer.domElement.removeEventListener("webglcontextrestored", onContextRestored)
      } catch (e) {}
      clearInterval(recoveryInterval)
      window.removeEventListener("resize", resizeRenderer)
      if (ro && mountRef.current) ro.unobserve(mountRef.current)
      // nothing to cleanup for debug overlay (removed)
      if (mountRef.current && renderer.domElement && mountRef.current.contains(renderer.domElement)) {
        mountRef.current.removeChild(renderer.domElement)
      }
      renderer.dispose()
    }
  }, [])

  // update material colors when mode changes
  useEffect(() => {
    const getColorForMode = (m: string) => {
      switch (m) {
        case "productive":
        case "productivity":
          return 0x10b981 // emerald
        case "wellness":
          return 0xf43f5e // rose
        case "learning":
          return 0x7c3aed // purple
        case "creative":
          return 0xf59e0b // amber
        case "bff":
          return 0xec4899 // pink
        case "general":
        default:
          return 0x0080ff // cyan/blue
      }
    }

    const color = getColorForMode(currentMode)
    if (nodeMaterialRef.current && (nodeMaterialRef.current as THREE.MeshBasicMaterial).color) {
      ;(nodeMaterialRef.current as THREE.MeshBasicMaterial).color.setHex(color)
    }
    if (lineMaterialRef.current && (lineMaterialRef.current as THREE.LineBasicMaterial).color) {
      ;(lineMaterialRef.current as THREE.LineBasicMaterial).color.setHex(color)
    }
  }, [currentMode])

  // Mode usage data based on current session
  const modeUsage = [
    {
      mode: "General",
      value: currentMode === "general" ? Math.min(85, messages.length * 15 + 10) : Math.min(45, messages.length * 8),
      color: "from-cyan-500 to-blue-500",
    },
    {
      mode: "Creative",
      value: currentMode === "creative" ? Math.min(90, messages.length * 18 + 15) : Math.min(30, messages.length * 6),
      color: "from-amber-500 to-orange-500",
    },
    {
      mode: "Learning",
      value: currentMode === "learning" ? Math.min(75, messages.length * 12 + 8) : Math.min(25, messages.length * 5),
      color: "from-purple-500 to-indigo-500",
    },
    {
      mode: "Wellness",
      value: currentMode === "wellness" ? Math.min(60, messages.length * 10 + 5) : Math.min(20, messages.length * 4),
      color: "from-rose-500 to-pink-500",
    },
    {
      mode: "BFF",
      value: currentMode === "bff" ? Math.min(95, messages.length * 20 + 20) : Math.min(35, messages.length * 7),
      color: "from-pink-500 to-rose-500",
    },
  ]

  return (
    <div className={cn("min-w-0 space-y-6", isPixel && "text-slate-700 dark:text-slate-200")}>
      <div>
        <h3
          className={cn(
            "mb-4 flex items-center text-sm font-medium uppercase tracking-wider text-gray-600 dark:text-gray-400",
            isPixel && "pixel-label text-[0.68rem] text-slate-600 dark:text-slate-300",
          )}
        >
          <Activity className="w-4 h-4 mr-2" />
          AI Activity Matrix
        </h3>

        <div className="mb-4 flex justify-center">
          <div
            ref={mountRef}
            className={cn(
              // add overflow-hidden so the WebGL canvas is clipped to the rounded border
              "h-36 w-36 overflow-hidden rounded-lg border border-cyan-500/30 bg-gradient-to-br from-gray-100/50 to-white/50 backdrop-blur-sm dark:from-cyan-950/20 dark:to-blue-950/20",
              isPixel && "pixel-tile h-36 w-36 border-cyan-400/70 bg-white/80 p-2 dark:border-cyan-500/50 dark:bg-slate-900/70",
            )}
          />
        </div>
      </div>

      {/* Real-time Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div
          className={cn(
            "rounded-lg border border-gray-200 bg-white/50 p-3 dark:border-cyan-500/20 dark:bg-gray-800/30",
            isPixel && "pixel-tile px-3 py-2",
          )}
        >
          <div className="flex items-center space-x-2 mb-1">
            <MessageSquare className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
            <span
              className={cn(
                "text-xs text-gray-700 dark:text-gray-400",
                isPixel && "pixel-subheading text-[0.68rem] text-slate-600 dark:text-slate-300",
              )}
            >
              Messages
            </span>
          </div>
          <div
            className={cn(
              "text-lg font-bold text-cyan-700 dark:text-cyan-400",
              isPixel && "text-[1rem]",
            )}
          >
            {stats.totalMessages}
          </div>
        </div>

        <div
          className={cn(
            "rounded-lg border border-gray-200 bg-white/50 p-3 dark:border-cyan-500/20 dark:bg-gray-800/30",
            isPixel && "pixel-tile px-3 py-2",
          )}
        >
          <div className="flex items-center space-x-2 mb-1">
            <Clock className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
            <span
              className={cn(
                "text-xs text-gray-700 dark:text-gray-400",
                isPixel && "pixel-subheading text-[0.68rem] text-slate-600 dark:text-slate-300",
              )}
            >
              Avg Time
            </span>
          </div>
          <div
            className={cn(
              "text-lg font-bold text-emerald-700 dark:text-emerald-400",
              isPixel && "text-[1rem]",
            )}
          >
            {stats.avgResponseTime.toFixed(1)}s
          </div>
        </div>

        <div
          className={cn(
            "rounded-lg border border-gray-200 bg-white/50 p-3 dark:border-cyan-500/20 dark:bg-gray-800/30",
            isPixel && "pixel-tile px-3 py-2",
          )}
        >
          <div className="flex items-center space-x-2 mb-1">
            <Brain className="w-3 h-3 text-purple-600 dark:text-purple-400" />
            <span
              className={cn(
                "text-xs text-gray-700 dark:text-gray-400",
                isPixel && "pixel-subheading text-[0.68rem] text-slate-600 dark:text-slate-300",
              )}
            >
              Mode
            </span>
          </div>
          <div
            className={cn(
              "text-sm font-bold text-purple-700 dark:text-purple-400 capitalize",
              isPixel && "text-[0.85rem]",
            )}
          >
            {stats.mostUsedMode}
          </div>
        </div>

        <div
          className={cn(
            "rounded-lg border border-gray-200 bg-white/50 p-3 dark:border-cyan-500/20 dark:bg-gray-800/30",
            isPixel && "pixel-tile px-3 py-2",
          )}
        >
          <div className="flex items-center space-x-2 mb-1">
            <Zap className="w-3 h-3 text-amber-600 dark:text-amber-400" />
            <span
              className={cn(
                "text-xs text-gray-700 dark:text-gray-400",
                isPixel && "pixel-subheading text-[0.68rem] text-slate-600 dark:text-slate-300",
              )}
            >
              Sessions
            </span>
          </div>
          <div
            className={cn(
              "text-lg font-bold text-amber-700 dark:text-amber-400",
              isPixel && "text-[1rem]",
            )}
          >
            {stats.sessionsToday}
          </div>
        </div>
      </div>

      {/* Mode Usage */}
      <div>
        <h4
          className={cn(
            "mb-3 text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-400",
            isPixel && "pixel-label text-[0.68rem] text-slate-600 dark:text-slate-300",
          )}
        >
          Mode Usage
        </h4>
        <div className="space-y-2">
          {modeUsage.map((item) => (
            <div key={item.mode} className="flex items-center space-x-3">
              <span
                className={cn(
                  "w-16 truncate text-xs text-gray-700 dark:text-gray-400",
                  isPixel && "pixel-subheading text-[0.68rem] text-slate-600 dark:text-slate-300",
                )}
              >
                {item.mode}
              </span>
              <div
                className={cn(
                  "flex-1 h-2 overflow-hidden rounded-full bg-gray-300 dark:bg-gray-800",
                  isPixel && "pixel-meter h-[0.65rem]",
                )}
              >
                <div
                  className={cn(
                    "h-full transition-all duration-1000 ease-out",
                    `bg-gradient-to-r ${item.color}`,
                    isPixel && "pixel-meter-fill",
                  )}
                  style={{ width: `${item.value}%` }}
                />
              </div>
              <span
                className={cn(
                  "w-8 text-right text-xs text-gray-700 dark:text-gray-400",
                  isPixel && "pixel-subheading text-[0.68rem] text-slate-600 dark:text-slate-300",
                )}
              >
                {item.value}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* AI Status */}
      <div>
        <h4
          className={cn(
            "mb-3 text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-400",
            isPixel && "pixel-label text-[0.68rem] text-slate-600 dark:text-slate-300",
          )}
        >
          AI Status
        </h4>
        <div className="space-y-2">
          <div
            className={cn(
              "flex items-center justify-between rounded-lg border border-gray-200 bg-white/50 p-2 dark:border-cyan-500/20 dark:bg-gray-800/30",
              isPixel && "pixel-status-card",
            )}
          >
            <span
              className={cn(
                "text-xs text-gray-800 dark:text-gray-300",
                isPixel && "pixel-subheading text-[0.7rem] text-slate-700 dark:text-slate-200",
              )}
            >
              Neural Network
            </span>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span
                className={cn(
                  "text-xs text-green-700 dark:text-green-400",
                  isPixel && "pixel-subheading text-[0.68rem] text-green-700 dark:text-green-300",
                )}
              >
                Active
              </span>
            </div>
          </div>
          <div
            className={cn(
              "flex items-center justify-between rounded-lg border border-gray-200 bg-white/50 p-2 dark:border-cyan-500/20 dark:bg-gray-800/30",
              isPixel && "pixel-status-card",
            )}
          >
            <span
              className={cn(
                "text-xs text-gray-800 dark:text-gray-300",
                isPixel && "pixel-subheading text-[0.7rem] text-slate-700 dark:text-slate-200",
              )}
            >
              Voice Synthesis
            </span>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse" />
              <span
                className={cn(
                  "text-xs text-cyan-700 dark:text-cyan-400",
                  isPixel && "pixel-subheading text-[0.68rem] text-cyan-700 dark:text-cyan-300",
                )}
              >
                Ready
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
