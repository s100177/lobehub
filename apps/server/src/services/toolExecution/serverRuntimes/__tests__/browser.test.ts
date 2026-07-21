import { BrowserIdentifier } from '@lobechat/builtin-tool-browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type ToolExecutionContext } from '../../types';

const { browserRuntime } = await import('../browser');

describe('browserRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BROWSER_SERVICE_URL = 'http://browser-service.test';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            mode: 'iframe',
            title: 'Form',
            url: 'https://example.com/form',
          }),
          {
            headers: { 'content-type': 'application/json' },
            status: 200,
          },
        ),
      ),
    );
  });

  it('exposes the browser identifier', () => {
    expect(browserRuntime.identifier).toBe(BrowserIdentifier);
  });

  it('requires context.userId', () => {
    const context: ToolExecutionContext = {
      toolManifestMap: {},
      topicId: 'topic-1',
    };

    expect(() => browserRuntime.factory(context)).toThrow(
      'userId is required for Browser runtime execution',
    );
  });

  it('forwards context.userId as X-Browser-Owner-ID', async () => {
    const context: ToolExecutionContext = {
      operationId: 'op-1',
      toolManifestMap: {},
      topicId: 'topic-1',
      userId: 'user-1',
    };

    const runtime = browserRuntime.factory(context);
    await runtime.navigate({ mode: 'iframe', url: 'https://example.com/form' });

    expect(fetch).toHaveBeenCalledWith(
      'http://browser-service.test/navigate',
      expect.objectContaining({
        body: JSON.stringify({ mode: 'iframe', url: 'https://example.com/form' }),
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-Browser-Owner-ID': 'user-1',
          'X-Session-ID': 'topic-1',
        }),
        method: 'POST',
      }),
    );
  });
});
