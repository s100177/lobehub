'use client';

import { Flexbox } from '@lobehub/ui';
import { createStaticStyles } from 'antd-style';
import { memo, useEffect, useState } from 'react';

import type { BrowserState } from '../../types';

const styles = createStaticStyles(({ css, cssVar }) => ({
  container: css`
    display: flex;
    flex-direction: column;
    height: 100%;
    background: ${cssVar.colorBgContainer};
  `,
  toolbar: css`
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 10px;
    align-items: center;

    padding-block: 10px;
    padding-inline: 12px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    background: ${cssVar.colorBgElevated};
  `,
  urlBar: css`
    display: flex;
    gap: 8px;
    align-items: center;

    padding-block: 6px;
    padding-inline: 12px;
    border: 1px solid ${cssVar.colorBorder};
    border-radius: 999px;

    font-size: 13px;
    color: ${cssVar.colorText};

    background: ${cssVar.colorFillQuaternary};
  `,
  iframe: css`
    flex: 1;

    width: 100%;
    border: none;
    border-radius: 0;

    background: #fff;
  `,
  modeBadge: css`
    padding-block: 4px;
    padding-inline: 10px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 999px;

    font-size: 12px;
    font-weight: 600;
    color: ${cssVar.colorTextSecondary};

    background: ${cssVar.colorFillQuaternary};
  `,
  actionButton: css`
    cursor: pointer;

    padding-block: 6px;
    padding-inline: 10px;
    border: 1px solid ${cssVar.colorBorder};
    border-radius: 8px;

    font-size: 12px;
    color: ${cssVar.colorPrimary};

    background: transparent;

    &:disabled {
      cursor: not-allowed;
      color: ${cssVar.colorTextDisabled};
    }
  `,
  summaryGrid: css`
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;

    padding-block: 10px;
    padding-inline: 12px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    background: ${cssVar.colorBgContainer};
  `,
  summaryCard: css`
    overflow: hidden;

    padding: 8px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;

    background: ${cssVar.colorFillQuaternary};
  `,
  summaryLabel: css`
    margin-block-end: 4px;

    font-size: 11px;
    font-weight: 600;
    color: ${cssVar.colorTextSecondary};
    text-transform: uppercase;
  `,
  summaryValue: css`
    overflow: hidden;

    font-size: 12px;
    color: ${cssVar.colorText};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  timeline: css`
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;

    max-height: 132px;
    padding-block: 10px;
    padding-inline: 12px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    background: ${cssVar.colorBgContainer};
  `,
  eventItem: css`
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 8px;
    align-items: start;

    font-size: 12px;
    color: ${cssVar.colorText};
  `,
  eventStatus: css`
    padding-block: 2px;
    padding-inline: 6px;
    border-radius: 999px;

    font-size: 10px;
    font-weight: 700;
    color: ${cssVar.colorTextSecondary};

    background: ${cssVar.colorFillQuaternary};
  `,
  riskNotice: css`
    margin-block: 10px 0;
    margin-inline: 12px;
    padding-block: 10px;
    padding-inline: 12px;
    border: 1px solid #f59e0b;
    border-radius: 10px;

    font-size: 12px;
    color: #92400e;

    background: #fffbeb;
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
  notice: css`
    padding-block: 8px;
    padding-inline: 12px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    font-size: 12px;
    color: ${cssVar.colorTextSecondary};

    background: ${cssVar.colorFillQuaternary};
  `,
}));

interface BrowserPanelProps {
  sessionId: string;
  showResult?: boolean;
  state: BrowserState;
}

