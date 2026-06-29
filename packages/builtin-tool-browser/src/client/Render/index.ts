import { type BuiltinRender } from '@lobechat/types';

import { BrowserApiName } from '../../types';
import BrowserCard from './BrowserCard';

export const BrowserRenders: Record<string, BuiltinRender> = {
  [BrowserApiName.navigate]: BrowserCard,
  [BrowserApiName.click]: BrowserCard,
  [BrowserApiName.fill]: BrowserCard,
  [BrowserApiName.submit]: BrowserCard,
  [BrowserApiName.scroll]: BrowserCard,
  [BrowserApiName.screenshot]: BrowserCard,
  [BrowserApiName.evaluate]: BrowserCard,
  [BrowserApiName.executePlan]: BrowserCard,
  [BrowserApiName.interrupt]: BrowserCard,
  [BrowserApiName.back]: BrowserCard,
  [BrowserApiName.forward]: BrowserCard,
};
