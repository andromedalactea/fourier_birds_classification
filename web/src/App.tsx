import { Search } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { AudioInputTabs } from './components/audio/AudioInputTabs'
import { AudioPreview } from './components/audio/AudioPreview'
import { Footer } from './components/layout/Footer'
import { Header } from './components/layout/Header'
import { InstallPrompt } from './components/layout/InstallPrompt'
import { SpeciesCatalog } from './components/species/SpeciesCatalog'
import { HeroSection } from './components/hero/HeroSection'
import { PredictionResults } from './components/results/PredictionResults'
import { Button } from './components/ui/Button'
import { WaveformVisualizer } from './components/visual/WaveformVisualizer'
import { useAudioRecorder } from './hooks/useAudioRecorder'
import { usePredict } from './hooks/usePredict'
import { checkHealth } from './lib/api'

function App() {
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [apiOnline, setApiOnline] = useState<boolean | null>(null)
  const [speciesOpen, setSpeciesOpen] = useState(false)

  const recorder = useAudioRecorder()
  const { result, error, isLoading, predict, reset } = usePredict()

  useEffect(() => {
    checkHealth().then(setApiOnline)
  }, [])

  const handleFileSelect = useCallback((file: File) => {
    reset()
    setAudioFile(file)
  }, [reset])

  const handleStartRecording = useCallback(async () => {
    reset()
    setAudioFile(null)
    await recorder.startRecording()
  }, [recorder, reset])

  const handleStopRecording = useCallback(async () => {
    const file = await recorder.stopRecording()
    if (file) setAudioFile(file)
  }, [recorder])

  const handleAnalyze = useCallback(async () => {
    if (!audioFile) return
    await predict(audioFile)
  }, [audioFile, predict])

  const handleClear = useCallback(() => {
    setAudioFile(null)
    recorder.reset()
    reset()
  }, [recorder, reset])

  const handleNewSearch = useCallback(() => {
    handleClear()
  }, [handleClear])

  const busy = isLoading || recorder.isRecording

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 pb-8">
        <Header onOpenSpecies={() => setSpeciesOpen(true)} />
        <SpeciesCatalog open={speciesOpen} onClose={() => setSpeciesOpen(false)} />
        <InstallPrompt />
        <HeroSection />

        {apiOnline === false ? (
          <div
            className="mx-auto mb-6 max-w-2xl rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-center text-sm text-destructive"
            role="alert"
          >
            No se pudo conectar con el servidor de análisis. Asegúrate de que la API
            esté ejecutándose en el puerto 8000.
          </div>
        ) : null}

        <main className="mx-auto max-w-2xl space-y-6">
          {!result ? (
            <>
              <AudioInputTabs
                isRecording={recorder.isRecording}
                recordDuration={recorder.duration}
                audioLevel={recorder.audioLevel}
                recorderError={recorder.error}
                disabled={isLoading}
                onFileSelect={handleFileSelect}
                onStartRecording={handleStartRecording}
                onStopRecording={handleStopRecording}
              />

              {audioFile ? <AudioPreview file={audioFile} onClear={handleClear} /> : null}

              {isLoading ? (
                <div className="flex flex-col items-center gap-4 py-6">
                  <WaveformVisualizer active />
                  <p className="text-sm text-foreground/70">
                    Analizando firma sonora...
                  </p>
                </div>
              ) : null}

              {error ? (
                <div
                  className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
                  role="alert"
                >
                  {error}
                </div>
              ) : null}

              <div className="flex justify-center pt-2">
                <Button
                  size="lg"
                  onClick={handleAnalyze}
                  disabled={!audioFile || busy}
                  isLoading={isLoading}
                >
                  <Search className="h-5 w-5" aria-hidden="true" />
                  Identificar ave
                </Button>
              </div>
            </>
          ) : (
            <PredictionResults result={result} onNewSearch={handleNewSearch} />
          )}
        </main>

        <Footer />
      </div>
    </div>
  )
}

export default App
