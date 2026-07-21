import {
  BrowserApiName,
  BrowserExecutionRuntime,
  BrowserIdentifier,
  type BrowserRuntimeService,
  type BrowserState,
  type CancelTaskParams,
  type ExecutePlanParams,
  type InterruptParams,
} from '@lobechat/builtin-tool-browser';
import type { BuiltinToolContext, BuiltinToolResult } from '@lobechat/types';
import { BaseExecutor } from '@lobechat/types';

const createBrowserSessionId = (ctx?: BuiltinToolContext) =>
  ctx?.topicId || ctx?.messageId || ctx?.toolCallId || 'default';

const callBrowserAction = async <TParams extends object | undefined>(
  sessionId: string,
  action: string,
  params?: TParams,
  signal?: AbortSignal,
): Promise<BrowserState> => {
  const res = await fetch('/api/browser/action', {
    body: JSON.stringify({ action, params: params ?? {}, sessionId }),
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
    signal,
  });

  const data = await res.json().catch(() => undefined);
  if (!res.ok) {
    throw new Error(data?.error || `Browser action "${action}" failed with HTTP ${res.status}`);
  }

  return data as BrowserState;
};

const createBrowserRuntimeService = (
  sessionId: string,
  signal?: AbortSignal,
): BrowserRuntimeService => ({
  back: () => callBrowserAction(sessionId, BrowserApiName.back, undefined, signal),
  cancelTask: (args) => callBrowserAction(sessionId, BrowserApiName.cancelTask, args, signal),
  click: (args) => callBrowserAction(sessionId, BrowserApiName.click, args, signal),
  evaluate: (args) => callBrowserAction(sessionId, BrowserApiName.evaluate, args, signal),
  executePlan: (args) => callBrowserAction(sessionId, BrowserApiName.executePlan, args, signal),
  fill: (args) => callBrowserAction(sessionId, BrowserApiName.fill, args, signal),
  forward: () => callBrowserAction(sessionId, BrowserApiName.forward, undefined, signal),
  hover: (args) => callBrowserAction(sessionId, BrowserApiName.hover, args, signal),
  interrupt: (args) => callBrowserAction(sessionId, BrowserApiName.interrupt, args, signal),
  inspect: () => callBrowserAction(sessionId, BrowserApiName.inspect, undefined, signal),
  navigate: (args) => callBrowserAction(sessionId, BrowserApiName.navigate, args, signal),
  screenshot: () => callBrowserAction(sessionId, BrowserApiName.screenshot, undefined, signal),
  scroll: (args) => callBrowserAction(sessionId, BrowserApiName.scroll, args, signal),
  submit: (args) => callBrowserAction(sessionId, BrowserApiName.submit, args, signal),
});

class BrowserExecutor extends BaseExecutor<typeof BrowserApiName> {
  readonly identifier = BrowserIdentifier;
  protected readonly apiEnum = BrowserApiName;

  private runtime(ctx?: BuiltinToolContext) {
    const sessionId = createBrowserSessionId(ctx);
    return new BrowserExecutionRuntime(
      createBrowserRuntimeService(sessionId, ctx?.signal),
      sessionId,
    );
  }

  navigate = async (
    params: { mode?: 'auto' | 'iframe' | 'remote'; timeout?: number; url: string },
    ctx?: BuiltinToolContext,
  ): Promise<BuiltinToolResult> => this.runtime(ctx).navigate(params);

  click = async (
    params: { selector: string; timeout?: number },
    ctx?: BuiltinToolContext,
  ): Promise<BuiltinToolResult> => this.runtime(ctx).click(params);

  fill = async (
    params: { selector: string; text: string; timeout?: number },
    ctx?: BuiltinToolContext,
  ): Promise<BuiltinToolResult> => this.runtime(ctx).fill(params);

  hover = async (
    params: { selector: string; timeout?: number },
    ctx?: BuiltinToolContext,
  ): Promise<BuiltinToolResult> => this.runtime(ctx).hover(params);

  scroll = async (
    params: { x?: number; y?: number },
    ctx?: BuiltinToolContext,
  ): Promise<BuiltinToolResult> => this.runtime(ctx).scroll(params);

  submit = async (
    params: { selector: string; timeout?: number },
    ctx?: BuiltinToolContext,
  ): Promise<BuiltinToolResult> => this.runtime(ctx).submit(params);

  screenshot = async (_params: unknown, ctx?: BuiltinToolContext): Promise<BuiltinToolResult> =>
    this.runtime(ctx).screenshot();

  evaluate = async (
    params: { code: string },
    ctx?: BuiltinToolContext,
  ): Promise<BuiltinToolResult> => this.runtime(ctx).evaluate(params);

  executePlan = async (
    params: ExecutePlanParams,
    ctx?: BuiltinToolContext,
  ): Promise<BuiltinToolResult> => this.runtime(ctx).executePlan(params);

  interrupt = async (
    params: InterruptParams,
    ctx?: BuiltinToolContext,
  ): Promise<BuiltinToolResult> => this.runtime(ctx).interrupt(params);

  cancelTask = async (
    params: CancelTaskParams,
    ctx?: BuiltinToolContext,
  ): Promise<BuiltinToolResult> => this.runtime(ctx).cancelTask(params);

  inspect = async (_params: unknown, ctx?: BuiltinToolContext): Promise<BuiltinToolResult> =>
    this.runtime(ctx).inspect();

  back = async (_params: unknown, ctx?: BuiltinToolContext): Promise<BuiltinToolResult> =>
    this.runtime(ctx).back();

  forward = async (_params: unknown, ctx?: BuiltinToolContext): Promise<BuiltinToolResult> =>
    this.runtime(ctx).forward();
}

export const browserExecutor = new BrowserExecutor();
