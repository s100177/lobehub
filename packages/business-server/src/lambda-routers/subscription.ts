import { Plans } from '@lobechat/types';

import { authedProcedure, router } from '@/libs/trpc/lambda';

const emptyBudget = {
  boundedSpend: 0,
  limit: 0,
  resetAt: null,
  spend: 0,
};

export const subscriptionRouter = router({
  getSubscription: authedProcedure.query(() => ({
    billingPlan: null,
    isFreePlan: true,
    mode: null,
    plan: Plans.Free,
    pricing: 0,
    quantity: 0,
    subscriptionCreditUsageReminder: {
      dismissed: true,
    },
    subscriptionPlan: Plans.Free,
    usage: {
      embeddingStorage: emptyBudget,
      fileStorage: emptyBudget,
      free: emptyBudget,
      packages: [],
      referral: emptyBudget,
      subscription: emptyBudget,
    },
  })),
});
