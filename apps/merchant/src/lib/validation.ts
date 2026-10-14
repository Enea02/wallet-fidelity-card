export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

/** Regola della password dello staff (Supabase ne chiede almeno 6: qui 8, più sicura). */
export const PASSWORD_MIN = 8;
export function passwordProblem(pw: string, confirm: string): { password?: string; confirm?: string } {
  if (pw.length < PASSWORD_MIN) return { password: `Usa almeno ${PASSWORD_MIN} caratteri.` };
  if (pw !== confirm) return { confirm: "Le due password non coincidono." };
  return {};
}
