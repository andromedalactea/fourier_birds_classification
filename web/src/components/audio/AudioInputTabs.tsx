import { Mic, Upload } from 'lucide-react'
import { useState } from 'react'
import { FileDropzone } from './FileDropzone'
import { RecorderPanel } from './RecorderPanel'

type TabId = 'upload' | 'record'

interface AudioInputTabsProps {
  isRecording: boolean
  recordDuration: number
  audioLevel: number
  recorderError: string | null
  disabled?: boolean
  onFileSelect: (file: File) => void
  onStartRecording: () => void
  onStopRecording: () => void
}

export function AudioInputTabs({
  isRecording,
  recordDuration,
  audioLevel,
  recorderError,
  disabled = false,
  onFileSelect,
  onStartRecording,
  onStopRecording,
}: AudioInputTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('upload')

  const tabs: { id: TabId; label: string; icon: typeof Upload }[] = [
    { id: 'upload', label: 'Subir audio', icon: Upload },
    { id: 'record', label: 'Grabar', icon: Mic },
  ]

  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-6">
      <div
        className="mb-6 flex rounded-xl bg-muted p-1"
        role="tablist"
        aria-label="Método de captura de audio"
      >
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            onClick={() => !isRecording && setActiveTab(id)}
            disabled={disabled || isRecording}
            className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-colors duration-200 ${
              activeTab === id
                ? 'bg-card text-primary shadow-sm'
                : 'text-foreground/60 hover:text-foreground'
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {activeTab === 'upload' ? (
          <FileDropzone onFileSelect={onFileSelect} disabled={disabled || isRecording} />
        ) : (
          <RecorderPanel
            isRecording={isRecording}
            duration={recordDuration}
            audioLevel={audioLevel}
            error={recorderError}
            disabled={disabled}
            onStart={onStartRecording}
            onStop={onStopRecording}
          />
        )}
      </div>
    </div>
  )
}
