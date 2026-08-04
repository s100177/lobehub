import { Plans } from '@lobechat/types';

import { authedProcedure, router } from '@/libs/trpc/lambda';

export const subscriptionRouter = router({
  getSubscription: authedProcedure.query(() => ({
    isFreePlan: true,
    plan: Plans.Free,
    subscriptionPlan: Plans.Free,
  })),
});
