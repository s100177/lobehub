import { type BuiltinToolManifest } from '@lobechat/types';

import { systemPrompt } from './systemRole';
import { BrowserApiName, BrowserIdentifier } from './types';

export const BrowserManifest: BuiltinToolManifest = {
  api: [
    {
      description:
        'Navigate to a URL. Opens the page in the shared live browser session and returns the current title, URL, and viewport state.',
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
      description:
        'Click an element on the shared browser page by CSS selector and returns the updated page state.',
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
      description:
        'Fill a form field in the shared browser page and returns the updated page state.',
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
      description:
        'Scroll the shared browser page by the given x/y offset and returns the updated page state.',
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
        'Capture the current shared browser page as a screenshot fallback, plus URL/title.',
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
      description: 'Go back in the shared browser history and returns the updated page state.',
      name: BrowserApiName.back,
      parameters: {
        properties: {},
        type: 'object',
      },
    },
    {
      description: 'Go forward in the shared browser history and returns the updated page state.',
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
      'This tool gives you control of an isolated Chromium browser. The same session is displayed in the right-side live browser panel, where the user can also interact with the page.',
    title: 'Browser',
  },
  systemRole: systemPrompt,
  type: 'builtin',
};
