/**
 * @vitest-environment happy-dom
 */
import type { BrowserState } from '@lobechat/builtin-tool-browser';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import BrowserPanel from '../../../../../../packages/builtin-tool-browser/src/client/Portal/BrowserPanel';

vi.mock('@lobehub/ui', () => ({
  Flexbox: ({ children, className }: { children?: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

vi.mock('antd-style', () => ({
  css: () => 'mock-css',
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
  cssVar: {
    colorText: '#111',
    colorTextDescription: '#666',
  },
  cx: (...classes: string[]) => classes.filter(Boolean).join(' '),
  keyframes: () => 'mock-keyframes',
}));

describe('BrowserPanel dual mode rendering', () => {
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

  it('renders page state, action timeline, and risk blocks inside the existing panel', () => {
    const state: BrowserState = {
      actionEvents: [
        {
          action: 'navigate',
          id: 'event-1',
          status: 'success',
          summary: 'Opened https://example.com/checkout',
          timestamp: 1,
        },
        {
          action: 'click',
          id: 'event-2',
          status: 'blocked',
          summary: 'Blocked risky click on "立即购买"',
          target: '#buy',
          timestamp: 2,
        },
      ],
      blocked: true,
      embeddable: false,
      mode: 'remote',
      pageState: {
        actions: [{ risk: 'purchase', text: '立即购买' }],
        prices: [{ label: '配置费用', value: '¥114.36' }],
        selectedOptions: ['南京', '2核4GB'],
      },
      riskBlock: {
        action: 'click',
        reason: 'Blocked risky click on "立即购买"',
        requiresUserConfirmation: true,
        risk: 'purchase',
        targetText: '立即购买',
      },
      title: 'Checkout',
      url: 'https://example.com/checkout',
    };

    render(<BrowserPanel sessionId="session-risk" state={state} />);

    expect(screen.getByText('Risky action blocked.')).toBeInTheDocument();
    expect(screen.getAllByText(/Blocked risky click on "立即购买"/)).toHaveLength(2);
    expect(screen.getByText('南京 / 2核4GB')).toBeInTheDocument();
    expect(screen.getByText('配置费用 ¥114.36')).toBeInTheDocument();
    expect(screen.getByText('立即购买')).toBeInTheDocument();
    expect(screen.getByText('Opened https://example.com/checkout')).toBeInTheDocument();
    expect(screen.getByText('Blocked risky click on "立即购买"')).toBeInTheDocument();
  });

  it('renders page intelligence signals for authorization and execution planning', () => {
    const state: BrowserState = {
      embeddable: false,
      mode: 'remote',
      taskState: 'waiting_user_authorization',
      pageState: {
        confirmBeforeProceed: true,
        confirmationPoints: [
          { id: 'before_submit', title: '提交前确认', reason: '提交后不可撤销' },
        ],
        gaps: ['login_required', 'missing_field_values'],
        loggedIn: false,
        needsUserAttention: true,
        pageType: 'purchase',
        workflowHints: ['读取配置并停在确认前'],
      },
      plan: {
        confirmationRequired: true,
        goal: '选择适合目标的云服务器配置并停在风险确认前',
        intent: 'cloud_server_purchase',
        source: 'skill_pack',
        steps: [
          {
            id: 'inspect',
            status: 'current',
            title: '读取当前配置、价格和登录态',
            type: 'inspect',
          },
          {
            id: 'risk_gate',
            risk: 'purchase',
            status: 'blocked',
            title: '停在购买、支付或提交订单前等待用户确认',
            type: 'risk_gate',
          },
        ],
      },
      title: 'Purchase',
      url: 'https://example.com/purchase',
    };

    render(<BrowserPanel sessionId="session-signal" state={state} />);

    expect(screen.getByText('Task State: waiting_user_authorization')).toBeInTheDocument();
    expect(screen.getAllByText('purchase').length).toBeGreaterThan(0);
    expect(screen.getByText('Needs login')).toBeInTheDocument();
    expect(screen.getByText('Required')).toBeInTheDocument();
    expect(screen.getByText('Needs user input')).toBeInTheDocument();
    expect(screen.getAllByText('读取配置并停在确认前').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Browser agent plan')).toHaveTextContent('页面技能包 workflow');
    expect(screen.getByText('读取当前配置、价格和登录态')).toBeInTheDocument();
    expect(
      screen.getByText('停在购买、支付或提交订单前等待用户确认 (purchase)'),
    ).toBeInTheDocument();
    expect(screen.getByText('login_required')).toBeInTheDocument();
    expect(screen.getByText('提交前确认 - 提交后不可撤销')).toBeInTheDocument();
  });

  it('authorizes AI takeover inside the browser panel without executing page actions', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(
      <BrowserPanel
        sessionId="session-auth"
        state={{
          embeddable: false,
          mode: 'remote',
          pageState: {
            pageType: 'form',
            targetHighlight: { label: '地域选择' },
            workflowHints: ['先读取页面状态', '停在提交前'],
          },
          taskState: 'waiting_user_authorization',
          title: 'Workflow',
          url: 'https://example.com/workflow',
        }}
      />,
    );

    expect(screen.getByLabelText('Browser authorization card')).toBeInTheDocument();

    fireEvent.click(screen.getByText('帮我操作'));

    expect(screen.getByText('Task State: ai_controlling')).toBeInTheDocument();
    expect(screen.getByLabelText('AI takeover status')).toBeInTheDocument();
    expect(screen.getByLabelText('Current browser target')).toHaveTextContent('地域选择');
    expect(screen.getByText('User authorized AI browser control.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('pauses takeover when the user intervenes and re-inspects before continuing', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        embeddable: false,
        mode: 'remote',
        pageState: { pageType: 'dashboard' },
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

    expect(screen.getByText('Task State: paused_by_user_intervention')).toBeInTheDocument();
    expect(screen.getByLabelText('Browser pause card')).toBeInTheDocument();

    fireEvent.click(screen.getByText('重新读取并继续'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/browser/action', {
        body: JSON.stringify({
          action: 'inspect',
          params: {},
          sessionId: 'session-pause',
        }),
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Task State: ai_controlling')).toBeInTheDocument();
    });
  });

  it('pauses takeover when the remote viewer reports user input from inside the iframe', async () => {
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

    act(() => {
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
    });

    await waitFor(() => {
      expect(screen.getByText('Task State: paused_by_user_intervention')).toBeInTheDocument();
    });
    expect(screen.getByText('Paused because user click in the remote viewer.')).toBeInTheDocument();
  });

  it('collects structured clarification before returning to authorization', () => {
    render(
      <BrowserPanel
        sessionId="session-clarify"
        state={{
          embeddable: false,
          mode: 'remote',
          pageState: {
            clarifications: [
              {
                id: 'region',
                options: [
                  { id: 'sh', label: '上海', value: 'shanghai' },
                  { id: 'bj', label: '北京', value: 'beijing' },
                ],
                question: '请选择部署地域',
                required: true,
              },
            ],
            pageType: 'purchase',
          },
          taskState: 'asking_clarification',
          title: 'Cloud Buy',
          url: 'https://example.com/buy',
        }}
      />,
    );

    expect(screen.getByLabelText('Browser clarification card')).toBeInTheDocument();
    fireEvent.click(screen.getByText('上海'));
    fireEvent.click(screen.getByText('确认并继续规划'));

    expect(screen.getByText('Task State: waiting_user_authorization')).toBeInTheDocument();
    expect(screen.getByText('User answered clarification: shanghai')).toBeInTheDocument();
  });

  it('shows a non-executing risk block card for dangerous browser actions', () => {
    render(
      <BrowserPanel
        sessionId="session-risk-card"
        state={{
          blocked: true,
          embeddable: false,
          mode: 'remote',
          riskBlock: {
            action: 'submit',
            reason: 'Blocked risky submit on "提交订单"',
            requiresUserConfirmation: true,
            risk: 'purchase',
            targetText: '提交订单',
          },
          taskState: 'risk_blocked',
          title: 'Order',
          url: 'https://example.com/order',
        }}
      />,
    );

    expect(screen.getByLabelText('Browser risk block card')).toHaveTextContent(
      'AI will not execute it automatically',
    );
    expect(screen.getByText('Task State: risk_blocked')).toBeInTheDocument();
  });
});
