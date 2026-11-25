type FreezeSettings = { frozen?: unknown; freezeAmount?: unknown; frozenAmount?: unknown };
type WalletFreeze = {
  kind: 'none' | 'account' | 'amount' | 'withdrawals';
  available: number;
  frozenBalance: number;
};

export function walletFreeze(available: number, settings: FreezeSettings): WalletFreeze {
  if (settings.frozen) return { kind: 'account', available: 0, frozenBalance: available };
  if (!settings.freezeAmount) return { kind: 'none', available, frozenBalance: 0 };
  const amount = settings.frozenAmount;
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount <= 0) {
    return { kind: 'withdrawals', available: 0, frozenBalance: available };
  }
  const frozenBalance = Math.min(available, amount);
  return { kind: 'amount', available: available - frozenBalance, frozenBalance };
}
