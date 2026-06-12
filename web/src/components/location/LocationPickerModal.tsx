import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Check, Crosshair, MapPin, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { animateModalOpen, animateSaveSuccess } from '../../lib/animations'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { Button } from '../ui/Button'

const DEFAULT_CENTER: L.LatLngExpression = [4.5709, -74.2973]
const DEFAULT_ZOOM = 6

interface LocationPickerModalProps {
  open: boolean
  onClose: () => void
  speciesName?: string
}

type SaveState = 'idle' | 'saving' | 'saved'

function formatCoordinate(value: number, positiveSuffix: string, negativeSuffix: string): string {
  const suffix = value >= 0 ? positiveSuffix : negativeSuffix
  return `${Math.abs(value).toFixed(5)}° ${suffix}`
}

export function LocationPickerModal({ open, onClose, speciesName }: LocationPickerModalProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const successRef = useRef<HTMLDivElement>(null)

  const [selected, setSelected] = useState<{ lat: number; lng: number } | null>(null)
  const [geoLoading, setGeoLoading] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const reducedMotion = useReducedMotion()

  const placeMarker = useCallback((lat: number, lng: number) => {
    const map = mapRef.current
    if (!map) return

    const icon = L.divIcon({
      className: 'bird-location-marker',
      html: '<div class="bird-location-marker-pin" aria-hidden="true"></div>',
      iconSize: [36, 36],
      iconAnchor: [18, 36],
    })

    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng])
    } else {
      markerRef.current = L.marker([lat, lng], { icon }).addTo(map)
    }

    map.panTo([lat, lng], { animate: !reducedMotion })
  }, [reducedMotion])

  useEffect(() => {
    if (!open || !mapContainerRef.current) return undefined

    const map = L.map(mapContainerRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: false,
    })

    L.control.zoom({ position: 'bottomright' }).addTo(map)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map)

    map.on('click', (event) => {
      setSelected({ lat: event.latlng.lat, lng: event.latlng.lng })
      setGeoError(null)
    })

    mapRef.current = map

    const resizeTimer = window.setTimeout(() => map.invalidateSize(), 350)

    return () => {
      window.clearTimeout(resizeTimer)
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
  }, [open])

  useEffect(() => {
    if (!selected) return
    placeMarker(selected.lat, selected.lng)
  }, [selected, placeMarker])

  useEffect(() => {
    if (!open) {
      setSelected(null)
      setGeoError(null)
      setGeoLoading(false)
      setSaveState('idle')
    }
  }, [open])

  useEffect(() => {
    if (!open) return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && saveState !== 'saving') onClose()
    }
    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose, saveState])

  useEffect(() => {
    if (!open || !modalRef.current) return undefined
    const cleanup = animateModalOpen(modalRef.current, reducedMotion)
    return () => cleanup?.()
  }, [open, reducedMotion])

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setGeoError('Tu navegador no soporta geolocalización.')
      return
    }

    setGeoLoading(true)
    setGeoError(null)

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude
        const lng = position.coords.longitude
        setSelected({ lat, lng })
        mapRef.current?.setView([lat, lng], 14)
        setGeoLoading(false)
      },
      (error) => {
        setGeoLoading(false)
        setGeoError(
          error.code === error.PERMISSION_DENIED
            ? 'Permiso de ubicación denegado. Toca el mapa para elegir un punto.'
            : 'No se pudo obtener tu ubicación. Toca el mapa para elegir un punto.',
        )
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  const handleSave = () => {
    if (!selected || saveState !== 'idle') return

    setSaveState('saving')

    const saveDelay = reducedMotion ? 300 : 700
    const closeDelay = reducedMotion ? 800 : 1400

    window.setTimeout(() => {
      setSaveState('saved')
      if (successRef.current) {
        animateSaveSuccess(successRef.current, reducedMotion)
      }
      window.setTimeout(onClose, closeDelay)
    }, saveDelay)
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="location-picker-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-pointer bg-foreground/25 backdrop-blur-sm transition-opacity"
        onClick={saveState === 'idle' ? onClose : undefined}
        aria-label="Cerrar selector de ubicación"
        disabled={saveState !== 'idle'}
      />

      <div
        ref={modalRef}
        className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-border bg-background shadow-2xl sm:rounded-3xl"
      >
        <header className="shrink-0 border-b border-border bg-card/90 px-5 py-4 backdrop-blur-md">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-primary">
                Avistamiento
              </p>
              <h2
                id="location-picker-title"
                className="font-heading text-xl font-bold text-foreground sm:text-2xl"
              >
                ¿Dónde lo escuchaste?
              </h2>
              {speciesName ? (
                <p className="mt-1 text-sm text-foreground/60">
                  Marca el lugar del avistamiento de{' '}
                  <span className="font-medium italic text-foreground">{speciesName}</span>
                </p>
              ) : (
                <p className="mt-1 text-sm text-foreground/60">
                  Toca el mapa o usa tu ubicación actual
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={saveState === 'saving'}
              className="cursor-pointer rounded-xl border border-border bg-card p-2.5 text-foreground/60 transition-colors duration-200 hover:border-primary/30 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Cerrar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="relative min-h-[240px] flex-1">
          <div ref={mapContainerRef} className="location-map h-[min(52vh,360px)] w-full" />

          {!selected ? (
            <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center px-4">
              <span className="rounded-full border border-border bg-card/95 px-3 py-1.5 text-xs font-medium text-foreground/70 shadow-sm backdrop-blur-sm">
                Toca el mapa para colocar el pin
              </span>
            </div>
          ) : null}

          <div className="absolute bottom-3 left-3 right-14">
            <button
              type="button"
              onClick={handleUseMyLocation}
              disabled={geoLoading || saveState !== 'idle'}
              className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-border bg-card/95 px-3.5 py-2.5 text-sm font-medium text-foreground shadow-md backdrop-blur-sm transition-colors duration-200 hover:border-primary/40 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {geoLoading ? (
                <span
                  className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary/20 border-t-primary"
                  aria-hidden="true"
                />
              ) : (
                <Crosshair className="h-4 w-4 text-primary" aria-hidden="true" />
              )}
              Usar mi ubicación
            </button>
          </div>

          {saveState === 'saved' ? (
            <div
              ref={successRef}
              className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm"
              aria-live="polite"
            >
              <div className="flex flex-col items-center gap-3 rounded-3xl border border-primary/20 bg-card px-8 py-7 shadow-xl">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-on-primary shadow-lg shadow-primary/30">
                  <Check className="h-8 w-8" strokeWidth={2.5} aria-hidden="true" />
                </div>
                <div className="text-center">
                  <p className="font-heading text-lg font-semibold text-foreground">
                    ¡Ubicación guardada!
                  </p>
                  <p className="mt-1 text-sm text-foreground/60">
                    Vista previa — no se almacena en el servidor
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <footer className="shrink-0 space-y-3 border-t border-border bg-card/80 px-5 py-4 backdrop-blur-md">
          {geoError ? (
            <p className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {geoError}
            </p>
          ) : null}

          <div className="flex items-start gap-2 rounded-2xl border border-border bg-muted/50 px-3.5 py-3">
            <MapPin
              className={`mt-0.5 h-4 w-4 shrink-0 ${selected ? 'text-primary' : 'text-foreground/30'}`}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-foreground/50">
                Coordenadas seleccionadas
              </p>
              {selected ? (
                <p className="mt-0.5 text-sm font-medium text-foreground">
                  {formatCoordinate(selected.lat, 'N', 'S')},{' '}
                  {formatCoordinate(selected.lng, 'E', 'O')}
                </p>
              ) : (
                <p className="mt-0.5 text-sm text-foreground/50">
                  Aún no has elegido un punto en el mapa
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              variant="secondary"
              size="md"
              className="flex-1"
              onClick={onClose}
              disabled={saveState === 'saving'}
            >
              Cancelar
            </Button>
            <Button
              variant="accent"
              size="md"
              className="flex-1"
              onClick={handleSave}
              disabled={!selected || saveState !== 'idle'}
              isLoading={saveState === 'saving'}
            >
              <MapPin className="h-4 w-4" aria-hidden="true" />
              Guardar ubicación
            </Button>
          </div>
        </footer>
      </div>
    </div>
  )
}
