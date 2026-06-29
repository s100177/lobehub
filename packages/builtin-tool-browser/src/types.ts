export const BrowserIdentifier = 'lobe-browser';

export const BrowserApiName = {
  navigate: 'navigate',
  click: 'click',
  back: 'back',
  evaluate: 'evaluate',
  executePlan: 'executePlan',
  fill: 'fill',
  forward: 'forward',
  interrupt: 'interrupt',
  inspect: 'inspect',
  screenshot: 'screenshot',
  scroll: 'scroll',
  submit: 'submit',
} as const;

export type BrowserApiNameType = (typeof BrowserApiName)[keyof typeof BrowserApiName];

export interface NavigateParams {
  mode?: 'auto' | 'iframe' | 'remote';
  timeout?: number;
  url: string;
}

export interface ClickParams {
  selector: string;
  timeout?: number;
}

export interface FillParams {
  selector: string;
  text: string;
  timeout?: number;
}

export interface SubmitParams {
  selector: string;
  timeout?: number;
}

export interface ExecutePlanParams {
  inputs?: Record<string, string>;
  intent?: string;
  maxSteps?: number;
  restart?: boolean;
  timeout?: number;
}

export interface InterruptParams {
  inputType?: string;
  reason?: string;
}

export interface ScrollParams {
  x?: number;
  y?: number;
}

export interface EvaluateParams {
  code: string;
}

export interface BrowserActionEvent {
  action:
    | 'back'
    | 'click'
    | 'evaluate'
    | 'executePlan'
    | 'fill'
    | 'forward'
    | 'interrupt'
    | 'inspect'
    | 'navigate'
    | 'screenshot'
    | 'scroll'
    | 'submit';
  id: string;
  status: 'blocked' | 'error' | 'start' | 'success';
  summary: string;
  target?: string;
  timestamp: number;
}

export interface BrowserPageField {
  checked?: boolean;
  label: string;
  options?: string[];
  selector?: string;
  value?: string;
}

export interface BrowserPlanExecutionEvent {
  action?: 'click' | 'fill' | 'inspect' | 'interrupt' | 'select' | 'submit' | 'verify';
  id: string;
  status: 'blocked' | 'completed' | 'failed' | 'skipped';
  summary: string;
  target?: string;
  timestamp: number;
}

export interface BrowserExecutionState {
  blockedStepId?: string;
  completedStepIds: string[];
  currentStepId?: string;
  cursor: number;
  phase:
    | 'acting'
    | 'completed'
    | 'paused_for_input'
    | 'paused_by_user_intervention'
    | 'paused_for_login'
    | 'risk_blocked'
    | 'waiting_authorization';
  planIntent?: string;
  planKey?: string;
  updatedAt: number;
}

export interface BrowserPageAction {
  risk?: BrowserRiskType;
  selector?: string;
  text: string;
}

export interface BrowserPagePrice {
  label: string;
  value: string;
}

export interface BrowserClarificationOption {
  id: string;
  label: string;
  value: string;
}

export interface BrowserClarificationPrompt {
  defaultValue?: string;
  field?: string;
  id: string;
  options?: BrowserClarificationOption[];
  question: string;
  required?: boolean;
}

export interface BrowserTargetHighlight {
  height?: number;
  label?: string;
  selector?: string;
  width?: number;
  x?: number;
  y?: number;
}

export interface BrowserSuggestedTask {
  intent: string;
  reason: string;
  risk: 'high' | 'low' | 'medium';
  title: string;
}

export interface BrowserPageState {
  actions?: BrowserPageAction[];
  clarifications?: BrowserClarificationPrompt[];
  confirmationPoints?: {
    id: string;
    reason?: string;
    title: string;
  }[];
  confirmBeforeProceed?: boolean;
  fields?: BrowserPageField[];
  gaps?: string[];
  loggedIn?: boolean;
  needsUserAttention?: boolean;
  pageType?: string;
  prices?: BrowserPagePrice[];
  primaryActions?: BrowserPageAction[];
  selectedOptions?: string[];
  suggestedTasks?: BrowserSuggestedTask[];
  targetHighlight?: BrowserTargetHighlight;
  taskState?: BrowserTaskState;
  textSample?: string;
  title?: string;
  url?: string;
  warnings?: string[];
  workflowHints?: string[];
}

export type BrowserTaskState =
  | 'idle'
  | 'understanding'
  | 'needs_more_info'
  | 'plan_ready'
  | 'waiting_user_authorization'
  | 'ai_controlling'
  | 'acting'
  | 'paused_by_user_intervention'
  | 'asking_clarification'
  | 'risk_blocked'
  | 'verifying'
  | 'completed'
  | 'failed';

export type BrowserRiskType =
  | 'authorization'
  | 'create'
  | 'delete'
  | 'payment'
  | 'purchase'
  | 'release'
  | 'submit';

export interface BrowserRiskBlock {
  action: 'click' | 'submit';
  reason: string;
  requiresUserConfirmation: true;
  risk: BrowserRiskType;
  targetText?: string;
}

export interface BrowserSkillPackWorkflowStep {
  action?: {
    expectedText?: string;
    inputKey?: string;
    selector: string;
    value?: string;
  };
  gaps?: string[];
  id: string;
  risk?: BrowserRiskType;
  title: string;
  type: 'ask' | 'click' | 'fill' | 'inspect' | 'risk_gate' | 'select' | 'verify';
}

export interface BrowserSkillPackWorkflow {
  constraints?: string[];
  goal: string;
  intent: string;
  steps: BrowserSkillPackWorkflowStep[];
}

export interface BrowserAgentPlanStep extends BrowserSkillPackWorkflowStep {
  status: 'blocked' | 'completed' | 'current' | 'pending';
}

export interface BrowserAgentPlan {
  confirmationRequired?: boolean;
  goal: string;
  intent: string;
  source: 'heuristic' | 'skill_pack';
  steps: BrowserAgentPlanStep[];
}

export interface BrowserPageSkillPack {
  ambiguityRules?: string[];
  confirmationPoints?: BrowserPageState['confirmationPoints'];
  description: string;
  entities?: string[];
  fillGaps?: {
    field: string;
    mode: 'ask_user' | 'auto_fill_if_known' | 'auto_suggest' | 'manual_only';
    reason: string;
  }[];
  page: string;
  pageType: string;
  riskActions?: string[];
  safeActions?: string[];
  site: string;
  source?: string;
  workflows?: BrowserSkillPackWorkflow[];
}

export interface BrowserState {
  actionEvents?: BrowserActionEvent[];
  blocked?: boolean;
  embeddable?: boolean;
  executionEvents?: BrowserPlanExecutionEvent[];
  executionState?: BrowserExecutionState;
  executionTimeline?: BrowserPlanExecutionEvent[];
  fallbackReason?: string;
  iframeUrl?: string;
  mode?: 'iframe' | 'remote';
  pageState?: BrowserPageState;
  plan?: BrowserAgentPlan;
  result?: any;
  riskBlock?: BrowserRiskBlock;
  screenshot?: string; // base64 fallback / live-viewer frame source
  sessionId?: string;
  skillPack?: BrowserPageSkillPack;
  taskState?: BrowserTaskState;
  title?: string;
  url?: string;
  viewport?: { width: number; height: number };
}
