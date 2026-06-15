// Converts a parsed state machine into a normalized graph model: nodes (states)
// and edges (transitions), flattening nested Parallel branches and Map item
// processors into a single graph with container relationships.
import { type SourceRange, rangeForPath } from './parser';
import type {
  ChoiceState,
  MapState,
  ParallelState,
  State,
  StateMachine,
  StateType,
  TaskState,
} from './types';
import type { Node } from 'jsonc-parser';

export type EdgeKind = 'next' | 'choice' | 'default' | 'catch' | 'branch' | 'map';

export interface GraphNode {
  /** Scope-qualified unique id (e.g. "P/b0/Inner"). */
  id: string;
  /** State name as written in the document. */
  name: string;
  type: StateType;
  /** JSON path to the state object, for range resolution / click-to-source. */
  jsonPath: (string | number)[];
  range?: SourceRange;
  parentId?: string;
  /** True for Parallel/Map states that contain sub-graphs. */
  container: boolean;
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  label?: string;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  startAt?: string;
}

interface ScopeContext {
  states: Record<string, State>;
  /** JSON path to the `States` object of this scope. */
  statesPath: (string | number)[];
  /** Id prefix for nodes in this scope (already ends with separator, or empty). */
  idPrefix: string;
  parentId?: string;
}

function makeId(prefix: string, name: string): string {
  return prefix ? `${prefix}${name}` : name;
}

export function buildGraph(machine: StateMachine | undefined, tree: Node | undefined): Graph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  if (!machine || !machine.States) {
    return { nodes, edges };
  }

  const walkScope = (ctx: ScopeContext): void => {
    for (const [name, state] of Object.entries(ctx.states)) {
      if (!state || typeof state !== 'object') {
        continue;
      }
      const id = makeId(ctx.idPrefix, name);
      const jsonPath = [...ctx.statesPath, name];
      const isContainer = state.Type === 'Parallel' || state.Type === 'Map';

      nodes.push({
        id,
        name,
        type: state.Type,
        jsonPath,
        range: rangeForPath(tree, jsonPath),
        parentId: ctx.parentId,
        container: isContainer,
      });

      collectTransitions(ctx, id, name, state, edges);
      descendContainers(id, jsonPath, state, edges, walkScope);
    }
  };

  walkScope({
    states: machine.States,
    statesPath: ['States'],
    idPrefix: '',
    parentId: undefined,
  });

  return { nodes, edges, startAt: machine.StartAt };
}

function collectTransitions(
  ctx: ScopeContext,
  id: string,
  _name: string,
  state: State,
  edges: GraphEdge[],
): void {
  const target = (n: string) => makeId(ctx.idPrefix, n);

  if ('Next' in state && state.Next) {
    edges.push({ from: id, to: target(state.Next), kind: 'next' });
  }

  if (state.Type === 'Choice') {
    const choice = state as ChoiceState;
    for (const rule of choice.Choices ?? []) {
      if (rule.Next) {
        edges.push({ from: id, to: target(rule.Next), kind: 'choice' });
      }
    }
    if (choice.Default) {
      edges.push({ from: id, to: target(choice.Default), kind: 'default', label: 'Default' });
    }
  }

  if (state.Type === 'Task' || state.Type === 'Parallel' || state.Type === 'Map') {
    const withCatch = state as TaskState | ParallelState | MapState;
    for (const rule of withCatch.Catch ?? []) {
      if (rule.Next) {
        edges.push({
          from: id,
          to: target(rule.Next),
          kind: 'catch',
          label: (rule.ErrorEquals ?? []).join(', '),
        });
      }
    }
  }
}

function descendContainers(
  id: string,
  jsonPath: (string | number)[],
  state: State,
  edges: GraphEdge[],
  walkScope: (ctx: ScopeContext) => void,
): void {
  if (state.Type === 'Parallel') {
    const parallel = state as ParallelState;
    (parallel.Branches ?? []).forEach((branch, index) => {
      if (!branch?.States) {
        return;
      }
      const prefix = `${id}/b${index}/`;
      if (branch.StartAt) {
        edges.push({ from: id, to: `${prefix}${branch.StartAt}`, kind: 'branch' });
      }
      walkScope({
        states: branch.States,
        statesPath: [...jsonPath, 'Branches', index, 'States'],
        idPrefix: prefix,
        parentId: id,
      });
    });
  }

  if (state.Type === 'Map') {
    const map = state as MapState;
    const processorKey = map.ItemProcessor ? 'ItemProcessor' : map.Iterator ? 'Iterator' : undefined;
    const processor = map.ItemProcessor ?? map.Iterator;
    if (processor?.States && processorKey) {
      const prefix = `${id}/item/`;
      if (processor.StartAt) {
        edges.push({ from: id, to: `${prefix}${processor.StartAt}`, kind: 'map' });
      }
      walkScope({
        states: processor.States,
        statesPath: [...jsonPath, processorKey, 'States'],
        idPrefix: prefix,
        parentId: id,
      });
    }
  }
}
