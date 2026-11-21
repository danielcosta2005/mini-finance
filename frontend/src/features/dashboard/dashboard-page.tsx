import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, list } from '@/lib/api';
import {
  currentMonth,
  formatCurrency,
  formatDate,
  formatPercent,
  signedCurrency,
} from '@/lib/format';
import type { Dashboard, Recurrence, Transaction } from '@/lib/types';
import { Loading } from '@/shared/ui/resource';

function CashFlow({ points }: { points: Dashboard['evolution'] }) {
  const max = Math.max(
    1,
    ...points.flatMap((point) => [point.incomeCents, point.expenseCents]),
  );
  return (
    <>
      <div
        className="chart"
        role="img"
        aria-label="Evolução mensal de receitas e despesas"
      >
        {points.map((point) => (
          <div
            className="chart-group"
            key={point.month}
            title={`${point.month}: receitas ${formatCurrency(point.incomeCents)}, despesas ${formatCurrency(point.expenseCents)}`}
          >
            <div
              className="chart-bar"
              style={{
                height: `${Math.max(1, (point.incomeCents / max) * 100)}%`,
              }}
            />
            <div
              className="chart-bar expense-bar"
              style={{
                height: `${Math.max(1, (point.expenseCents / max) * 100)}%`,
              }}
            />
          </div>
        ))}
      </div>
      <div className="chart-labels">
        {points.map((point) => (
          <span key={point.month}>{point.month.slice(5)}</span>
        ))}
      </div>
      <p className="muted">Receitas em petróleo · despesas em vermelho</p>
    </>
  );
}

