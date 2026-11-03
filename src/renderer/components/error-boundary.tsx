import { Component, type ReactNode } from "react"

import { Button } from "@/components/ui/button"

/**
 * What the window draws when rendering throws. Without it React unmounts the
 * whole tree and the window is left blank, with no way back short of quitting
 * — and the chats underneath are main's, so a reload loses nothing they wrote.
 * A class because React still has no hook for this.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const details = error.stack ?? String(error)
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background p-8 text-foreground">
        <div className="text-base font-medium">Something went wrong</div>
        <p className="max-w-md text-center text-sm text-muted-foreground">
          The window hit an error it could not draw past. Your chats and files
          are saved; reloading picks up where you were.
        </p>
        <pre className="max-h-48 w-full max-w-2xl overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap text-muted-foreground select-text">
          {details}
        </pre>
        <div className="flex gap-2">
          <Button onClick={() => window.location.reload()}>Reload</Button>
          <Button
            variant="outline"
            onClick={() => void navigator.clipboard.writeText(details)}
          >
            Copy details
          </Button>
        </div>
      </div>
    )
  }
}
