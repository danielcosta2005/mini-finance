import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { list } from '@/lib/api';
import {
  currentDate,
  currentMonth,
  formatDate,
  signedCurrency,
} from '@/lib/format';
import type { Account, Category, Transaction } from '@/lib/types';
import { type FieldSpec, ResourcePage } from '@/shared/ui/resource';

export function TransactionsPage() {
  const [month, setMonth] = useState(currentMonth());
  const [type, setType] = useState('');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [sortBy, setSortBy] = useState('date');
  const [order, setOrder] = useState('desc');
  const accounts = useQuery({
    queryKey: ['all-accounts'],
    queryFn: () => list<Account>('/accounts', { pageSize: 100 }),
  });
  const categories = useQuery({
    queryKey: ['all-categories'],
    queryFn: () => list<Category>('/categories', { pageSize: 100 }),
  });
  const accountOptions =
    accounts.data?.data.map((item) => ({ value: item.id, label: item.name })) ??
    [];
  const categoryOptions =
    categories.data?.data.map((item) => ({
      value: item.id,
      label: `${item.name} (${item.type === 'income' ? 'receita' : 'despesa'})`,
      type: item.type,
    })) ?? [];
  const fields: FieldSpec[] = [
    {
      name: 'type',
      label: 'Tipo',
      kind: 'segmented',
      options: [
        { value: 'expense', label: 'Despesa' },
        { value: 'income', label: 'Receita' },
      ],
    },
    { name: 'description', label: 'Descrição' },
    { name: 'amountCents', label: 'Valor', kind: 'money', min: 1 },
    {
      name: 'accountId',
      label: 'Conta',
      kind: 'select',
      options: accountOptions,
    },
    {
      name: 'categoryId',
      label: 'Categoria do mesmo tipo',
      kind: 'select',
      options: categoryOptions,
    },
    { name: 'occurredOn', label: 'Data', kind: 'date' },
  ];
  const last = month
    ? new Date(
        Number(month.slice(0, 4)),
        Number(month.slice(5, 7)),
        0,
      ).getDate()
    : 31;
  return (
    <>
      <div className="filters">
        <label htmlFor="tx-month">
          Mês
          <input
            id="tx-month"
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
          />
        </label>
        <label htmlFor="tx-type">
          Tipo
          <select
            id="tx-type"
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            <option value="">Todos</option>
            <option value="income">Receitas</option>
            <option value="expense">Despesas</option>
          </select>
        </label>
        <label htmlFor="tx-account">
          Conta
          <select
            id="tx-account"
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
          >
            <option value="">Todas</option>
            {accountOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="tx-category">
          Categoria
          <select
            id="tx-category"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            <option value="">Todas</option>
            {categoryOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="tx-sort">
          Ordenar por
          <select
            id="tx-sort"
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value)}
          >
            <option value="date">Data</option>
            <option value="amount">Valor</option>
            <option value="createdAt">Cadastro</option>
          </select>
        </label>
        <label htmlFor="tx-order">
          Direção
          <select
            id="tx-order"
            value={order}
            onChange={(event) => setOrder(event.target.value)}
          >
            <option value="desc">Mais recente</option>
            <option value="asc">Mais antigo</option>
          </select>
        </label>
      </div>
      <ResourcePage<Transaction>
        tableClass="transactions-table"
        title="Movimentações"
        description="Receitas e despesas das suas contas."
        singular="Transação"
        createLabel="Nova transação"
        path="/transactions"
        fields={fields}
        defaults={{ type: 'expense', occurredOn: currentDate() }}
        valuesOf={(item) => ({
          type: item.type,
          description: item.description,
          amountCents: (item.amountCents / 100).toFixed(2).replace('.', ','),
          accountId: item.accountId,
          categoryId: item.categoryId,
          occurredOn: item.occurredOn,
        })}
        filters={{
          from: month ? `${month}-01` : undefined,
          to: month ? `${month}-${String(last).padStart(2, '0')}` : undefined,
          type,
          accountId,
          categoryId,
          sortBy,
          order,
        }}
        columns={[
          { label: 'Data', render: (item) => formatDate(item.occurredOn) },
          { label: 'Descrição', render: (item) => item.description },
          {
            label: 'Categoria',
            render: (item) =>
              categories.data?.data.find(
                (category) => category.id === item.categoryId,
              )?.name ?? 'Categoria',
          },
          {
            label: 'Valor',
            render: (item) => (
              <span className="money">
                {signedCurrency(item.amountCents, item.type)}
              </span>
            ),
            right: true,
          },
        ]}
      />
    </>
  );
}
