// TypeScript model for the Amazon States Language (ASL).
// Focused on the JSONata query language, but tolerant of JSONPath fields too.

export type QueryLanguage = 'JSONPath' | 'JSONata';

export type StateType =
  | 'Task'
  | 'Choice'
  | 'Parallel'
  | 'Map'
  | 'Pass'
  | 'Wait'
  | 'Succeed'
  | 'Fail';

/** Fields shared across most state types. */
export interface CommonStateFields {
  Type: StateType;
  Comment?: string;
  Next?: string;
  End?: boolean;
  QueryLanguage?: QueryLanguage;
  /** JSONata: variable assignments. Keys are variable names; values are expressions. */
  Assign?: Record<string, unknown>;
  /** JSONata: output transformation. */
  Output?: unknown;
  // JSONPath legacy fields (kept for tolerance / future support):
  InputPath?: string | null;
  OutputPath?: string | null;
  Parameters?: unknown;
  ResultPath?: string | null;
  ResultSelector?: unknown;
}

export interface RetryRule {
  ErrorEquals: string[];
  IntervalSeconds?: number;
  MaxAttempts?: number;
  BackoffRate?: number;
}

export interface CatchRule {
  ErrorEquals: string[];
  Next: string;
  ResultPath?: string | null;
  Assign?: Record<string, unknown>;
  Output?: unknown;
}

export interface TaskState extends CommonStateFields {
  Type: 'Task';
  Resource: string;
  /** JSONata: arguments passed to the integration. */
  Arguments?: unknown;
  Retry?: RetryRule[];
  Catch?: CatchRule[];
  TimeoutSeconds?: number;
  HeartbeatSeconds?: number;
}

export interface ChoiceRule {
  Next: string;
  /** JSONata: boolean condition expression ({% ... %}). */
  Condition?: unknown;
  /** JSONPath comparison operators may also appear (Variable + operator). */
  Variable?: string;
  [operator: string]: unknown;
}

export interface ChoiceState extends CommonStateFields {
  Type: 'Choice';
  Choices: ChoiceRule[];
  Default?: string;
}

export interface ParallelState extends CommonStateFields {
  Type: 'Parallel';
  Branches: StateMachine[];
  Retry?: RetryRule[];
  Catch?: CatchRule[];
}

export interface MapState extends CommonStateFields {
  Type: 'Map';
  ItemProcessor?: StateMachine;
  /** Older spelling of ItemProcessor. */
  Iterator?: StateMachine;
  /** JSONata: items to iterate. */
  Items?: unknown;
  ItemsPath?: string;
  MaxConcurrency?: number;
  Retry?: RetryRule[];
  Catch?: CatchRule[];
}

export interface PassState extends CommonStateFields {
  Type: 'Pass';
  Result?: unknown;
}

export interface WaitState extends CommonStateFields {
  Type: 'Wait';
  Seconds?: number;
  Timestamp?: string;
  SecondsPath?: string;
  TimestampPath?: string;
}

export interface SucceedState extends CommonStateFields {
  Type: 'Succeed';
}

export interface FailState extends CommonStateFields {
  Type: 'Fail';
  Error?: string;
  Cause?: string;
}

export type State =
  | TaskState
  | ChoiceState
  | ParallelState
  | MapState
  | PassState
  | WaitState
  | SucceedState
  | FailState;

export interface StateMachine {
  Comment?: string;
  StartAt: string;
  QueryLanguage?: QueryLanguage;
  TimeoutSeconds?: number;
  Version?: string;
  States: Record<string, State>;
}
