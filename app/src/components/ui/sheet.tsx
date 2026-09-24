import * as React from "react"
import * as SheetPrimitive from "@radix-ui/react-dialog"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const Sheet = SheetPrimitive.Root

const SheetTrigger = SheetPrimitive.Trigger

const SheetClose = SheetPrimitive.Close

// Portalled layers render at <body>, outside every island root — but Tailwind's
// `important: '.sigma-root'` only emits utilities under that selector. Wrap the portal
// content so tokens, RTL direction and the Assistant face still apply.
const SheetPortal = ({ children, ...props }: React.ComponentProps<typeof SheetPrimitive.Portal>) => (
  <SheetPrimitive.Portal {...props}>
    <div className="sigma-root" data-sigma-portal>{children}</div>
  </SheetPrimitive.Portal>
)

// z-[1200], not the shadcn default z-50: every sheet here can be opened from INSIDE a legacy
// overlay (.modal-backdrop is z-index:1000, the EMS task modal 1160). At z-50 the sheet opened
// *underneath* them — it looked like the button "did nothing", while the sheet was live and
// tappable the moment the legacy modal closed. That is how two kibbutzim got archived by
// accident on 22.9. Still below the JS-built overlays (100001) and the toaster (100002).
// The number is the literal --s-z-sheet value (styles.css/tokens.css); read from the var()
// itself, not hardcoded — sign-off P1-6.
const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    className={cn(
      // Scrim 0 → 0.48 (design-review.md §2 Sheet), not bg-black/80 — sign-off P1-6.
      // s-anim-sheet: animation-duration/timing-function per data-state (styles.css) — a plain
      // CSS class instead of a Tailwind arbitrary-value chain, since this file is in the BOOT
      // chunk under a byte ceiling and styles.css doesn't count against it.
      "s-anim-sheet fixed inset-0 z-[var(--s-z-sheet)] bg-black/[.48] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
    ref={ref}
  />
))
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName

const sheetVariants = cva(
  "s-anim-sheet fixed z-[var(--s-z-sheet)] gap-4 bg-background p-6 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        // Top radius from --s-radius-sheet (24px — was a hardcoded 26px, sign-off P1-6) + a
        // grab handle (the mockup's `.sheet` / `.sheet .grab`): the handle is what tells a
        // thumb this panel is draggable-looking and dismissible.
        bottom:
          "inset-x-0 bottom-0 rounded-t-[var(--s-radius-sheet)] border-t pt-2.5 before:absolute before:inset-x-0 before:top-2.5 before:mx-auto before:h-1 before:w-10 before:rounded before:bg-border before:content-[''] data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        // rtl-ok (both lines): `side="left"` / `side="right"` MEAN a physical side — that is
        // what the caller is asking for. This app only ever uses `side="bottom"` (the ⋯ sheet
        // and the kibbutz sheet), so neither variant is on screen; they are kept so the
        // component stays the unmodified shadcn one.
        left: "inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
        right:   // rtl-ok — see above
          "inset-y-0 right-0 h-full w-3/4  border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
      },
    },
    defaultVariants: {
      side: "right",
    },
  }
)

/**
 * §7p / F13: a BLOCKING gate (the 401 re-login sheet) must not offer a way out. Hiding the X is
 * half of it; the caller also preventDefaults `onEscapeKeyDown`/`onInteractOutside`. Shared via
 * context (not a prop threaded through every caller) because `SheetHeader` is the thing that
 * now RENDERS the close button (sign-off P1-5 — it's a grid cell next to the title, not an
 * absolutely-positioned overlay), and touching all ~24 callers to pass it down is exactly the
 * "beyond what the primitive change forces" this pass avoids.
 */
const SheetHideCloseContext = React.createContext(false)

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {
  hideClose?: boolean
}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(({ side = "right", className, children, hideClose = false, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <SheetPrimitive.Content
      ref={ref}
      className={cn(sheetVariants({ side }), hideClose && "before:hidden", className)}
      {...props}
    >
      <SheetHideCloseContext.Provider value={hideClose}>{children}</SheetHideCloseContext.Provider>
    </SheetPrimitive.Content>
  </SheetPortal>
))
SheetContent.displayName = SheetPrimitive.Content.displayName

// Grid `1fr auto`: [title, 2-line clamp | Close, 48px] — sign-off P1-5. Was an absolutely
// positioned ✕ over a reserved 56px strip; now the close button is an ordinary grid cell next
// to the title, so nothing overlaps and no extra row is spent on it.
const SheetHeader = ({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => {
  const hideClose = React.useContext(SheetHideCloseContext)
  return (
    <div className={cn("grid grid-cols-[1fr_auto] items-start gap-2", className)} {...props}>
      <div className="flex min-w-0 flex-col gap-1 text-start">{children}</div>
      {!hideClose && (
        <SheetPrimitive.Close className="s-close-btn">
          <X className="h-5 w-5" />
          <span className="sr-only">סגירה</span>
        </SheetPrimitive.Close>
      )}
    </div>
  )
}

const SheetFooter = ({
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
SheetFooter.displayName = "SheetFooter"

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    // title-sm (spec §2 Type: 18/700) — text-lg is already 18px, so this stays plain utilities
    // (sheet.tsx is in the BOOT chunk, under a byte ceiling; no need for the var()-length form).
    className={cn("line-clamp-2 text-lg font-bold text-foreground", className)}
    {...props}
  />
))
SheetTitle.displayName = SheetPrimitive.Title.displayName

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
SheetDescription.displayName = SheetPrimitive.Description.displayName

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
