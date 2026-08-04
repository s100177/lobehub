import { BrowserApiName, BrowserIdentifier } from '@lobechat/builtin-tool-browser';
import { LobeAgentApiName, LobeAgentIdentifier } from '@lobechat/builtin-tool-lobe-agent';
import {
  RemoteDeviceApiName,
  RemoteDeviceIdentifier,
} from '@lobechat/builtin-tool-remote-device';
import {
  WebOnboardingApiName,
  WebOnboardingIdentifier,
} from '@lobechat/builtin-tool-web-onboarding';
import { describe, expect, it, vi } from 'vitest';

import {
  getApiNamesForIdentifier,
  getRegisteredIdentifiers,
  hasExecutor,
  invokeExecutor,
  registerBuiltinToolExecutors,
} from './index';

vi.hoisted(() => {
  const storage = new Map<string, string>();

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      clear: () => storage.clear(),
      getItem: (key: string) => storage.get(key) ?? null,
      key: (index: number) => Array.from(storage.keys())[index] ?? null,
      get length() {
        return storage.size;
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
    },
  });
});

describe('builtin executor registry', () => {
  it('does not register executors as an import side effect', () => {
    expect(getRegisteredIdentifiers()).toEqual([]);
  });

  it('registers web onboarding executor APIs explicitly', async () => {
    await registerBuiltinToolExecutors();

    await expect(
      hasExecutor(WebOnboardingIdentifier, WebOnboardingApiName.saveUserQuestion),
    ).resolves.toBe(true);
    await expect(
      hasExecutor(WebOnboardingIdentifier, WebOnboardingApiName.finishOnboarding),
    ).resolves.toBe(true);
    expect(getApiNamesForIdentifier(WebOnboardingIdentifier)).toEqual(
      Object.values(WebOnboardingApiName),
    );
  }, 30_000);

  it('registers visual understanding executor APIs', async () => {
    await registerBuiltinToolExecutors();

    await expect(
      hasExecutor(LobeAgentIdentifier, LobeAgentApiName.analyzeVisualMedia),
    ).resolves.toBe(true);
  }, 30_000);

  it('registers browser executor APIs', async () => {
    await registerBuiltinToolExecutors();

    await expect(hasExecutor(BrowserIdentifier, BrowserApiName.navigate)).resolves.toBe(true);
    expect(getApiNamesForIdentifier(BrowserIdentifier)).toEqual(Object.values(BrowserApiName));
  }, 30_000);

  it('keeps remote-device executor registered through the async catalog', async () => {
    await registerBuiltinToolExecutors();

    await expect(
      hasExecutor(RemoteDeviceIdentifier, RemoteDeviceApiName.listOnlineDevices),
    ).resolves.toBe(true);
  }, 30_000);

  it('rejects nested sub-agent execution', async () => {
    const subAgentRun = vi.fn();
    const baseContext = {
      isSubAgent: true,
      messageId: 'tool-message-id',
      subAgent: { run: subAgentRun },
    };

    await expect(
      invokeExecutor(
        LobeAgentIdentifier,
        LobeAgentApiName.callSubAgent,
        { description: 'Nested work', instruction: 'Do nested work' },
        baseContext,
      ),
    ).resolves.toMatchObject({
      error: { type: 'NestedSubAgentNotAllowed' },
      success: false,
    });

    expect(subAgentRun).not.toHaveBeenCalled();
  }, 30_000);
});
