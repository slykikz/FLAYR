export async function api<T = any>(
  path: string,
  body?: unknown,
  method?: string,
): Promise<T> {
  const response = await fetch("/api" + path, {
    method: method || (body ? "POST" : "GET"),
    credentials: "same-origin",
    signal: AbortSignal.timeout(30000),
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const type = response.headers.get("content-type");
  if (!type?.includes("application/json"))
    throw new Error(
      "Esta funcionalidade ficará disponível quando a loja estiver ligada aos serviços de produção.",
    );
  const result: any = await response.json();
  if (!response.ok)
    throw new Error(
      result.error || "Não foi possível concluir. Tenta novamente.",
    );
  return result;
}
