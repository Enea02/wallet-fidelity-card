import type { ApiError } from "@/lib/api";
import { Banner } from "./Banner";
import { SupportCode } from "./SupportCode";
import { T } from "./Text";

/** Errore del catalogo per l'utente: messaggio comprensibile e codice assistenza copiabile. */
export function ErrorNotice({
  error,
  title,
}: {
  error: Pick<ApiError, "userMessage" | "supportCode" | "code">;
  title?: string;
}) {
  const showCode = error.code !== "E_OFFLINE";
  return (
    <Banner tone="danger" {...(title !== undefined && { title })}>
      <T variant="small" testID="messaggio-errore">
        {error.userMessage}
      </T>
      {showCode ? <SupportCode code={error.supportCode} /> : null}
    </Banner>
  );
}
