/**
 * Eseguito da Next.js una volta all'avvio del server (dev e produzione, non durante il build).
 * Il codice Node sta in lib/startup.ts: qui solo il controllo del runtime.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { runStartupChecks } = await import("./lib/startup");
    runStartupChecks();
  }
}
