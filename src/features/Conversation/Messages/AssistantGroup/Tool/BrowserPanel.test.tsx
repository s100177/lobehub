/**
 * @vitest-environment happy-dom
 */
import type { BrowserState } from '@lobechat/builtin-tool-browser';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BROWSER_BRIDGE_SOURCE,
  BROWSER_BRIDGE_VERSION,
  BROWSER_HOST_SOURCE,
} from '../../../../../../packages/builtin-tool-browser/src/bridge';
import BrowserPanel, {
  installIframeSamePanelNavigationGuard,
} from '../../../../../../packages/builtin-tool-browser/src/client/Portal/BrowserPanel';

vi.mock('@lobehub/ui', () => ({
  Flexbox: ({ children, className }: { children?: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

vi.mock('antd-style', () => ({
  createStaticStyles: (factory: any) =>
    factory({
      css: () => 'mock-class',
      cssVar: {
        colorBgContainer: '#fff',
        colorBgElevated: '#fff',
        colorBorder: '#ddd',
        colorBorderSecondary: '#eee',
        colorFillQuaternary: '#f7f7f7',
        colorPrimary: '#1677ff',
        colorText: '#111',
        colorTextDescription: '#666',
        colorTextDisabled: '#aaa',
        colorTextSecondary: '#444',
        fontFamilyCode: 'monospace',
      },
    }),
}));

describe('BrowserPanel clean browser rendering', () => {
  beforeEach(() => {
    vi.useRealTimers();
    const happyDOM = (
      window as typeof window & {
        happyDOM: {
          settings: {
            disableIframePageLoading: boolean;
            handleDisabledFileLoadingAsSuccess: boolean;
          };
        };
      }
    ).happyDOM;
    happyDOM.settings.disableIframePageLoading = true;
    happyDOM.settings.handleDisabledFileLoadingAsSuccess = true;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('renders embeddable pages directly in iframe mode', () => {
    const state: BrowserState = {
      embeddable: true,
      iframeUrl: 'http://localhost:4311/iframe-ok.html',
      mode: 'iframe',
      title: 'Iframe OK',
      url: 'http://localhost:4311/iframe-ok.html',
    };

    render(<BrowserPanel sessionId="session-1" state={state} />);

    expect(screen.getByText('Iframe')).toBeInTheDocument();
    expect(screen.getByTitle('Iframe OK')).toHaveAttribute(
      'src',
      'http://localhost:4311/iframe-ok.html',
    );
  });

  it('keeps iframe pages sandboxed from opening system browser popups', () => {
    const state: BrowserState = {
      embeddable: true,
      iframeUrl: 'https://sina.com.cn/',
      mode: 'iframe',
      title: 'Sina',
      url: 'https://sina.com.cn/',
    };

    render(<BrowserPanel sessionId="session-sandbox" state={state} />);

    const iframe = screen.getByTitle('Sina');
    expect(iframe).toHaveAttribute('sandbox');
    expect(iframe.getAttribute('sandbox')).not.toContain('allow-popups');
  });

  it('keeps target blank links inside same-origin iframe pages', () => {
    const documentStub = document.implementation.createHTMLDocument('Business');
    documentStub.body.innerHTML = '<a id="policy" href="/policy" target="_blank">Policy</a>';
    const iframeWindow = {
      location: { href: 'http://localhost/business' },
      MutationObserver: window.MutationObserver,
    };
    const iframe = {
      contentDocument: documentStub,
      contentWindow: iframeWindow,
    } as unknown as HTMLIFrameElement;

    expect(installIframeSamePanelNavigationGuard(iframe)).toBe(true);
    expect(documentStub.getElementById('policy')?.getAttribute('target')).toBe('_self');
    expect(documentStub.getElementById('policy')?.getAttribute('data-lobe-original-target')).toBe(
      '_blank',
    );

    const link = documentStub.getElementById('policy')!;
    const clickEvent = new MouseEvent('click', {
      bubbles: true,
      button: 0,
      cancelable: true,
      ctrlKey: true,
    });
    link.dispatchEvent(clickEvent);

    expect(clickEvent.defaultPrevented).toBe(true);
    expect(iframeWindow.location.href).toBe('http://localhost/policy');
  });

  it('keeps window.open calls inside same-origin iframe pages', () => {
    const iframeWindow = {
      location: { href: 'http://localhost/business' },
      MutationObserver: window.MutationObserver,
    };
    const iframe = {
      contentDocument: document.implementation.createHTMLDocument('Business'),
      contentWindow: iframeWindow,
    } as unknown as HTMLIFrameElement;

    expect(installIframeSamePanelNavigationGuard(iframe)).toBe(true);

    const openedWindow = (iframeWindow as unknown as Window).open('/details');

    expect(openedWindow).toBe(iframeWindow);
    expect(iframeWindow.location.href).toBe('http://localhost/details');
  });

  it('renders the remote viewer when remote mode is selected', () => {
    const state: BrowserState = {
      embeddable: false,
      mode: 'remote',
      title: 'Baidu',
      url: 'https://www.baidu.com/',
    };

    render(<BrowserPanel sessionId="session-remote" state={state} />);

    expect(screen.getByText('Remote')).toBeInTheDocument();
    expect(screen.getByTitle('Baidu')).toHaveAttribute(
      'src',
      '/api/browser/proxy?session=session-remote',
    );
    expect(screen.queryByText('Use Remote')).not.toBeInTheDocument();
  });

  it('can switch an iframe page to remote mode', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        embeddable: false,
        mode: 'remote',
        title: 'Remote Page',
        url: 'http://localhost:4311/iframe-ok.html',
      }),
      ok: true,
      status: 200,
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <BrowserPanel
        sessionId="topic-1"
        state={{
          embeddable: true,
          mode: 'iframe',
          title: 'Iframe OK',
          url: 'http://localhost:4311/iframe-ok.html',
        }}
      />,
    );

    fireEvent.click(screen.getByText('Use Remote'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/browser/action', {
        body: JSON.stringify({
          action: 'navigate',
          params: { mode: 'remote', url: 'http://localhost:4311/iframe-ok.html' },
          sessionId: 'topic-1',
        }),
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
    });
    await waitFor(() => {
      expect(screen.getByTitle('Remote Page')).toHaveAttribute(
        'src',
        '/api/browser/proxy?session=topic-1',
      );
    });
  });

  it('connects the visible iframe bridge, polls commands, and reports results', async () => {
    let pollCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/browser/bridge' && JSON.parse(String(_init?.body)).action === 'connect') {
        return {
          json: async () => ({ connected: true }),
          ok: true,
          status: 200,
        };
      }

      if (url.startsWith('/api/browser/bridge?')) {
        pollCount += 1;

        if (pollCount === 1) {
          return {
            json: async () => ({
              command: { action: 'inspect', epoch: 1, id: 'cmd-1', params: {} },
            }),
            ok: true,
            status: 200,
          };
        }

        return new Promise((_, reject) => {
          _init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('The operation was aborted.', 'AbortError')),
            { once: true },
          );
        });
      }

      if (url === '/api/browser/bridge' && JSON.parse(String(_init?.body)).action === 'result') {
        return {
          json: async () => ({ ok: true }),
          ok: true,
          status: 200,
        };
      }

      if (
        url === '/api/browser/bridge' &&
        JSON.parse(String(_init?.body)).action === 'disconnect'
      ) {
        return {
          json: async () => ({ ok: true }),
          ok: true,
          status: 200,
        };
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { unmount } = render(
      <BrowserPanel
        sessionId="session-bridge"
        state={{
          embeddable: true,
          iframeUrl: 'https://app.example/form',
          mode: 'iframe',
          title: 'Bridge Form',
          url: 'https://app.example/form',
        }}
      />,
    );

    const iframe = screen.getByTitle('Bridge Form') as HTMLIFrameElement;
    const iframeWindow = { postMessage: vi.fn() } as unknown as Window;
    Object.defineProperty(iframe, 'contentWindow', { configurable: true, value: iframeWindow });

    fireEvent.load(iframe);

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          source: BROWSER_BRIDGE_SOURCE,
          type: 'ready',
          version: BROWSER_BRIDGE_VERSION,
        },
        origin: 'https://evil.example',
        source: iframeWindow,
      }),
    );
    expect(
      fetchMock.mock.calls.filter(
        ([requestUrl, init]) =>
          requestUrl === '/api/browser/bridge' &&
          JSON.parse(String(init?.body)).action === 'connect',
      ),
    ).toHaveLength(0);

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          source: BROWSER_BRIDGE_SOURCE,
          type: 'ready',
          version: BROWSER_BRIDGE_VERSION,
        },
        origin: 'https://app.example',
        source: window,
      }),
    );

    expect(
      fetchMock.mock.calls.filter(
        ([requestUrl, init]) =>
          requestUrl === '/api/browser/bridge' &&
          JSON.parse(String(init?.body)).action === 'connect',
      ),
    ).toHaveLength(0);

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          source: BROWSER_BRIDGE_SOURCE,
          type: 'ready',
          version: BROWSER_BRIDGE_VERSION,
        },
        origin: 'https://app.example',
        source: iframeWindow,
      }),
    );
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          source: BROWSER_BRIDGE_SOURCE,
          type: 'ready',
          version: BROWSER_BRIDGE_VERSION,
        },
        origin: 'https://app.example',
        source: iframeWindow,
      }),
    );

    let bridgeClientId = '';
    await waitFor(() => {
      const connectCall = fetchMock.mock.calls.find(
        ([requestUrl, init]) =>
          requestUrl === '/api/browser/bridge' &&
          JSON.parse(String(init?.body)).action === 'connect',
      );

      expect(connectCall).toBeDefined();

      const connectInit = connectCall?.[1] as RequestInit;
      const body = JSON.parse(String(connectInit.body));
      bridgeClientId = body.clientId;

      expect(body).toEqual({
        action: 'connect',
        clientId: expect.any(String),
        sessionId: 'session-bridge',
        url: 'https://app.example/form',
      });
      expect(connectInit.cache).toBe('no-store');
      expect(connectInit.headers).toEqual({ 'Content-Type': 'application/json' });
      expect(connectInit.method).toBe('POST');
    });
    expect(
      fetchMock.mock.calls.filter(
        ([requestUrl, init]) =>
          requestUrl === '/api/browser/bridge' &&
          JSON.parse(String(init?.body)).action === 'connect',
      ),
    ).toHaveLength(1);

    await waitFor(() => {
      const pollCall = fetchMock.mock.calls.find(([requestUrl]) =>
        String(requestUrl).startsWith('/api/browser/bridge?'),
      );

      expect(pollCall).toBeDefined();

      const pollInit = pollCall?.[1] as RequestInit;
      expect(String(pollCall?.[0])).toContain(`clientId=${encodeURIComponent(bridgeClientId)}`);
      expect(String(pollCall?.[0])).toContain('sessionId=session-bridge');
      expect(pollInit.cache).toBe('no-store');
      expect(pollInit.method).toBe('GET');
      expect(pollInit.signal).toBeInstanceOf(AbortSignal);
    });

    await waitFor(() => {
      expect((iframeWindow as any).postMessage).toHaveBeenCalledWith(
        {
          command: {
            action: 'inspect',
            epoch: 1,
            id: 'cmd-1',
            params: {},
          },
          clientId: bridgeClientId,
          sessionId: 'session-bridge',
          source: BROWSER_HOST_SOURCE,
          type: 'command',
          version: BROWSER_BRIDGE_VERSION,
        },
        'https://app.example',
      );
    });

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          clientId: bridgeClientId,
          commandId: 'cmd-1',
          epoch: 1,
          result: { title: 'Form', url: 'https://app.example/form' },
          source: BROWSER_BRIDGE_SOURCE,
          type: 'result',
          version: BROWSER_BRIDGE_VERSION,
        },
        origin: 'https://evil.example',
        source: iframeWindow,
      }),
    );

    expect(
      fetchMock.mock.calls.filter(
        ([requestUrl, init]) =>
          requestUrl === '/api/browser/bridge' &&
          JSON.parse(String(init?.body)).action === 'result',
      ),
    ).toHaveLength(0);

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          clientId: 'stale-client',
          commandId: 'cmd-1',
          epoch: 1,
          result: { title: 'Old Form', url: 'https://app.example/old' },
          source: BROWSER_BRIDGE_SOURCE,
          type: 'result',
          version: BROWSER_BRIDGE_VERSION,
        },
        origin: 'https://app.example',
        source: iframeWindow,
      }),
    );

    expect(
      fetchMock.mock.calls.filter(
        ([requestUrl, init]) =>
          requestUrl === '/api/browser/bridge' &&
          JSON.parse(String(init?.body)).action === 'result',
      ),
    ).toHaveLength(0);

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          clientId: bridgeClientId,
          commandId: 'cmd-1',
          epoch: 1,
          result: { title: 'Form', url: 'https://app.example/form' },
          source: BROWSER_BRIDGE_SOURCE,
          type: 'result',
          version: BROWSER_BRIDGE_VERSION,
        },
        origin: 'https://app.example',
        source: iframeWindow,
      }),
    );

    await waitFor(() => {
      const resultCall = fetchMock.mock.calls.find(
        ([requestUrl, init]) =>
          requestUrl === '/api/browser/bridge' &&
          JSON.parse(String(init?.body)).action === 'result',
      );

      expect(resultCall).toBeDefined();

      const resultInit = resultCall?.[1] as RequestInit;
      const body = JSON.parse(String(resultInit.body));

      expect(body).toEqual({
        action: 'result',
        clientId: bridgeClientId,
        commandId: 'cmd-1',
        epoch: 1,
        result: { title: 'Form', url: 'https://app.example/form' },
        sessionId: 'session-bridge',
      });
      expect(resultInit.cache).toBe('no-store');
      expect(resultInit.headers).toEqual({ 'Content-Type': 'application/json' });
      expect(resultInit.method).toBe('POST');
    });

    unmount();

    await waitFor(() => {
      const disconnectCall = fetchMock.mock.calls.find(
        ([requestUrl, init]) =>
          requestUrl === '/api/browser/bridge' &&
          JSON.parse(String(init?.body)).action === 'disconnect',
      );

      expect(disconnectCall).toBeDefined();

      const disconnectInit = disconnectCall?.[1] as RequestInit;
      const body = JSON.parse(String(disconnectInit.body));

      expect(body).toEqual({
        action: 'disconnect',
        clientId: bridgeClientId,
        sessionId: 'session-bridge',
      });
    });
  });

  it('shows bridge unavailable while keeping remote fallback for iframe pages without the sdk', async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        embeddable: false,
        mode: 'remote',
        title: 'Remote Fallback',
        url: 'https://app.example/form',
      }),
      ok: true,
      status: 200,
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <BrowserPanel
        sessionId="session-no-sdk"
        state={{
          embeddable: true,
          iframeUrl: 'https://app.example/form',
          mode: 'iframe',
          title: 'No SDK',
          url: 'https://app.example/form',
        }}
      />,
    );

    const iframe = screen.getByTitle('No SDK') as HTMLIFrameElement;
    Object.defineProperty(iframe, 'contentWindow', { configurable: true, value: {} });

    fireEvent.load(iframe);
    await act(async () => {
      vi.advanceTimersByTime(1600);
    });
    expect(screen.getByText('Bridge unavailable.')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Use Remote'));
    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/browser/action', {
      body: JSON.stringify({
        action: 'navigate',
        params: { mode: 'remote', url: 'https://app.example/form' },
        sessionId: 'session-no-sdk',
      }),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
  });

  it('does not expose internal workflow state by default', () => {
    const state: BrowserState = {
      actionEvents: [
        {
          action: 'navigate',
          id: 'event-1',
          status: 'success',
          summary: 'Opened https://example.com/checkout',
          timestamp: 1,
        },
      ],
      embeddable: false,
      executionTimeline: [
        {
          action: 'interrupt',
          id: 'audit-1',
          status: 'blocked',
          summary: 'Automation paused because the user performed click in the browser.',
          timestamp: 3,
        },
      ],
      mode: 'remote',
      pageState: {
        confirmBeforeProceed: true,
        gaps: ['login_required'],
        loggedIn: false,
        needsUserAttention: true,
        pageType: 'purchase',
        suggestedTasks: [
          {
            intent: 'configure_before_purchase',
            reason: '页面存在云服务器配置字段和购买风险动作',
            risk: 'medium',
            title: '配置个人建站服务器但停在下单前',
          },
        ],
        workflowHints: ['读取配置并停在确认前'],
      },
      riskBlock: {
        action: 'click',
        reason: 'Blocked risky click on "立即购买"',
        requiresUserConfirmation: true,
        risk: 'purchase',
        targetText: '立即购买',
      },
      taskState: 'needs_more_info',
      title: 'Checkout',
      url: 'https://example.com/checkout',
    };

    render(<BrowserPanel sessionId="session-clean" state={state} />);

    expect(screen.getByTitle('Checkout')).toHaveAttribute(
      'src',
      '/api/browser/proxy?session=session-clean',
    );
    expect(screen.queryByText(/Task State:/)).not.toBeInTheDocument();
    expect(screen.queryByText('当前页面推荐任务')).not.toBeInTheDocument();
    expect(screen.queryByText('审阅模式')).not.toBeInTheDocument();
    expect(screen.queryByText('需要你补充信息')).not.toBeInTheDocument();
    expect(screen.queryByText('Risky action blocked.')).not.toBeInTheDocument();
    expect(screen.queryByText('审计时间线')).not.toBeInTheDocument();
    expect(screen.queryByText('Workflow')).not.toBeInTheDocument();
    expect(screen.queryByText('Needs login')).not.toBeInTheDocument();
  });

  it('renders a viewport-relative target box while AI controls the browser', () => {
    render(
      <BrowserPanel
        sessionId="session-target-box"
        state={{
          embeddable: true,
          iframeUrl: 'http://localhost:4311/search.html',
          mode: 'iframe',
          pageState: {
            pageType: 'search',
            targetHighlight: {
              height: 44,
              label: '搜索输入框',
              selector: '#kw',
              width: 260,
              x: 120,
              y: 96,
            },
          },
          taskState: 'ai_controlling',
          title: 'Search',
          url: 'http://localhost:4311/search.html',
          viewport: { height: 800, width: 1280 },
        }}
      />,
    );

    const targetBox = screen.getByLabelText('Current browser target box');
    expect(targetBox).toHaveTextContent('搜索输入框');
    expect(targetBox).toHaveStyle({
      height: '5.5%',
      left: '9.375%',
      pointerEvents: 'none',
      top: '12%',
      width: '20.3125%',
    });
    expect(screen.queryByLabelText('Current browser target')).not.toBeInTheDocument();
  });

  it('uses the takeover proxy while AI controls the remote browser', () => {
    render(
      <BrowserPanel
        sessionId="session-remote-target"
        state={{
          embeddable: false,
          mode: 'remote',
          pageState: {
            pageType: 'purchase',
            targetHighlight: { label: '立即购买' },
          },
          taskState: 'ai_controlling',
          title: 'Remote Buy',
          url: 'https://example.com/buy',
        }}
      />,
    );

    expect(screen.getByLabelText('Current browser target')).toHaveTextContent('立即购买');
    expect(screen.queryByLabelText('Current browser target box')).not.toBeInTheDocument();
    expect(screen.getByTitle('Remote Buy')).toHaveAttribute(
      'src',
      '/api/browser/proxy?session=session-remote-target&takeover=1',
    );
  });

  it('pauses takeover when the user intervenes without showing a workflow console', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        embeddable: false,
        mode: 'remote',
        taskState: 'paused_by_user_intervention',
        title: 'Dashboard',
        url: 'https://example.com/dashboard',
      }),
      ok: true,
      status: 200,
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <BrowserPanel
        sessionId="session-pause"
        state={{
          embeddable: false,
          mode: 'remote',
          pageState: {
            pageType: 'dashboard',
            targetHighlight: { label: '资源列表' },
          },
          taskState: 'ai_controlling',
          title: 'Dashboard',
          url: 'https://example.com/dashboard',
        }}
      />,
    );

    fireEvent.click(screen.getByTitle('Dashboard'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/browser/action', {
        body: JSON.stringify({
          action: 'interrupt',
          params: {
            inputType: 'viewport',
            reason: 'Automation paused because the user performed viewport in the browser.',
          },
          sessionId: 'session-pause',
        }),
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
    });
    expect(screen.queryByText(/Task State:/)).not.toBeInTheDocument();
    expect(screen.queryByText('检测到人工介入')).not.toBeInTheDocument();
  });

  it('keeps manual iframe clicks native without interrupting automation', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(
      <BrowserPanel
        sessionId="session-iframe-manual"
        state={{
          embeddable: true,
          iframeUrl: 'https://app.example/dashboard',
          mode: 'iframe',
          pageState: {
            pageType: 'dashboard',
            targetHighlight: { label: '筛选条件' },
          },
          taskState: 'ai_controlling',
          title: 'Iframe Dashboard',
          url: 'https://app.example/dashboard',
        }}
      />,
    );

    fireEvent.click(screen.getByTitle('Iframe Dashboard'));

    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/browser/action',
      expect.objectContaining({
        body: expect.stringContaining('"action":"interrupt"'),
      }),
    );
  });

  it('pauses takeover when the remote viewer reports user input from inside the iframe', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        embeddable: false,
        mode: 'remote',
        taskState: 'paused_by_user_intervention',
        title: 'Remote Viewer',
        url: 'https://example.com/remote',
      }),
      ok: true,
      status: 200,
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <BrowserPanel
        sessionId="session-message"
        state={{
          embeddable: false,
          mode: 'remote',
          pageState: { pageType: 'dashboard' },
          taskState: 'ai_controlling',
          title: 'Remote Viewer',
          url: 'https://example.com/remote',
        }}
      />,
    );

    const iframe = screen.getByTitle('Remote Viewer') as HTMLIFrameElement;
    const viewerWindow = { postMessage: vi.fn() } as unknown as Window;
    Object.defineProperty(iframe, 'contentWindow', { configurable: true, value: viewerWindow });

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          inputType: 'click',
          sessionId: 'session-message',
          source: 'lobe-browser-viewer',
          type: 'user-input',
        },
        origin: window.location.origin,
        source: window,
      }),
    );
    expect(fetchMock).not.toHaveBeenCalled();

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          inputType: 'click',
          sessionId: 'session-message',
          source: 'lobe-browser-viewer',
          type: 'user-input',
        },
        origin: window.location.origin,
        source: viewerWindow,
      }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/browser/action', {
        body: JSON.stringify({
          action: 'interrupt',
          params: {
            inputType: 'click',
            reason: 'Automation paused because the user performed click in the browser.',
          },
          sessionId: 'session-message',
        }),
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
    });
    expect(screen.queryByText(/Task State:/)).not.toBeInTheDocument();
    expect(screen.queryByText('审计时间线')).not.toBeInTheDocument();
  });
});
