'use client';

import { type BuiltinRenderProps } from '@lobechat/types';
import { Flexbox } from '@lobehub/ui';
import { createStaticStyles } from 'antd-style';
import { memo, useCallback } from 'react';

import { useChatStore } from '@/store/chat';
import { chatPortalSelectors } from '@/store/chat/selectors';

import type { BrowserState } from '../../../types';

const styles = createStaticStyles(({ css, cssVar }) => ({
  card: css`
    overflow: hidden;

    width: 100%;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 10px;

    background: ${cssVar.colorBgContainer};
  `,
  header: css`
    display: flex;
    gap: 8px;
    align-items: center;

    padding-block: 8px;
    padding-inline: 12px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  url: css`
    overflow: hidden;
    flex: 1;

    font-size: 12px;
    color: ${cssVar.colorTextDescription};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  title: css`
    font-size: 13px;
    font-weight: 600;
    color: ${cssVar.colorText};
  `,
  screenshot: css`
    display: block;
    width: 100%;
    height: auto;
  `,
  error: css`
    padding: 12px;
    font-size: 13px;
    color: ${cssVar.colorError};
  `,
  empty: css`
    padding: 12px;
    font-size: 13px;
    color: ${cssVar.colorTextDescription};
  `,
  openBtn: css`
    cursor: pointer;

    padding-block: 4px;
    padding-inline: 12px;
    border: 1px solid ${cssVar.colorBorder};
    border-radius: 6px;

    font-size: 12px;
    color: ${cssVar.colorPrimary};

    background: transparent;

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
  evalResult: css`
    padding-block: 8px;
    padding-inline: 12px;

    font-family: ${cssVar.fontFamilyCode};
    font-size: 12px;
    color: ${cssVar.colorText};

    background: ${cssVar.colorFillQuaternary};
  `,
}));

const BrowserCard = memo<BuiltinRenderProps<Record<string, any>, BrowserState>>(
  ({ pluginState, content, identifier, messageId, apiName }) => {
    const openToolUI = useChatStore((s) => s.openToolUI);
    const isOpen = useChatStore(chatPortalSelectors.isPluginUIOpen(identifier));

    const handleOpen = useCallback(() => {
      if (!isOpen) {
        openToolUI(messageId!, identifier, { apiName });
      }
    }, [messageId, identifier, apiName, isOpen, openToolUI]);

    if (!pluginState) {
      return (
        <div className={styles.card}>
          <div className={styles.empty}>{content || 'No browser data'}</div>
        </div>
      );
    }

    const { screenshot, url, title, result } = pluginState;

    return (
      <div className={styles.card}>
        <div className={styles.header}>
          <Flexbox flex={1} gap={2} style={{ overflow: 'hidden' }}>
            {title && <div className={styles.title}>{title}</div>}
            {url && <div className={styles.url}>{url}</div>}
          </Flexbox>
          <button className={styles.openBtn} type="button" onClick={handleOpen}>
            Open
          </button>
        </div>

        {screenshot && (
          <img
            alt={title ?? 'Screenshot'}
            className={styles.screenshot}
            src={`data:image/png;base64,${screenshot}`}
          />
        )}

        {result !== undefined && (
          <div className={styles.evalResult}>
            {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
          </div>
        )}
      </div>
    );
  },
);

BrowserCard.displayName = 'BrowserCard';

export default BrowserCard;
