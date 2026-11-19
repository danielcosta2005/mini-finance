export type Kind = 'income' | 'expense';
export type User = { id: string; name: string; email: string };
export type Account = {
  id: string;
  name: string;
  type: 'checking' | 'savings' | 'cash' | 'investment' | 'other';
  openingBalanceCents: number;
  balanceCents: number;
};
export type Category = { id: string; name: string; type: Kind };
export type Transaction = {
  id: string;
  accountId: string;
  categoryId: string;
  type: Kind;
  amountCents: number;
  description: string;
  occurredOn: string;
  recurrenceId: string | null;
};
export type Budget = {
  id: string;
  categoryId: string;
  month: string;
  limitCents: number;
  spentCents: number;
  remainingCents: number;
  percentageUsed: string;
  exceeded: boolean;
};
export type Card = {
  id: string;
  name: string;
  creditLimitCents: number;
  availableCents: number;
  closingDay: number;
  dueDay: number;
};
export type Purchase = {
  id: string;
  description: string;
  totalCents: number;
  purchasedOn: string;
  installmentCount: number;
  categoryId: string;
};
export type Installment = {
  id: string;
  description: string;
  installmentNumber: number;
  installmentCount: number;
  amountCents: number;
  purchasedOn: string;
};
export type Invoice = {
  id: string;
  period: string;
  closesOn: string;
  dueOn: string;
  totalCents: number;
  paidCents: number;
  outstandingCents: number;
  paidOn: string | null;
  status: 'open' | 'paid';
  installments?: Installment[];
};
export type Recurrence = {
  id: string;
  accountId: string;
  categoryId: string;
  type: Kind;
  description: string;
  amountCents: number;
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  intervalCount: number;
  startsOn: string;
  endsOn: string | null;
  status: 'active' | 'paused' | 'completed';
  nextExecutionOn: string | null;
};
export type Goal = {
  id: string;
  description: string;
  targetCents: number;
  dueOn: string;
  contributedCents: number;
  remainingCents: number;
  progressPercentage: string;
  achieved: boolean;
  overdue: boolean;
};
export type Contribution = {
  id: string;
  amountCents: number;
  contributedOn: string;
};
export type Dashboard = {
  month: string;
  totals: {
    balanceCents: number;
    incomeCents: number;
    expenseCents: number;
    netCents: number;
  };
  accounts: Account[];
  categories: {
    categoryId: string;
    name: string;
    type: Kind;
    amountCents: number;
    percentage: string;
  }[];
  evolution: {
    month: string;
    incomeCents: number;
    expenseCents: number;
    netCents: number;
  }[];
  budgets: {
    limitCents: number;
    spentCents: number;
    remainingCents: number;
    progressPercentage: string;
    overBudgetCount: number;
    items: {
      id: string;
      categoryId: string;
      categoryName: string;
      limitCents: number;
      spentCents: number;
      progressPercentage: string;
      exceeded: boolean;
    }[];
  };
};
