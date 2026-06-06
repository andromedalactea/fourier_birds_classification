import { ArrowUpRight } from 'lucide-react'
import { SITE } from '../../lib/site'
import { GitHubIcon } from '../ui/GitHubIcon'

export function DeveloperCredits() {
  return (
    <div className="mt-8 flex justify-center border-t border-border/40 pt-6">
      <a
        href={SITE.githubUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="group inline-flex cursor-pointer items-center gap-2.5 rounded-full border border-border/60 bg-muted/30 px-4 py-2 text-xs text-foreground/45 transition-all duration-200 hover:border-primary/25 hover:bg-primary/5 hover:text-foreground/70 hover:shadow-sm"
        aria-label={`Ver repositorio ${SITE.repoName} en GitHub`}
      >
        <GitHubIcon className="h-4 w-4 shrink-0 text-foreground/35 transition-colors duration-200 group-hover:text-primary" />
        <span className="font-mono tracking-tight">
          {SITE.githubUser}/{SITE.repoName}
        </span>
        <ArrowUpRight
          className="h-3 w-3 shrink-0 text-foreground/25 transition-all duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary/70"
          aria-hidden="true"
        />
      </a>
    </div>
  )
}
