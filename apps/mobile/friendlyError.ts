/** Keep actionable validation text, not Convex request IDs or developer stacks. */
export function friendlyError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const validation = error.message.match(/Uncaught (?:Error|ConvexError):\s*([^\n]+)/)?.[1];
  if (validation) return validation.trim().slice(0, 240);
  if (error.message.startsWith("[CONVEX")) return fallback;
  return error.message.split("\n")[0].replace(/^Error:\s*/, "").slice(0, 240) || fallback;
}
