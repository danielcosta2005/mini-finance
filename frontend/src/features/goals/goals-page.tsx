import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, list } from '@/lib/api';
import {
  currentDate,
  formatCurrency,
  formatDate,
  formatPercent,
} from '@/lib/format';
import type { Contribution, Goal } from '@/lib/types';
import {
  Feedback,
  type FieldSpec,
  FormFields,
  Loading,
  Pagination,
  ResourcePage,
  toPayload,
} from '@/shared/ui/resource';
import { Sheet } from '@/shared/ui/sheet';

const fields: FieldSpec[] = [
  { name: 'description', label: 'Descrição' },
  { name: 'targetCents', label: 'Valor-alvo', kind: 'money', min: 1 },
  { name: 'dueOn', label: 'Prazo', kind: 'date' },
];

function GoalDetails({ goals }: { goals: Goal[] }) {
  const client = useQueryClient();
  const [selected, setSelected] = useState<Goal | null>(null);
  const [page, setPage] = useState(1);
  const [values, setValues] = useState<Record<string, string>>({
    amountCents: '',
    contributedOn: currentDate(),
  });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const history = useQuery({
    queryKey: ['contributions', selected?.id, page],
    queryFn: () =>
      list<Contribution>(`/goals/${selected?.id}/contributions`, { page }),
    enabled: !!selected,
  });
  const contributionFields: FieldSpec[] = [
    { name: 'amountCents', label: 'Valor do aporte', kind: 'money', min: 1 },
    { name: 'contributedOn', label: 'Data', kind: 'date' },
  ];
  const mutation = useMutation({
    mutationFn: (body: Record<string, string | number | null>) =>
      api(`/goals/${selected?.id}/contributions`, { method: 'POST', body }),
    onSuccess: async () => {
      await client.invalidateQueries();
      setMessage('Aporte registrado.');
      setValues({ amountCents: '', contributedOn: currentDate() });
    },
  });
  return (
    <div className="section">
      <div className="section-head">
        <h2>Aportes</h2>
      </div>
      <Feedback message={message} />
      {goals.map((goal) => (
        <div key={goal.id} className="compact-row">
          <span>
            {goal.description}
            <small>Prazo {formatDate(goal.dueOn)}</small>
          </span>
          <button
            type="button"
            className="button-link"
            onClick={() => {
              setSelected(goal);
              setPage(1);
            }}
          >
            Ver histórico e aportar
          </button>
        </div>
      ))}
      <Sheet
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        title={selected?.description ?? 'Meta'}
      >
        {selected && (
          <>
            <p>
              {formatCurrency(selected.contributedCents)} de{' '}
              {formatCurrency(selected.targetCents)}
            </p>
            <div
              className={`progress ${Number(selected.progressPercentage) > 100 ? 'exceeded' : Number(selected.progressPercentage) >= 80 ? 'warning' : ''}`}
              role="progressbar"
              aria-valuenow={Number(selected.progressPercentage)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span
                style={{
                  width: `${Math.min(100, Number(selected.progressPercentage))}%`,
                }}
              />
            </div>
            <small>
              {formatPercent(selected.progressPercentage)} alcançado
            </small>
            <form
              className="form section"
              onSubmit={(event) => {
                event.preventDefault();
                try {
                  setError('');
                  mutation.mutate(toPayload(contributionFields, values));
                } catch (failure) {
                  setError(
                    failure instanceof Error
                      ? failure.message
                      : 'Confira os campos.',
                  );
                }
              }}
            >
              <h3>Registrar aporte</h3>
              <FormFields
                fields={contributionFields}
                values={values}
                setValues={setValues}
                error={error}
              />
              <Feedback error={mutation.error} />
              <button
                type="submit"
                className="button"
                disabled={mutation.isPending}
              >
                Salvar aporte
              </button>
            </form>
            <section className="section">
              <h3>Histórico de aportes</h3>
              <Loading
                pending={history.isPending}
                error={history.error}
                retry={() => history.refetch()}
              />
              {history.data &&
                (history.data.data.length ? (
                  history.data.data.map((item) => (
                    <div className="compact-row" key={item.id}>
                      <span>{formatDate(item.contributedOn)}</span>
                      <span className="money">
                        {formatCurrency(item.amountCents)}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="muted">Nenhum aporte registrado.</p>
                ))}
              <Pagination
                page={page}
                totalPages={history.data?.pagination.totalPages ?? 0}
                setPage={setPage}
              />
            </section>
          </>
        )}
      </Sheet>
    </div>
  );
}

export function GoalsPage() {
  return (
    <ResourcePage<Goal>
      title="Metas financeiras"
      description="Acompanhe valores-alvo, prazos e aportes."
      singular="Meta"
      path="/goals"
      fields={fields}
      valuesOf={(item) => ({
        description: item.description,
        targetCents: (item.targetCents / 100).toFixed(2).replace('.', ','),
        dueOn: item.dueOn,
      })}
      columns={[
        { label: 'Meta', render: (item) => item.description },
        { label: 'Prazo', render: (item) => formatDate(item.dueOn) },
        {
          label: 'Alvo',
          render: (item) => (
            <span className="money">{formatCurrency(item.targetCents)}</span>
          ),
          right: true,
        },
        {
          label: 'Aportado',
          render: (item) => (
            <span className="money">
              {formatCurrency(item.contributedCents)}
            </span>
          ),
          right: true,
        },
        {
          label: 'Progresso',
          render: (item) => (
            <>
              <div
                className={`progress ${Number(item.progressPercentage) > 100 ? 'exceeded' : Number(item.progressPercentage) >= 80 ? 'warning' : ''}`}
              >
                <span
                  style={{
                    width: `${Math.min(100, Number(item.progressPercentage))}%`,
                  }}
                />
              </div>
              <small>
                {formatPercent(item.progressPercentage)} alcançado
                {item.overdue ? ' · Prazo vencido' : ''}
              </small>
            </>
          ),
        },
      ]}
      extra={(goals) => <GoalDetails goals={goals} />}
    />
  );
}
