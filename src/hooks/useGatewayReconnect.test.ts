import { describe, expect, it, vi } from 'vitest';

import { useGatewayReconnect } from './useGatewayReconnect';

const mocks = vi.hoisted(() => ({
  reconnectToGatewayOperation: vi.fn(),
  useSWR: vi.fn(),
}));

vi.mock('swr', () => ({ default: mocks.useSWR }));

vi.mock('@/store/chat', () => ({
  useChatStore: {
    getState: () => ({ reconnectToGatewayOperation: mocks.reconnectToGatewayOperation }),
  },
}));

describe('useGatewayReconnect', () => {
  it('restores a running operation even without a configured Gateway URL', async () => {
    const runningOperation = {
      assistantMessageId: 'assistant-1',
      operationId: 'operation-1',
      scope: 'main',
      threadId: null,
    };

    useGatewayReconnect('topic-1', runningOperation);

    const [key, reconnect] = mocks.useSWR.mock.calls[0];
    expect(key).toBeTruthy();

    await reconnect();

    expect(mocks.reconnectToGatewayOperation).toHaveBeenCalledWith({
      ...runningOperation,
      topicId: 'topic-1',
    });
  });
});
