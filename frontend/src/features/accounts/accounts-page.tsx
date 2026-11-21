import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, list } from '@/lib/api';
import { currentDate, formatCurrency } from '@/lib/format';
import type { Account } from '@/lib/types';
import {
  Feedback,
  type FieldSpec,
  FormFields,
  ResourcePage,
  toPayload,
} from '@/shared/ui/resource';
import { Sheet } from '@/shared/ui/sheet';

const accountTypes = [
  { value: 'checking', label: 'Conta corrente' },
  { value: 'savings', label: 'Poupança' },
  { value: 'cash', label: 'Dinheiro' },
  { value: 'investment', label: 'Investimento' },
  { value: 'other', label: 'Outra' },
];
const fields: FieldSpec[] = [
  { name: 'name', label: 'Nome' },
  { name: 'type', label: 'Tipo', kind: 'select', options: accountTypes },
  { name: 'openingBalanceCents', label: 'Saldo inicial', kind: 'money' },
];

function TransferPanel({ accounts }: { accounts: Account[] }) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({
    occurredOn: currentDate(),
  });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const transferFields: FieldSpec[] = [
    {
      name: 'sourceAccountId',
      label: 'Conta de origem',
      kind: 'select',
      options: accounts.map((account) => ({
        value: account.id,
        label: account.name,
      })),
    },
    {
      name: 'destinationAccountId',
      label: 'Conta de destino',
      kind: 'select',
      options: accounts.map((account) => ({
        value: account.id,
        label: account.name,
      })),
    },
    { name: 'amountCents', label: 'Valor', kind: 'money', min: 1 },
    { name: 'occurredOn', label: 'Data', kind: 'date' },
    { name: 'description', label: 'Descrição', required: false },
  ];
  const mutation = useMutation({
    mutationFn: (payload: Record<string, string | number | null>) =>
      api('/transfers', { method: 'POST', body: payload }),
    onSuccess: async () => {
      await client.invalidateQueries();
      setOpen(false);
      setMessage('Transferência registrada.');
    },
  });
  return (
    <div className="section">
      <div className="section-head">
        <h2>Transferências</h2>
        <button
          type="button"
          className="button secondary"
          disabled={accounts.length < 2}
          onClick={() => setOpen(true)}
        >
          Nova transferência
        </button>
      </div>
      {accounts.length < 2 && (
        <p className="muted">Cadastre duas contas para transferir valores.</p>
      )}
      <Feedback message={message} error={mutation.error} />
      <Sheet open={open} onOpenChange={setOpen} title="Nova transferência">
        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault();
            try {
              const payload = toPayload(transferFields, values);
              if (payload.sourceAccountId === payload.destinationAccountId)
                throw new Error('Selecione contas diferentes.');
              setError('');
              mutation.mutate(payload);
            } catch (failure) {
              setError(
                failure instanceof Error
                  ? failure.message
                  : 'Confira os campos.',
              );
            }
          }}
        >
          <FormFields
            fields={transferFields}
            values={values}
            setValues={setValues}
            error={error}
          />
          <Feedback error={mutation.error} />
          <div className="form-actions">
            <button
              type="button"
              className="button secondary"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="button"
              disabled={mutation.isPending}
            >
              Transferir valor
            </button>
          </div>
        </form>
      </Sheet>
    </div>
  );
}

export function AccountsPage() {
  const all = useQuery({
    queryKey: ['all-accounts'],
    queryFn: () => list<Account>('/accounts', { pageSize: 100 }),
  });
  return (
    <ResourcePage<Account>
      title="Contas financeiras"
      description="Saldos atualizados com lançamentos, transferências e pagamentos."
      singular="Conta"
      path="/accounts"
      fields={fields}
      defaults={{ type: 'checking', openingBalanceCents: '0,00' }}
      valuesOf={(item) => ({
        name: item.name,
        type: item.type,
        openingBalanceCents: (item.openingBalanceCents / 100)
          .toFixed(2)
          .replace('.', ','),
      })}
      columns={[
        { label: 'Conta', render: (item) => item.name },
        {
          label: 'Tipo',
          render: (item) =>
            accountTypes.find((type) => type.value === item.type)?.label ??
            item.type,
        },
        {
          label: 'Saldo',
          render: (item) => (
            <span className="money">{formatCurrency(item.balanceCents)}</span>
          ),
          right: true,
        },
      ]}
      extra={() => <TransferPanel accounts={all.data?.data ?? []} />}
    />
  );
}
