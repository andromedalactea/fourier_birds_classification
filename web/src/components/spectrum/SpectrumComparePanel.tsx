import { useMemo, useState } from 'react'
import { AudioWaveform, Bird, Layers, Rows3 } from 'lucide-react'
import type {
  PredictionItem,
  SpectrumComparison,
  SpectrumPeak,
} from '../../types/prediction'
import { SpectrumChart, formatHz } from './SpectrumChart'

interface SpectrumComparePanelProps {
  spectrum: SpectrumComparison
  predictions: PredictionItem[]
}

const AUDIO_COLOR = '#d97706'
const SPECIES_COLOR = '#15803d'
const PEAK_MATCH_TOLERANCE_HZ = 350

function countMatchingPeaks(a: SpectrumPeak[], b: SpectrumPeak[]): number {
  return a.filter((peakA) =>
    b.some((peakB) => Math.abs(peakA.freq_hz - peakB.freq_hz) <= PEAK_MATCH_TOLERANCE_HZ),
  ).length
}

function PeakChips({ peaks, color }: { peaks: SpectrumPeak[]; color: string }) {
  const top = [...peaks].sort((a, b) => b.magnitude - a.magnitude).slice(0, 3)
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-foreground/50">Picos principales:</span>
      {top.map((peak) => (
        <span
          key={peak.freq_hz}
          className="rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums"
          style={{ color, backgroundColor: `${color}14`, border: `1px solid ${color}33` }}
        >
          {formatHz(peak.freq_hz)}
        </span>
      ))}
    </div>
  )
}

export function SpectrumComparePanel({ spectrum, predictions }: SpectrumComparePanelProps) {
  const candidates = useMemo(
    () => predictions.filter((p) => spectrum.species[p.species] != null),
    [predictions, spectrum.species],
  )
  const [selected, setSelected] = useState<string | null>(
    candidates[0]?.species ?? null,
  )
  const [overlay, setOverlay] = useState(false)

  const audioProfile = spectrum.audio
  const selectedPrediction = candidates.find((p) => p.species === selected) ?? null
  const speciesProfile = selected ? spectrum.species[selected] : null

  if (!audioProfile && !speciesProfile) return null

  const matchingPeaks =
    audioProfile && speciesProfile
      ? countMatchingPeaks(speciesProfile.peaks, audioProfile.peaks)
      : 0

  const audioSeries = audioProfile
    ? { id: 'audio', label: 'Tu grabación', color: AUDIO_COLOR, profile: audioProfile }
    : null
  const speciesSeries =
    speciesProfile && selectedPrediction
      ? {
          id: 'species',
          label: selectedPrediction.display_name,
          color: SPECIES_COLOR,
          profile: speciesProfile,
        }
      : null

  return (
    <section
      className="result-card rounded-2xl border border-border bg-card p-4 sm:p-6"
      aria-label="Comparación de espectros de Fourier"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-primary">
            <AudioWaveform className="h-5 w-5" aria-hidden="true" />
            <h3 className="font-heading text-lg font-semibold text-foreground">
              Huella de Fourier
            </h3>
          </div>
          <p className="mt-1 text-sm text-foreground/60">
            Compara las frecuencias dominantes de tu audio con la firma sonora de cada
            candidato.
          </p>
        </div>

        {audioSeries && speciesSeries ? (
          <div
            className="inline-flex shrink-0 rounded-full border border-border bg-muted p-0.5"
            role="group"
            aria-label="Modo de visualización"
          >
            <button
              type="button"
              onClick={() => setOverlay(false)}
              aria-pressed={!overlay}
              className={`flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-200 ${
                !overlay
                  ? 'bg-card text-primary shadow-sm'
                  : 'text-foreground/55 hover:text-foreground/80'
              }`}
            >
              <Rows3 className="h-3.5 w-3.5" aria-hidden="true" />
              Comparar
            </button>
            <button
              type="button"
              onClick={() => setOverlay(true)}
              aria-pressed={overlay}
              className={`flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-200 ${
                overlay
                  ? 'bg-card text-primary shadow-sm'
                  : 'text-foreground/55 hover:text-foreground/80'
              }`}
            >
              <Layers className="h-3.5 w-3.5" aria-hidden="true" />
              Superponer
            </button>
          </div>
        ) : null}
      </div>

      {candidates.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Especie a comparar">
          {candidates.map((p) => {
            const isActive = p.species === selected
            return (
              <button
                key={p.species}
                type="button"
                onClick={() => setSelected(p.species)}
                aria-pressed={isActive}
                className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-200 ${
                  isActive
                    ? 'border-primary bg-primary text-on-primary'
                    : 'border-border bg-card text-foreground/70 hover:border-primary/40 hover:text-foreground'
                }`}
              >
                <span className="italic">{p.display_name}</span>
                <span className={`ml-1.5 tabular-nums ${isActive ? 'opacity-80' : 'opacity-50'}`}>
                  {Math.round(p.probability * 100)}%
                </span>
              </button>
            )
          })}
        </div>
      ) : null}

      <div className="mt-4 space-y-4">
        {overlay && audioSeries && speciesSeries ? (
          <div className="rounded-xl border border-border bg-background/60 p-3 sm:p-4">
            <div className="mb-1 flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: AUDIO_COLOR }}>
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: AUDIO_COLOR }} />
                Tu grabación
              </span>
              <span className="flex items-center gap-1.5 text-xs font-semibold italic" style={{ color: SPECIES_COLOR }}>
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: SPECIES_COLOR }} />
                {speciesSeries.label}
              </span>
              <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary tabular-nums">
                {matchingPeaks} {matchingPeaks === 1 ? 'pico coincide' : 'picos coinciden'}
              </span>
            </div>
            <SpectrumChart series={[speciesSeries, audioSeries]} height={210} />
          </div>
        ) : (
          <>
            {audioSeries ? (
              <div className="rounded-xl border border-border bg-background/60 p-3 sm:p-4">
                <div className="mb-1 flex items-center gap-2">
                  <AudioWaveform className="h-4 w-4" style={{ color: AUDIO_COLOR }} aria-hidden="true" />
                  <h4 className="text-sm font-semibold text-foreground">Tu grabación</h4>
                </div>
                <SpectrumChart series={[audioSeries]} height={170} />
                <PeakChips peaks={audioSeries.profile.peaks} color={AUDIO_COLOR} />
              </div>
            ) : null}

            {speciesSeries ? (
              <div className="rounded-xl border border-border bg-background/60 p-3 sm:p-4">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Bird className="h-4 w-4" style={{ color: SPECIES_COLOR }} aria-hidden="true" />
                  <h4 className="text-sm font-semibold italic text-foreground">
                    {speciesSeries.label}
                  </h4>
                  {audioSeries ? (
                    <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary tabular-nums">
                      {matchingPeaks} {matchingPeaks === 1 ? 'pico coincide' : 'picos coinciden'}
                    </span>
                  ) : null}
                </div>
                <SpectrumChart series={[speciesSeries]} height={170} />
                <PeakChips peaks={speciesSeries.profile.peaks} color={SPECIES_COLOR} />
              </div>
            ) : null}
          </>
        )}
      </div>

      <p className="mt-3 text-xs text-foreground/45">
        Espectro promedio normalizado (transformada de Fourier, 0–
        {Math.round((audioProfile ?? speciesProfile)!.freq_max_hz / 1000)} kHz). La firma de
        cada especie se calcula con las grabaciones de Xeno-Canto usadas en el entrenamiento.
      </p>
    </section>
  )
}
