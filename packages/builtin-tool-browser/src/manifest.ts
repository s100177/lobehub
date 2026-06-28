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
          mode: {
            description:
              'Browser display/control mode. Use auto by default. Use remote when you need to click, fill, submit, or evaluate the page. Use iframe when the user only needs to view/interact with an embeddable page directly.',
            enum: ['auto', 'iframe', 'remote'],
            type: 'string',
          },
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
        'Submit the form associated with a field, button, or form selector. Use this after filling a search box or form input to perform the search or submit action.',
      name: BrowserApiName.submit,
      parameters: {
        properties: {
          selector: {
            description:
              'CSS selector of the input, button, or form to submit. For search boxes, pass the input selector.',
            type: 'string',
          },
          timeout: {
            description:
              'Timeout in milliseconds to wait for the submit/navigation (default: 10000)',
            type: 'number',
          },
        },
        required: ['selector'],
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
    description:
      'Open pages in a right-side browser panel using direct iframe when possible and remote Playwright control when needed',
    readme:
      'This tool opens pages in the right-side browser panel. Embeddable pages use a direct iframe for native interaction; blocked pages or pages that need AI control use an isolated remote Chromium session.',
    title: 'Browser',
  },
  systemRole: systemPrompt,
  type: 'builtin',
};
