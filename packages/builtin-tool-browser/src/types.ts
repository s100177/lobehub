export const BrowserIdentifier = 'lobe-browser';

export const BrowserApiName = {
  navigate: 'navigate',
  click: 'click',
  back: 'back',
  evaluate: 'evaluate',
  fill: 'fill',
  forward: 'forward',
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
    | 'fill'
    | 'forward'
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
  value?: string;
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

export interface BrowserPageState {
  actions?: BrowserPageAction[];
  fields?: BrowserPageField[];
  prices?: BrowserPagePrice[];
  selectedOptions?: string[];
  textSample?: string;
  title?: string;
  url?: string;
  warnings?: string[];
}

export type BrowserRiskType =
  | 'authorization'
  | 'create'
  | 'delete'
  | 'payment'
  | 'purchase'
  | 'submit';

export interface BrowserRiskBlock {
  action: 'click' | 'submit';
  reason: string;
  requiresUserConfirmation: true;
  risk: BrowserRiskType;
  targetText?: string;
}

export interface BrowserState {
  actionEvents?: BrowserActionEvent[];
  blocked?: boolean;
  embeddable?: boolean;
  fallbackReason?: string;
  iframeUrl?: string;
  mode?: 'iframe' | 'remote';
  pageState?: BrowserPageState;
  result?: any;
  riskBlock?: BrowserRiskBlock;
  screenshot?: string; // base64 fallback / live-viewer frame source
  sessionId?: string;
  title?: string;
  url?: string;
  viewport?: { width: number; height: number };
}
