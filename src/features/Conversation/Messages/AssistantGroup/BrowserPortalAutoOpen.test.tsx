/**
 * @vitest-environment happy-dom
 */
import type { AssistantContentBlock } from '@lobechat/types';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import BrowserPortalAutoOpen from './BrowserPortalAutoOpen';

const openToolUIMock = vi.fn();
let openMessageId: string | undefined;

vi.mock('@/store/chat', () => ({
  useChatStore: (selector: (state: any) => unknown) =>
    selector({
      openToolUI: openToolUIMock,
      portalStack: openMessageId
        ? [{ identifier: 'lobe-browser', messageId: openMessageId, type: 'toolUI' }]
        : [],
      showPortal: Boolean(openMessageId),
    }),
}));

vi.mock('@/store/chat/selectors', () => ({
  chatPortalSelectors: {
    isPluginUIOpen: (id: string) => () => openMessageId === id,
  },
}));

const browserTool = (messageId: string, apiName = 'navigate', state: unknown = { url: 'x' }) => ({
  apiName,
  arguments: '{}',
  id: `call-${messageId}`,
  identifier: 'lobe-browser',
  result: { content: 'ok', state },
  result_msg_id: messageId,
  type: 'builtin' as const,
});

const blocks = (...tools: any[]): AssistantContentBlock[] =>
  [{ content: '', createdAt: 1, id: 'assistant-1', role: 'assistant', tools }] as any;

describe('BrowserPortalAutoOpen', () => {
  beforeEach(() => {
    openMessageId = undefined;
    openToolUIMock.mockClear();
  });

  it('opens a completed browser result without mounting expanded tool details', async () => {
    render(<BrowserPortalAutoOpen blocks={blocks(browserTool('navigate-result'))} />);

    await waitFor(() => {
      expect(openToolUIMock).toHaveBeenCalledWith('navigate-result', 'lobe-browser', {
        apiName: 'navigate',
      });
    });
  });

  it('keeps the latest visible result when a later browser action failed without state', async () => {
    render(
      <BrowserPortalAutoOpen
        blocks={blocks(
          browserTool('navigate-result'),
          browserTool('inspect-error', 'inspect', null),
        )}
      />,
    );

    await waitFor(() => {
      expect(openToolUIMock).toHaveBeenCalledWith('navigate-result', 'lobe-browser', {
        apiName: 'navigate',
      });
    });
  });

  it('switches the portal to a newer browser result', async () => {
    const { rerender } = render(
      <BrowserPortalAutoOpen blocks={blocks(browserTool('navigate-result'))} />,
    );
    await waitFor(() => expect(openToolUIMock).toHaveBeenCalledTimes(1));

    rerender(
      <BrowserPortalAutoOpen
        blocks={blocks(browserTool('navigate-result'), browserTool('fill-result', 'fill'))}
      />,
    );

    await waitFor(() => {
      expect(openToolUIMock).toHaveBeenLastCalledWith('fill-result', 'lobe-browser', {
        apiName: 'fill',
      });
    });
  });
});
