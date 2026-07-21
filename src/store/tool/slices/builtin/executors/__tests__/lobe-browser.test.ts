import { BrowserApiName, BrowserIdentifier } from '@lobechat/builtin-tool-browser';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { invokeExecutor } from '../index';

describe('browser executor', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('proxies navigate actions and preserves browser state', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        title: 'Example Domain',
        url: 'https://example.com/',
        viewport: { height: 720, width: 1280 },
      }),
      ok: true,
      status: 200,
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await invokeExecutor(
      BrowserIdentifier,
      BrowserApiName.navigate,
      { url: 'https://example.com' },
      { messageId: 'tool-message-id', topicId: 'topic-1', toolCallId: 'call-1' },
    );

    expect(fetchMock).toHaveBeenCalledWith('/api/browser/action', {
      body: JSON.stringify({
        action: BrowserApiName.navigate,
        params: { url: 'https://example.com' },
        sessionId: 'topic-1',
      }),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      signal: undefined,
    });
    expect(result).toMatchObject({
      content: 'Navigated to https://example.com/\nTitle: Example Domain',
      state: {
        sessionId: 'topic-1',
        title: 'Example Domain',
        url: 'https://example.com/',
      },
      success: true,
    });
  });

  it('proxies submit actions through the same browser session', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        title: 'Baidu Search',
        url: 'https://www.baidu.com/s?wd=%E5%A4%8D%E6%98%9F%E5%8C%BB%E8%8D%AF',
        viewport: { height: 720, width: 1280 },
      }),
      ok: true,
      status: 200,
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await invokeExecutor(
      BrowserIdentifier,
      BrowserApiName.submit,
      { selector: '#kw' },
      { messageId: 'tool-message-id', topicId: 'topic-1', toolCallId: 'call-1' },
    );

    expect(fetchMock).toHaveBeenCalledWith('/api/browser/action', {
      body: JSON.stringify({
        action: BrowserApiName.submit,
        params: { selector: '#kw' },
        sessionId: 'topic-1',
      }),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      signal: undefined,
    });
    expect(result).toMatchObject({
      content:
        'Submitted form for "#kw"\nURL: https://www.baidu.com/s?wd=%E5%A4%8D%E6%98%9F%E5%8C%BB%E8%8D%AF\nTitle: Baidu Search',
      state: {
        sessionId: 'topic-1',
        title: 'Baidu Search',
      },
      success: true,
    });
  });

  it('proxies hover and returns the revealed page state', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ title: 'Menu', url: 'https://example.com/menu' }),
      ok: true,
      status: 200,
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await invokeExecutor(
      BrowserIdentifier,
      BrowserApiName.hover,
      { selector: '#menu' },
      { messageId: 'tool-message-id', topicId: 'topic-1', toolCallId: 'call-1' },
    );

    expect(fetchMock).toHaveBeenCalledWith('/api/browser/action', {
      body: JSON.stringify({
        action: BrowserApiName.hover,
        params: { selector: '#menu' },
        sessionId: 'topic-1',
      }),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      signal: undefined,
    });
    expect(result).toMatchObject({
      content: 'Hovered over element "#menu"',
      state: { sessionId: 'topic-1', title: 'Menu' },
      success: true,
    });
  });

  it('proxies inspect actions for structured page state', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        pageState: {
          confirmBeforeProceed: true,
          gaps: ['login_required'],
          loggedIn: false,
          prices: [{ label: '配置费用', value: '¥114.36' }],
          selectedOptions: ['南京', '2核4GB'],
          pageType: 'purchase',
          workflowHints: ['读取配置并停在确认前'],
        },
        taskState: 'waiting_user_authorization',
        title: 'CVM',
        url: 'https://buy.cloud.tencent.com/cvm',
      }),
      ok: true,
      status: 200,
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await invokeExecutor(
      BrowserIdentifier,
      BrowserApiName.inspect,
      {},
      { messageId: 'tool-message-id', topicId: 'topic-1', toolCallId: 'call-1' },
    );

    expect(fetchMock).toHaveBeenCalledWith('/api/browser/action', {
      body: JSON.stringify({
        action: BrowserApiName.inspect,
        params: {},
        sessionId: 'topic-1',
      }),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      signal: undefined,
    });
    expect(result).toMatchObject({
      content: 'Inspected page state for https://buy.cloud.tencent.com/cvm',
      state: {
        pageState: {
          confirmBeforeProceed: true,
          gaps: ['login_required'],
          loggedIn: false,
          selectedOptions: ['南京', '2核4GB'],
          pageType: 'purchase',
        },
        taskState: 'waiting_user_authorization',
        sessionId: 'topic-1',
      },
      success: true,
    });
  });

  it('proxies executePlan actions and preserves execution events', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        executionEvents: [
          {
            action: 'fill',
            id: 'fill_query',
            status: 'completed',
            summary: 'Filled 搜索',
            target: '#kw',
            timestamp: 1,
          },
          {
            action: 'submit',
            id: 'submit_search',
            status: 'completed',
            summary: 'Submitted #kw',
            target: '#kw',
            timestamp: 2,
          },
        ],
        executionState: {
          completedStepIds: ['fill_query', 'submit_search'],
          cursor: 2,
          phase: 'completed',
          updatedAt: 1,
        },
        taskState: 'completed',
        title: 'Search',
        url: 'https://example.com/search',
      }),
      ok: true,
      status: 200,
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await invokeExecutor(
      BrowserIdentifier,
      BrowserApiName.executePlan,
      {
        authorized: true,
        inputs: { query: '复星医药' },
        intent: 'find_official_source',
        maxSteps: 4,
        restart: true,
      },
      { messageId: 'tool-message-id', topicId: 'topic-1', toolCallId: 'call-1' },
    );

    expect(fetchMock).toHaveBeenCalledWith('/api/browser/action', {
      body: JSON.stringify({
        action: BrowserApiName.executePlan,
        params: {
          authorized: true,
          inputs: { query: '复星医药' },
          intent: 'find_official_source',
          maxSteps: 4,
          restart: true,
        },
        sessionId: 'topic-1',
      }),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      signal: undefined,
    });
    expect(result).toMatchObject({
      content: expect.stringContaining('Browser plan execution finished'),
      state: {
        executionEvents: [
          expect.objectContaining({ action: 'fill', status: 'completed' }),
          expect.objectContaining({ action: 'submit', status: 'completed' }),
        ],
        executionState: expect.objectContaining({
          completedStepIds: ['fill_query', 'submit_search'],
          cursor: 2,
          phase: 'completed',
        }),
        sessionId: 'topic-1',
        taskState: 'completed',
      },
      success: true,
    });
  });

  it('proxies interrupt actions when the user manually intervenes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        executionEvents: [
          {
            action: 'interrupt',
            id: 'user_intervention:1',
            status: 'blocked',
            summary: 'Automation paused because the user performed click in the browser.',
            timestamp: 1,
          },
        ],
        executionState: {
          blockedStepId: 'select_region',
          completedStepIds: ['inspect_current_page'],
          currentStepId: 'select_region',
          cursor: 1,
          phase: 'paused_by_user_intervention',
          updatedAt: 1,
        },
        taskState: 'paused_by_user_intervention',
        title: 'Dashboard',
        url: 'https://example.com/dashboard',
      }),
      ok: true,
      status: 200,
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await invokeExecutor(
      BrowserIdentifier,
      BrowserApiName.interrupt,
      { inputType: 'click', reason: 'Automation paused because the user clicked the page.' },
      { messageId: 'tool-message-id', topicId: 'topic-1', toolCallId: 'call-1' },
    );

    expect(fetchMock).toHaveBeenCalledWith('/api/browser/action', {
      body: JSON.stringify({
        action: BrowserApiName.interrupt,
        params: {
          inputType: 'click',
          reason: 'Automation paused because the user clicked the page.',
        },
        sessionId: 'topic-1',
      }),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      signal: undefined,
    });
    expect(result).toMatchObject({
      content: expect.stringContaining('Browser automation paused'),
      state: {
        executionState: expect.objectContaining({
          phase: 'paused_by_user_intervention',
        }),
        sessionId: 'topic-1',
        taskState: 'paused_by_user_intervention',
      },
      success: true,
    });
  });

  it('proxies cancelTask actions as terminal browser task cancellations', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        executionEvents: [
          {
            action: 'cancel',
            id: 'task_cancelled:1',
            status: 'blocked',
            summary: 'User cancelled the risky browser task before execution.',
            timestamp: 1,
          },
        ],
        executionState: {
          blockedStepId: 'risk_gate',
          completedStepIds: ['inspect_current_page'],
          currentStepId: 'risk_gate',
          cursor: 2,
          phase: 'cancelled',
          updatedAt: 1,
        },
        taskState: 'cancelled',
        title: 'Checkout',
        url: 'https://example.com/checkout',
      }),
      ok: true,
      status: 200,
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await invokeExecutor(
      BrowserIdentifier,
      BrowserApiName.cancelTask,
      { reason: 'User cancelled the risky browser task before execution.' },
      { messageId: 'tool-message-id', topicId: 'topic-1', toolCallId: 'call-1' },
    );

    expect(fetchMock).toHaveBeenCalledWith('/api/browser/action', {
      body: JSON.stringify({
        action: BrowserApiName.cancelTask,
        params: {
          reason: 'User cancelled the risky browser task before execution.',
        },
        sessionId: 'topic-1',
      }),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      signal: undefined,
    });
    expect(result).toMatchObject({
      content: expect.stringContaining('Browser automation cancelled'),
      state: {
        executionState: expect.objectContaining({
          phase: 'cancelled',
        }),
        sessionId: 'topic-1',
        taskState: 'cancelled',
      },
      success: true,
    });
  });

  it('returns blocked state when the browser service rejects a risky click', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        blocked: true,
        riskBlock: {
          action: 'click',
          reason: 'Blocked risky click on "立即购买"',
          requiresUserConfirmation: true,
          risk: 'purchase',
          targetText: '立即购买',
        },
        title: 'Checkout',
        url: 'https://example.com/checkout',
      }),
      ok: true,
      status: 200,
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await invokeExecutor(
      BrowserIdentifier,
      BrowserApiName.click,
      { selector: '#buy' },
      { messageId: 'tool-message-id', topicId: 'topic-1', toolCallId: 'call-1' },
    );

    expect(result).toMatchObject({
      content: 'Blocked risky click "#buy": Blocked risky click on "立即购买"',
      state: {
        blocked: true,
        riskBlock: {
          risk: 'purchase',
        },
      },
      success: false,
    });
  });
});
