'use client';

import { Flexbox } from '@lobehub/ui';
import { createStaticStyles } from 'antd-style';
import { memo } from 'react';

import type { BrowserState } from '../../types';

const styles = createStaticStyles(({ css, cssVar }) => ({
  container: css`
    display: flex;
    flex-direction: column;
    gap: 4px;
    height: 100%;
  `,
  urlBar: css`
    display: flex;
    gap: 8px;
    align-items: center;

    margin-inline: 8px;
    padding-block: 6px;
    padding-inline: 12px;
    border: 1px solid ${cssVar.colorBorder};
    border-radius: 8px;

    font-size: 13px;
    color: ${cssVar.colorText};

    background: ${cssVar.colorFillQuaternary};
  `,
  iframe: css`
    flex: 1;
    width: 100%;
    border: none;
    border-radius: 0;
  `,
  empty: css`
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;

    font-size: 14px;
    color: ${cssVar.colorTextDescription};
  `,
  result: css`
    overflow: auto;

    max-height: 120px;
    margin: 8px;
    padding: 12px;
    border-radius: 8px;

    font-family: ${cssVar.fontFamilyCode};
    font-size: 12px;
    color: ${cssVar.colorText};
    white-space: pre-wrap;

    background: ${cssVar.colorFillQuaternary};
  `,
}));

interface BrowserPanelProps {
  sessionId: string;
  showResult?: boolean;
  state: BrowserState;
}

const BrowserPanel = memo<BrowserPanelProps>(({ state, showResult, sessionId }) => {
  if (!state) {
    return (
      <div className={styles.empty}>No browser data yet. Ask the AI to navigate somewhere.</div>
    );
  }

  const { url, title, result } = state;

  return (
    <Flexbox className={styles.container}>
      {title && (
        <div style={{ fontSize: 15, fontWeight: 600, marginInline: 12, marginTop: 8 }}>{title}</div>
      )}
      {url && (
        <div className={styles.urlBar}>
          <span style={{ opacity: 0.5 }}>🔗</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {url}
          </span>
        </div>
      )}
      {url ? (
        <iframe
          className={styles.iframe}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          src={`/api/browser/proxy?session=${encodeURIComponent(sessionId)}`}
          title={title ?? 'Browser'}
        />
      ) : (
        <div className={styles.empty}>Navigate to a URL first. Ask the AI to open a webpage.</div>
      )}
      {showResult && result !== undefined && (
        <div className={styles.result}>
          {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
        </div>
      )}
    </Flexbox>
  );
});

BrowserPanel.displayName = 'BrowserPanel';

export default BrowserPanel;
