import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "./cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "link" | "danger";
type ButtonSize = "sm" | "md";

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "disabled"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  leading?: ReactNode;
  badge?: ReactNode;
};

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-accent-ink hover:bg-accent-hover disabled:hover:bg-accent",
  secondary:
    "border border-border bg-surface text-ink hover:bg-surface-hover",
  ghost: "text-muted hover:text-ink hover:bg-surface-hover",
  link: "h-auto px-0 py-0 text-muted underline-offset-[3px] hover:text-ink hover:underline",
  danger: "text-muted underline-offset-[3px] hover:text-danger hover:underline"
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 rounded-md px-2.5 text-[12px]",
  md: "h-10 rounded-lg px-3 text-[14px]"
};

export function Button({
  variant = "secondary",
  size = "md",
  type = "button",
  loading = false,
  disabled = false,
  fullWidth = false,
  leading,
  badge,
  className,
  children,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <button
      {...props}
      type={type}
      data-press
      disabled={isDisabled}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-medium outline-none transition-[background-color,color,border-color,transform,opacity] duration-150 focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-60",
        SIZES[size],
        VARIANTS[variant],
        fullWidth && "w-full",
        variant === "link" || variant === "danger" ? "" : "active:scale-[0.98]",
        className
      )}
      style={variant === "primary" ? { boxShadow: "var(--shadow-button)" } : undefined}
    >
      {leading}
      <span className={cn("min-w-0", fullWidth && "flex-1 text-center")}>
        {children}
      </span>
      {badge}
    </button>
  );
}
