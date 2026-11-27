export const minimumWithdrawalReputation = 100;

export function withdrawalReputationWarning(score: unknown) {
  return Number(score ?? minimumWithdrawalReputation) < minimumWithdrawalReputation
    ? `Your reputation points are below ${minimumWithdrawalReputation}. Contact support for help.`
    : '';
}
