// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.hoisted(() => ({
  checkAuth: vi.fn(
    (handler) => (req: Request) =>
      handler(req, {
        jwtPayload: { userId: 'user-1' },
        params: Promise.resolve({}),
        serverDB: {} as never,
        userId: 'user-1',
      }),
  ),
}));

vi.mock('@/app/(backend)/middleware/auth', () => authMock);

const { POST } = await import('./route');

describe('/api/browser/action route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BROWSER_SERVICE_URL = 'http://browser-service.test';
    process.env.BROWSER_SERVICE_TOKEN = 'test-service-token';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      ),
    );
  });

  it('wraps POST with checkAuth and forwards owner + session headers', async () => {
    const request = new NextRequest('https://test.com/api/browser/action', {
      body: JSON.stringify({
        action: 'navigate',
        params: { mode: 'iframe', url: 'https://example.com/form' },
        sessionId: 'session-1',
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });

    const response = await POST(request, { params: Promise.resolve({}) });

    expect(fetch).toHaveBeenCalledWith(
      'http://browser-service.test/navigate',
      expect.objectContaining({
        body: JSON.stringify({ mode: 'iframe', url: 'https://example.com/form' }),
        headers: expect.any(Headers),
        method: 'POST',
      }),
    );

    const headers = (vi.mocked(fetch).mock.calls[0][1] as RequestInit).headers as Headers;
    expect(headers.get('X-Browser-Owner-ID')).toBe('user-1');
    expect(headers.get('X-Browser-Service-Token')).toBe('test-service-token');
    expect(headers.get('X-Session-ID')).toBe('session-1');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it('normalizes executePlan to execute-plan', async () => {
    const request = new NextRequest('https://test.com/api/browser/action', {
      body: JSON.stringify({
        action: 'executePlan',
        params: { intent: 'fill the form' },
        sessionId: 'session-2',
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });

    await POST(request, { params: Promise.resolve({}) });

    expect(fetch).toHaveBeenCalledWith(
      'http://browser-service.test/execute-plan',
      expect.any(Object),
    );
  });
});
