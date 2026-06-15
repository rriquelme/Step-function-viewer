// Unified document layer over JSON and YAML state-machine sources. Both formats
// produce a plain JS `machine` object plus a `rangeAt` resolver that maps a
// JSON/YAML path to a source range, so the rest of the pipeline (graph,
// validation, variable analysis) stays format-agnostic and keeps click-to-source.
import {
  type RangeResolver,
  type SourceRange,
  looksLikeStateMachine as looksLikeJsonStateMachine,
  parseStateMachine,
  rangeForPath,
} from './parser';
import type { StateMachine } from './types';
import { parseDocument as parseYaml } from 'yaml';

export type DocumentFormat = 'json' | 'yaml';

export interface DocumentError {
  message: string;
  range?: SourceRange;
}

export interface ParsedDocument {
  machine: StateMachine | undefined;
  rangeAt: RangeResolver;
  errors: DocumentError[];
}

/** Choose a parser based on the file name. */
export function detectFormat(fileName: string): DocumentFormat {
  return /\.ya?ml$/i.test(fileName) ? 'yaml' : 'json';
}

export function parseDocument(text: string, format: DocumentFormat = 'json'): ParsedDocument {
  return format === 'yaml' ? parseYamlDocument(text) : parseJsonDocument(text);
}

function parseJsonDocument(text: string): ParsedDocument {
  const { machine, tree, errors } = parseStateMachine(text);
  return {
    machine,
    rangeAt: (path) => rangeForPath(tree, path),
    errors: errors.map((e) => ({
      message: `JSON syntax error (code ${e.error}).`,
      range: { start: e.offset, end: e.offset + e.length },
    })),
  };
}

function parseYamlDocument(text: string): ParsedDocument {
  const doc = parseYaml(text);
  let machine: StateMachine | undefined;
  try {
    const js = doc.toJS();
    machine = js && typeof js === 'object' && !Array.isArray(js) ? (js as StateMachine) : undefined;
  } catch {
    machine = undefined;
  }
  return {
    machine,
    rangeAt: (path) => {
      if (path.length === 0) {
        return undefined;
      }
      const node = doc.getIn(path, true) as { range?: [number, number, number] | null } | undefined;
      const range = node?.range;
      return Array.isArray(range) ? { start: range[0], end: range[1] } : undefined;
    },
    errors: (doc.errors ?? []).map((e) => ({
      message: e.message,
      range: e.pos ? { start: e.pos[0], end: e.pos[1] } : undefined,
    })),
  };
}

/** Heuristic: does this document look like an ASL state machine? */
export function looksLikeStateMachine(text: string, format: DocumentFormat = 'json'): boolean {
  if (format !== 'yaml') {
    return looksLikeJsonStateMachine(text);
  }
  try {
    const obj = parseYaml(text).toJS();
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
