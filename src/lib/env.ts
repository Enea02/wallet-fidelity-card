// Lettura env lazy: il build non fallisce se mancano variabili,
// l'errore arriva solo quando la funzionalità viene usata.
export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variabile d'ambiente mancante: ${name}`);
  return v;
}

export function optionalEnv(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}
