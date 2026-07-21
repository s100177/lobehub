import { NextResponse } from 'next/server';

import { checkAuth } from '@/app/(backend)/middleware/auth';

import {
  createBrowserServiceHeaders,
  getBrowserServiceUrl,
  proxyBrowserServiceResponse,
} from '../utils';

export const dynamic = 'force-dynamic';

/**
 * Proxy endpoint for the browser tool Portal iframe.
 *
 * This endpoint intentionally proxies the browser-service live viewer instead
 * of target-page HTML. The AI and user interact with one Playwright page:
 * - mode omitted: iframe viewer HTML
 * - mode=events: screenshot event stream
 * - mode=input: user mouse/keyboard input
 *
 * Usage: GET /api/browser/proxy?session=<sessionId>
 */
export const GET = checkAuth(async (request: Request, { userId }) => {
  const searchParams = new URL(request.url).searchParams;
  const session = searchParams.get('session');
  if (!session) {
    return new NextResponse('Missing session parameter', { status: 400 });
  }

  const browserServiceUrl = getBrowserServiceUrl();
  if (!browserServiceUrl) {
    return new NextResponse('Browser service not configured', { status: 503 });
  }

  const mode = searchParams.get('mode');
  const takeover = searchParams.get('takeover');
  const path = mode === 'events' ? '/events' : '/viewer';

  try {
    const targetUrl = new URL(`${browserServiceUrl}${path}`);
    targetUrl.searchParams.set('session', session);
    if (path === '/viewer') {
      targetUrl.searchParams.set('basePath', '/api/browser/proxy');
      if (takeover === '1') targetUrl.searchParams.set('takeover', '1');
    }

    const res = await fetch(targetUrl, {
      cache: 'no-store',
      headers: createBrowserServiceHeaders(userId),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return new NextResponse(text, { status: res.status });
    }

    return proxyBrowserServiceResponse(
      res,
      mode === 'events' ? 'text/event-stream' : 'text/html; charset=utf-8',
      {
        'Cache-Control': 'no-cache, no-transform',
        'Content-Security-Policy': "frame-ancestors 'self'",
        'X-Accel-Buffering': 'no',
        'X-Frame-Options': 'SAMEORIGIN',
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new NextResponse(`Proxy error: ${message}`, { status: 502 });
  }
});

export const POST = checkAuth(async (request: Request, { userId }) => {
  const searchParams = new URL(request.url).searchParams;
  const session = searchParams.get('session');
  if (!session) {
    return new NextResponse('Missing session parameter', { status: 400 });
  }

  const mode = searchParams.get('mode');
  if (mode !== 'input') {
    return new NextResponse('Unsupported browser proxy POST mode', { status: 400 });
  }

  const browserServiceUrl = getBrowserServiceUrl();
  if (!browserServiceUrl) {
    return new NextResponse('Browser service not configured', { status: 503 });
  }

  try {
    const res = await fetch(`${browserServiceUrl}/input`, {
      body: await request.text(),
      cache: 'no-store',
      headers: createBrowserServiceHeaders(userId, {
        'Content-Type': request.headers.get('content-type') ?? 'application/json',
        'X-Session-ID': session,
      }),
      method: 'POST',
    });

    return proxyBrowserServiceResponse(res, 'application/json');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new NextResponse(`Proxy error: ${message}`, { status: 502 });
  }
});
