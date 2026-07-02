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
              'Browser display/control mode. Use auto by default; public websites open in remote mode so links and popups stay inside the right-side browser. Use remote when you need to click, fill, submit, or evaluate the page. Use iframe for trusted local or controlled business pages; same-origin iframe pages keep target="_blank" and window.open navigation inside the panel.',
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
      description:
        'Inspect the current shared browser page and return structured page state such as selected options, visible fields, prices, warnings, and risky primary actions. Use this before making claims about the page or before risky workflows.',
      name: BrowserApiName.inspect,
      parameters: {
        properties: {},
        type: 'object',
      },
    },
    {
      description:
        'Pause the current browser automation because the user manually clicked, typed, scrolled, or otherwise intervened in the page. Records an auditable interruption and requires re-inspection before continuing.',
      name: BrowserApiName.interrupt,
      parameters: {
        properties: {
          inputType: {
            description: 'Type of user intervention, for example click, wheel, key, or viewport.',
            type: 'string',
          },
          reason: {
            description: 'Human-readable reason for pausing automation.',
            type: 'string',
          },
        },
        type: 'object',
      },
    },
    {
      description:
        'Cancel the current browser automation task as a terminal user decision. Use this when the user cancels a risky or unwanted browser workflow; it records an auditable cancellation and does not resume the workflow.',
      name: BrowserApiName.cancelTask,
      parameters: {
        properties: {
          reason: {
            description: 'Human-readable reason for cancelling the browser automation task.',
            type: 'string',
          },
        },
        type: 'object',
      },
    },
    {
      description:
        'Execute the current page skill-pack plan only after explicit user authorization. Set authorized=true only when the user has confirmed the visible browser authorization card or explicitly approved execution. Runs only safe steps such as inspect, fill, search submit, and verify. Stops before missing information or risky actions such as purchase, payment, submit order, delete, release, or authorization.',
      name: BrowserApiName.executePlan,
      parameters: {
        properties: {
          authorized: {
            description:
              'Must be true after explicit user approval. If omitted or false, the runtime will not operate the page and will return waiting_user_authorization.',
            type: 'boolean',
          },
          inputs: {
            additionalProperties: { type: 'string' },
            description:
              'Structured user-provided inputs for the plan, for example {"query":"复星医药"}. Do not guess missing required inputs.',
            type: 'object',
          },
          intent: {
            description:
              'Optional workflow intent selected from page suggested tasks. The browser runtime will prefer a matching skill-pack workflow and still require user authorization before executing.',
            type: 'string',
          },
          maxSteps: {
            description: 'Maximum safe plan steps to run in one call (default: 4).',
            type: 'number',
          },
          timeout: {
            description: 'Per-step timeout in milliseconds (default: 10000).',
            type: 'number',
          },
        },
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
