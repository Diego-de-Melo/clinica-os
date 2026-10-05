/**
 * Utilitários para CSV seguro (M4) e validação de redirect (B6).
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  // Escape aspas: " -> ""
  const escaped = str.replace(/"/g, '""');
  // Prefixo ' se começa com =, +, -, @, tab, CR, LF
  const first = escaped.charAt(0);
  if (first === "=" || first === "+" || first === "-" || first === "@" || first === "\t" || first === "\r" || first === "\n") {
    return "'" + escaped;
  }
  // Se contém vírgula, aspas ou quebra de linha, envolve em aspas
  if (escaped.includes(",") || escaped.includes('"') || escaped.includes("\n") || escaped.includes("\r")) {
    return `"${escaped}"`;
  }
  return escaped;
}

export function assertAllowedRedirect(url: string, allowedOrigins: string[]): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("URL de redirecionamento inválida");
  }
  const origin = parsed.origin;
  if (!allowedOrigins.includes(origin)) {
    throw new Error(`Redirecionamento para origem não permitida: ${origin}`);
  }
}