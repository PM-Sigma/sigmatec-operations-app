"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

// Portalled layers render at <body>, outside every island root — but Tailwind's
// `important: '.sigma-root'` only emits utilities under that selector. Wrap the portal
// content so tokens, RTL direction and the Assistant face still apply.
const DialogPortal = ({ children, ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) => (
  <DialogPrimitive.Portal {...props}>
    <div className="sigma-root" data-sigma-portal>{children}</div>
  </DialogPrimitive.Portal>
)

const DialogClose = DialogPrimitive.Close

// z-[1210] — matches the --z-dialog token (kept literal here: this file is in the BOOT chunk,
// under a hard byte ceiling, test-sigma-shell.mjs). A dialog can open from INSIDE a sheet
// (⚙️ הגדרות and ✉️ הודעה from ⋯ עוד), and sheets are z-[1200] since 22.9 (sheet.tsx). Select
// popovers sit at 1220. Still under the JS overlays (100001).
const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      // s-anim-dialog: animation-duration/timing-function per data-state (styles.css) — plain
      // CSS instead of a Tailwind arbitrary-value chain (this file is in the BOOT chunk).
      "s-anim-dialog fixed inset-0 z-[var(--s-z-dialog)] bg-black/[.48] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogHideCloseContext = React.createContext(false)

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { hideClose?: boolean }
>(({ className, children, hideClose = false, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        // rtl-ok: `left-[50%]` + `translate-x-[-50%]` is SYMMETRIC centring — the same result
        // in either direction — and there is no logical-property equivalent for a fixed
        // centred layer. It is not a start/end decision.
        // Opacity + scale(.97) only, NO slide (sign-off P1-6 — the shadcn default's
        // slide-from-corner-while-centering was removed): base in, fast out.
        "s-anim-dialog fixed left-[50%] top-[50%] z-[var(--s-z-dialog)] grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg",
        className
      )}
      {...props}
    >
      <DialogHideCloseContext.Provider value={hideClose}>{children}</DialogHideCloseContext.Provider>
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

// Grid `1fr auto`: [title, 2-line clamp | Close, 48px] — sign-off P1-5, same fix as
// SheetHeader. Was an absolutely positioned ✕ over a reserved 56px strip.
const DialogHeader = ({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => {
  const hideClose = React.useContext(DialogHideCloseContext)
  return (
    <div className={cn("grid grid-cols-[1fr_auto] items-start gap-2", className)} {...props}>
      <div className="flex min-w-0 flex-col gap-1.5 text-start">{children}</div>
      {!hideClose && (
        <DialogPrimitive.Close className="s-close-btn">
          <X className="h-5 w-5" />
          <span className="sr-only">סגירה</span>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("line-clamp-2 text-lg font-bold", className)}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
