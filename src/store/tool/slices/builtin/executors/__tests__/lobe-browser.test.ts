import { BrowserApiName, BrowserIdentifier } from '@lobechat/builtin-tool-browser';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { invokeExecutor } from '../index';

describe('browser executor', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('proxies navigate actions and preserves browser state', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        title: 'Example Domain',
        url: 'https://example.com/',
        viewport: { height: 720, width: 1280 },
      }),
      ok: true,
      status: 200,
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await invokeExecutor(
      BrowserIdentifier,
      BrowserApiName.navigate,
      { url: 'https://example.com' },
      { messageId: 'tool-message-id', topicId: 'topic-1', toolCallId: 'call-1' },
    );

    expect(fetchMock).toHaveBeenCalledWith('/api/browser/action', {
      body: JSON.stringify({
        action: BrowserApiName.navigate,
        params: { url: 'https://example.com' },
        sessionId: 'topic-1',
      }),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      signal: undefined,
    });
    expect(result).toMatchObject({
      content: 'Navigated to https://example.com/\nTitle: Example Domain',
      state: {
        sessionId: 'topic-1',
        title: 'Example Domain',
        url: 'https://example.com/',
      },
      success: true,
    });
  });
});
