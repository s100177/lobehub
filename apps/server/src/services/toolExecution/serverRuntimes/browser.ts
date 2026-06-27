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
  body?: Record<string, unknown>,
): Promise<any> => {
  const baseUrl = getBrowserServiceUrl();
  if (!baseUrl) {
    throw new Error('BROWSER_SERVICE_URL is not configured');
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
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
    const sessionId = context.topicId || context.operationId || 'default';

    const service: BrowserRuntimeService = {
      navigate: async (args) => {
        return fetchBrowser('/navigate', sessionId, args) as Promise<BrowserState>;
      },
      click: async (args) => {
        return fetchBrowser('/click', sessionId, args) as Promise<BrowserState>;
      },
      fill: async (args) => {
        return fetchBrowser('/fill', sessionId, args) as Promise<BrowserState>;
      },
      scroll: async (args) => {
        return fetchBrowser('/scroll', sessionId, args) as Promise<BrowserState>;
      },
      screenshot: async () => {
        return fetchBrowser('/screenshot', sessionId, {}) as Promise<BrowserState>;
      },
      evaluate: async (args) => {
        return fetchBrowser('/evaluate', sessionId, args) as Promise<BrowserState>;
      },
      back: async () => {
        return fetchBrowser('/back', sessionId, {}) as Promise<BrowserState>;
      },
      forward: async () => {
        return fetchBrowser('/forward', sessionId, {}) as Promise<BrowserState>;
      },
    };

    return new BrowserExecutionRuntime(service, sessionId);
  },
  identifier: BrowserIdentifier,
};
