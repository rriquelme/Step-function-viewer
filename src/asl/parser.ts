// Position-aware ASL parsing built on jsonc-parser, so graph nodes can map
// back to source ranges (offsets) for click-to-source navigation.
import {
  type Node,
  type ParseError,
  findNodeAtLocation,
  parse,
  parseTree,
} from 'jsonc-parser';
import type { StateMachine } from './types';

/** A character-offset range within the source document. */
export interface SourceRange {
  start: number;
  end: number;
}

export interface ParseResult {
  /** The typed state machine, or undefined if the document could not be parsed. */
  machine: StateMachine | undefined;
  /** The jsonc-parser syntax tree, used to resolve ranges by JSON path. */
  tree: Node | undefined;
  /** Syntactic JSON errors. */
  errors: ParseError[];
}

export function parseStateMachine(text: string): ParseResult {
  const errors: ParseError[] = [];
  const machine = parse(text, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  }) as StateMachine | undefined;
  const tree = parseTree(text, [], { allowTrailingComma: true });
  return { machine, tree, errors };
}

/** Resolve the source range for a JSON path (e.g. ['States', 'MyState', 'Next']). */
export function rangeForPath(
  tree: Node | undefined,
  path: (string | number)[],
): SourceRange | undefined {
  if (!tree) {
    return undefined;
  }
  const node = findNodeAtLocation(tree, path);
  if (!node) {
    return undefined;
  }
  return { start: node.offset, end: node.offset + node.length };
}

/** Heuristic: does this JSON document look like an ASL state machine? */
export function looksLikeStateMachine(text: string): boolean {
  try {
    const obj = parse(text, [], { allowTrailingComma: true });
    return (
      !!obj &&
      typeof obj === 'object' &&
      typeof obj.StartAt === 'string' &&
      !!obj.States &&
      typeof obj.States === 'object'
    );
  } catch {
    return false;
  }
}
