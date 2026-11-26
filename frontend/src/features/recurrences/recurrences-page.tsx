import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, list } from '@/lib/api';
import { currentDate, formatDate, signedCurrency } from '@/lib/format';
import type { Account, Category, Recurrence } from '@/lib/types';
import { Feedback, type FieldSpec, ResourcePage } from '@/shared/ui/resource';

function RecurrenceActions({ items }: { items: Recurrence[] }) {
  const client = useQueryClient();
  const [message, setMessage] = useState('');
  const process = useMutation({
    mutationFn: () =>
      api<{ createdTransactions: number; more: boolean }>(
        '/recurrences/process',
        { method: 'POST', body: {} },
      ),
    onSuccess: async (result) => {
      await client.invalidateQueries();
      setMessage(
        `${result.createdTransactions} movimentações geradas.${result.more ? ' Há mais ocorrências a processar.' : ''}`,
      );
    },
  });
  const cancel = useMutation({
    mutationFn: (id: string) =>
      api(`/recurrences/${id}`, {
        method: 'PATCH',
        body: { status: 'completed' },
      }),
    onSuccess: async () => {
      await client.invalidateQueries();
      setMessage('Recorrência cancelada.');
    },
  });
  return (
    <section className="section">
      <div className="section-head">
        <h2>Próximas ocorrências</h2>
        <button
          className="button secondary"
          type="button"
          onClick={() => process.mutate()}
          disabled={process.isPending}
        >
          Processar vencidas
        </button>
      </div>
      <Feedback message={message} error={process.error ?? cancel.error} />
      {items.filter((item) => item.status === 'active').length ? (
        items
          .filter((item) => item.status === 'active')
          .sort((a, b) =>
            (a.nextExecutionOn ?? '').localeCompare(b.nextExecutionOn ?? ''),
          )
          .map((item) => (
            <div className="compact-row" key={item.id}>
              <span>
                {item.description}
                <small>
                  {item.nextExecutionOn
                    ? formatDate(item.nextExecutionOn)
                    : 'Sem próxima ocorrência'}
                </small>
              </span>
              <span className="money">
                {signedCurrency(item.amountCents, item.type)}
              </span>
              <button
                className="button-link"
                type="button"
                onClick={() => cancel.mutate(item.id)}
                disabled={cancel.isPending}
              >
                Cancelar recorrência
              </button>
            </div>
          ))
      ) : (
        <p className="muted">Nenhuma recorrência ativa.</p>
      )}
    </section>
  );
}

export function RecurrencesPage() {
  const [status, setStatus] = useState('');
  const accounts = useQuery({
    queryKey: ['all-accounts'],
    queryFn: () => list<Account>('/accounts', { pageSize: 100 }),
  });
  const categories = useQuery({
    queryKey: ['all-categories'],
    queryFn: () => list<Category>('/categories', { pageSize: 100 }),
  });
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
      options:
        accounts.data?.data.map((item) => ({
          value: item.id,
          label: item.name,
        })) ?? [],
    },
    {
      name: 'categoryId',
      label: 'Categoria do mesmo tipo',
      kind: 'select',
      options:
        categories.data?.data.map((item) => ({
          value: item.id,
          label: `${item.name} (${item.type === 'income' ? 'receita' : 'despesa'})`,
          type: item.type,
        })) ?? [],
    },
    {
      name: 'frequency',
      label: 'Periodicidade',
      kind: 'select',
      options: [
        { value: 'daily', label: 'Diária' },
        { value: 'weekly', label: 'Semanal' },
        { value: 'monthly', label: 'Mensal' },
        { value: 'yearly', label: 'Anual' },
      ],
    },
    {
      name: 'intervalCount',
      label: 'Intervalo',
      kind: 'number',
      min: 1,
      max: 1200,
    },
    { name: 'startsOn', label: 'Início', kind: 'date' },
    { name: 'endsOn', label: 'Fim', kind: 'date', required: false },
    {
      name: 'status',
      label: 'Estado',
      kind: 'select',
      options: [
        { value: 'active', label: 'Ativa' },
        { value: 'paused', label: 'Pausada' },
        { value: 'completed', label: 'Cancelada' },
      ],
    },
  ];
  return (
    <>
      <div className="filters">
        <label htmlFor="rec-status">
          Estado
          <select
            id="rec-status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">Todos</option>
            <option value="active">Ativas</option>
            <option value="paused">Pausadas</option>
            <option value="completed">Concluídas</option>
          </select>
        </label>
      </div>
      <ResourcePage<Recurrence>
        singular="Recorrência"
        path="/recurrences"
        fields={fields}
        defaults={{
          type: 'expense',
          frequency: 'monthly',
          intervalCount: '1',
          startsOn: currentDate(),
          status: 'active',
        }}
        valuesOf={(item) => ({
          type: item.type,
          description: item.description,
          amountCents: (item.amountCents / 100).toFixed(2).replace('.', ','),
          accountId: item.accountId,
          categoryId: item.categoryId,
          frequency: item.frequency,
          intervalCount: String(item.intervalCount),
          startsOn: item.startsOn,
          endsOn: item.endsOn ?? '',
          status: item.status,
        })}
        filters={{ status }}
        columns={[
          { label: 'Descrição', render: (item) => item.description },
          {
            label: 'Periodicidade',
            render: (item) =>
              ({
                daily: 'Diária',
                weekly: 'Semanal',
                monthly: 'Mensal',
                yearly: 'Anual',
              })[item.frequency],
          },
          {
            label: 'Próxima',
            render: (item) =>
              item.nextExecutionOn ? formatDate(item.nextExecutionOn) : '—',
          },
          {
            label: 'Estado',
            render: (item) =>
              ({ active: 'Ativa', paused: 'Pausada', completed: 'Concluída' })[
                item.status
              ],
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
        extra={(items) => <RecurrenceActions items={items} />}
      />
      ;
    </>
  );
}
