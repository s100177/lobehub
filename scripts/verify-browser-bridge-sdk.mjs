import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import ts from 'typescript';

const require = createRequire(import.meta.url);
const { chromium } = require(
  require.resolve('playwright', { paths: [path.resolve(process.cwd(), 'browser-service')] }),
);

const source = readFileSync(
  path.resolve(process.cwd(), 'packages/builtin-tool-browser/src/bridge/index.ts'),
  'utf8',
);
const compiled = ts
  .transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2022,
    },
  })
  .outputText.replaceAll(/^export\s+/gm, '');

const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage();
  await page.setContent(`
    <!doctype html>
    <iframe id="business" srcdoc='<!doctype html><title>Expense Demo</title>
      <input id="name" aria-label="Name">
      <button id="continue" onclick='document.body.dataset.clicked="1"'>Continue</button>
      <button id="submit">提交审批</button>'></iframe>
  `);

  const frame = page.frames().find((item) => item !== page.mainFrame());
  if (!frame) throw new Error('Visible business iframe was not created');

  await frame.addScriptTag({
    content: `${compiled}\nwindow.__cleanupBrowserBridge = installBrowserBridge({ allowedParentOrigin: location.origin });`,
  });

  const result = await page.evaluate(async () => {
    const iframe = document.querySelector('#business');
    if (!(iframe instanceof HTMLIFrameElement) || !iframe.contentWindow) {
      throw new Error('Visible business iframe window is unavailable');
    }

    const clientId = 'chromium-client';
    iframe.contentWindow.postMessage(
      { clientId, source: 'lobe-browser-host', type: 'connected' },
      location.origin,
    );

    const send = (command) =>
      new Promise((resolvePromise, reject) => {
        const timeout = setTimeout(
          () => reject(new Error(`Command timed out: ${command.action}`)),
          2000,
        );
        const onMessage = (event) => {
          if (event.source !== iframe.contentWindow || event.data?.commandId !== command.id) return;
          clearTimeout(timeout);
          window.removeEventListener('message', onMessage);
          resolvePromise(event.data);
        };
        window.addEventListener('message', onMessage);
        iframe.contentWindow.postMessage(
          {
            clientId,
            command,
            sessionId: 'chromium-e2e',
            source: 'lobe-browser-host',
            type: 'command',
          },
          location.origin,
        );
      });

    const fill = await send({
      action: 'fill',
      epoch: 1,
      id: 'fill-1',
      params: { selector: '#name', text: 'Ada' },
    });
    const click = await send({
      action: 'click',
      epoch: 1,
      id: 'click-1',
      params: { selector: '#continue' },
    });
    const risky = await send({
      action: 'submit',
      epoch: 1,
      id: 'submit-1',
      params: { selector: '#submit' },
    });

    return {
      clicked: iframe.contentDocument?.body.dataset.clicked,
      clickUrl: click.result?.url,
      fillUrl: fill.result?.url,
      inputValue: iframe.contentDocument?.querySelector('#name')?.value,
      riskyBlocked: risky.result?.blocked,
      riskyType: risky.result?.riskBlock?.risk,
    };
  });

  if (result.inputValue !== 'Ada')
    throw new Error(`Visible input was not filled: ${result.inputValue}`);
  if (result.clicked !== '1') throw new Error('Visible button was not clicked');
  if (!result.riskyBlocked || result.riskyType !== 'submit') {
    throw new Error(`Risky submit was not blocked: ${JSON.stringify(result)}`);
  }

  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
} finally {
  await browser.close();
}
