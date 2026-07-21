'use client';

import { memo } from 'react';

import { useChatStore } from '@/store/chat';
import { chatPortalSelectors, dbMessageSelectors } from '@/store/chat/selectors';

import type { BrowserState } from '../../types';

const BrowserPortalTitle = memo(() => {
  const messageId = useChatStore(chatPortalSelectors.toolMessageId);
  const state = useChatStore((s) =>
    messageId ? dbMessageSelectors.getDbMessageById(messageId)(s)?.pluginState : undefined,
  ) as BrowserState | undefined;
  const title = state?.title || 'Browser';
  const url = state?.url;

  return (
    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {title}
      {url ? ` — ${url}` : ''}
    </span>
  );
});

BrowserPortalTitle.displayName = 'BrowserPortalTitle';

export default BrowserPortalTitle;
