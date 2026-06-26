import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Proxy endpoint for the browser tool Portal iframe.
 *
 * Fetches the current page HTML from browser-service and strips headers
 * that prevent cross-origin framing (X-Frame-Options, CSP frame-ancestors).
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

  try {
    const res = await fetch(`${browserServiceUrl}/page`, {
      headers: { 'X-Session-ID': session },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return new NextResponse(text, { status: res.status });
    }

    const html = await res.text();

    // Strip CSP and X-Frame-Options meta tags so the page can render in an iframe
    const cleaned = html
      .replaceAll(/<meta[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/gi, '')
      .replaceAll(/<meta[^>]*http-equiv=["']X-Frame-Options["'][^>]*>/gi, '');

    return new NextResponse(cleaned, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        // Explicitly allow framing
        'X-Frame-Options': 'ALLOWALL',
        'Content-Security-Policy': 'frame-ancestors *',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new NextResponse(`Proxy error: ${message}`, { status: 502 });
  }
}
