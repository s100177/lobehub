import { type BuiltinPortalProps } from '@lobechat/types';
import { memo } from 'react';

import { BrowserApiName } from '../../types';
import BrowserPanel from './BrowserPanel';

const BrowserPortal = memo<BuiltinPortalProps>(
  ({ arguments: _args, state, apiName, messageId }) => {
    const sessionId = (state as any)?.sessionId || messageId;

    switch (apiName) {
      case BrowserApiName.navigate:
      case BrowserApiName.click:
      case BrowserApiName.fill:
      case BrowserApiName.cancelTask:
      case BrowserApiName.executePlan:
      case BrowserApiName.interrupt:
      case BrowserApiName.submit:
      case BrowserApiName.scroll:
      case BrowserApiName.screenshot:
      case BrowserApiName.back:
      case BrowserApiName.forward: {
        return <BrowserPanel sessionId={sessionId} state={state} />;
      }

      case BrowserApiName.evaluate: {
        return <BrowserPanel showResult sessionId={sessionId} state={state} />;
      }
    }

    return <BrowserPanel sessionId={sessionId} state={state} />;
  },
);

BrowserPortal.displayName = 'BrowserPortal';

export default BrowserPortal;
