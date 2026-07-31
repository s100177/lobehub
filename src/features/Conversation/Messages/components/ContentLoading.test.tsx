/**
 * @vitest-environment happy-dom
 */
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ContentLoading from './ContentLoading';

let runningOperation: any;

vi.mock('@lobehub/ui', () => ({
  Flexbox: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/BubblesLoading', () => ({ default: () => <div>loading</div> }));
vi.mock('@/components/NeuralNetworkLoading', () => ({ default: () => <div>thinking</div> }));
vi.mock('@/styles/loading', () => ({
  elapsedTimeStyles: { elapsedTime: 'elapsed' },
  shinyTextStyles: { shinyText: 'shiny' },
}));
vi.mock('@/store/chat', () => ({
  useChatStore: (selector: (state: unknown) => unknown) => selector({}),
}));
vi.mock('@/store/chat/selectors', () => ({
  operationSelectors: {
    getDeepestRunningOperationByMessage: () => () => runningOperation,
  },
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: { attempt?: number; max?: number }) => {
      if (key === 'opStatusTray.status.retrying') {
        return `模型响应异常，正在重试 ${params?.attempt}/${params?.max}`;
      }
      if (key === 'operation.execServerAgentRuntime') {
        return '任务正在服务器运行，您可以放心离开此页面';
      }
      return key;
    },
  }),
}));

describe('ContentLoading', () => {
  beforeEach(() => {
    runningOperation = {
      metadata: { startTime: Date.now() },
      type: 'execServerAgentRuntime',
    };
  });

  it('shows the model retry attempt instead of generic running copy', () => {
    runningOperation.metadata.llmRetry = { attempt: 2, maxAttempts: 3 };

    render(<ContentLoading id="message-1" />);

    expect(screen.getByText('模型响应异常，正在重试 2/3...')).toBeInTheDocument();
    expect(screen.queryByText('任务正在服务器运行，您可以放心离开此页面...')).toBeNull();
  });
});
