import { useEffect } from 'react'
import { animateHeroWords } from '../../lib/animations'
import { useReducedMotion } from '../../hooks/useReducedMotion'

export function HeroSection() {
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    const cleanup = animateHeroWords('.hero-word', reducedMotion)
    return () => cleanup?.()
  }, [reducedMotion])

  return (
    <section className="relative mx-auto max-w-6xl px-4 pt-10 pb-6 text-center">
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden="true"
      >
        <svg
          className="absolute -top-8 left-1/2 h-40 w-[120%] -translate-x-1/2 opacity-20"
          viewBox="0 0 800 120"
          fill="none"
        >
          <path
            d="M0 60 Q100 20 200 60 T400 60 T600 60 T800 60"
            stroke="#15803D"
            strokeWidth="2"
            className="hero-wave-path"
          />
          <path
            d="M0 80 Q150 40 300 80 T600 80 T800 80"
            stroke="#059669"
            strokeWidth="1.5"
            opacity="0.6"
          />
        </svg>
      </div>

      <p className="hero-word mb-3 text-sm font-medium uppercase tracking-widest text-primary">
        Firma sonora
      </p>
      <h1 className="font-heading text-4xl font-bold leading-tight text-foreground sm:text-5xl md:text-6xl">
        <span className="hero-word block">Descubre</span>
        <span className="hero-word block text-primary">qué ave canta</span>
      </h1>
      <p className="hero-word mx-auto mt-5 max-w-2xl text-base leading-relaxed text-foreground/70 sm:text-lg">
        Sube una grabación o usa tu micrófono para identificar aves de la región
        colombiana mediante análisis espectral de su canto.
      </p>
    </section>
  )
}