const BrowserPanel = memo<BrowserPanelProps>(({ state, showResult, sessionId }) => {
  const [localState, setLocalState] = useState<BrowserState | undefined>(state);
  const [isSwitching, setIsSwitching] = useState(false);
  const [iframeStatus, setIframeStatus] = useState<'blocked' | 'loaded' | 'loading'>('loading');
  const [switchError, setSwitchError] = useState<string>();

  useEffect(() => {
    setLocalState(state);
    setIframeStatus('loading');
    setSwitchError(undefined);
  }, [state]);

  const currentState = localState;

  useEffect(() => {
    if (currentState?.mode !== 'iframe') return;

    const timer = window.setTimeout(() => {
      setIframeStatus((status) => (status === 'loading' ? 'blocked' : status));
    }, 8000);

    return () => window.clearTimeout(timer);
  }, [currentState?.mode, currentState?.url]);

  if (!currentState) {
    return (
      <div className={styles.empty}>No browser data yet. Ask the AI to navigate somewhere.</div>
    );
  }

  const { fallbackReason, iframeUrl, mode = 'remote', result, title, url } = currentState;
  const displayUrl = iframeUrl || url;
  const isIframeMode = mode === 'iframe';
  const modeLabel = isIframeMode ? 'Iframe' : 'Remote';
  const recentEvents = currentState.actionEvents?.slice(-20).reverse() ?? [];
  const pageState = currentState.pageState;
  const riskyActions = pageState?.actions?.filter((action) => action.risk).slice(0, 3) ?? [];
  const selectedOptions = pageState?.selectedOptions?.filter(Boolean).slice(0, 3) ?? [];
  const prices = pageState?.prices?.slice(0, 2) ?? [];

  const switchToRemote = async () => {
    if (!url || isSwitching) return;

    setIsSwitching(true);
    setSwitchError(undefined);
    try {
      const res = await fetch('/api/browser/action', {
        body: JSON.stringify({
          action: 'navigate',
          params: { mode: 'remote', url },
          sessionId,
        }),
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      const data = await res.json().catch(() => undefined);
      if (!res.ok) throw new Error(data?.error || `Remote switch failed with HTTP ${res.status}`);

      setLocalState({ ...data, sessionId });
      setIframeStatus('loading');
    } catch (err) {
      setSwitchError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSwitching(false);
    }
  };

  return (
    <Flexbox className={styles.container}>
      <div className={styles.toolbar}>
        <div className={styles.modeBadge}>{modeLabel}</div>
        <div className={styles.urlBar}>
          <span style={{ opacity: 0.5 }}>{title || 'Browser'}</span>
          {displayUrl && (
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {displayUrl}
            </span>
          )}
        </div>
        <button
          className={styles.actionButton}
          disabled={!url || isSwitching || !isIframeMode}
          type="button"
          onClick={switchToRemote}
        >
          {isSwitching ? 'Switching...' : 'Use Remote'}
        </button>
      </div>
      {fallbackReason && <div className={styles.notice}>{fallbackReason}</div>}
      {switchError && <div className={styles.notice}>{switchError}</div>}
      {currentState.riskBlock && (
        <div className={styles.riskNotice}>
          <strong>Risky action blocked.</strong> {currentState.riskBlock.reason}. Please take over
          manually if you want to continue.
        </div>
      )}
      {(selectedOptions.length > 0 || prices.length > 0 || riskyActions.length > 0) && (
        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Selected</div>
            <div className={styles.summaryValue}>
              {selectedOptions.length > 0 ? selectedOptions.join(' / ') : 'None detected'}
            </div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Price</div>
            <div className={styles.summaryValue}>
              {prices.length > 0
                ? prices.map((price) => `${price.label} ${price.value}`).join(' / ')
                : 'None detected'}
            </div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Risk Gates</div>
            <div className={styles.summaryValue}>
              {riskyActions.length > 0
                ? riskyActions.map((action) => action.text).join(' / ')
                : 'No risky action visible'}
            </div>
          </div>
        </div>
      )}
      {recentEvents.length > 0 && (
        <div aria-label="Browser action timeline" className={styles.timeline}>
          {recentEvents.map((event) => (
            <div className={styles.eventItem} key={event.id}>
              <span className={styles.eventStatus}>{event.status}</span>
              <span>{event.summary}</span>
            </div>
          ))}
        </div>
      )}
      {isIframeMode && iframeStatus === 'blocked' && (
        <div className={styles.notice}>
          This page did not finish loading in iframe mode. Switch to Remote if the page appears
          blank or blocked.
        </div>
      )}
      {displayUrl ? (
        <iframe
          className={styles.iframe}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
          title={title ?? 'Browser'}
          src={
            isIframeMode
              ? displayUrl
              : `/api/browser/proxy?session=${encodeURIComponent(sessionId)}`
          }
          onLoad={() => setIframeStatus('loaded')}
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
