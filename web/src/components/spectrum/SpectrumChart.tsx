import { useCallback, useId, useMemo, useRef, useState } from 'react'
import type { SpectrumProfile } from '../../types/prediction'

export interface SpectrumSeries {
  id: string
  label: string
  color: string
  profile: SpectrumProfile
}

interface SpectrumChartProps {
  series: SpectrumSeries[]
  /** Peaks are drawn only for these series ids (defaults to all). */
  peaksFor?: string[]
  height?: number
}

const VIEW_W = 640
const PAD_LEFT = 8
const PAD_RIGHT = 8
const PAD_TOP = 26
const PAD_BOTTOM = 24

export function formatHz(freqHz: number): string {
  if (freqHz >= 1000) {
    const khz = freqHz / 1000
    return `${khz >= 10 ? Math.round(khz) : khz.toFixed(1)} kHz`
  }
  return `${Math.round(freqHz)} Hz`
}

function buildPath(
  values: number[],
  toX: (i: number) => number,
  toY: (v: number) => number,
): string {
  return values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`)
    .join(' ')
}

export function SpectrumChart({ series, peaksFor, height = 190 }: SpectrumChartProps) {
  const gradientBase = useId().replace(/:/g, '')
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoverBin, setHoverBin] = useState<number | null>(null)

  const freqMax = series[0]?.profile.freq_max_hz ?? 11025
  const nBins = series[0]?.profile.n_bins ?? 128

  const plotW = VIEW_W - PAD_LEFT - PAD_RIGHT
  const plotH = height - PAD_TOP - PAD_BOTTOM
  const toX = useCallback(
    (i: number) => PAD_LEFT + ((i + 0.5) / nBins) * plotW,
    [nBins, plotW],
  )
  const toY = useCallback(
    (v: number) => PAD_TOP + (1 - v) * plotH,
    [plotH],
  )
  const freqToX = useCallback(
    (f: number) => PAD_LEFT + (f / freqMax) * plotW,
    [freqMax, plotW],
  )

  const ticks = useMemo(() => {
    const step = 2000
    const result: number[] = []
    for (let f = 0; f <= freqMax; f += step) result.push(f)
    return result
  }, [freqMax])

  const peakSeriesIds = peaksFor ?? series.map((s) => s.id)

  const handleMove = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current
      if (!svg) return
      const rect = svg.getBoundingClientRect()
      const xRatio = (event.clientX - rect.left) / rect.width
      const x = xRatio * VIEW_W
      const bin = Math.round(((x - PAD_LEFT) / plotW) * nBins - 0.5)
      setHoverBin(bin >= 0 && bin < nBins ? bin : null)
    },
    [nBins, plotW],
  )

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VIEW_W} ${height}`}
      className="w-full select-none"
      role="img"
      aria-label={`Espectro de frecuencias: ${series.map((s) => s.label).join(' vs ')}`}
      onMouseMove={handleMove}
      onMouseLeave={() => setHoverBin(null)}
    >
      <defs>
        {series.map((s, idx) => (
          <linearGradient
            key={s.id}
            id={`${gradientBase}-${idx}`}
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop offset="0%" stopColor={s.color} stopOpacity={series.length > 1 ? 0.28 : 0.4} />
            <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
          </linearGradient>
        ))}
      </defs>

      {/* Horizontal grid */}
      {[0.25, 0.5, 0.75, 1].map((v) => (
        <line
          key={v}
          x1={PAD_LEFT}
          x2={VIEW_W - PAD_RIGHT}
          y1={toY(v)}
          y2={toY(v)}
          stroke="#0f172a"
          strokeOpacity={0.06}
          strokeWidth={1}
        />
      ))}

      {/* X axis ticks */}
      <line
        x1={PAD_LEFT}
        x2={VIEW_W - PAD_RIGHT}
        y1={toY(0)}
        y2={toY(0)}
        stroke="#0f172a"
        strokeOpacity={0.18}
        strokeWidth={1}
      />
      {ticks.map((f) => (
        <g key={f}>
          <line
            x1={freqToX(f)}
            x2={freqToX(f)}
            y1={toY(0)}
            y2={toY(0) + 4}
            stroke="#0f172a"
            strokeOpacity={0.3}
            strokeWidth={1}
          />
          <text
            x={freqToX(f)}
            y={height - 6}
            textAnchor="middle"
            fontSize={10}
            fill="#0f172a"
            fillOpacity={0.5}
            fontFamily="inherit"
          >
            {f === 0 ? '0' : `${f / 1000}k`}
          </text>
        </g>
      ))}
      <text
        x={VIEW_W - PAD_RIGHT}
        y={height - 6}
        textAnchor="end"
        fontSize={10}
        fill="#0f172a"
        fillOpacity={0.5}
        fontFamily="inherit"
      >
        Hz
      </text>

      {/* Series: area + line */}
      {series.map((s, idx) => {
        const line = buildPath(s.profile.spectrum, toX, toY)
        const area = `${line} L${toX(s.profile.spectrum.length - 1).toFixed(1)},${toY(0)} L${toX(0).toFixed(1)},${toY(0)} Z`
        return (
          <g key={s.id}>
            <path d={area} fill={`url(#${gradientBase}-${idx})`} />
            <path
              d={line}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </g>
        )
      })}

      {/* Peak markers */}
      {series
        .filter((s) => peakSeriesIds.includes(s.id))
        .map((s) => {
          const topPeaks = [...s.profile.peaks]
            .sort((a, b) => b.magnitude - a.magnitude)
            .slice(0, 3)
          return topPeaks.map((peak) => {
            const x = freqToX(peak.freq_hz)
            const y = toY(peak.magnitude)
            return (
              <g key={`${s.id}-${peak.freq_hz}`}>
                <line
                  x1={x}
                  x2={x}
                  y1={y}
                  y2={toY(0)}
                  stroke={s.color}
                  strokeOpacity={0.35}
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
                <circle cx={x} cy={y} r={3.5} fill={s.color} stroke="#fff" strokeWidth={1.5} />
                <text
                  x={Math.min(Math.max(x, PAD_LEFT + 24), VIEW_W - PAD_RIGHT - 24)}
                  y={Math.max(y - 8, 11)}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={600}
                  fill={s.color}
                  fontFamily="inherit"
                >
                  {formatHz(peak.freq_hz)}
                </text>
              </g>
            )
          })
        })}

      {/* Hover crosshair */}
      {hoverBin !== null && (
        <g pointerEvents="none">
          <line
            x1={toX(hoverBin)}
            x2={toX(hoverBin)}
            y1={PAD_TOP}
            y2={toY(0)}
            stroke="#0f172a"
            strokeOpacity={0.25}
            strokeWidth={1}
          />
          {series.map((s) => (
            <circle
              key={s.id}
              cx={toX(hoverBin)}
              cy={toY(s.profile.spectrum[hoverBin] ?? 0)}
              r={3}
              fill="#fff"
              stroke={s.color}
              strokeWidth={2}
            />
          ))}
          <text
            x={Math.min(Math.max(toX(hoverBin), PAD_LEFT + 28), VIEW_W - PAD_RIGHT - 28)}
            y={toY(0) + 16}
            textAnchor="middle"
            fontSize={10}
            fontWeight={600}
            fill="#0f172a"
            fillOpacity={0.75}
            fontFamily="inherit"
          >
            {formatHz(((hoverBin + 0.5) / nBins) * freqMax)}
          </text>
        </g>
      )}
    </svg>
  )
}
