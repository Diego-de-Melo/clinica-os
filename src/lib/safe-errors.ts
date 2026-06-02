type SafeErrorInput = {
  code?: string | null;
  message?: string | null;
  name?: string | null;
  status?: number | string | null;
};

const GENERIC_OPERATION_ERROR = "Não foi possível concluir a operação. Tente novamente.";

function safeDatabaseMessage(error: SafeErrorInput, fallback = GENERIC_OPERATION_ERROR) {
  switch (error.code) {
    case "23505":
      return "Já existe um registro com essas informações.";
    case "23503":
      return "Não foi possível concluir a operação por causa de dados relacionados.";
    case "23514":
      return "Os dados informados não atendem às regras permitidas.";
    case "42501":
      return "Você não tem permissão para realizar esta ação.";
    case "PGRST116":
      return "Registro não encontrado.";
    default:
      return fallback;
  }
}

export function throwDatabaseError(error: SafeErrorInput, fallback?: string): never {
  console.error("[database] operation failed", error);
  throw new Error(safeDatabaseMessage(error, fallback));
}

export function throwServiceError(error: SafeErrorInput, fallback = GENERIC_OPERATION_ERROR): never {
  console.error("[service] operation failed", error);
  throw new Error(fallback);
}