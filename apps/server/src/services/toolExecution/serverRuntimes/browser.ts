import {
  BrowserExecutionRuntime,
  BrowserIdentifier,
  BrowserManifest,
  type BrowserRuntimeService,
  type BrowserState,
} from '@lobechat/builtin-tool-browser';

import { deviceGateway } from '@/server/services/deviceGateway';

import { resolveRunWorkspaceId } from './resolveWorkspaceScope';
import type { ServerRuntimeRegistration } from './types';

const fetchBrowser = async (
  path: string,
  sessionId: string,
  ownerId: string,
  body: object = {},
): Promise<BrowserState> => {
  const baseUrl = process.env.BROWSER_SERVICE_URL;
  if (!baseUrl) throw new Error('BROWSER_SERVICE_URL is not configured');

  const response = await fetch(`${baseUrl}${path}`, {
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      'X-Browser-Owner-ID': ownerId,
      ...(process.env.BROWSER_SERVICE_TOKEN
        ? { 'X-Browser-Service-Token': process.env.BROWSER_SERVICE_TOKEN }
        : {}),
      'X-Session-ID': sessionId,
    },
    method: 'POST',
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Browser service error (${response.status}): ${detail}`);
  }
  return response.json();
};

const createWebRuntime = (context: Parameters<ServerRuntimeRegistration['factory']>[0]) => {
  if (!context.userId) throw new Error('userId is required for Browser runtime execution');
  if (!context.topicId) throw new Error('topicId is required for Browser runtime execution');

  const sessionId = `topic:${context.topicId}`;
  const call = (path: string, args: object = {}) =>
    fetchBrowser(path, sessionId, context.userId!, args);
  const service: BrowserRuntimeService = {
    back: () => call('/back'),
    cancelTask: (args) => call('/cancel-task', args),
    click: (args) => call('/click', args),
    evaluate: (args) => call('/evaluate', args),
    executePlan: (args) => call('/execute-plan', args),
    fill: (args) => call('/fill', args),
    forward: () => call('/forward'),
    hover: (args) => call('/hover', args),
    inspect: () => call('/inspect'),
    interrupt: (args) => call('/interrupt', args),
    navigate: (args) => call('/navigate', args),
    press: (args) => call('/press', args),
    readPage: () => call('/read-page'),
    screenshot: () => call('/screenshot'),
    scroll: (args) => call('/scroll', args),
    snapshot: () => call('/snapshot'),
    submit: (args) => call('/submit', args),
  };
  return new BrowserExecutionRuntime(service, sessionId);
};

const createDeviceRuntime = (context: Parameters<ServerRuntimeRegistration['factory']>[0]) => {
  if (!context.userId || !context.activeDeviceId || !context.agentId || !context.topicId) {
    throw new Error('Browser device proxy requires userId, activeDeviceId, agentId, and topicId');
  }

  let workspaceIdPromise: Promise<string | undefined> | undefined;
  const proxy: Record<string, (args: any) => Promise<any>> = {};
  for (const api of BrowserManifest.api) {
    proxy[api.name] = async (args: any = {}) =>
      deviceGateway.executeToolCall(
        {
          deviceId: context.activeDeviceId!,
          operationId: context.operationId,
          userId: context.userId!,
          workspaceId: await (workspaceIdPromise ??= resolveRunWorkspaceId(context)),
        },
        {
          apiName: api.name,
          arguments: JSON.stringify({
            ...args,
            __agentId: context.agentId,
            __topicId: context.topicId,
          }),
          identifier: BrowserIdentifier,
        },
        context.executionTimeoutMs,
      );
  }
  return proxy;
};

export const browserRuntime: ServerRuntimeRegistration = {
  factory: (context) =>
    context.activeDeviceId ? createDeviceRuntime(context) : createWebRuntime(context),
  identifier: BrowserIdentifier,
};
