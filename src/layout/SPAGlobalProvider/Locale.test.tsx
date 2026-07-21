/**
 * @vitest-environment happy-dom
 */
import { render, screen } from '@testing-library/react';
import i18next from 'i18next';
import type { PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type LocaleComponent from './Locale';

let Locale: typeof LocaleComponent;

const instance = i18next.createInstance();

vi.mock('@/locales/create', () => ({
  createI18nNext: () => ({
    init: () =>
      instance.init({
        initAsync: false,
        lng: 'en-US',
        resources: { 'en-US': { editor: { placeholder: 'Editor ready' } } },
      }),
    instance,
  }),
}));

vi.mock('@/layout/GlobalProvider/Editor', () => ({
  default: function MockEditor({ children }: PropsWithChildren) {
    const { i18n } = useTranslation('editor');
    const resources = i18n.getResourceBundle(i18n.language, 'editor');

    return (
      <div data-testid="editor-locale">
        {resources.placeholder}
        {children}
      </div>
    );
  },
}));

vi.mock('@/utils/dayjsLocale', () => ({
  loadDayjsLocaleModule: vi.fn(async () => ({ default: {} })),
  normalizeDayjsLocale: vi.fn(() => 'en'),
}));

vi.mock('@/utils/locale', () => ({
  getAntdLocale: vi.fn(async () => ({})),
}));

describe('SPA Locale provider', () => {
  beforeAll(async () => {
    Locale = (await import('./Locale')).default;
  });

  it('provides its initialized i18next instance to editor descendants', () => {
    render(
      <Locale defaultLang="en-US">
        <span>child</span>
      </Locale>,
    );

    expect(screen.getByTestId('editor-locale')).toHaveTextContent('Editor readychild');
  });
});
