import { useCallback, useEffect, useRef, useState } from 'react'

interface UseAudioRecorderResult {
  isRecording: boolean
  duration: number
  audioLevel: number
  error: string | null
  startRecording: () => Promise<void>
  stopRecording: () => Promise<File | null>
  reset: () => void
}

function pickMimeType(): string {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ]
  return types.find((type) => MediaRecorder.isTypeSupported(type)) ?? ''
}

export function useAudioRecorder(): UseAudioRecorderResult {
  const [isRecording, setIsRecording] = useState(false)
  const [duration, setDuration] = useState(0)
  const [audioLevel, setAudioLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<number | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const rafRef = useRef<number | null>(null)

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    audioContextRef.current?.close().catch(() => undefined)
    audioContextRef.current = null
    analyserRef.current = null
    mediaRecorderRef.current = null
    chunksRef.current = []
    setAudioLevel(0)
  }, [])

  useEffect(() => () => cleanup(), [cleanup])

  const startRecording = useCallback(async () => {
    setError(null)
    cleanup()

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const audioContext = new AudioContext()
      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      audioContextRef.current = audioContext
      analyserRef.current = analyser

      const data = new Uint8Array(analyser.frequencyBinCount)
      const updateLevel = () => {
        analyser.getByteFrequencyData(data)
        const avg = data.reduce((sum, v) => sum + v, 0) / data.length
        setAudioLevel(avg / 255)
        rafRef.current = requestAnimationFrame(updateLevel)
      }
      updateLevel()

      const mimeType = pickMimeType()
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)

      chunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }

      mediaRecorderRef.current = recorder
      recorder.start(250)
      setIsRecording(true)
      setDuration(0)

      timerRef.current = window.setInterval(() => {
        setDuration((prev) => prev + 1)
      }, 1000)
    } catch {
      setError(
        'No se pudo acceder al micrófono. Verifica los permisos del navegador.',
      )
      cleanup()
    }
  }, [cleanup])

  const stopRecording = useCallback(async (): Promise<File | null> => {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      cleanup()
      setIsRecording(false)
      return null
    }

    return new Promise((resolve) => {
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type: mimeType })
        const ext = mimeType.includes('mp4') ? 'm4a' : mimeType.includes('ogg') ? 'ogg' : 'webm'
        const file = new File([blob], `grabacion-${Date.now()}.${ext}`, { type: mimeType })
        cleanup()
        setIsRecording(false)
        resolve(file)
      }
      recorder.stop()
    })
  }, [cleanup])

  const reset = useCallback(() => {
    cleanup()
    setIsRecording(false)
    setDuration(0)
    setError(null)
  }, [cleanup])

  return {
    isRecording,
    duration,
    audioLevel,
    error,
    startRecording,
    stopRecording,
    reset,
  }
}
