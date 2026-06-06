import { FileAudio, Upload } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'

const ACCEPTED_TYPES = 'audio/*,.mp3,.wav,.m4a,.ogg,.webm,.flac'

interface FileDropzoneProps {
  onFileSelect: (file: File) => void
  disabled?: boolean
}

export function FileDropzone({ onFileSelect, disabled = false }: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const handleFile = useCallback(
    (file: File | undefined) => {
      if (!file || disabled) return
      onFileSelect(file)
    },
    [disabled, onFileSelect],
  )

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      setIsDragging(false)
      handleFile(event.dataTransfer.files[0])
    },
    [handleFile],
  )

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setIsDragging(true)
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={onDrop}
      className={`relative flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors duration-200 ${
        isDragging
          ? 'border-primary bg-primary/5'
          : 'border-border bg-muted/50 hover:border-primary/40 hover:bg-muted'
      } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
      onClick={() => !disabled && inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          inputRef.current?.click()
        }
      }}
      aria-label="Zona para subir archivo de audio"
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        className="sr-only"
        disabled={disabled}
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        {isDragging ? (
          <FileAudio className="h-7 w-7" aria-hidden="true" />
        ) : (
          <Upload className="h-7 w-7" aria-hidden="true" />
        )}
      </div>
      <p className="font-medium text-foreground">
        Arrastra tu audio aquí o toca para seleccionar
      </p>
      <p className="mt-2 text-sm text-foreground/60">
        MP3, WAV, M4A, OGG, WebM · Máximo 15 MB
      </p>
    </div>
  )
}
