import type { ReactNode } from "react";

import {
  Button,
  FormAlert,
  FormField as SharedFormField,
  InfoPanel as SharedInfoPanel,
  ThemeToggle as SharedThemeToggle
} from "@nezdemkovski/auth-ui";
import type { Theme } from "@nezdemkovski/auth-client-shared/theme";

export function InfoPanel({ children }: { children: ReactNode }) {
  return <SharedInfoPanel>{children}</SharedInfoPanel>;
}

export function ErrorAlert({ children }: { children: ReactNode }) {
  return (
    <div className="enter enter-1 mt-6">
      <FormAlert>{children}</FormAlert>
    </div>
  );
}

export function ActionButton({
  type,
  disabled,
  badge,
  className,
  onClick,
  children
}: {
  type: "button" | "submit";
  disabled?: boolean;
  badge?: ReactNode;
  className?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type={type}
      variant="primary"
      size="md"
      fullWidth
      disabled={disabled}
      onClick={onClick}
      className={className ?? "mt-2 h-11"}
      badge={badge}
    >
      {children}
    </Button>
  );
}

export function FormField({
  id,
  name,
  label,
  type,
  autoComplete,
  placeholder,
  value,
  onChange,
  hint
}: {
  id: string;
  name: string;
  label: string;
  type: string;
  autoComplete: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  hint?: ReactNode;
}) {
  return (
    <SharedFormField
      id={id}
      name={name}
      label={label}
      type={type}
      autoComplete={autoComplete}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      hint={hint}
    />
  );
}

export function ThemeToggle({
  theme,
  onToggle
}: {
  theme: Theme;
  onToggle: () => void;
}) {
  return <SharedThemeToggle theme={theme} onToggle={onToggle} />;
}
