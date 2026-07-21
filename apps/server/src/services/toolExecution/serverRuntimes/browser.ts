import {
  BrowserExecutionRuntime,
  BrowserIdentifier,
  type BrowserRuntimeService,
  type BrowserState,
} from '@lobechat/builtin-tool-browser';

import { type ServerRuntimeRegistration } from './types';

const getBrowserServiceUrl = (): string | undefined => process.env.BROWSER_SERVICE_URL || undefined;

const fetchBrowser = async (
  path: string,
  sessionId: string,
  ownerId: string,
  body?: object,
): Promise<any> => {
  const baseUrl = getBrowserServiceUrl();
  if (!baseUrl) {
    throw new Error('BROWSER_SERVICE_URL is not configured');
  }

  const serviceToken = process.env.BROWSER_SERVICE_TOKEN;
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Browser-Owner-ID': ownerId,
      ...(serviceToken ? { 'X-Browser-Service-Token': serviceToken } : {}),
      'X-Session-ID': sessionId,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Browser service error (${res.status}): ${text}`);
  }

  return res.json();
};

export const browserRuntime: ServerRuntimeRegistration = {
  factory: (context) => {
    if (!context.userId) {
      throw new Error('userId is required for Browser runtime execution');
    }

    const sessionId = context.topicId || context.operationId || 'default';
    const ownerId = context.userId;

    const service: BrowserRuntimeService = {
      back: async () => {
        return fetchBrowser('/back', sessionId, ownerId, {}) as Promise<BrowserState>;
      },
      cancelTask: async (args) => {
        return fetchBrowser('/cancel-task', sessionId, ownerId, args) as Promise<BrowserState>;
      },
      click: async (args) => {
        return fetchBrowser('/click', sessionId, ownerId, args) as Promise<BrowserState>;
      },
      evaluate: async (args) => {
        return fetchBrowser('/evaluate', sessionId, ownerId, args) as Promise<BrowserState>;
      },
      executePlan: async (args) => {
        return fetchBrowser('/execute-plan', sessionId, ownerId, args) as Promise<BrowserState>;
      },
      fill: async (args) => {
        return fetchBrowser('/fill', sessionId, ownerId, args) as Promise<BrowserState>;
      },
      forward: async () => {
        return fetchBrowser('/forward', sessionId, ownerId, {}) as Promise<BrowserState>;
      },
      hover: async (args) => {
        return fetchBrowser('/hover', sessionId, ownerId, args) as Promise<BrowserState>;
      },
      inspect: async () => {
        return fetchBrowser('/inspect', sessionId, ownerId, {}) as Promise<BrowserState>;
      },
      interrupt: async (args) => {
        return fetchBrowser('/interrupt', sessionId, ownerId, args) as Promise<BrowserState>;
      },
      navigate: async (args) => {
        return fetchBrowser('/navigate', sessionId, ownerId, args) as Promise<BrowserState>;
      },
      screenshot: async () => {
        return fetchBrowser('/screenshot', sessionId, ownerId, {}) as Promise<BrowserState>;
      },
      scroll: async (args) => {
        return fetchBrowser('/scroll', sessionId, ownerId, args) as Promise<BrowserState>;
      },
      submit: async (args) => {
        return fetchBrowser('/submit', sessionId, ownerId, args) as Promise<BrowserState>;
      },
    };

    return new BrowserExecutionRuntime(service, sessionId);
  },
  identifier: BrowserIdentifier,
};
