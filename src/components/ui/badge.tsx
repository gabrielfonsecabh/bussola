import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "bg-destructive text-destructive-foreground focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40 [a&]:hover:bg-destructive/90",
        outline:
          "border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        ghost: "[a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        link: "text-primary underline-offset-4 [a&]:hover:underline",

        // Os três estados que o shadcn não traz. Sem eles, o primeiro badge de
        // status recebe uma cor crua do Tailwind e a paleta começa a derivar.
        success: "bg-success text-success-foreground [a&]:hover:bg-success/90",
        warning: "bg-warning text-warning-foreground [a&]:hover:bg-warning/90",
        info: "bg-info text-info-foreground [a&]:hover:bg-info/90",

        // Versões suaves, para tabela densa onde o sólido pesa demais.
        // Cada uma usa o par bg/foreground próprio (medido em AA nos 2 temas).
        "success-subtle": "bg-success-subtle text-success-subtle-foreground",
        "warning-subtle": "bg-warning-subtle text-warning-subtle-foreground",
        "info-subtle": "bg-info-subtle text-info-subtle-foreground",
        "destructive-subtle":
          "bg-destructive-subtle text-destructive-subtle-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
