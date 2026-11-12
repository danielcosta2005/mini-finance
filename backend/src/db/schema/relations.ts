import { relations } from 'drizzle-orm';
import {
  cardInstallments,
  cardPurchases,
  creditCards,
  invoicePayments,
  invoices,
} from './cards.js';
import { accounts, categories } from './catalog.js';
import { goalContributions, goals } from './goals.js';
import { sessions, users } from './identity.js';
import { budgets, transactions, transfers } from './ledger.js';
import { recurrences } from './recurrences.js';

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
  categories: many(categories),
  transactions: many(transactions),
  transfers: many(transfers),
  budgets: many(budgets),
  creditCards: many(creditCards),
  purchases: many(cardPurchases),
  installments: many(cardInstallments),
  invoices: many(invoices),
  payments: many(invoicePayments),
  recurrences: many(recurrences),
  goals: many(goals),
  contributions: many(goalContributions),
}));
export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));
export const accountsRelations = relations(accounts, ({ one, many }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
  transactions: many(transactions),
  payments: many(invoicePayments),
  recurrences: many(recurrences),
  outgoingTransfers: many(transfers, { relationName: 'transferSource' }),
  incomingTransfers: many(transfers, { relationName: 'transferDestination' }),
}));
export const categoriesRelations = relations(categories, ({ one, many }) => ({
  user: one(users, { fields: [categories.userId], references: [users.id] }),
  transactions: many(transactions),
  purchases: many(cardPurchases),
  budgets: many(budgets),
  recurrences: many(recurrences),
}));
export const transactionsRelations = relations(transactions, ({ one }) => ({
  user: one(users, { fields: [transactions.userId], references: [users.id] }),
  account: one(accounts, {
    fields: [transactions.accountId, transactions.userId],
    references: [accounts.id, accounts.userId],
  }),
  category: one(categories, {
    fields: [transactions.categoryId, transactions.userId, transactions.type],
    references: [categories.id, categories.userId, categories.type],
  }),
  recurrence: one(recurrences, {
    fields: [transactions.recurrenceId, transactions.userId],
    references: [recurrences.id, recurrences.userId],
  }),
}));
export const transfersRelations = relations(transfers, ({ one }) => ({
  user: one(users, { fields: [transfers.userId], references: [users.id] }),
  source: one(accounts, {
    fields: [transfers.sourceAccountId, transfers.userId],
    references: [accounts.id, accounts.userId],
    relationName: 'transferSource',
  }),
  destination: one(accounts, {
    fields: [transfers.destinationAccountId, transfers.userId],
    references: [accounts.id, accounts.userId],
    relationName: 'transferDestination',
  }),
}));
export const budgetsRelations = relations(budgets, ({ one }) => ({
  user: one(users, { fields: [budgets.userId], references: [users.id] }),
  category: one(categories, {
    fields: [budgets.categoryId, budgets.userId, budgets.categoryType],
    references: [categories.id, categories.userId, categories.type],
  }),
}));
export const recurrencesRelations = relations(recurrences, ({ one, many }) => ({
  user: one(users, { fields: [recurrences.userId], references: [users.id] }),
  account: one(accounts, {
    fields: [recurrences.accountId, recurrences.userId],
    references: [accounts.id, accounts.userId],
  }),
  category: one(categories, {
    fields: [recurrences.categoryId, recurrences.userId, recurrences.type],
    references: [categories.id, categories.userId, categories.type],
  }),
  transactions: many(transactions),
}));
export const creditCardsRelations = relations(creditCards, ({ one, many }) => ({
  user: one(users, { fields: [creditCards.userId], references: [users.id] }),
  purchases: many(cardPurchases),
  invoices: many(invoices),
}));
export const cardPurchasesRelations = relations(
  cardPurchases,
  ({ one, many }) => ({
    user: one(users, {
      fields: [cardPurchases.userId],
      references: [users.id],
    }),
    creditCard: one(creditCards, {
      fields: [cardPurchases.creditCardId, cardPurchases.userId],
      references: [creditCards.id, creditCards.userId],
    }),
    category: one(categories, {
      fields: [
        cardPurchases.categoryId,
        cardPurchases.userId,
        cardPurchases.categoryType,
      ],
      references: [categories.id, categories.userId, categories.type],
    }),
    installments: many(cardInstallments),
  }),
);
export const cardInstallmentsRelations = relations(
  cardInstallments,
  ({ one }) => ({
    user: one(users, {
      fields: [cardInstallments.userId],
      references: [users.id],
    }),
    purchase: one(cardPurchases, {
      fields: [
        cardInstallments.purchaseId,
        cardInstallments.creditCardId,
        cardInstallments.userId,
      ],
      references: [
        cardPurchases.id,
        cardPurchases.creditCardId,
        cardPurchases.userId,
      ],
    }),
    invoice: one(invoices, {
      fields: [
        cardInstallments.invoiceId,
        cardInstallments.creditCardId,
        cardInstallments.userId,
      ],
      references: [invoices.id, invoices.creditCardId, invoices.userId],
    }),
  }),
);
export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  user: one(users, { fields: [invoices.userId], references: [users.id] }),
  creditCard: one(creditCards, {
    fields: [invoices.creditCardId, invoices.userId],
    references: [creditCards.id, creditCards.userId],
  }),
  installments: many(cardInstallments),
  payment: one(invoicePayments),
}));
export const invoicePaymentsRelations = relations(
  invoicePayments,
  ({ one }) => ({
    user: one(users, {
      fields: [invoicePayments.userId],
      references: [users.id],
    }),
    invoice: one(invoices, {
      fields: [invoicePayments.invoiceId, invoicePayments.userId],
      references: [invoices.id, invoices.userId],
    }),
    account: one(accounts, {
      fields: [invoicePayments.accountId, invoicePayments.userId],
      references: [accounts.id, accounts.userId],
    }),
  }),
);
export const goalsRelations = relations(goals, ({ one, many }) => ({
  user: one(users, { fields: [goals.userId], references: [users.id] }),
  contributions: many(goalContributions),
}));
export const goalContributionsRelations = relations(
  goalContributions,
  ({ one }) => ({
    user: one(users, {
      fields: [goalContributions.userId],
      references: [users.id],
    }),
    goal: one(goals, {
      fields: [goalContributions.goalId, goalContributions.userId],
      references: [goals.id, goals.userId],
    }),
  }),
);
