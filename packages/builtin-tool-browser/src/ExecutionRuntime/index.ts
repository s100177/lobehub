import { type BuiltinServerRuntimeOutput } from '@lobechat/types';

import {
  type BrowserActionEvent,
  type BrowserState,
  type CancelTaskParams,
  type ExecutePlanParams,
  type InterruptParams,
} from '../types';

export interface BrowserRuntimeService {
  back: () => Promise<BrowserState>;
  cancelTask: (args: CancelTaskParams) => Promise<BrowserState>;
  click: (args: { selector: string; timeout?: number }) => Promise<BrowserState>;
  evaluate: (args: { code: string }) => Promise<BrowserState>;
  executePlan: (args: ExecutePlanParams) => Promise<BrowserState>;
  fill: (args: { selector: string; text: string; timeout?: number }) => Promise<BrowserState>;
  forward: () => Promise<BrowserState>;
  inspect: () => Promise<BrowserState>;
  interrupt: (args: InterruptParams) => Promise<BrowserState>;
  navigate: (args: {
    mode?: 'auto' | 'iframe' | 'remote';
    timeout?: number;
    url: string;
  }) => Promise<BrowserState>;
  screenshot: () => Promise<BrowserState>;
  scroll: (args: { x?: number; y?: number }) => Promise<BrowserState>;
  submit: (args: { selector: string; timeout?: number }) => Promise<BrowserState>;
}

export class BrowserExecutionRuntime {
  private service: BrowserRuntimeService;

  constructor(
    private service: BrowserRuntimeService,
    private sessionId: string,
  ) {}

  private createEvent(
    action: BrowserActionEvent['action'],
    status: BrowserActionEvent['status'],
    summary: string,
    target?: string,
  ): BrowserActionEvent {
    return {
      action,
      id: `${this.sessionId}:${Date.now()}:${action}:${Math.random().toString(36).slice(2, 8)}`,
      status,
      summary,
      target,
      timestamp: Date.now(),
    };
  }

  private withEvent(state: BrowserState, event: BrowserActionEvent): BrowserState {
    if (state.actionEvents?.length) {
      return { ...state, sessionId: this.sessionId };
    }

    return {
      ...state,
      actionEvents: [...(state.actionEvents ?? []), event],
      sessionId: this.sessionId,
    };
  }

