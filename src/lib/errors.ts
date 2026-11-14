/**
 * Error classes can be duplicated across Next.js bundles (route handlers, server actions and pages each get their own copy of a module),
 * which makes `instanceof` unreliable at runtime even though it works in tests. Compare by `name` instead.
 */
export function isNamed<T extends Error = Error>(e: unknown, ...names: string[]): e is T {
  return e instanceof Error && names.includes(e.name);
}
