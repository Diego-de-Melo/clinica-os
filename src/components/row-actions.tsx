import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

/** Container padrão para ações visíveis na linha da tabela */
export function ActionCell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex flex-wrap items-center justify-end gap-1", className)}>
      {children}
    </div>
  );
}

/** Ação em linha — botão com texto (e ícone opcional) */
export function InlineAction({
  label,
  icon: Icon,
  onClick,
  disabled,
  variant = "default",
}: {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "destructive";
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
        "hover:bg-muted disabled:opacity-50 disabled:pointer-events-none",
        variant === "destructive"
          ? "text-destructive hover:bg-destructive/10"
          : "text-foreground",
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
      {label}
    </button>
  );
}

/** Alternância direta — switch com rótulo ao lado */
export function DirectToggle({
  checked,
  onCheckedChange,
  labelOn,
  labelOff,
  disabled,
  ariaLabel,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  labelOn: string;
  labelOff: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <div className="inline-flex items-center gap-2">
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-label={ariaLabel ?? (checked ? labelOn : labelOff)}
      />
      <span className="text-xs font-medium text-muted-foreground min-w-[3.5rem]">
        {checked ? labelOn : labelOff}
      </span>
    </div>
  );
}
