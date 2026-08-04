import useSWR from 'swr';

import { gatewayKeys } from '@/libs/swr/keys';
import { useChatStore } from '@/store/chat';
import { isTrpcErrorCode } from '@/utils/trpcError';

interface RunningOperation {
  assistantMessageId: string;
  operationId: string;
  scope?: string;
  threadId?: string | null;
}

/**
 * Auto-reconnect to a running Gateway operation on the given topic.
 *
 * The caller sources `runningOperation` itself — the chat-store topic map
 * (main agent) and the task-detail activity (task drawer) live in different
 * stores, so this hook stays source-agnostic.
 *
 * With a Gateway URL this resumes the event stream. Without one it still
 * restores the operation through status polling so a page reload can receive
 * the final persisted messages.
 *
 * SWR key is the operationId, so the same operation deduplicates and only
 * one reconnect attempt fires per op.
 */
export const useGatewayReconnect = (
  topicId: string | null | undefined,
  runningOperation: RunningOperation | null | undefined,
) => {
  useSWR(
    runningOperation && topicId ? gatewayKeys.reconnect(runningOperation.operationId) : null,
    async () => {
      if (!runningOperation || !topicId) return;

      await useChatStore.getState().reconnectToGatewayOperation({
        assistantMessageId: runningOperation.assistantMessageId,
        operationId: runningOperation.operationId,
        scope: runningOperation.scope,
        threadId: runningOperation.threadId,
        topicId,
      });
    },
    {
      revalidateIfStale: false,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      // Never retry the stale-marker case (operation already gone → NOT_FOUND) so a
      // dead op can't loop 404s even if it escapes the fetcher-level catch; transient
      // network/server errors keep SWR's default retry so a live run still resumes.
      shouldRetryOnError: (error) => !isTrpcErrorCode(error, 'NOT_FOUND'),
    },
  );
};