  async navigate(args: {
    mode?: 'auto' | 'iframe' | 'remote';
    timeout?: number;
    url: string;
  }): Promise<BuiltinServerRuntimeOutput> {
    try {
      const state = await this.service.navigate(args);
      const modeText = state.mode ? `\nMode: ${state.mode}` : '';
      const fallbackText = state.fallbackReason ? `\nFallback: ${state.fallbackReason}` : '';

      return {
        content: `Navigated to ${state.url}\nTitle: ${state.title}${modeText}${fallbackText}`,
        state: this.withEvent(
          state,
          this.createEvent('navigate', 'success', `Opened ${state.url ?? args.url}`, args.url),
        ),
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
      const state = await this.service.click(args);
      if (state.blocked && state.riskBlock) {
        return {
          content: `Blocked risky click "${args.selector}": ${state.riskBlock.reason}`,
          state: this.withEvent(
            state,
            this.createEvent('click', 'blocked', state.riskBlock.reason, args.selector),
          ),
          success: false,
        };
      }

      return {
        content: `Clicked element "${args.selector}"`,
        state: this.withEvent(
          state,
          this.createEvent('click', 'success', `Clicked ${args.selector}`, args.selector),
        ),
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
      const state = await this.service.fill(args);

      return {
        content: `Filled field "${args.selector}" with "${args.text}"`,
        state: this.withEvent(
          state,
          this.createEvent('fill', 'success', `Filled ${args.selector}`, args.selector),
        ),
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
      const state = await this.service.scroll(args);

      return {
        content: `Scrolled to x=${args.x ?? 0}, y=${args.y ?? 0}`,
        state: this.withEvent(
          state,
          this.createEvent('scroll', 'success', `Scrolled to x=${args.x ?? 0}, y=${args.y ?? 0}`),
        ),
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

  async submit(args: { selector: string; timeout?: number }): Promise<BuiltinServerRuntimeOutput> {
    try {
      const state = await this.service.submit(args);
      if (state.blocked && state.riskBlock) {
        return {
          content: `Blocked risky submit "${args.selector}": ${state.riskBlock.reason}`,
          state: this.withEvent(
            state,
            this.createEvent('submit', 'blocked', state.riskBlock.reason, args.selector),
          ),
          success: false,
        };
      }

      return {
        content: `Submitted form for "${args.selector}"\nURL: ${state.url ?? 'blank'}\nTitle: ${state.title ?? ''}`,
        state: this.withEvent(
          state,
          this.createEvent('submit', 'success', `Submitted ${args.selector}`, args.selector),
        ),
        success: true,
      };
    } catch (error) {
      return {
        content: `Failed to submit form for "${args.selector}": ${error instanceof Error ? error.message : String(error)}`,
        error,
        success: false,
      };
    }
  }

  async executePlan(args: ExecutePlanParams = {}): Promise<BuiltinServerRuntimeOutput> {
    try {
      const state = await this.service.executePlan(args);
      const events = state.executionEvents ?? [];
      const blocked = events.find((event) => event.status === 'blocked');
      const summary =
        events.length > 0
          ? events.map((event) => `${event.status}: ${event.summary}`).join('\n')
          : 'No executable plan steps were run.';

      return {
        content: blocked
          ? `Browser plan stopped before unsafe or incomplete step:\n${summary}`
          : `Browser plan execution finished:\n${summary}`,
        state: this.withEvent(
          state,
          this.createEvent(
            'executePlan',
            blocked ? 'blocked' : 'success',
            blocked ? blocked.summary : 'Executed browser plan',
            blocked?.target,
          ),
        ),
        success: !blocked,
      };
    } catch (error) {
      return {
        content: `Failed to execute browser plan: ${error instanceof Error ? error.message : String(error)}`,
        error,
        success: false,
      };
    }
  }

  async interrupt(args: InterruptParams = {}): Promise<BuiltinServerRuntimeOutput> {
    try {
      const state = await this.service.interrupt(args);

      return {
        content: `Browser automation paused: ${args.reason || args.inputType || 'user intervention'}`,
        state: this.withEvent(
          state,
          this.createEvent(
            'interrupt',
            'blocked',
            args.reason || `Paused because user ${args.inputType || 'input'} intervened`,
          ),
        ),
        success: true,
      };
    } catch (error) {
      return {
        content: `Failed to pause browser automation: ${error instanceof Error ? error.message : String(error)}`,
        error,
        success: false,
      };
    }
  }

  async cancelTask(args: CancelTaskParams = {}): Promise<BuiltinServerRuntimeOutput> {
    try {
      const state = await this.service.cancelTask(args);

      return {
        content: `Browser automation cancelled: ${args.reason || 'user cancelled the task'}`,
        state: this.withEvent(
          state,
          this.createEvent('cancelTask', 'blocked', args.reason || 'Browser task cancelled'),
        ),
        success: true,
      };
    } catch (error) {
      return {
        content: `Failed to cancel browser automation: ${error instanceof Error ? error.message : String(error)}`,
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
        state: this.withEvent(
          state,
          this.createEvent(
            'screenshot',
            'success',
            `Captured screenshot for ${state.url ?? 'blank page'}`,
          ),
        ),
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
      const state = await this.service.evaluate(args);
      const { result } = state;
      const resultStr = typeof result === 'string' ? result : JSON.stringify(result, null, 2);

      return {
        content: `JavaScript evaluation result:\n${resultStr}`,
        state: this.withEvent(
          state,
          this.createEvent('evaluate', 'success', 'Evaluated JavaScript in the page'),
        ),
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
        state: this.withEvent(
          state,
          this.createEvent('back', 'success', `Went back to ${state.url ?? 'blank'}`),
        ),
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
        state: this.withEvent(
          state,
          this.createEvent('forward', 'success', `Went forward to ${state.url ?? 'blank'}`),
        ),
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

  async inspect(): Promise<BuiltinServerRuntimeOutput> {
    try {
      const state = await this.service.inspect();

      return {
        content: `Inspected page state for ${state.url ?? 'blank page'}`,
        state: this.withEvent(
          state,
          this.createEvent('inspect', 'success', `Inspected ${state.url ?? 'blank page'}`),
        ),
        success: true,
      };
    } catch (error) {
      return {
        content: `Failed to inspect page: ${error instanceof Error ? error.message : String(error)}`,
        error,
        success: false,
      };
    }
  }
}