export function DashboardPage() {
  const [month, setMonth] = useState(currentMonth());
  const dashboard = useQuery({
    queryKey: ['dashboard', month],
    queryFn: () => api<Dashboard>('/dashboard', { params: { month } }),
  });
  const recent = useQuery({
    queryKey: ['dashboard-recent', month],
    queryFn: () =>
      list<Transaction>('/transactions', {
        from: `${month}-01`,
        to: `${month}-${String(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()).padStart(2, '0')}`,
        pageSize: 5,
      }),
  });
  const next = useQuery({
    queryKey: ['dashboard-recurrences'],
    queryFn: () =>
      list<Recurrence>('/recurrences', { status: 'active', pageSize: 100 }),
  });
  const data = dashboard.data;
  return (
    <>
      <div className="page-head">
        <div>
          <h2>Resumo financeiro</h2>
          <p>Saldo atual e movimentação por competência.</p>
        </div>
        <label className="field" htmlFor="dashboard-month">
          <span className="muted">Mês de referência</span>
          <input
            id="dashboard-month"
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
          />
        </label>
      </div>
      <Loading
        pending={dashboard.isPending}
        error={dashboard.error}
        retry={() => dashboard.refetch()}
      />
      {data && (
        <>
          <div className="summary-strip bordered">
            <div>
              <span className="label">Saldo consolidado</span>
              <strong className="value money">
                {formatCurrency(data.totals.balanceCents)}
              </strong>
              <span className="detail">Todas as contas</span>
            </div>
            <div>
              <span className="label">Receitas do mês</span>
              <strong className="value money income">
                {formatCurrency(data.totals.incomeCents)}
              </strong>
              <span className="detail">
                Resultado {formatCurrency(data.totals.netCents)}
              </span>
            </div>
            <div>
              <span className="label">Despesas do mês</span>
              <strong className="value money expense">
                {formatCurrency(data.totals.expenseCents)}
              </strong>
              <span className="detail">Competência {month}</span>
            </div>
          </div>
          <div className="section two-col">
            <section>
              <div className="section-head">
                <h2>Fluxo de caixa</h2>
              </div>
              <CashFlow points={data.evolution} />
            </section>
            <section>
              <div className="section-head">
                <h2>Maiores categorias de despesa</h2>
              </div>
              <div className="compact-list">
                {data.categories
                  .filter((item) => item.type === 'expense')
                  .slice(0, 5)
                  .map((item) => (
                    <div className="compact-row" key={item.categoryId}>
                      <div style={{ flex: 1 }}>
                        <span>{item.name}</span>
                        <div className="category-bar">
                          <span
                            style={{
                              width: `${Math.min(Number(item.percentage), 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                      <span className="money">
                        {formatCurrency(item.amountCents)}
                      </span>
                    </div>
                  ))}
                {!data.categories.some((item) => item.type === 'expense') && (
                  <p className="muted">Sem despesas neste mês.</p>
                )}
              </div>
            </section>
          </div>
          <section className="section">
            <div className="section-head">
              <h2>Últimas transações</h2>
              <Link className="button-link" to="/transacoes">
                Ver transações
              </Link>
            </div>
            <Loading
              pending={recent.isPending}
              error={recent.error}
              retry={() => recent.refetch()}
            />
            {recent.data &&
              (recent.data.data.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Descrição</th>
                        <th className="right">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recent.data.data.map((item) => (
                        <tr key={item.id}>
                          <td>{formatDate(item.occurredOn)}</td>
                          <td>{item.description}</td>
                          <td className="right money">
                            {signedCurrency(item.amountCents, item.type)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty bordered">
                  Nenhuma transação neste período.{' '}
                  <Link className="button-link" to="/transacoes">
                    Adicionar transação
                  </Link>
                </div>
              ))}
          </section>
          <div className="section two-col">
            <section>
              <div className="section-head">
                <h2>Contas</h2>
                <Link className="button-link" to="/contas">
                  Ver contas
                </Link>
              </div>
              {data.accounts.length ? (
                data.accounts.map((item) => (
                  <div className="compact-row" key={item.id}>
                    <span>{item.name}</span>
                    <strong className="money">
                      {formatCurrency(item.balanceCents)}
                    </strong>
                  </div>
                ))
              ) : (
                <p className="muted">Nenhuma conta cadastrada.</p>
              )}
            </section>
            <section>
              <div className="section-head">
                <h2>Orçamentos do mês</h2>
                <Link className="button-link" to="/orcamentos">
                  Ver orçamentos
                </Link>
              </div>
              {data.budgets.items.length ? (
                data.budgets.items.map((item) => (
                  <div className="compact-row" key={item.id}>
                    <span>
                      {item.categoryName}
                      <small>
                        {formatPercent(item.progressPercentage)} utilizado
                      </small>
                    </span>
                    <strong className="money">
                      {formatCurrency(item.spentCents)}
                    </strong>
                  </div>
                ))
              ) : (
                <p className="muted">Nenhum orçamento neste mês.</p>
              )}
            </section>
          </div>
          <section className="section">
            <div className="section-head">
              <h2>Próximas recorrências</h2>
              <Link className="button-link" to="/recorrencias">
                Ver recorrências
              </Link>
            </div>
            <Loading
              pending={next.isPending}
              error={next.error}
              retry={() => next.refetch()}
            />
            {next.data &&
              (next.data.data.length ? (
                [...next.data.data]
                  .filter((item) => item.nextExecutionOn)
                  .sort((a, b) =>
                    (a.nextExecutionOn ?? '').localeCompare(
                      b.nextExecutionOn ?? '',
                    ),
                  )
                  .slice(0, 5)
                  .map((item) => (
                    <div className="compact-row" key={item.id}>
                      <span>
                        {item.description}
                        <small>
                          {item.nextExecutionOn
                            ? formatDate(item.nextExecutionOn)
                            : 'Sem próxima data'}
                        </small>
                      </span>
                      <strong className="money">
                        {signedCurrency(item.amountCents, item.type)}
                      </strong>
                    </div>
                  ))
              ) : (
                <p className="muted">Nenhuma recorrência ativa.</p>
              ))}
          </section>
        </>
      )}
    </>
  );
}
