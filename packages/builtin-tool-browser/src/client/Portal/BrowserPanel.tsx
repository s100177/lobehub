'use client';

import { Flexbox } from '@lobehub/ui';
import { createStaticStyles } from 'antd-style';
import type { CSSProperties, SyntheticEvent } from 'react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';

import {
  BROWSER_BRIDGE_SOURCE,
  BROWSER_BRIDGE_VERSION,
  BROWSER_HOST_SOURCE,
  type BrowserBridgeCommand,
} from '../../bridge';
import type { BrowserPageState, BrowserState, BrowserTaskState } from '../../types';

const guardedIframeDocuments = new WeakMap<Document, { openPanelTab: OpenPanelTab }>();

type OpenPanelTab = (url: string, title?: string) => void;

export const installIframeSamePanelNavigationGuard = (
  iframe: HTMLIFrameElement,
  openPanelTab: OpenPanelTab,
) => {
  try {
    const iframeWindow = iframe.contentWindow;
    const iframeDocument = iframe.contentDocument || iframeWindow?.document;
    if (!iframeWindow || !iframeDocument) return false;
    const existingGuard = guardedIframeDocuments.get(iframeDocument);
    if (existingGuard) {
      existingGuard.openPanelTab = openPanelTab;
      return true;
    }
    const guard = { openPanelTab };
    guardedIframeDocuments.set(iframeDocument, guard);

    const openInsidePanel = (href: string | URL | undefined | null, title?: string) => {
      if (!href) return null;

      const targetUrl = new URL(String(href), iframeWindow.location.href || iframeDocument.baseURI);
      guard.openPanelTab(targetUrl.toString(), title);
      return iframeWindow;
    };

    iframeDocument.addEventListener(
      'click',
      (event) => {
        if (event.defaultPrevented || event.button !== 0) return;

        const target = event.target;
        const link =
          target && 'closest' in target && typeof target.closest === 'function'
            ? target.closest('a[href]')
            : undefined;
        if (!link || link.tagName.toLowerCase() !== 'a') return;

        const opensNewContext =
          link.getAttribute('target')?.toLowerCase() === '_blank' ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey ||
          event.altKey;
        if (!opensNewContext) return;

        event.preventDefault();
        openInsidePanel(
          link.getAttribute('href') || link.href,
          link.textContent?.trim() || undefined,
        );
      },
      true,
    );

    iframeWindow.open = ((url?: string | URL, target?: string) => {
      if (target?.toLowerCase() === '_self') {
        if (url)
          iframeWindow.location.href = new URL(String(url), iframeWindow.location.href).toString();
        return iframeWindow;
      }

      return openInsidePanel(url);
    }) as typeof window.open;

    return true;
  } catch {
    return false;
  }
};

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
  iframeHidden: css`
    pointer-events: none;
    position: absolute;
    visibility: hidden;
  `,
  loadBar: css`
    pointer-events: none;

    position: absolute;
    z-index: 6;
    inset-block-start: 0;
    inset-inline-start: 0;

    width: 42%;
    height: 2px;

    background: ${cssVar.colorPrimary};

    animation: browser-load 1s ease-in-out infinite;

    @keyframes browser-load {
      0% {
        transform: translateX(-100%);
        opacity: 0.45;
      }

      100% {
        transform: translateX(340%);
        opacity: 1;
      }
    }
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
  tab: css`
    cursor: pointer;

    overflow: hidden;
    display: flex;
    flex: 0 1 180px;
    gap: 6px;
    align-items: center;

    min-width: 92px;
    max-width: 180px;
    height: 30px;
    padding-inline: 9px 5px;
    border: 0;
    border-radius: 6px 6px 0 0;

    font-size: 12px;
    color: ${cssVar.colorTextSecondary};

    background: ${cssVar.colorFillQuaternary};

    &[data-active='true'] {
      color: ${cssVar.colorText};
      background: ${cssVar.colorBgContainer};
    }
  `,
  tabActivate: css`
    cursor: pointer;

    overflow: hidden;
    flex: 1;

    min-width: 0;
    height: 100%;
    padding: 0;
    border: 0;

    font: inherit;
    color: inherit;
    text-align: start;

    background: transparent;
  `,
  tabClose: css`
    cursor: pointer;

    flex: none;

    width: 20px;
    height: 20px;
    padding: 0;
    border: 0;
    border-radius: 4px;

    font-size: 16px;
    line-height: 18px;
    color: ${cssVar.colorTextSecondary};

    background: transparent;

    &:hover {
      color: ${cssVar.colorText};
      background: ${cssVar.colorFillQuaternary};
    }
  `,
  tabLabel: css`
    overflow: hidden;
    flex: 1;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  tabs: css`
    overflow-x: auto;
    display: flex;
    flex: none;
    gap: 2px;
    align-items: end;

    min-height: 32px;
    padding-inline: 8px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    background: ${cssVar.colorBgElevated};
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

interface BridgeConnection {
  clientId: string;
  connected?: boolean;
  connecting?: boolean;
  expectedOrigin: string;
  iframeWindow: Window | null;
  loadId: number;
  pollAbortController?: AbortController;
  timeoutId?: number;
}

interface BrowserPanelTab {
  id: string;
  srcUrl: string;
  title: string;
  url: string;
}

interface ActiveBridgeAction {
  action: string;
  commandId: string;
  phase: 'error' | 'start' | 'success';
  target?: BrowserPageState['targetHighlight'];
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

const BRIDGE_TIMEOUT_MS = 1500;
const MAX_IFRAME_TABS = 8;

const createBridgeClientId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `bridge-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const createBrowserTabId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const getOrigin = (url: string | undefined) => {
  if (!url) return;

  try {
    return new URL(url, window.location.href).origin;
  } catch {
    return;
  }
};

