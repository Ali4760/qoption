export type ClientReportPeriod = { from: number | null; until: number | null };

export type ClientReport = {
  generatedAt: number;
  period: ClientReportPeriod;
  client: {
    uid: string;
    number: number | null;
    name: string;
    email: string;
    status: 'Active' | 'Restricted' | 'Frozen';
    vipLevel: string;
    reputation: number;
    currency: string;
  };
  available: number;
  held: number;
  netProfit: number;
  deposits: number;
  withdrawals: number;
  trades: number;
  wins: number;
  losses: number;
};
