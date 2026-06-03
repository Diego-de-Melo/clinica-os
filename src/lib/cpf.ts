export function formatCPF(value: string | null | undefined): string {
  if (!value) return "";
  const digits = String(value).replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export function unformatCPF(value: string | null | undefined): string {
  if (!value) return "";
  return String(value).replace(/\D/g, "");
}