const getErrorMessage = async (res: Response) => {
  const data = await res.json().catch(() => undefined);

  return data?.error || `Bridge request failed with HTTP ${res.status}`;
};

const BrowserPanel = memo<BrowserPanelProps>(({ state, showResult, sessionId }) => {
  const [localState, setLocalState] = useState<BrowserState | undefined>(state);
  const [bridgeStatus, setBridgeStatus] = useState<BrowserState['bridgeStatus']>(
    state.bridgeStatus,
  );
  const [isSwitching, setIsSwitching] = useState(false);
  const [isPageLoading, setIsPageLoading] = useState(false);
  const [activeBridgeAction, setActiveBridgeAction] = useState<ActiveBridgeAction>();
  const [remoteCandidateUrl, setRemoteCandidateUrl] = useState<string>();
  const [switchError, setSwitchError] = useState<string>();
  const initialTabIdRef = useRef(createBrowserTabId());
  const [tabs, setTabs] = useState<BrowserPanelTab[]>(() => [
    {
      id: initialTabIdRef.current,
      srcUrl: state.iframeUrl || state.url || '',
      title: state.title || 'Browser',
      url: state.iframeUrl || state.url || '',
    },
  ]);
  const [activeTabId, setActiveTabId] = useState(initialTabIdRef.current);
  const activeTabIdRef = useRef(activeTabId);
  const tabsRef = useRef(tabs);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const iframeRefs = useRef(new Map<string, HTMLIFrameElement>());
  const loadedIframeTabsRef = useRef(new Set<string>());
  const pendingCommandTabsRef = useRef(new Map<string, { title?: string; url: string }>());
  const bridgeConnectionRef = useRef<BridgeConnection | undefined>(undefined);
  const loadIdRef = useRef(0);

  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  useEffect(() => {
    setLocalState(state);
    setBridgeStatus(state.bridgeStatus);
    setSwitchError(undefined);
    setRemoteCandidateUrl(undefined);
    if (state.mode === 'iframe') {
      const nextUrl = state.iframeUrl || state.url;
      setTabs((previous) =>
        previous.map((tab) =>
          tab.id === activeTabIdRef.current && nextUrl
            ? { ...tab, srcUrl: nextUrl, title: state.title || tab.title, url: nextUrl }
            : tab,
        ),
      );
    }
  }, [state]);

  const currentState = localState;

  const taskState = currentState?.taskState;
  const isControlling = taskState ? controllingStates.has(taskState) : false;
  const { iframeUrl, mode = 'remote', result, title, url } = currentState || {};
  const isIframeMode = mode === 'iframe';
  const activeTab = tabs.find((tab) => tab.id === activeTabId) || tabs[0];
  const displayTitle = isIframeMode ? activeTab?.title || title : title;
  const displayUrl = isIframeMode ? activeTab?.url || iframeUrl || url : iframeUrl || url;
  const expectedBridgeOrigin = isIframeMode ? getOrigin(displayUrl) : undefined;
  const trustedIframeOrigin = isIframeMode ? getOrigin(iframeUrl || url) : undefined;

  const openPanelTab = useCallback(
    (nextUrl: string, nextTitle?: string) => {
      if (!trustedIframeOrigin || getOrigin(nextUrl) !== trustedIframeOrigin) {
        setRemoteCandidateUrl(nextUrl);
        setSwitchError('This link uses an untrusted origin. Open it in Remote mode.');
        return;
      }

      const currentTabs = tabsRef.current;
      const existing = currentTabs.find((tab) => tab.url === nextUrl);
      if (existing) {
        setActiveTabId(existing.id);
        return;
      }
      if (currentTabs.length >= MAX_IFRAME_TABS) {
        setSwitchError(`You can keep up to ${MAX_IFRAME_TABS} iframe tabs open. Close one first.`);
        return;
      }

      const id = createBrowserTabId();
      setTabs((previous) => [
        ...previous,
        { id, srcUrl: nextUrl, title: nextTitle || new URL(nextUrl).hostname, url: nextUrl },
      ]);
      setActiveTabId(id);
      setIsPageLoading(true);
      setActiveBridgeAction(undefined);
    },
    [trustedIframeOrigin],
  );

  const closePanelTab = useCallback(
    (tabId: string) => {
      if (tabs.length === 1) return;
      const tabIndex = tabs.findIndex((tab) => tab.id === tabId);
      const remaining = tabs.filter((tab) => tab.id !== tabId);
      loadedIframeTabsRef.current.delete(tabId);
      iframeRefs.current.delete(tabId);
      setTabs(remaining);
      if (activeTabId === tabId) {
        setActiveTabId(remaining[Math.max(0, tabIndex - 1)]?.id || remaining[0].id);
      }
    },
    [activeTabId, tabs],
  );

  const cleanupBridgeConnection = useCallback(async () => {
    const connection = bridgeConnectionRef.current;
    if (!connection) return;

    bridgeConnectionRef.current = undefined;
    pendingCommandTabsRef.current.clear();

    if (connection.timeoutId) window.clearTimeout(connection.timeoutId);
    connection.pollAbortController?.abort();
    if (typeof connection.iframeWindow?.postMessage === 'function') {
      connection.iframeWindow.postMessage(
        {
          clientId: connection.clientId,
          source: BROWSER_HOST_SOURCE,
          type: 'disconnected',
          version: BROWSER_BRIDGE_VERSION,
        },
        connection.expectedOrigin,
      );
    }

    try {
      await fetch('/api/browser/bridge', {
        body: JSON.stringify({
          action: 'disconnect',
          clientId: connection.clientId,
          sessionId,
        }),
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
    } catch {
      // Best effort cleanup only.
    }
  }, [sessionId]);

  const postBridgeResult = useCallback(
    async (payload: { commandId: string; epoch: number; error?: unknown; result?: unknown }) => {
      const connection = bridgeConnectionRef.current;
      if (!connection) return false;

      try {
        const response = await fetch('/api/browser/bridge', {
          body: JSON.stringify({
            action: 'result',
            clientId: connection.clientId,
            sessionId,
            ...payload,
          }),
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        });
        return response.ok;
      } catch {
        return false;
      }
    },
    [sessionId],
  );

  const startBridgePolling = useCallback(
    async (connection: BridgeConnection) => {
      const controller = new AbortController();
      connection.pollAbortController = controller;

      while (
        bridgeConnectionRef.current &&
        bridgeConnectionRef.current.clientId === connection.clientId &&
        !controller.signal.aborted
      ) {
        try {
          const params = new URLSearchParams({ clientId: connection.clientId, sessionId });
          const res = await fetch(`/api/browser/bridge?${params}`, {
            cache: 'no-store',
            method: 'GET',
            signal: controller.signal,
          });
          if (controller.signal.aborted) return;
          if (res.status === 204) continue;
          if (!res.ok) throw new Error(await getErrorMessage(res));

          const payload = (await res.json().catch(() => undefined)) as
            { command?: BrowserBridgeCommand } | undefined;
          const command = payload?.command;
          const iframeWindow = iframeRef.current?.contentWindow;
          if (!command?.id || iframeWindow !== connection.iframeWindow) return;

          connection.iframeWindow?.postMessage(
            {
              command,
              clientId: connection.clientId,
              sessionId,
              source: BROWSER_HOST_SOURCE,
              type: 'command',
              version: BROWSER_BRIDGE_VERSION,
            },
            connection.expectedOrigin,
          );
        } catch {
          if (controller.signal.aborted) return;

          setBridgeStatus('unavailable');
          setLocalState((previous) =>
            previous ? { ...previous, bridgeStatus: 'unavailable' } : previous,
          );
          return;
        }
      }
    },
    [sessionId],
  );

  const connectBridge = useCallback(
    async (iframeWindow: Window | null, readyOrigin: string, readyUrl: string, loadId: number) => {
      const connection = bridgeConnectionRef.current;
      if (!connection || connection.loadId !== loadId || connection.iframeWindow !== iframeWindow) {
        return;
      }
      if (connection.connecting || connection.connected) return;

      if (connection.timeoutId) window.clearTimeout(connection.timeoutId);
      connection.connecting = true;

      try {
        const res = await fetch('/api/browser/bridge', {
          body: JSON.stringify({
            action: 'connect',
            clientId: connection.clientId,
            sessionId,
            url: readyUrl,
          }),
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        });
        if (!res.ok) throw new Error(await getErrorMessage(res));

        if (
          !bridgeConnectionRef.current ||
          bridgeConnectionRef.current.clientId !== connection.clientId
        )
          return;

        connection.expectedOrigin = readyOrigin;
        connection.connected = true;
        connection.iframeWindow?.postMessage(
          {
            clientId: connection.clientId,
            sessionId,
            source: BROWSER_HOST_SOURCE,
            type: 'connected',
            version: BROWSER_BRIDGE_VERSION,
          },
          readyOrigin,
        );
        setBridgeStatus('connected');
        setLocalState((previous) =>
          previous ? { ...previous, bridgeStatus: 'connected' } : previous,
        );
        void startBridgePolling(connection);
      } catch {
        setBridgeStatus('unavailable');
        setLocalState((previous) =>
          previous ? { ...previous, bridgeStatus: 'unavailable' } : previous,
        );
      } finally {
        connection.connecting = false;
      }
    },
    [sessionId, startBridgePolling],
  );

  const prepareBridgeConnection = useCallback(
    (iframe: HTMLIFrameElement, expectedOrigin: string, force = false) => {
      const currentConnection = bridgeConnectionRef.current;
      if (
        !force &&
        currentConnection?.iframeWindow === iframe.contentWindow &&
        currentConnection.expectedOrigin === expectedOrigin
      ) {
        return;
      }

      loadIdRef.current += 1;
      void cleanupBridgeConnection();

      const loadId = loadIdRef.current;
      const connection: BridgeConnection = {
        clientId: createBridgeClientId(),
        expectedOrigin,
        iframeWindow: iframe.contentWindow,
        loadId,
        timeoutId: window.setTimeout(() => {
          const activeConnection = bridgeConnectionRef.current;
          if (!activeConnection || activeConnection.loadId !== loadId) return;

          setBridgeStatus('unavailable');
          setLocalState((previous) =>
            previous ? { ...previous, bridgeStatus: 'unavailable' } : previous,
          );
        }, BRIDGE_TIMEOUT_MS),
      };

      bridgeConnectionRef.current = connection;
      setBridgeStatus('waiting');
      setLocalState((previous) => (previous ? { ...previous, bridgeStatus: 'waiting' } : previous));
    },
    [cleanupBridgeConnection],
  );

  useEffect(() => {
    if (!isIframeMode) return;
    const iframe = iframeRefs.current.get(activeTabId);
    iframeRef.current = iframe || null;
    setIsPageLoading(false);
    setActiveBridgeAction(undefined);

    if (iframe && expectedBridgeOrigin && loadedIframeTabsRef.current.has(activeTabId)) {
      prepareBridgeConnection(iframe, expectedBridgeOrigin);
    } else {
      void cleanupBridgeConnection();
    }
  }, [
    activeTabId,
    cleanupBridgeConnection,
    expectedBridgeOrigin,
    isIframeMode,
    prepareBridgeConnection,
  ]);

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
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (event.origin !== window.location.origin) return;
      if (event.data?.source !== 'lobe-browser-viewer') return;
      if (event.data?.type !== 'user-input') return;
      if (event.data?.sessionId !== sessionId) return;

      void interruptAutomation(event.data.inputType || 'input');
    };

    window.addEventListener('message', handleMessage);

    return () => window.removeEventListener('message', handleMessage);
  }, [interruptAutomation, isControlling, sessionId]);

  useEffect(() => {
    if (!isIframeMode || !expectedBridgeOrigin) {
      void cleanupBridgeConnection();
      return;
    }

    const handleMessage = (event: MessageEvent) => {
      const iframeWindow = iframeRef.current?.contentWindow;
      if (!iframeWindow || event.source !== iframeWindow || event.origin !== expectedBridgeOrigin)
        return;
      if (event.data?.source !== BROWSER_BRIDGE_SOURCE) return;
      if (event.data?.version !== BROWSER_BRIDGE_VERSION) return;
      if (event.data?.type === 'ready') {
        const currentTab = tabsRef.current.find((tab) => tab.id === activeTabIdRef.current);
        const readyUrl = typeof event.data.url === 'string' ? event.data.url : currentTab?.url;
        if (!readyUrl || getOrigin(readyUrl) !== expectedBridgeOrigin) return;
        setTabs((previous) =>
          previous.map((tab) =>
            tab.id === activeTabIdRef.current
              ? {
                  ...tab,
                  title:
                    typeof event.data.title === 'string' && event.data.title
                      ? event.data.title
                      : tab.title,
                  url: readyUrl,
                }
              : tab,
          ),
        );
        void connectBridge(iframeWindow, event.origin, readyUrl, loadIdRef.current);
      }
      if (event.data?.type === 'result' && typeof event.data?.commandId === 'string') {
        const connection = bridgeConnectionRef.current;
        if (!connection?.connected || event.data.clientId !== connection.clientId) return;
        const resultPromise = postBridgeResult({
          commandId: event.data.commandId,
          epoch: event.data.epoch,
          error: event.data.error,
          result: event.data.result,
        });
        const commandId = event.data.commandId;
        const actionFailed = Boolean(event.data.error);
        void resultPromise.then((delivered) => {
          setActiveBridgeAction((previous) =>
            previous && previous.commandId === commandId
              ? {
                  ...previous,
                  phase: delivered && !actionFailed ? 'success' : 'error',
                }
              : previous,
          );
          const pendingTab = pendingCommandTabsRef.current.get(commandId);
          pendingCommandTabsRef.current.delete(commandId);
          if (!pendingTab || !delivered || actionFailed) return;
          openPanelTab(pendingTab.url, pendingTab.title);
        });
      }
      if (event.data?.type === 'action-state' && typeof event.data?.commandId === 'string') {
        const connection = bridgeConnectionRef.current;
        if (!connection?.connected || event.data.clientId !== connection.clientId) return;
        const phase = event.data.phase;
        if (phase !== 'start' && phase !== 'success' && phase !== 'error') return;
        if (phase !== 'success') {
          setActiveBridgeAction({
            action: event.data.action,
            commandId: event.data.commandId,
            phase,
            target: event.data.target,
          });
        }
      }
      if (event.data?.type === 'navigation-state' && typeof event.data?.url === 'string') {
        const connection = bridgeConnectionRef.current;
        if (!connection?.connected || event.data.clientId !== connection.clientId) return;
        setIsPageLoading(event.data.phase === 'start');
      }
      if (event.data?.type === 'open-tab' && typeof event.data?.url === 'string') {
        const connection = bridgeConnectionRef.current;
        if (!connection?.connected || event.data.clientId !== connection.clientId) return;
        const pendingTab = {
          title: typeof event.data.title === 'string' ? event.data.title : undefined,
          url: event.data.url,
        };
        if (typeof event.data.commandId === 'string') {
          pendingCommandTabsRef.current.set(event.data.commandId, pendingTab);
        } else {
          openPanelTab(pendingTab.url, pendingTab.title);
        }
      }
      if (event.data?.type === 'user-intervention') {
        const connection = bridgeConnectionRef.current;
        if (!connection?.connected || event.data.clientId !== connection.clientId) return;
        setLocalState((previous) =>
          previous ? { ...previous, taskState: 'paused_by_user_intervention' } : previous,
        );
        void fetch('/api/browser/bridge', {
          body: JSON.stringify({
            action: 'interrupt',
            clientId: connection.clientId,
            sessionId,
          }),
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        });
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
      void cleanupBridgeConnection();
    };
  }, [
    cleanupBridgeConnection,
    connectBridge,
    expectedBridgeOrigin,
    isIframeMode,
    openPanelTab,
    postBridgeResult,
    sessionId,
  ]);

  if (!currentState) {
    return (
      <div className={styles.empty}>No browser data yet. Ask the AI to navigate somewhere.</div>
    );
  }

  const modeLabel = isIframeMode ? 'Iframe' : 'Remote';
  const targetHighlight = activeBridgeAction?.target || currentState.pageState?.targetHighlight;
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
  const actionLabel =
    activeBridgeAction?.phase === 'error'
      ? 'AI 操作失败'
      : activeBridgeAction?.phase === 'success'
        ? 'AI 已完成'
        : activeBridgeAction?.action === 'fill'
          ? 'AI 正在输入'
          : activeBridgeAction?.action === 'submit'
            ? 'AI 准备提交'
            : 'AI 正在操作';
  const bridgeUnavailable = isIframeMode && bridgeStatus === 'unavailable';

  const pauseByIntervention = () => {
    if (!isControlling || isIframeMode) return;

    void interruptAutomation('viewport');
  };

  const switchToRemote = async () => {
    const remoteUrl = remoteCandidateUrl || displayUrl || url;
    if (!remoteUrl || isSwitching) return;

    setIsSwitching(true);
    setSwitchError(undefined);
    try {
      const res = await fetch('/api/browser/action', {
        body: JSON.stringify({
          action: 'navigate',
          params: { mode: 'remote', url: remoteUrl },
          sessionId,
        }),
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      const data = await res.json().catch(() => undefined);
      if (!res.ok) throw new Error(data?.error || `Remote switch failed with HTTP ${res.status}`);

      setLocalState({ ...data, sessionId });
      setRemoteCandidateUrl(undefined);
    } catch (err) {
      setSwitchError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSwitching(false);
    }
  };

  const handleIframeLoad = (event: SyntheticEvent<HTMLIFrameElement>) => {
    const iframe = event.currentTarget;
    const tabId = iframe.dataset.browserTabId;

    if (tabId === activeTabId) {
      iframeRef.current = iframe;
      setIsPageLoading(false);
      setActiveBridgeAction(undefined);
    }
    if (isIframeMode) installIframeSamePanelNavigationGuard(iframe, openPanelTab);
    if (!isIframeMode || !expectedBridgeOrigin || tabId !== activeTabId) return;
    if (tabId) loadedIframeTabsRef.current.add(tabId);
    prepareBridgeConnection(iframe, expectedBridgeOrigin, true);
  };

  return (
    <Flexbox className={styles.container}>
      <div className={styles.toolbar}>
        <div className={styles.modeBadge}>{modeLabel}</div>
        <div className={styles.urlBar}>
          <span>{displayTitle || 'Browser'}</span>
          {displayUrl && <span className={styles.urlText}>{displayUrl}</span>}
        </div>
        {isIframeMode && (
          <button
            className={styles.actionButton}
            disabled={!(remoteCandidateUrl || displayUrl || url) || isSwitching}
            type="button"
            onClick={switchToRemote}
          >
            {isSwitching ? 'Switching...' : 'Use Remote'}
          </button>
        )}
      </div>
      {isIframeMode && tabs.length > 1 && (
        <div aria-label="Browser tabs" className={styles.tabs} role="tablist">
          {tabs.map((tab) => (
            <div className={styles.tab} data-active={tab.id === activeTabId} key={tab.id}>
              <button
                aria-selected={tab.id === activeTabId}
                className={styles.tabActivate}
                role="tab"
                title={tab.title}
                type="button"
                onClick={() => {
                  if (tab.id === activeTabId) return;
                  setActiveTabId(tab.id);
                  setIsPageLoading(true);
                  setActiveBridgeAction(undefined);
                }}
              >
                <span className={styles.tabLabel}>{tab.title}</span>
              </button>
              <button
                aria-label={`Close ${tab.title}`}
                className={styles.tabClose}
                title={`Close ${tab.title}`}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  closePanelTab(tab.id);
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      {(switchError || bridgeUnavailable) && (
        <div className={styles.notice}>{switchError || 'Bridge unavailable.'}</div>
      )}
      {displayUrl ? (
        <div
          className={`${styles.viewportFrame} ${isControlling ? styles.takeoverFrame : ''}`}
          data-agent-state={taskState}
          onClickCapture={pauseByIntervention}
          onKeyDownCapture={pauseByIntervention}
          onWheelCapture={pauseByIntervention}
        >
          {isPageLoading && <div aria-label="Browser page loading" className={styles.loadBar} />}
          {targetBoxVisible && (
            <div
              aria-label="Current browser target box"
              className={styles.targetBox}
              style={targetBoxStyle}
            >
              {targetLabel && (
                <span className={styles.targetBoxLabel}>
                  {actionLabel}：{targetLabel}
                </span>
              )}
            </div>
          )}
          {isControlling && targetLabel && !targetBoxVisible && (
            <div aria-label="Current browser target" className={styles.targetHighlight}>
              {actionLabel}：{targetLabel}
            </div>
          )}
          {isIframeMode ? (
            tabs.map((tab) => (
              <iframe
                className={`${styles.iframe} ${tab.id === activeTabId ? '' : styles.iframeHidden}`}
                data-browser-tab-id={tab.id}
                key={tab.id}
                // The browser panel needs same-origin scripts for interactive iframe pages; remote mode is still used for blocked sites.
                // Do not allow popups to escape the sandbox; external browsing must use the explicit Open action.
                // eslint-disable-next-line @eslint-react/dom/no-unsafe-iframe-sandbox
                sandbox="allow-scripts allow-same-origin allow-forms allow-downloads"
                src={tab.srcUrl}
                title={tab.title}
                ref={(node) => {
                  if (node) {
                    iframeRefs.current.set(tab.id, node);
                    if (tab.id === activeTabId) iframeRef.current = node;
                  } else {
                    iframeRefs.current.delete(tab.id);
                  }
                }}
                onLoad={handleIframeLoad}
              />
            ))
          ) : (
            <iframe
              className={styles.iframe}
              ref={iframeRef}
              // eslint-disable-next-line @eslint-react/dom/no-unsafe-iframe-sandbox
              sandbox="allow-scripts allow-same-origin allow-forms allow-downloads"
              title={displayTitle ?? 'Browser'}
              src={`/api/browser/proxy?session=${encodeURIComponent(sessionId)}${
                isControlling ? '&takeover=1' : ''
              }`}
              onLoad={handleIframeLoad}
            />
          )}
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
