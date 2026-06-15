// Lightweight extractor for variable references inside ASL JSONata expressions.
//
// ASL embeds JSONata as `{% ... %}`. Inside, user variables are referenced as
// `$name`. We must distinguish those from:
//   - reserved context objects (`$states`, `$$`),
//   - JSONata built-in/function calls (`$map(...)`, `$sum(...)`, ...),
//   - expression-local bindings (`$x := ...`),
//   - `$`-tokens inside string literals.
//
// This is a focused scanner (not a full JSONata parser); see plan Phase 3.3 for
// the option to switch to the `jsonata` package AST if we need full fidelity.

/** Reserved JSONata/Step Functions context identifiers that are not user variables. */
const RESERVED = new Set(['states', 'context']);

const IDENT_START = /[A-Za-z_]/;
const IDENT_PART = /[A-Za-z0-9_]/;

/**
 * Extract distinct user-variable names referenced inside a raw field value.
 * Returns [] when the value contains no `{% %}` JSONata expression.
 */
export function extractVariableReferences(raw: string): string[] {
  const expressions = extractExpressionBodies(raw);
  if (expressions.length === 0) {
    return [];
  }
  const refs = new Set<string>();
  for (const body of expressions) {
    for (const name of scanBody(body)) {
      refs.add(name);
    }
  }
  return [...refs];
}

/** True when the string contains at least one `{% ... %}` block. */
export function isJSONataExpression(raw: string): boolean {
  return /\{%[\s\S]*?%\}/.test(raw);
}

/**
 * True when the expression reads the current Map iteration item — JSONata
 * `$states.context.Map.Item.*` or the legacy `$$.Map.Item.*`. These are not user
 * variables, but they are worth surfacing as the Map's "item" data flow.
 */
export function referencesMapItem(raw: string): boolean {
  return /\$states\.context\.Map\.Item\b/.test(raw) || /\$\$\.Map\.Item\b/.test(raw);
}

function extractExpressionBodies(raw: string): string[] {
  const bodies: string[] = [];
  const re = /\{%([\s\S]*?)%\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw)) !== null) {
    bodies.push(match[1]);
  }
  return bodies;
}

function scanBody(body: string): string[] {
  const candidates = new Set<string>();
  const localBound = new Set<string>();

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];

    // Skip string literals (single or double quoted).
    if (ch === "'" || ch === '"') {
      i = skipString(body, i);
      continue;
    }

    if (ch !== '$') {
      continue;
    }

    // `$$` (root input) and bare `$` (context) are not user variables.
    if (body[i + 1] === '$') {
      i += 1;
      continue;
    }
    if (!body[i + 1] || !IDENT_START.test(body[i + 1])) {
      continue;
    }

    // Read the identifier.
    let j = i + 1;
    let name = '';
    while (j < body.length && IDENT_PART.test(body[j])) {
      name += body[j];
      j += 1;
    }

    // Look ahead past whitespace to classify.
    let k = j;
    while (k < body.length && /\s/.test(body[k])) {
      k += 1;
    }

    if (body[k] === '(') {
      // Function call (built-in or user function): not a variable.
      i = j - 1;
      continue;
    }
    if (body[k] === ':' && body[k + 1] === '=') {
      // Expression-local binding: `$x := ...` — exclude from references.
      localBound.add(name);
      i = j - 1;
      continue;
    }

    if (!RESERVED.has(name)) {
      candidates.add(name);
    }
    i = j - 1;
  }

  return [...candidates].filter((name) => !localBound.has(name));
}

/** Returns the index of the closing quote of the string starting at `start`. */
function skipString(text: string, start: number): number {
  const quote = text[start];
  let i = start + 1;
  while (i < text.length) {
    if (text[i] === '\\') {
      i += 2;
      continue;
    }
    if (text[i] === quote) {
      return i;
    }
    i += 1;
  }
  return text.length;
}
