// Resolve a value within a parsed object by JSON path (e.g. the state object at
// ['States', 'MyState'] or a nested branch state).
export function resolveByPath(root: unknown, path: (string | number)[]): unknown {
  let current: unknown = root;
  for (const key of path) {
    if (current && typeof current === 'object') {
      current = (current as Record<string | number, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return current;
}
