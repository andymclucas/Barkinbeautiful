import { Toaster as Sonner, type ToasterProps } from "sonner";

import { useTheme } from "@/contexts/ThemeContext";

/**
 * Toasts, themed from our own context.
 *
 * This used to pull useTheme from `next-themes`, which the app does not use -
 * so it always read "system" and toasts stayed light while the rest of the
 * platform went dark. Passing the RESOLVED theme (never "system") means
 * sonner does not have to guess either.
 *
 * The --normal-* variables already point at our popover tokens, so the
 * colours follow the .dark block without anything further here.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      theme={resolvedTheme}
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
