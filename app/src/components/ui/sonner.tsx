import {
  CircleCheck,
  Info,
  LoaderCircle,
  OctagonX,
  TriangleAlert,
} from 'lucide-react';
import { Toaster as Sonner } from 'sonner';
import { currentTheme } from '@/lib/theme';
import { useSigmaEvent } from '@/bridge';
import * as React from 'react';

type ToasterProps = React.ComponentProps<typeof Sonner>;

/** shadcn's Sonner wrapper, wired to OUR theme (lib/theme) instead of next-themes. */
const Toaster = ({ ...props }: ToasterProps) => {
  const [theme, setTheme] = React.useState<'light' | 'dark'>(() => currentTheme());
  useSigmaEvent('theme-changed', () => setTheme(currentTheme()));

  return (
    <Sonner
      theme={theme}
      dir="rtl"
      className="toaster group sigma-root"
      icons={{
        success: <CircleCheck className="h-4 w-4" />,
        info: <Info className="h-4 w-4" />,
        warning: <TriangleAlert className="h-4 w-4" />,
        error: <OctagonX className="h-4 w-4" />,
        loading: <LoaderCircle className="h-4 w-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-foreground group-[.toaster]:text-background group-[.toaster]:border-0 group-[.toaster]:shadow-lg group-[.toaster]:rounded-xl group-[.toaster]:max-w-[358px] group-[.toaster]:font-semibold',
          description: 'group-[.toast]:opacity-80',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
