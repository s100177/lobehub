'use client';

import { Flexbox } from '@lobehub/ui';
import { createStaticStyles } from 'antd-style';
import { memo } from 'react';

import type { BrowserState } from '../../types';

const styles = createStaticStyles(({ css, cssVar }) => ({
  container: css`
    display: flex;
    flex-direction: column;
    gap: 8px;

    height: 100%;
    padding: 12px;
  `,
  urlBar: css`
    display: flex;
    gap: 8px;
    align-items: center;

    padding-block: 6px;
    padding-inline: 12px;
    border: 1px solid ${cssVar.colorBorder};
    border-radius: 8px;

    font-size: 13px;
    color: ${cssVar.colorText};

    background: ${cssVar.colorFillQuaternary};
  `,
  screenshot: css`
    width: 100%;
    height: auto;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;

    object-fit: contain;
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

    max-height: 200px;
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
  showResult?: boolean;
  state: BrowserState;
}

const BrowserPanel = memo<BrowserPanelProps>(({ state, showResult }) => {
  if (!state) {
    return (
      <div className={styles.empty}>No browser data yet. Ask the AI to navigate somewhere.</div>
    );
  }

  const { screenshot, url, title, result } = state;

  return (
    <Flexbox className={styles.container}>
      {title && <div style={{ fontSize: 15, fontWeight: 600 }}>{title}</div>}
      {url && (
        <div className={styles.urlBar}>
          <span style={{ opacity: 0.5 }}>🔗</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {url}
          </span>
        </div>
      )}
      {screenshot && (
        <img
          alt={title ?? 'Screenshot'}
          className={styles.screenshot}
          src={`data:image/png;base64,${screenshot}`}
        />
      )}
      {!screenshot && !result && (
        <div className={styles.empty}>
          Page loaded. Screenshot will appear after the AI interacts with the page.
        </div>
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
