import type { BuiltinToolManifest } from '@lobechat/types';

import { systemPrompt } from './systemRole';
import { BrowserApiName, BrowserIdentifier } from './types';

export const BrowserManifest: BuiltinToolManifest = {
  api: [
    {
      description:
        'Open a URL in the shared browser. Web/Docker supports auto, iframe, and remote modes; Desktop uses its native browser runtime.',
      name: BrowserApiName.navigate,
      parameters: {
        properties: {
          mode: {
            description:
              'Web display mode. Use auto unless the user explicitly requests iframe or remote.',
            enum: ['auto', 'iframe', 'remote'],
            type: 'string',
          },
          timeout: { description: 'Navigation timeout in milliseconds.', type: 'number' },
          url: { description: 'Absolute http/https URL to open.', type: 'string' },
        },
        required: ['url'],
        type: 'object',
      },
    },
    {
      description:
        'Capture an accessibility snapshot of the current page with stable refs such as [ref=e12]. Always snapshot before acting and after the page changes.',
      name: BrowserApiName.snapshot,
      parameters: { properties: {}, type: 'object' },
    },
    {
      description:
        'Click an element. Prefer a ref from the latest snapshot; selector and viewport coordinates are compatibility fallbacks.',
      name: BrowserApiName.click,
      parameters: {
        properties: {
          ref: { description: 'Element ref from the latest snapshot.', type: 'string' },
          selector: { description: 'CSS selector fallback.', type: 'string' },
          timeout: { description: 'Element wait timeout in milliseconds.', type: 'number' },
          x: { description: 'Viewport x coordinate fallback.', type: 'number' },
          y: { description: 'Viewport y coordinate fallback.', type: 'number' },
        },
        type: 'object',
      },
    },
    {
      description:
        'Fill a text field. Prefer a ref from the latest snapshot; selector is a compatibility fallback. Set submit=true to press Enter afterwards.',
      name: BrowserApiName.fill,
      parameters: {
        properties: {
          ref: { description: 'Element ref from the latest snapshot.', type: 'string' },
          selector: { description: 'CSS selector fallback.', type: 'string' },
          submit: { description: 'Press Enter after filling.', type: 'boolean' },
          text: { description: 'Text to fill.', type: 'string' },
          timeout: { description: 'Element wait timeout in milliseconds.', type: 'number' },
        },
        required: ['text'],
        type: 'object',
      },
    },
    {
      description: 'Send a keyboard key to the current page, for example Enter, Tab, or Escape.',
      name: BrowserApiName.press,
      parameters: {
        properties: { key: { description: 'KeyboardEvent.key value.', type: 'string' } },
        required: ['key'],
        type: 'object',
      },
    },
    {
      description: 'Scroll the page by a relative pixel distance.',
      name: BrowserApiName.scroll,
      parameters: {
        properties: {
          dx: { description: 'Horizontal relative distance.', type: 'number' },
          dy: { description: 'Vertical relative distance; positive scrolls down.', type: 'number' },
        },
        required: ['dy'],
        type: 'object',
      },
    },
    {
      description:
        'Capture a screenshot for the user. Use snapshot or readPage for model perception.',
      name: BrowserApiName.screenshot,
      parameters: { properties: {}, type: 'object' },
    },
    {
      description: 'Extract readable text from the current page for quoting or summarization.',
      name: BrowserApiName.readPage,
      parameters: { properties: {}, type: 'object' },
    },
  ],
  executors: ['client', 'server'],
  identifier: BrowserIdentifier,
  meta: {
    avatar: '🌐',
    description:
      'Drive a shared browser with stable refs: native Electron on Desktop, iframe or Playwright Remote on Web/Docker',
    readme:
      'Desktop uses a native retained browser. Web/Docker uses an embeddable iframe with Browser Bridge when available and Playwright Remote as fallback.',
    title: 'Browser',
  },
  systemRole: systemPrompt,
  type: 'builtin',
};
