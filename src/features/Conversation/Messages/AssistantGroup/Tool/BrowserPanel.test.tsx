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
      executionTimeline: [
        {
          action: 'interrupt',
          id: 'audit-1',
          status: 'blocked',
          summary: 'Automation paused because the user performed click in the browser.',
          timestamp: 3,
        },
        {
          action: 'inspect',
          id: 'audit-2',
          status: 'completed',
          summary: 'Re-inspected page before resume.',
          timestamp: 4,
        },
      ],
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
    expect(screen.getByLabelText('Browser audit timeline')).toBeInTheDocument();
    expect(screen.getByText('审计时间线')).toBeInTheDocument();
    expect(
      screen.getByText('Automation paused because the user performed click in the browser.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Re-inspected page before resume.')).toBeInTheDocument();
  });

  it('selects a suggested task before authorizing plan execution', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        embeddable: false,
        executionEvents: [],
        mode: 'remote',
        taskState: 'completed',
        title: 'Purchase',
        url: 'https://example.com/purchase',
      }),
      ok: true,
      status: 200,
    });
    vi.stubGlobal('fetch', fetchMock);

    const state: BrowserState = {
      embeddable: false,
      executionState: {
        blockedStepId: 'risk_gate',
        completedStepIds: ['inspect'],
        cursor: 1,
        currentStepId: 'risk_gate',
        phase: 'risk_blocked',
        updatedAt: 1,
      },
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
        suggestedTasks: [
          {
            intent: 'explain_price',
            reason: '页面检测到价格和购买确认动作',
            risk: 'low',
            title: '解释当前配置的价格构成',
          },
          {
            intent: 'configure_before_purchase',
            reason: '页面存在云服务器配置字段和购买风险动作',
            risk: 'medium',
            title: '配置个人建站服务器但停在下单前',
          },
        ],
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
    expect(screen.getByLabelText('Browser interaction mode')).toHaveTextContent('审阅模式');
    expect(screen.getAllByText('purchase').length).toBeGreaterThan(0);
    expect(screen.getByText('Needs login')).toBeInTheDocument();
    expect(screen.getByText('Required')).toBeInTheDocument();
    expect(screen.getByText('Needs user input')).toBeInTheDocument();
    expect(screen.getByText('phase: risk_blocked')).toBeInTheDocument();
    expect(screen.getByText('cursor: 1')).toBeInTheDocument();
    expect(screen.getByText('step: risk_gate')).toBeInTheDocument();
    expect(screen.getAllByText('读取配置并停在确认前').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Browser suggested tasks')).toHaveTextContent(
      '解释当前配置的价格构成',
    );
    expect(screen.getByLabelText('Browser suggested tasks')).toHaveTextContent('low');
    expect(screen.getByLabelText('Browser suggested tasks')).toHaveTextContent(
      '配置个人建站服务器但停在下单前',
    );
    expect(screen.getByLabelText('Browser suggested tasks')).toHaveTextContent('medium');
    fireEvent.click(screen.getByText('配置个人建站服务器但停在下单前'));
    expect(screen.getByText('已选择推荐任务')).toBeInTheDocument();
    expect(screen.getByLabelText('Browser authorization card')).toHaveTextContent(
      '配置个人建站服务器但停在下单前',
    );
    expect(screen.getByLabelText('Browser agent plan')).toHaveTextContent('页面技能包 workflow');
    expect(screen.getByLabelText('Browser agent plan')).toHaveTextContent('completed');
    expect(screen.getByLabelText('Browser agent plan')).toHaveTextContent('blocked');
    expect(screen.getByText('读取当前配置、价格和登录态')).toBeInTheDocument();
    expect(
      screen.getByText('停在购买、支付或提交订单前等待用户确认 (purchase)'),
    ).toBeInTheDocument();
    expect(screen.getByText('login_required')).toBeInTheDocument();
    expect(screen.getByText('提交前确认 - 提交后不可撤销')).toBeInTheDocument();

    fireEvent.click(screen.getByText('帮我操作'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/browser/action', {
        body: JSON.stringify({
          action: 'executePlan',
          params: {
            authorized: true,
            inputs: {},
            intent: 'configure_before_purchase',
            maxSteps: 4,
          },
          sessionId: 'session-signal',
        }),
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
    });
  });

  it('authorizes AI takeover and executes the safe browser plan', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        embeddable: false,
        executionEvents: [
          {
            action: 'inspect',
            id: 'inspect',
            status: 'completed',
            summary: '读取当前页面状态',
            timestamp: 1,
          },
          {
            action: 'fill',
            id: 'fill_query',
            status: 'completed',
            summary: 'Filled 搜索',
            target: '#kw',
            timestamp: 2,
          },
        ],
        mode: 'remote',
        pageState: {
          pageType: 'search',
          targetHighlight: { label: '搜索输入框' },
        },
        taskState: 'completed',
        title: 'Workflow',
        url: 'https://example.com/workflow',
      }),
      ok: true,
      status: 200,
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <BrowserPanel
        sessionId="session-auth"
        state={{
          embeddable: false,
          mode: 'remote',
          pageState: {
            pageType: 'search',
            targetHighlight: { label: '搜索输入框' },
            workflowHints: ['先读取页面状态', '提交搜索'],
          },
          taskState: 'waiting_user_authorization',
          title: 'Workflow',
          url: 'https://example.com/workflow',
        }}
      />,
    );

    expect(screen.getByLabelText('Browser authorization card')).toBeInTheDocument();
    expect(screen.getByLabelText('Browser interaction mode')).toHaveTextContent('审阅模式');

    fireEvent.click(screen.getByText('帮我操作'));

    expect(screen.getByText('Task State: ai_controlling')).toBeInTheDocument();
    expect(screen.getByLabelText('Browser interaction mode')).toHaveTextContent('界面模式');
    expect(screen.getByText('User authorized AI browser control.')).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/browser/action', {
        body: JSON.stringify({
          action: 'executePlan',
          params: { authorized: true, inputs: {}, maxSteps: 4 },
          sessionId: 'session-auth',
        }),
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Task State: completed')).toBeInTheDocument();
    });
    expect(screen.getByText('Filled 搜索')).toBeInTheDocument();
  });

  it('renders a viewport-relative target box in iframe takeover without intercepting input', () => {
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

  it('keeps the target label fallback when remote viewer owns bbox drawing', () => {
    render(
      <BrowserPanel
        sessionId="session-remote-target"
        state={{
          embeddable: false,
          mode: 'remote',
          pageState: {
            pageType: 'purchase',
            targetHighlight: {
              height: 42,
              label: '立即购买',
              selector: '#buy',
              width: 180,
              x: 340,
              y: 420,
            },
          },
          taskState: 'ai_controlling',
          title: 'Remote Buy',
          url: 'https://example.com/buy',
          viewport: { height: 800, width: 1280 },
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

  it('pauses takeover when the user intervenes and re-inspects before continuing', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({
          embeddable: false,
          executionEvents: [
            {
              action: 'interrupt',
              id: 'user_intervention:1',
              status: 'blocked',
              summary: 'Automation paused because the user performed viewport in the browser.',
              timestamp: 1,
            },
          ],
          executionState: {
            blockedStepId: 'inspect_current_page',
            completedStepIds: [],
            currentStepId: 'inspect_current_page',
            cursor: 0,
            phase: 'paused_by_user_intervention',
            updatedAt: 1,
          },
          mode: 'remote',
          pageState: { pageType: 'dashboard' },
          taskState: 'paused_by_user_intervention',
          title: 'Dashboard',
          url: 'https://example.com/dashboard',
        }),
        ok: true,
        status: 200,
      })
      .mockResolvedValueOnce({
        json: async () => ({
          embeddable: false,
          mode: 'remote',
          pageState: { pageType: 'dashboard' },
          taskState: 'ai_controlling',
          title: 'Dashboard',
          url: 'https://example.com/dashboard',
        }),
        ok: true,
        status: 200,
      })
      .mockResolvedValueOnce({
        json: async () => ({
          embeddable: false,
          executionEvents: [
            {
              action: 'verify',
              id: 'verify_state',
              status: 'completed',
              summary: '重新读取后继续执行',
              timestamp: 1,
            },
          ],
          executionState: {
            completedStepIds: ['verify_state'],
            cursor: 2,
            phase: 'completed',
            updatedAt: 1,
          },
          mode: 'remote',
          pageState: { pageType: 'dashboard' },
          taskState: 'completed',
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
    expect(screen.getByLabelText('Browser interaction mode')).toHaveTextContent('接管模式');
    expect(screen.getByLabelText('Browser pause card')).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/browser/action', {
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

    fireEvent.click(screen.getByText('重新读取并继续'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/browser/action', {
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
      expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/browser/action', {
        body: JSON.stringify({
          action: 'executePlan',
          params: { authorized: true, inputs: {}, maxSteps: 4 },
          sessionId: 'session-pause',
        }),
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Task State: completed')).toBeInTheDocument();
    });
    expect(screen.getByText('重新读取后继续执行')).toBeInTheDocument();
  });

  it('pauses takeover when the remote viewer reports user input from inside the iframe', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        embeddable: false,
        executionEvents: [
          {
            action: 'interrupt',
            id: 'user_intervention:2',
            status: 'blocked',
            summary: 'Automation paused because the user performed click in the browser.',
            timestamp: 1,
          },
        ],
        executionState: {
          completedStepIds: [],
          cursor: 0,
          phase: 'paused_by_user_intervention',
          updatedAt: 1,
        },
        executionTimeline: [
          {
            action: 'interrupt',
            id: 'user_intervention:2',
            status: 'blocked',
            summary: 'Automation paused because the user performed click in the browser.',
            timestamp: 1,
          },
        ],
        mode: 'remote',
        pageState: { pageType: 'dashboard' },
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
    expect(screen.getByLabelText('Browser interaction mode')).toHaveTextContent('接管模式');
    expect(
      screen.getAllByText('Automation paused because the user performed click in the browser.'),
    ).toHaveLength(2);
    expect(screen.getByLabelText('Browser audit timeline')).toBeInTheDocument();
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

  it('collects multiple structured clarification inputs and passes them into plan execution', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        embeddable: false,
        executionEvents: [
          {
            action: 'select',
            id: 'select_region',
            status: 'completed',
            summary: '选择部署地域',
            target: '#region',
            timestamp: 1,
          },
        ],
        mode: 'remote',
        taskState: 'completed',
        title: 'Cloud Buy',
        url: 'https://example.com/buy',
      }),
      ok: true,
      status: 200,
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <BrowserPanel
        sessionId="session-clarify"
        state={{
          embeddable: false,
          mode: 'remote',
          pageState: {
            clarifications: [
              {
                field: 'region',
                id: 'region',
                options: [
                  { id: 'sh', label: '上海', value: 'shanghai' },
                  { id: 'bj', label: '北京', value: 'beijing' },
                ],
                question: '请选择部署地域',
                required: true,
              },
              {
                field: 'scenario',
                id: 'scenario',
                options: [
                  { id: 'site', label: '个人建站', value: 'personal_site' },
                  { id: 'dev', label: '开发测试', value: 'dev_test' },
                ],
                question: '请选择使用场景',
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
    fireEvent.click(screen.getByText('保存回答'));
    fireEvent.click(screen.getByText('个人建站'));
    fireEvent.click(screen.getByText('保存回答'));
    fireEvent.click(screen.getByText('确认并继续规划'));

    expect(screen.getByText('Task State: waiting_user_authorization')).toBeInTheDocument();
    expect(screen.getByText('User answered clarification: shanghai')).toBeInTheDocument();
    expect(screen.getByText('User answered clarification: personal_site')).toBeInTheDocument();

    fireEvent.click(screen.getByText('帮我操作'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/browser/action', {
        body: JSON.stringify({
          action: 'executePlan',
          params: {
            authorized: true,
            inputs: { region: 'shanghai', scenario: 'personal_site' },
            maxSteps: 4,
          },
          sessionId: 'session-clarify',
        }),
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
    });
  });

  it('shows a non-executing risk decision card for dangerous browser actions', () => {
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
    expect(screen.getByText('允许本次，我手动完成')).toBeInTheDocument();
    expect(screen.getByText('我手动处理')).toBeInTheDocument();
    expect(screen.getByText('取消任务')).toBeInTheDocument();
    expect(screen.getByText('Task State: risk_blocked')).toBeInTheDocument();
    expect(screen.getByLabelText('Browser interaction mode')).toHaveTextContent('审阅模式');

    fireEvent.click(screen.getByText('允许本次，我手动完成'));

    expect(screen.getByText('Task State: paused_by_user_intervention')).toBeInTheDocument();
    expect(screen.getByLabelText('Browser risk decision')).toHaveTextContent(
      'AI 不会自动点击或提交',
    );
    expect(
      screen.getByText(
        'User allowed this risky action for manual handling. AI did not execute it automatically.',
      ),
    ).toBeInTheDocument();
  });
});
