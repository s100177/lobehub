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

describe('/api/browser/proxy route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BROWSER_SERVICE_URL = 'http://browser-service.test';
    process.env.BROWSER_SERVICE_TOKEN = 'test-service-token';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('ok', {
          headers: { 'content-type': 'text/plain; charset=utf-8' },
          status: 200,
        }),
      ),
    );
  });

  it('forwards GET viewer requests with owner header and basePath', async () => {
    const request = new NextRequest(
      'https://test.com/api/browser/proxy?session=session-1&takeover=1',
    );

    const response = await GET(request, { params: Promise.resolve({}) });

    expect(fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        href: 'http://browser-service.test/viewer?session=session-1&basePath=%2Fapi%2Fbrowser%2Fproxy&takeover=1',
      }),
      expect.objectContaining({ headers: expect.any(Headers) }),
    );

    const headers = (vi.mocked(fetch).mock.calls[0][1] as RequestInit).headers as Headers;
    expect(headers.get('X-Browser-Owner-ID')).toBe('user-1');
    expect(headers.get('X-Browser-Service-Token')).toBe('test-service-token');
    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
  });

  it('forwards GET event-stream requests with owner header', async () => {
    const request = new NextRequest(
      'https://test.com/api/browser/proxy?session=session-1&mode=events',
    );

    await GET(request, { params: Promise.resolve({}) });

    expect(fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        href: 'http://browser-service.test/events?session=session-1',
      }),
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
  });

  it('forwards POST input requests with owner and session headers', async () => {
    const request = new NextRequest(
      'https://test.com/api/browser/proxy?session=session-1&mode=input',
      {
        body: JSON.stringify({ type: 'click', x: 12, y: 20 }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      },
    );

    await POST(request, { params: Promise.resolve({}) });

    expect(fetch).toHaveBeenCalledWith(
      'http://browser-service.test/input',
      expect.objectContaining({
        body: JSON.stringify({ type: 'click', x: 12, y: 20 }),
        headers: expect.any(Headers),
        method: 'POST',
      }),
    );

    const headers = (vi.mocked(fetch).mock.calls[0][1] as RequestInit).headers as Headers;
    expect(headers.get('X-Browser-Owner-ID')).toBe('user-1');
    expect(headers.get('X-Browser-Service-Token')).toBe('test-service-token');
    expect(headers.get('X-Session-ID')).toBe('session-1');
  });
});
