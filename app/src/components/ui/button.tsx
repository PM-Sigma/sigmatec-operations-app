import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  /**
   * Pattern 4 of `docs/ux-loading-patterns.md` (fix round 3, F10/F11): the button IS the
   * pending state. `loading` disables it and prepends a spinner **without touching the
   * label** — swapping the label for a bare spinner drops the accessible name and makes the
   * state unassertable in Playwright. `asChild` buttons keep the plain shadcn behaviour.
   */
  loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={asChild ? disabled : disabled || loading}
        data-loading={loading ? "true" : undefined}
        aria-busy={loading || undefined}
        {...props}
      >
        {asChild ? children : (
          <>
            {/* A CSS ring, not a lucide icon: this component is in the BOOT chunk, and the
                shell contract (test-sigma-shell.mjs) holds it under a hard size ceiling —
                an icon import for a spinner is not worth the bytes. `.animate-spin` is what
                docs/ux-loading-patterns.md and the Playwright helper both look for. */}
            {loading && (
              <span
                aria-hidden
                data-spinner
                className="size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
              />
            )}
            {children}
          </>
        )}
      </Comp>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
