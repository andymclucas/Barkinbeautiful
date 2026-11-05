import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold tracking-[-0.01em] transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-ring/40 focus-visible:ring-[3px] focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        /* The fills live in index.css under "Buttons", because a flat
           background-colour cannot carry the highlight and the depth
           these have — and because a tenant's brand colour has to flow
           through them rather than being baked in here. */
        default: "btn-solid text-primary-foreground",
        destructive: "btn-solid btn-solid-destructive text-white focus-visible:ring-destructive/30",
        outline:
          "border border-border/80 bg-card/60 backdrop-blur-[2px] hover:border-primary/35 hover:bg-accent/60 dark:bg-input/20 dark:hover:bg-input/40",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/75",
        ghost:
          "hover:bg-accent/70 dark:hover:bg-accent/40",
        link: "text-primary underline-offset-4 hover:underline font-medium",
      },
      size: {
        /* A pill needs more side room than a rectangle before the text
           stops touching the curve. */
        default: "h-9 px-5 py-2 has-[>svg]:px-4",
        sm: "h-8 gap-1.5 px-4 has-[>svg]:px-3",
        lg: "h-11 px-7 text-[0.9375rem] has-[>svg]:px-6",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
