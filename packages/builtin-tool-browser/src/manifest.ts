import { type BuiltinToolManifest } from '@lobechat/types';

import { systemPrompt } from './systemRole';
import { BrowserApiName, BrowserIdentifier } from './types';

export const BrowserManifest: BuiltinToolManifest = {
  api: [
    {
      description:
        'Navigate to a URL. Opens the page and waits for it to load. Returns the page title, URL, and a screenshot.',
      name: BrowserApiName.navigate,
      parameters: {
        properties: {
          url: {
            description: 'The URL to navigate to (must include protocol, e.g. https://)',
            type: 'string',
          },
          timeout: {
            description: 'Navigation timeout in milliseconds (default: 30000)',
            type: 'number',
          },
        },
        required: ['url'],
        type: 'object',
      },
    },
    {
      description: 'Click an element on the page by CSS selector. Returns an updated screenshot.',
      name: BrowserApiName.click,
      parameters: {
        properties: {
          selector: {
            description: 'CSS selector of the element to click',
            type: 'string',
          },
          timeout: {
            description: 'Timeout in milliseconds to wait for the element (default: 5000)',
            type: 'number',
          },
        },
        required: ['selector'],
        type: 'object',
      },
    },
    {
      description: 'Fill a form field with text. Returns an updated screenshot.',
      name: BrowserApiName.fill,
      parameters: {
        properties: {
          selector: {
            description: 'CSS selector of the input element',
            type: 'string',
          },
          text: {
            description: 'Text to type into the field',
            type: 'string',
          },
        },
        required: ['selector', 'text'],
        type: 'object',
      },
    },
    {
      description: 'Scroll the page by the given x/y offset. Returns an updated screenshot.',
      name: BrowserApiName.scroll,
      parameters: {
        properties: {
          x: { description: 'Horizontal scroll offset', type: 'number' },
          y: { description: 'Vertical scroll offset', type: 'number' },
        },
        type: 'object',
      },
    },
    {
      description:
        'Take a screenshot of the current page. Returns the screenshot and current URL/title.',
      name: BrowserApiName.screenshot,
      parameters: {
        properties: {},
        type: 'object',
      },
    },
    {
      description:
        'Execute arbitrary JavaScript code in the browser page context. Returns the result of the evaluation.',
      name: BrowserApiName.evaluate,
      parameters: {
        properties: {
          code: {
            description: 'JavaScript code to execute in the page context',
            type: 'string',
          },
        },
        required: ['code'],
        type: 'object',
      },
    },
    {
      description:
        'Go back to the previous page in browser history. Returns an updated screenshot.',
      name: BrowserApiName.back,
      parameters: {
        properties: {},
        type: 'object',
      },
    },
    {
      description: 'Go forward to the next page in browser history. Returns an updated screenshot.',
      name: BrowserApiName.forward,
      parameters: {
        properties: {},
        type: 'object',
      },
    },
  ],
  executors: ['server'],
  humanIntervention: 'never',
  identifier: BrowserIdentifier,
  meta: {
    avatar: '🌐',
    description: 'Control a web browser to navigate, click, fill forms, and execute JavaScript',
    readme:
      'This tool gives you full control of a headless Chromium browser. You can navigate to URLs, click elements, fill form fields, scroll, execute JavaScript, and take screenshots. Each conversation gets its own isolated browser session.',
    title: 'Browser',
  },
  systemRole: systemPrompt,
  type: 'builtin',
};
