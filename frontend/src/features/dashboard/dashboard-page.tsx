import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useOutletContext } from 'react-router-dom';
import { api, list } from '@/lib/api';
import {
  formatAxisMonth,
  formatCurrency,
  formatDate,
  formatMonth,
  formatPercent,
  shiftMonth,
  signedCurrency,
} from '@/lib/format';
import type { Dashboard, Recurrence, Transaction } from '@/lib/types';
import { Loading } from '@/shared/ui/resource';

function CashFlow({ points }: { points: Dashboard['evolution'] }) {
  const hasMovement = points.some(
    (point) => point.incomeCents !== 0 || point.expenseCents !== 0,
  );
  if (!hasMovement)
    return (
      <div className="chart-empty">
        <p>Sem movimentação nos últimos 12 meses.</p>
        <Link className="button-link" to="/transacoes">
          Adicionar transação
        </Link>
      </div>
    );
  const max = Math.max(
    1,
    ...points.flatMap((point) => [point.incomeCents, point.expenseCents]),
  );
  return (
    <>
      <fieldset className="chart-legend">
        <legend className="visually-hidden">Séries do fluxo de caixa</legend>
        <span>
          <i className="chart-marker income-marker" />
          Receitas
        </span>
        <span>
          <i className="chart-marker expense-marker" />
          Despesas
        </span>
      </fieldset>
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
                height: `${(point.incomeCents / max) * 100}%`,
              }}
            />
            <div
              className="chart-bar expense-bar"
              style={{
                height: `${(point.expenseCents / max) * 100}%`,
              }}
            />
          </div>
        ))}
      </div>
      <div className="chart-labels">
        {points.map((point, index) => (
          <span key={point.month}>
            {formatAxisMonth(point.month, index, points[index - 1]?.month)}
          </span>
        ))}
      </div>
    </>
  );
}

function rankedExpenses(categories: Dashboard['categories']) {
  const ranked = categories
    .filter((item) => item.type === 'expense')
    .sort((left, right) => right.amountCents - left.amountCents);
  const visible = ranked.slice(0, 4).map((item, index) => ({
    ...item,
    displayName: item.name,
    tone: `category-tone-${index + 1}`,
  }));
  const remaining = ranked.slice(4);
  if (remaining.length) {
    visible.push({
      categoryId: 'other',
      name: 'Outras',
      displayName: 'Outras',
      type: 'expense',
      amountCents: remaining.reduce((sum, item) => sum + item.amountCents, 0),
      percentage: String(
        remaining.reduce((sum, item) => sum + Number(item.percentage), 0),
      ),
      tone: 'category-other',
    });
  }
  return visible;
}

function deltaLabel(current: number, previous: number, previousMonth: string) {
  const delta = current - previous;
  const amount = formatCurrency(Math.abs(delta));
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '';
  const monthName = formatMonth(previousMonth).split(' de ')[0];
  return `${sign}${amount} vs. ${monthName}`;
}

type DashboardContext = {
  month: string;
  setMonth: (value: string) => void;
};

export function DashboardPage() {
  const { month } = useOutletContext<DashboardContext>();
  const dashboard = useQuery({
    queryKey: ['dashboard', month],
    queryFn: () => api<Dashboard>('/dashboard', { params: { month } }),
    placeholderData: keepPreviousData,
  });
  const recent = useQuery({
    queryKey: ['dashboard-recent', month],
    queryFn: () =>
      list<Transaction>('/transactions', {
        from: `${month}-01`,
        to: `${month}-${String(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()).padStart(2, '0')}`,
        pageSize: 5,
      }),
    placeholderData: keepPreviousData,
  });
  const next = useQuery({
    queryKey: ['dashboard-recurrences'],
    queryFn: () =>
      list<Recurrence>('/recurrences', { status: 'active', pageSize: 100 }),
  });
  const data = dashboard.data;
  const displayedMonth = dashboard.isPlaceholderData
    ? (data?.month ?? month)
    : month;
  const previousMonth = shiftMonth(displayedMonth, -1);
  const previousPoint = data?.evolution.find(
    (point) => point.month === previousMonth,
  );
  const netCents = data?.totals.netCents ?? 0;
  const netClass = netCents === 0 ? '' : netCents > 0 ? 'income' : 'expense';
  return (
    <>
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
              <strong
                className={`value money ${data.totals.balanceCents === 0 ? '' : data.totals.balanceCents > 0 ? 'income' : 'expense'}`}
              >
                {formatCurrency(data.totals.balanceCents)}
              </strong>
              <span className={`detail ${netClass}`}>
                Resultado de {formatMonth(displayedMonth).split(' de ')[0]}:{' '}
                {signedCurrency(
                  Math.abs(data.totals.netCents),
                  data.totals.netCents < 0 ? 'expense' : 'income',
                )}
              </span>
            </div>
            <div>
              <span className="label">Receitas do mês</span>
              <strong
                className={`value money ${data.totals.incomeCents === 0 ? '' : 'income'}`}
              >
                {signedCurrency(Math.abs(data.totals.incomeCents), 'income')}
              </strong>
              <span className="detail">
                {previousPoint
                  ? deltaLabel(
                      data.totals.incomeCents,
                      previousPoint.incomeCents,
                      previousMonth,
                    )
                  : 'Sem dados do mês anterior.'}
              </span>
            </div>
            <div>
              <span className="label">Despesas do mês</span>
              <strong
                className={`value money ${data.totals.expenseCents === 0 ? '' : 'expense'}`}
              >
                {signedCurrency(Math.abs(data.totals.expenseCents), 'expense')}
              </strong>
              <span className="detail">
                {previousPoint
                  ? deltaLabel(
                      data.totals.expenseCents,
                      previousPoint.expenseCents,
                      previousMonth,
                    )
                  : 'Sem dados do mês anterior.'}
              </span>
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
                {rankedExpenses(data.categories).map((item) => (
                  <div className="compact-row" key={item.categoryId}>
                    <div style={{ flex: 1 }}>
                      <span>{item.displayName}</span>
                      <div className={`category-bar ${item.tone}`}>
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
