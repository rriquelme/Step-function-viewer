// Resolves the effective query language for a state.
// QueryLanguage may be set at the state machine level (applies to all states)
// and overridden per state. When unset, ASL defaults to JSONPath.
import type { QueryLanguage, State, StateMachine } from './types';

export function machineQueryLanguage(machine: StateMachine | undefined): QueryLanguage {
  return machine?.QueryLanguage ?? 'JSONPath';
}

export function effectiveQueryLanguage(
  machine: StateMachine | undefined,
  state: State | undefined,
): QueryLanguage {
  return state?.QueryLanguage ?? machineQueryLanguage(machine);
}

/** True when the whole machine (top-level) declares JSONata. */
export function isJSONataMachine(machine: StateMachine | undefined): boolean {
  return machineQueryLanguage(machine) === 'JSONata';
}
