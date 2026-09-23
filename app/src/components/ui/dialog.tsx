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

// z-[1210] — matches the --z-dialog token in styles.css (kept as a literal: dialog.tsx is in
// the BOOT chunk, under a hard byte ceiling, test-sigma-shell.mjs). A dialog can open from
// INSIDE a sheet (⚙️ הגדרות and ✉️ הודעה from ⋯ עוד), and sheets are z-[1200] since 22.9
// (sheet.tsx). Select popovers sit at 1220. Still under the JS overlays (100001).
const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-[1210] bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

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
        "fixed left-[50%] top-[50%] z-[1210] grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
        // Same reserved-strip fix as sheet.tsx: the close button gets its own top band instead
        // of floating over whatever a caller's own DialogHeader/DialogTitle puts at the top.
        !hideClose && "pt-14",
        className
      )}
      {...props}
    >
      {children}
      {!hideClose && (
        <DialogPrimitive.Close
          className="absolute flex h-12 w-12 items-center justify-center rounded-full opacity-70 hover:bg-secondary hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring disabled:pointer-events-none"
          style={{ insetInlineEnd: 8, insetBlockStart: 8 }}
        >
          <X className="h-5 w-5" />
          <span className="sr-only">סגירה</span>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-start",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

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
