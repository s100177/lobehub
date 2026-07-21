import { type BuiltinRender } from '@lobechat/types';

import { BrowserApiName } from '../../types';
import BrowserCard from './BrowserCard';

export const BrowserRenders: Record<string, BuiltinRender> = {
  [BrowserApiName.navigate]: BrowserCard as BuiltinRender,
  [BrowserApiName.cancelTask]: BrowserCard as BuiltinRender,
  [BrowserApiName.click]: BrowserCard as BuiltinRender,
  [BrowserApiName.fill]: BrowserCard as BuiltinRender,
  [BrowserApiName.hover]: BrowserCard as BuiltinRender,
  [BrowserApiName.submit]: BrowserCard as BuiltinRender,
  [BrowserApiName.scroll]: BrowserCard as BuiltinRender,
  [BrowserApiName.screenshot]: BrowserCard as BuiltinRender,
  [BrowserApiName.evaluate]: BrowserCard as BuiltinRender,
  [BrowserApiName.executePlan]: BrowserCard as BuiltinRender,
  [BrowserApiName.interrupt]: BrowserCard as BuiltinRender,
  [BrowserApiName.back]: BrowserCard as BuiltinRender,
  [BrowserApiName.forward]: BrowserCard as BuiltinRender,
};
