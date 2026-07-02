'use client';

import { Flexbox } from '@lobehub/ui';
import { createStaticStyles } from 'antd-style';
import type { CSSProperties } from 'react';
import { memo, useCallback, useEffect, useState } from 'react';

import type { BrowserPageState, BrowserState, BrowserTaskState } from '../../types';

const styles = createStaticStyles(({ css, cssVar }) => ({
  actionButton: css`
    cursor: pointer;

    flex: none;

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
  container: css`
    overflow: hidden;
    display: flex;
    flex-direction: column;

    height: 100%;

    background: ${cssVar.colorBgContainer};
  `,
  empty: css`
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;

    font-size: 14px;
    color: ${cssVar.colorTextDescription};
  `,
  iframe: css`
    flex: 1;

    width: 100%;
    height: 100%;
    border: none;
    border-radius: 0;

    background: #fff;
  `,
  modeBadge: css`
    flex: none;

    padding-block: 4px;
    padding-inline: 8px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 999px;

    font-size: 11px;
    font-weight: 600;
    color: ${cssVar.colorTextSecondary};

    background: ${cssVar.colorFillQuaternary};
  `,
  notice: css`
    padding-block: 7px;
    padding-inline: 12px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    font-size: 12px;
    color: ${cssVar.colorTextSecondary};

    background: ${cssVar.colorFillQuaternary};
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
  targetBox: css`
    pointer-events: none;

    position: absolute;
    z-index: 4;

    min-width: 14px;
    min-height: 14px;
    border: 2px solid #f59e0b;
    border-radius: 8px;

    background: rgb(245 158 11 / 8%);
    box-shadow: 0 0 0 4px rgb(245 158 11 / 12%);
  `,
  targetBoxLabel: css`
    position: absolute;
    inset-block-start: -30px;
    inset-inline-start: 0;

    overflow: hidden;

    max-width: min(360px, 80vw);
    padding-block: 4px;
    padding-inline: 8px;
    border-radius: 999px;

    font-size: 12px;
    font-weight: 700;
    color: #fff7ed;
    text-overflow: ellipsis;
    white-space: nowrap;

    background: rgb(15 23 42 / 86%);
  `,
  targetHighlight: css`
    pointer-events: none;

    position: absolute;
    z-index: 4;
    inset-block-start: 16px;
    inset-inline-start: 16px;

    max-width: min(340px, calc(100% - 32px));
    padding-block: 7px;
    padding-inline: 10px;
    border: 1px solid #f59e0b;
    border-radius: 999px;

    font-size: 12px;
    font-weight: 700;
    color: #92400e;

    background: rgb(255 251 235 / 94%);
    box-shadow: 0 8px 24px rgb(146 64 14 / 12%);
  `,
  takeoverFrame: css`
    outline: 2px solid rgb(22 163 74 / 72%);
    outline-offset: -2px;
  `,
  toolbar: css`
    display: flex;
    gap: 8px;
    align-items: center;

    min-height: 44px;
    padding-block: 7px;
    padding-inline: 10px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    background: ${cssVar.colorBgElevated};
  `,
  urlBar: css`
    overflow: hidden;
    display: flex;
    flex: 1;
    gap: 8px;
    align-items: center;

    min-width: 0;
    padding-block: 6px;
    padding-inline: 10px;
    border: 1px solid ${cssVar.colorBorder};
    border-radius: 999px;

    font-size: 13px;
    color: ${cssVar.colorText};

    background: ${cssVar.colorFillQuaternary};
  `,
  urlText: css`
    overflow: hidden;

    min-width: 0;

    color: ${cssVar.colorTextSecondary};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  viewportFrame: css`
    position: relative;

    overflow: hidden;
    display: flex;
    flex: 1;

    min-height: 0;

    background: #fff;
  `,
}));

interface BrowserPanelProps {
  sessionId: string;
  showResult?: boolean;
  state: BrowserState;
}

const controllingStates = new Set<BrowserTaskState>(['ai_controlling', 'acting', 'verifying']);

const hasTargetBox = (
  target: BrowserPageState['targetHighlight'],
): target is NonNullable<BrowserPageState['targetHighlight']> &
  Required<
    Pick<NonNullable<BrowserPageState['targetHighlight']>, 'height' | 'width' | 'x' | 'y'>
  > =>
  Number.isFinite(target?.x) &&
  Number.isFinite(target?.y) &&
  Number.isFinite(target?.width) &&
  Number.isFinite(target?.height) &&
  (target?.width ?? 0) > 0 &&
  (target?.height ?? 0) > 0;

const BrowserPanel = memo<BrowserPanelProps>(({ state, showResult, sessionId }) => {
  const [localState, setLocalState] = useState<BrowserState | undefined>(state);
  const [isSwitching, setIsSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string>();

  useEffect(() => {
    setLocalState(state);
    setSwitchError(undefined);
  }, [state]);

  const currentState = localState;

  const taskState = currentState?.taskState;
  const isControlling = taskState ? controllingStates.has(taskState) : false;

  const interruptAutomation = useCallback(
    async (inputType: string) => {
      try {
        const res = await fetch('/api/browser/action', {
          body: JSON.stringify({
            action: 'interrupt',
            params: {
              inputType,
              reason: `Automation paused because the user performed ${inputType} in the browser.`,
            },
            sessionId,
          }),
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        });
        const data = await res.json().catch(() => undefined);
        if (res.ok && data) setLocalState({ ...data, sessionId });
      } catch {
        setLocalState((previous) =>
          previous ? { ...previous, taskState: 'paused_by_user_intervention' } : previous,
        );
      }
    },
    [sessionId],
  );

  useEffect(() => {
    if (!isControlling) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.source !== 'lobe-browser-viewer') return;
      if (event.data?.type !== 'user-input') return;
      if (event.data?.sessionId !== sessionId) return;

      void interruptAutomation(event.data.inputType || 'input');
    };

    window.addEventListener('message', handleMessage);

    return () => window.removeEventListener('message', handleMessage);
  }, [interruptAutomation, isControlling, sessionId]);

  if (!currentState) {
    return (
      <div className={styles.empty}>No browser data yet. Ask the AI to navigate somewhere.</div>
    );
  }

  const { iframeUrl, mode = 'remote', result, title, url } = currentState;
  const displayUrl = iframeUrl || url;
  const isIframeMode = mode === 'iframe';
  const modeLabel = isIframeMode ? 'Iframe' : 'Remote';
  const targetHighlight = currentState.pageState?.targetHighlight;
  const targetBoxVisible =
    isIframeMode &&
    isControlling &&
    Boolean(currentState.viewport) &&
    hasTargetBox(targetHighlight);
  const targetBoxStyle: CSSProperties | undefined =
    targetBoxVisible && currentState.viewport
      ? {
          height: `${Math.max(0.5, (targetHighlight.height / currentState.viewport.height) * 100)}%`,
          left: `${Math.max(0, (targetHighlight.x / currentState.viewport.width) * 100)}%`,
          pointerEvents: 'none',
          top: `${Math.max(0, (targetHighlight.y / currentState.viewport.height) * 100)}%`,
          width: `${Math.max(0.5, (targetHighlight.width / currentState.viewport.width) * 100)}%`,
        }
      : undefined;
  const targetLabel =
    targetHighlight?.label ||
    targetHighlight?.selector ||
    currentState.pageState?.primaryActions?.[0]?.text ||
    currentState.actionEvents?.find((event) => event.target)?.target;

  const pauseByIntervention = () => {
    if (!isControlling) return;

    void interruptAutomation('viewport');
  };

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
          <span>{title || 'Browser'}</span>
          {displayUrl && <span className={styles.urlText}>{displayUrl}</span>}
        </div>
        {isIframeMode && (
          <button
            className={styles.actionButton}
            disabled={!url || isSwitching}
            type="button"
            onClick={switchToRemote}
          >
            {isSwitching ? 'Switching...' : 'Use Remote'}
          </button>
        )}
      </div>
      {switchError && <div className={styles.notice}>{switchError}</div>}
      {displayUrl ? (
        <div
          className={`${styles.viewportFrame} ${isControlling ? styles.takeoverFrame : ''}`}
          data-agent-state={taskState}
          onClickCapture={pauseByIntervention}
          onKeyDownCapture={pauseByIntervention}
          onWheelCapture={pauseByIntervention}
        >
          {targetBoxVisible && (
            <div
              aria-label="Current browser target box"
              className={styles.targetBox}
              style={targetBoxStyle}
            >
              {targetLabel && (
                <span className={styles.targetBoxLabel}>AI 正在操作：{targetLabel}</span>
              )}
            </div>
          )}
          {isControlling && targetLabel && !targetBoxVisible && (
            <div aria-label="Current browser target" className={styles.targetHighlight}>
              AI 正在操作：{targetLabel}
            </div>
          )}
          <iframe
            className={styles.iframe}
            // The browser panel needs same-origin scripts for interactive iframe pages; remote mode is still used for blocked sites.
            // Do not allow popups to escape the sandbox; external browsing must use the explicit Open action.
            // eslint-disable-next-line @eslint-react/dom/no-unsafe-iframe-sandbox
            sandbox="allow-scripts allow-same-origin allow-forms allow-downloads"
            title={title ?? 'Browser'}
            src={
              isIframeMode
                ? displayUrl
                : `/api/browser/proxy?session=${encodeURIComponent(sessionId)}${
                    isControlling ? '&takeover=1' : ''
                  }`
            }
          />
        </div>
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
