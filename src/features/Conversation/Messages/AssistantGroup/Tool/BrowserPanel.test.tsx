/**
 * @vitest-environment happy-dom
 */
import type { BrowserState } from '@lobechat/builtin-tool-browser';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
  afterEach(() => {
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

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          inputType: 'click',
          sessionId: 'session-message',
          source: 'lobe-browser-viewer',
          type: 'user-input',
        },
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
