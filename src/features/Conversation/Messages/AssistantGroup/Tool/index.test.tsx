/**
 * @vitest-environment happy-dom
 */
import { render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Tool from './index';

const openToolUIMock = vi.fn();

let mockTool: any;
let mockIsPluginUIOpen = false;

vi.mock('@lobechat/builtin-tools/renders', () => ({
  getBuiltinRender: () => undefined,
}));

vi.mock('@lobechat/builtin-tools/streamings', () => ({
  getBuiltinStreaming: () => undefined,
}));

vi.mock('@lobehub/ui', () => ({
  AccordionItem: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Flexbox: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Skeleton: {
    Block: () => <div>loading</div>,
  },
}));

vi.mock('antd', () => ({
  Divider: () => <hr />,
}));

vi.mock('@/components/ErrorBoundary', () => ({
  default: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

vi.mock('@/libs/next/dynamic', () => ({
  default: () => () => <div>dynamic-detail</div>,
}));

vi.mock('@/store/chat', () => ({
  useChatStore: (selector: (state: any) => unknown) =>
    selector({
      openToolUI: openToolUIMock,
    }),
}));

vi.mock('@/store/chat/selectors', () => ({
  chatPortalSelectors: {
    isPluginUIOpen: () => () => mockIsPluginUIOpen,
  },
}));

vi.mock('@/store/chat/slices/operation/selectors', () => ({
  operationSelectors: {
    getRunningToolCallStartTime: () => () => undefined,
    isMessageInToolCalling: () => () => false,
    isMessageProcessing: () => () => false,
  },
}));

vi.mock('@/store/tool', () => ({
  useToolStore: (selector: (state: unknown) => unknown) => selector({}),
}));

vi.mock('@/store/tool/selectors', () => ({
  toolSelectors: {
    getRenderDisplayControl: () => () => 'collapsed',
  },
}));

vi.mock('../../../store', () => ({
  dataSelectors: {
    getToolInBlock: () => () => mockTool,
  },
  useConversationStore: (selector: (state: unknown) => unknown) => selector({}),
}));

vi.mock('./Actions', () => ({
  default: () => <div>actions</div>,
}));

vi.mock('./Inspector', () => ({
  default: () => <div>inspector</div>,
}));

describe('AssistantGroup Tool rendering', () => {
  beforeEach(() => {
    openToolUIMock.mockClear();
    mockIsPluginUIOpen = false;
    mockTool = {
      apiName: 'navigate',
      arguments: '{"url":"https://example.com"}',
      id: 'tool-call-1',
      identifier: 'lobe-browser',
      result: {
        content: 'ok',
        state: {
          sessionId: 'session-1',
          url: 'https://example.com',
        },
      },
      result_msg_id: 'tool-message-1',
      type: 'builtin',
    };
  });

  it('leaves browser portal coordination to the always-mounted assistant group', async () => {
    render(<Tool assistantMessageId="assistant-message-1" id="tool-call-1" />);

    await waitFor(() => {
      expect(openToolUIMock).not.toHaveBeenCalled();
    });
  });

  it('does not open the portal for non-browser tools', async () => {
    mockTool.identifier = 'lobe-web-browsing';

    render(<Tool assistantMessageId="assistant-message-1" id="tool-call-1" />);

    await waitFor(() => {
      expect(openToolUIMock).not.toHaveBeenCalled();
    });
  });

  it('does not reopen the browser portal when it is already open for the tool message', async () => {
    mockIsPluginUIOpen = true;

    render(<Tool assistantMessageId="assistant-message-1" id="tool-call-1" />);

    await waitFor(() => {
      expect(openToolUIMock).not.toHaveBeenCalled();
    });
  });
});
