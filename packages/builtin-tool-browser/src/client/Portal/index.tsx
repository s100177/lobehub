import { type BuiltinPortalProps } from '@lobechat/types';
import { memo } from 'react';

import { BrowserApiName } from '../../types';
import BrowserPanel from './BrowserPanel';

const BrowserPortal = memo<BuiltinPortalProps>(
  ({ arguments: _args, state, apiName, messageId }) => {
    const sessionId = (state as any)?.sessionId || messageId;

    switch (apiName) {
      case BrowserApiName.navigate:
      case BrowserApiName.snapshot:
      case BrowserApiName.click:
      case BrowserApiName.fill:
      case BrowserApiName.press:
      case BrowserApiName.readPage:
      case BrowserApiName.scroll:
      case BrowserApiName.screenshot: {
        return <BrowserPanel apiName={apiName} sessionId={sessionId} state={state} />;
      }
    }

    return <BrowserPanel apiName={apiName} sessionId={sessionId} state={state} />;
  },
);

BrowserPortal.displayName = 'BrowserPortal';

export default BrowserPortal;
