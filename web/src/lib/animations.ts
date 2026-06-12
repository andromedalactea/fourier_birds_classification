import { animate, createTimeline, stagger } from 'animejs'

export function animateHeroWords(
  selector: string,
  reducedMotion: boolean,
): (() => void) | undefined {
  if (reducedMotion) return undefined

  const animation = animate(selector, {
    opacity: [0, 1],
    translateY: [24, 0],
    delay: stagger(80),
    duration: 700,
    ease: 'outCubic',
  })

  return () => animation.pause()
}

export function animateResultsCards(
  selector: string,
  reducedMotion: boolean,
): (() => void) | undefined {
  if (reducedMotion) return undefined

  const animation = animate(selector, {
    opacity: [0, 1],
    translateY: [20, 0],
    delay: stagger(80),
    duration: 500,
    ease: 'outCubic',
  })

  return () => animation.pause()
}

export function animateProbabilityBar(
  element: HTMLElement,
  widthPercent: number,
  reducedMotion: boolean,
): (() => void) | undefined {
  if (reducedMotion) {
    element.style.width = `${widthPercent}%`
    return undefined
  }

  const animation = animate(element, {
    width: [`0%`, `${widthPercent}%`],
    duration: 600,
    ease: 'outCubic',
  })

  return () => animation.pause()
}

export function startWaveformLoop(
  selector: string,
  reducedMotion: boolean,
): (() => void) | undefined {
  if (reducedMotion) return undefined

  const timeline = createTimeline({ loop: true, defaults: { ease: 'inOutSine' } })
    .add(selector, {
      scaleY: stagger([0.3, 1], { from: 'center', grid: [1, 24] }),
      duration: 400,
    })
    .add(selector, {
      scaleY: stagger([1, 0.3], { from: 'center', grid: [1, 24] }),
      duration: 400,
    })

  timeline.play()
  return () => timeline.pause()
}

export function animatePanelOpen(
  panel: HTMLElement,
  reducedMotion: boolean,
): (() => void) | undefined {
  if (reducedMotion) return undefined

  const animation = animate(panel, {
    translateX: ['100%', '0%'],
    opacity: [0, 1],
    duration: 350,
    ease: 'outCubic',
  })

  return () => animation.pause()
}

export function animateSpeciesItems(
  selector: string,
  reducedMotion: boolean,
): (() => void) | undefined {
  if (reducedMotion) return undefined

  const animation = animate(selector, {
    opacity: [0, 1],
    translateY: [12, 0],
    delay: stagger(30, { from: 'first' }),
    duration: 400,
    ease: 'outCubic',
  })

  return () => animation.pause()
}

export function animateModalOpen(
  modal: HTMLElement,
  reducedMotion: boolean,
): (() => void) | undefined {
  if (reducedMotion) return undefined

  const animation = animate(modal, {
    opacity: [0, 1],
    scale: [0.96, 1],
    translateY: [16, 0],
    duration: 320,
    ease: 'outCubic',
  })

  return () => animation.pause()
}

export function animateSaveSuccess(
  element: HTMLElement,
  reducedMotion: boolean,
): (() => void) | undefined {
  if (reducedMotion) {
    element.style.opacity = '1'
    return undefined
  }

  const animation = animate(element, {
    opacity: [0, 1],
    scale: [0.6, 1],
    duration: 450,
    ease: 'outBack',
  })

  return () => animation.pause()
}

export function startRecordingRipple(
  selector: string,
  reducedMotion: boolean,
): (() => void) | undefined {
  if (reducedMotion) return undefined

  const timeline = createTimeline({ loop: true, defaults: { ease: 'outQuad' } })
    .add(selector, {
      scale: [0.8, 1.6],
      opacity: [0.6, 0],
      duration: 1500,
      delay: stagger(500),
    })

  timeline.play()
  return () => timeline.pause()
}
