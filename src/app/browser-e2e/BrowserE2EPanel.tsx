'use client';

import { BrowserIdentifier, type BrowserState } from '@lobechat/builtin-tool-browser';
import { BrowserPortal } from '@lobechat/builtin-tool-browser/client';
import { useCallback, useEffect, useId, useMemo, useState } from 'react';

const BrowserE2EPanel = () => {
  const reactId = useId();
  const sessionId = `docker-ui-e2e-${reactId.replaceAll(':', '')}`;
  const [apiName, setApiName] = useState('navigate');
  const [state, setState] = useState<BrowserState>();
  const [error, setError] = useState<string>();
  const [toolUpdateComplete, setToolUpdateComplete] = useState(false);

  const fixtureUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';

    const params = new URLSearchParams(window.location.search);
    const path = params.get('path') || '/browser-e2e/fixture';

    return new URL(path, window.location.origin).toString();
  }, []);

  const callBrowserAction = useCallback(
    async (action: string, params: Record<string, unknown> = {}) => {
      const response = await fetch('/api/browser/action', {
        body: JSON.stringify({
          action,
          params,
          sessionId,
        }),
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });

      const data = await response.json().catch(() => undefined);
      if (!response.ok) {
        throw new Error(data?.error || `Browser action failed with HTTP ${response.status}`);
      }

      return data;
    },
    [sessionId],
  );

  useEffect(() => {
    if (!fixtureUrl) return;

    const navigate = async () => {
      const params = new URLSearchParams(window.location.search);
      const mode = params.get('mode') === 'iframe' ? 'iframe' : 'remote';
      const navigated = await callBrowserAction('navigate', {
        mode,
        timeout: 30_000,
        url: fixtureUrl,
      });
      const inspected = mode === 'remote' ? await callBrowserAction('inspect') : navigated;

      setState({ ...inspected, sessionId });
    };

    navigate().catch((err) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  }, [callBrowserAction, fixtureUrl, sessionId]);

  return (
    <main
      data-browser-e2e-session-id={sessionId}
      style={{
        background: '#eef2f7',
        color: '#0f172a',
        display: 'grid',
        gap: 16,
        gridTemplateRows: 'auto minmax(0, 1fr)',
        height: '100vh',
        padding: 16,
      }}
    >
      <header>
        <h1 style={{ fontSize: 18, margin: 0 }}>Browser Docker UI E2E</h1>
        <p style={{ margin: '6px 0 0' }}>
          This test page renders the real BrowserPanel against the deployed browser service.
        </p>
        {state?.mode === 'iframe' ? (
          <button
            data-testid="simulate-browser-tool-update"
            type="button"
            onClick={async () => {
              setToolUpdateComplete(false);
              try {
                const inspected = await callBrowserAction('inspect');
                setApiName('inspect');
                setState({ ...inspected, sessionId });
                setToolUpdateComplete(true);
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
              }
            }}
          >
            Run non-navigation tool update
          </button>
        ) : null}
        {toolUpdateComplete ? (
          <span data-testid="browser-tool-update-complete">Complete</span>
        ) : null}
      </header>
      <section
        style={{
          border: '1px solid #cbd5e1',
          borderRadius: 16,
          boxShadow: '0 18px 48px rgb(15 23 42 / 12%)',
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        {error ? (
          <pre style={{ color: '#b91c1c', padding: 16 }}>{error}</pre>
        ) : state ? (
          <BrowserPortal
            apiName={apiName}
            arguments={{}}
            identifier={BrowserIdentifier}
            messageId={sessionId}
            state={state}
          />
        ) : (
          <div style={{ padding: 16 }}>Loading deployed browser panel...</div>
        )}
      </section>
    </main>
  );
};

export default BrowserE2EPanel;
