import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { MonthSelector } from '@/components/layout/month-selector';
import { list } from '@/lib/api';
import { currentMonth, formatCurrency, formatPercent } from '@/lib/format';
import type { Budget, Category } from '@/lib/types';
import { type FieldSpec, ResourcePage } from '@/shared/ui/resource';

export function BudgetProgress({
  budget,
}: {
  budget: Pick<Budget, 'percentageUsed' | 'remainingCents'>;
}) {
  const value = Number(budget.percentageUsed);
  const state = value > 100 ? 'exceeded' : value >= 80 ? 'warning' : '';
  return (
    <div style={{ minWidth: 140 }}>
      <div
        className={`progress ${state}`}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Orçamento utilizado"
      >
        <span style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      <small className={state}>
        {value > 100
          ? `Limite excedido em ${formatCurrency(-budget.remainingCents)}`
          : `${formatPercent(value)} utilizado`}
      </small>
    </div>
  );
}

export function BudgetsPage() {
  const [month, setMonth] = useState(currentMonth());
  const categories = useQuery({
    queryKey: ['expense-categories'],
    queryFn: () =>
      list<Category>('/categories', { pageSize: 100, type: 'expense' }),
  });
  const fields: FieldSpec[] = [
    {
      name: 'categoryId',
      label: 'Categoria de despesa',
      kind: 'select',
      options:
        categories.data?.data.map((item) => ({
          value: item.id,
          label: item.name,
        })) ?? [],
    },
    { name: 'month', label: 'Mês', kind: 'month' },
    { name: 'limitCents', label: 'Limite', kind: 'money', min: 1 },
  ];
  return (
    <>
      <div className="filters">
        <div className="field">
          <span className="muted">Mês</span>
          <MonthSelector label="Mês" value={month} onChange={setMonth} />
        </div>
      </div>
      <ResourcePage<Budget>
        singular="Orçamento"
        path="/budgets"
        fields={fields}
        defaults={{ month }}
        valuesOf={(item) => ({
          categoryId: item.categoryId,
          month: item.month,
          limitCents: (item.limitCents / 100).toFixed(2).replace('.', ','),
        })}
        filters={{ month }}
        columns={[
          {
            label: 'Categoria',
            render: (item) =>
              categories.data?.data.find(
                (category) => category.id === item.categoryId,
              )?.name ?? 'Categoria',
          },
          {
            label: 'Limite',
            render: (item) => (
              <span className="money">{formatCurrency(item.limitCents)}</span>
            ),
            right: true,
          },
          {
            label: 'Utilizado',
            render: (item) => (
              <span className="money">{formatCurrency(item.spentCents)}</span>
            ),
            right: true,
          },
          {
            label: 'Progresso',
            render: (item) => <BudgetProgress budget={item} />,
          },
        ]}
      />
    </>
  );
}
