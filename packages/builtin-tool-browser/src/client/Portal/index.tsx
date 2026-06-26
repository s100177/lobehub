import { type BuiltinPortalProps } from '@lobechat/types';
import { memo } from 'react';

import { BrowserApiName } from '../../types';
import BrowserPanel from './BrowserPanel';

const BrowserPortal = memo<BuiltinPortalProps>(({ arguments: args, state, apiName }) => {
  switch (apiName) {
    case BrowserApiName.navigate:
    case BrowserApiName.click:
    case BrowserApiName.fill:
    case BrowserApiName.scroll:
    case BrowserApiName.screenshot:
    case BrowserApiName.back:
    case BrowserApiName.forward: {
      return <BrowserPanel state={state} />;
    }

    case BrowserApiName.evaluate: {
      return <BrowserPanel showResult state={state} />;
    }
  }

  return <BrowserPanel state={state} />;
});

BrowserPortal.displayName = 'BrowserPortal';

export default BrowserPortal;
