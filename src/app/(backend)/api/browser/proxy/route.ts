import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

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
export async function GET(request: NextRequest) {
  const session = request.nextUrl.searchParams.get('session');
  if (!session) {
    return new NextResponse('Missing session parameter', { status: 400 });
  }

  const browserServiceUrl = process.env.BROWSER_SERVICE_URL;
  if (!browserServiceUrl) {
    return new NextResponse('Browser service not configured', { status: 503 });
  }

  const mode = request.nextUrl.searchParams.get('mode');
  const path = mode === 'events' ? '/events' : '/viewer';

  try {
    const targetUrl = new URL(`${browserServiceUrl}${path}`);
    targetUrl.searchParams.set('session', session);
    if (path === '/viewer') targetUrl.searchParams.set('basePath', '/api/browser/proxy');

    const res = await fetch(targetUrl, { cache: 'no-store' });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return new NextResponse(text, { status: res.status });
    }

    return new NextResponse(res.body, {
      headers: {
        'Cache-Control': 'no-cache, no-transform',
        'Content-Security-Policy': 'frame-ancestors *',
        'Content-Type':
          res.headers.get('content-type') ??
          (mode === 'events' ? 'text/event-stream' : 'text/html; charset=utf-8'),
        'X-Accel-Buffering': 'no',
        'X-Frame-Options': 'ALLOWALL',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new NextResponse(`Proxy error: ${message}`, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  const session = request.nextUrl.searchParams.get('session');
  if (!session) {
    return new NextResponse('Missing session parameter', { status: 400 });
  }

  const mode = request.nextUrl.searchParams.get('mode');
  if (mode !== 'input') {
    return new NextResponse('Unsupported browser proxy POST mode', { status: 400 });
  }

  const browserServiceUrl = process.env.BROWSER_SERVICE_URL;
  if (!browserServiceUrl) {
    return new NextResponse('Browser service not configured', { status: 503 });
  }

  try {
    const res = await fetch(`${browserServiceUrl}/input`, {
      body: await request.text(),
      cache: 'no-store',
      headers: {
        'Content-Type': request.headers.get('content-type') ?? 'application/json',
        'X-Session-ID': session,
      },
      method: 'POST',
    });

    return new NextResponse(res.body, {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': res.headers.get('content-type') ?? 'application/json',
      },
      status: res.status,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new NextResponse(`Proxy error: ${message}`, { status: 502 });
  }
}
