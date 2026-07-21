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

const { GET, POST } = await import('./route');

describe('/api/browser/bridge route', () => {
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

  it('proxies GET long-poll to /bridge/commands with owner header', async () => {
    const request = new NextRequest(
      'https://test.com/api/browser/bridge?sessionId=session-1&clientId=client-1',
    );

    const response = await GET(request, { params: Promise.resolve({}) });

    expect(fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        href: 'http://browser-service.test/bridge/commands?session=session-1&clientId=client-1',
      }),
      expect.objectContaining({
        headers: expect.any(Headers),
        method: 'GET',
        signal: request.signal,
      }),
    );

    const headers = (vi.mocked(fetch).mock.calls[0][1] as RequestInit).headers as Headers;
    expect(headers.get('X-Browser-Owner-ID')).toBe('user-1');
    expect(headers.get('X-Browser-Service-Token')).toBe('test-service-token');
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it('proxies POST connect requests to /bridge/connect with owner header', async () => {
    const request = new NextRequest('https://test.com/api/browser/bridge', {
      body: JSON.stringify({
        action: 'connect',
        clientId: 'client-1',
        sessionId: 'session-1',
        url: 'https://example.com/form',
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });

    await POST(request, { params: Promise.resolve({}) });

    expect(fetch).toHaveBeenCalledWith(
      'http://browser-service.test/bridge/connect',
      expect.objectContaining({
        body: JSON.stringify({
          action: 'connect',
          clientId: 'client-1',
          sessionId: 'session-1',
          url: 'https://example.com/form',
        }),
        headers: expect.any(Headers),
        method: 'POST',
      }),
    );

    const headers = (vi.mocked(fetch).mock.calls[0][1] as RequestInit).headers as Headers;
    expect(headers.get('X-Browser-Owner-ID')).toBe('user-1');
    expect(headers.get('X-Browser-Service-Token')).toBe('test-service-token');
    expect(headers.get('X-Session-ID')).toBe('session-1');
  });

  it('rejects unsupported bridge actions', async () => {
    const request = new NextRequest('https://test.com/api/browser/bridge', {
      body: JSON.stringify({ action: 'unknown' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });

    const response = await POST(request, { params: Promise.resolve({}) });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Unsupported bridge action' });
  });
});
