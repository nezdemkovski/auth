import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "./cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "link" | "danger";
type ButtonSize = "sm" | "md";
type ButtonWidth = "auto" | "full";

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

const INTERACTIONS: Record<ButtonVariant, string> = {
  primary: "shadow-button active:scale-[0.98]",
  secondary: "active:scale-[0.98]",
  ghost: "active:scale-[0.98]",
  link: "",
  danger: ""
};

const WIDTHS: Record<ButtonWidth, string> = {
  auto: "",
  full: "w-full"
};

const LABEL_WIDTHS: Record<ButtonWidth, string> = {
  auto: "",
  full: "flex-1 text-center"
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
  const width = fullWidth ? "full" : "auto";
  const buttonClassName = cn(
    "inline-flex items-center justify-center gap-2 font-medium outline-none transition-[background-color,color,border-color,transform,opacity] duration-150 focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-60",
    SIZES[size],
    VARIANTS[variant],
    INTERACTIONS[variant],
    WIDTHS[width],
    className
  );
  const labelClassName = cn("min-w-0", LABEL_WIDTHS[width]);

  return (
    <button
      {...props}
      type={type}
      data-press
      disabled={isDisabled}
      className={buttonClassName}
    >
      {leading}
      <span className={labelClassName}>{children}</span>
      {badge}
    </button>
  );
}
