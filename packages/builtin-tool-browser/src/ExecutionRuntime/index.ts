import { type BuiltinServerRuntimeOutput } from '@lobechat/types';

import { type BrowserState } from '../types';

export interface BrowserRuntimeService {
  back: () => Promise<Pick<BrowserState, 'screenshot' | 'url' | 'title'>>;
  click: (args: {
    selector: string;
    timeout?: number;
  }) => Promise<Pick<BrowserState, 'screenshot'>>;
  evaluate: (args: { code: string }) => Promise<{ result?: any }>;
  fill: (args: {
    selector: string;
    text: string;
    timeout?: number;
  }) => Promise<Pick<BrowserState, 'screenshot'>>;
  forward: () => Promise<Pick<BrowserState, 'screenshot' | 'url' | 'title'>>;
  navigate: (args: { url: string; timeout?: number }) => Promise<BrowserState>;
  screenshot: () => Promise<Pick<BrowserState, 'screenshot' | 'url' | 'title'>>;
  scroll: (args: { x?: number; y?: number }) => Promise<Pick<BrowserState, 'screenshot'>>;
}

export class BrowserExecutionRuntime {
  private service: BrowserRuntimeService;

  constructor(
    private service: BrowserRuntimeService,
    private sessionId: string,
  ) {}

  async navigate(args: { url: string; timeout?: number }): Promise<BuiltinServerRuntimeOutput> {
    try {
      const state = await this.service.navigate(args);

      return {
        content: `Navigated to ${state.url}\nTitle: ${state.title}`,
        state: { ...state, sessionId: this.sessionId },
        success: true,
      };
    } catch (error) {
      return {
        content: `Failed to navigate: ${error instanceof Error ? error.message : String(error)}`,
        error,
        success: false,
      };
    }
  }

  async click(args: { selector: string; timeout?: number }): Promise<BuiltinServerRuntimeOutput> {
    try {
      const { screenshot } = await this.service.click(args);

      return {
        content: `Clicked element "${args.selector}"`,
        state: { screenshot } as BrowserState,
        success: true,
      };
    } catch (error) {
      return {
        content: `Failed to click "${args.selector}": ${error instanceof Error ? error.message : String(error)}`,
        error,
        success: false,
      };
    }
  }

  async fill(args: {
    selector: string;
    text: string;
    timeout?: number;
  }): Promise<BuiltinServerRuntimeOutput> {
    try {
      const { screenshot } = await this.service.fill(args);

      return {
        content: `Filled field "${args.selector}" with "${args.text}"`,
        state: { screenshot } as BrowserState,
        success: true,
      };
    } catch (error) {
      return {
        content: `Failed to fill "${args.selector}": ${error instanceof Error ? error.message : String(error)}`,
        error,
        success: false,
      };
    }
  }

  async scroll(args: { x?: number; y?: number }): Promise<BuiltinServerRuntimeOutput> {
    try {
      const { screenshot } = await this.service.scroll(args);

      return {
        content: `Scrolled to x=${args.x ?? 0}, y=${args.y ?? 0}`,
        state: { screenshot } as BrowserState,
        success: true,
      };
    } catch (error) {
      return {
        content: `Failed to scroll: ${error instanceof Error ? error.message : String(error)}`,
        error,
        success: false,
      };
    }
  }

  async screenshot(): Promise<BuiltinServerRuntimeOutput> {
    try {
      const state = await this.service.screenshot();

      return {
        content: `Screenshot captured: ${state.url ?? 'blank page'}`,
        state: { ...state } as BrowserState,
        success: true,
      };
    } catch (error) {
      return {
        content: `Failed to take screenshot: ${error instanceof Error ? error.message : String(error)}`,
        error,
        success: false,
      };
    }
  }

  async evaluate(args: { code: string }): Promise<BuiltinServerRuntimeOutput> {
    try {
      const { result } = await this.service.evaluate(args);
      const resultStr = typeof result === 'string' ? result : JSON.stringify(result, null, 2);

      return {
        content: `JavaScript evaluation result:\n${resultStr}`,
        state: { result } as BrowserState,
        success: true,
      };
    } catch (error) {
      return {
        content: `Failed to evaluate JavaScript: ${error instanceof Error ? error.message : String(error)}`,
        error,
        success: false,
      };
    }
  }

  async back(): Promise<BuiltinServerRuntimeOutput> {
    try {
      const state = await this.service.back();

      return {
        content: `Navigated back to ${state.url ?? 'blank'}`,
        state: { ...state } as BrowserState,
        success: true,
      };
    } catch (error) {
      return {
        content: `Failed to go back: ${error instanceof Error ? error.message : String(error)}`,
        error,
        success: false,
      };
    }
  }

  async forward(): Promise<BuiltinServerRuntimeOutput> {
    try {
      const state = await this.service.forward();

      return {
        content: `Navigated forward to ${state.url ?? 'blank'}`,
        state: { ...state } as BrowserState,
        success: true,
      };
    } catch (error) {
      return {
        content: `Failed to go forward: ${error instanceof Error ? error.message : String(error)}`,
        error,
        success: false,
      };
    }
  }
}
