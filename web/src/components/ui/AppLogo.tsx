interface AppLogoProps {
  size?: number
  className?: string
}

export function AppLogo({ size = 40, className }: AppLogoProps) {
  return (
    <img
      src="/app-icon.svg"
      alt="Aves Sonoras"
      width={size}
      height={size}
      className={className}
      draggable={false}
    />
  )
}
