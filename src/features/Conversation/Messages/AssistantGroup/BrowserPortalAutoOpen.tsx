'use client';

import { BrowserIdentifier } from '@lobechat/builtin-tool-browser/client';
import type { AssistantContentBlock, ChatToolPayloadWithResult } from '@lobechat/types';
import { memo, useEffect, useMemo, useRef } from 'react';

import { useChatStore } from '@/store/chat';
import { chatPortalSelectors } from '@/store/chat/selectors';

interface BrowserPortalAutoOpenProps {
  blocks?: AssistantContentBlock[];
}

const findLatestVisibleBrowserResult = (blocks: AssistantContentBlock[]) => {
  const tools = blocks.flatMap((block) => block.tools ?? []);

  return tools.findLast((tool: ChatToolPayloadWithResult) => {
    if (tool.identifier !== BrowserIdentifier || !tool.result_msg_id) return false;

    const state = tool.result?.state as { sessionId?: string; url?: string } | undefined;
    return Boolean(state?.sessionId || state?.url);
  });
};

const BrowserPortalAutoOpen = memo<BrowserPortalAutoOpenProps>(({ blocks = [] }) => {
  const browserTool = useMemo(() => findLatestVisibleBrowserResult(blocks), [blocks]);
  const toolMessageId = browserTool?.result_msg_id;
  const apiName = browserTool?.apiName;
  const openToolUI = useChatStore((state) => state.openToolUI);
  const isOpen = useChatStore(chatPortalSelectors.isPluginUIOpen(toolMessageId || ''));
  const openedMessageRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!toolMessageId || !apiName || isOpen || openedMessageRef.current === toolMessageId) return;

    openedMessageRef.current = toolMessageId;
    openToolUI(toolMessageId, BrowserIdentifier, { apiName });
  }, [apiName, isOpen, openToolUI, toolMessageId]);

  return null;
});

BrowserPortalAutoOpen.displayName = 'BrowserPortalAutoOpen';

export default BrowserPortalAutoOpen;
