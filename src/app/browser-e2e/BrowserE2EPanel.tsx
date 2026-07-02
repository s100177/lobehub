'use client';

import { BrowserIdentifier, type BrowserState } from '@lobechat/builtin-tool-browser';
import { BrowserPortal } from '@lobechat/builtin-tool-browser/client';
import { useEffect, useMemo, useState } from 'react';

const sessionId = `docker-ui-e2e-${Date.now()}`;

const BrowserE2EPanel = () => {
  const [state, setState] = useState<BrowserState>();
  const [error, setError] = useState<string>();

  const fixtureUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';

    const params = new URLSearchParams(window.location.search);
    const path = params.get('path') || '/browser-e2e/fixture';

    return new URL(path, window.location.origin).toString();
  }, []);

  useEffect(() => {
    if (!fixtureUrl) return;

    const callBrowserAction = async (action: string, params: Record<string, unknown> = {}) => {
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
    };

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
  }, [fixtureUrl]);

  return (
    <main
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
            apiName="navigate"
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
