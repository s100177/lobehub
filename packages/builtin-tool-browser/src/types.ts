export const BrowserIdentifier = 'lobe-browser';

export const BrowserApiName = {
  navigate: 'navigate',
  click: 'click',
  fill: 'fill',
  scroll: 'scroll',
  screenshot: 'screenshot',
  evaluate: 'evaluate',
  back: 'back',
  forward: 'forward',
} as const;

export type BrowserApiNameType = (typeof BrowserApiName)[keyof typeof BrowserApiName];

export interface NavigateParams {
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

export interface ScrollParams {
  x?: number;
  y?: number;
}

export interface EvaluateParams {
  code: string;
}

export interface BrowserState {
  result?: any;
  screenshot?: string; // base64 fallback / live-viewer frame source
  sessionId?: string;
  title?: string;
  url?: string;
  viewport?: { width: number; height: number };
}
