import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, list } from '@/lib/api';
import {
  currentDate,
  currentMonth,
  formatCurrency,
  formatDate,
} from '@/lib/format';
import type { Account, Card, Category, Invoice, Purchase } from '@/lib/types';
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

const cardFields: FieldSpec[] = [
  { name: 'name', label: 'Nome' },
  {
    name: 'creditLimitCents',
    label: 'Limite de crédito',
    kind: 'money',
    min: 0,
  },
  {
    name: 'closingDay',
    label: 'Dia de fechamento',
    kind: 'number',
    min: 1,
    max: 31,
  },
  {
    name: 'dueDay',
    label: 'Dia de vencimento',
    kind: 'number',
    min: 1,
    max: 31,
  },
];

function CardDetails({ cards }: { cards: Card[] }) {
  const client = useQueryClient();
  const [cardId, setCardId] = useState('');
  const selected = cards.find((card) => card.id === cardId) ?? cards[0];
  const [month, setMonth] = useState(currentMonth());
  const [invoicePage, setInvoicePage] = useState(1);
  const [purchasePage, setPurchasePage] = useState(1);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({
    purchasedOn: currentDate(),
    installmentCount: '1',
  });
  const [formError, setFormError] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [paymentAccount, setPaymentAccount] = useState('');
  const [message, setMessage] = useState('');
  const categories = useQuery({
    queryKey: ['expense-categories'],
    queryFn: () =>
      list<Category>('/categories', { type: 'expense', pageSize: 100 }),
  });
  const accounts = useQuery({
    queryKey: ['all-accounts'],
    queryFn: () => list<Account>('/accounts', { pageSize: 100 }),
  });
  const purchases = useQuery({
    queryKey: ['purchases', selected?.id, purchasePage],
    queryFn: () =>
      list<Purchase>(`/cards/${selected?.id}/purchases`, {
        page: purchasePage,
      }),
    enabled: !!selected,
  });
  const invoices = useQuery({
    queryKey: ['invoices', selected?.id, month, invoicePage],
    queryFn: () =>
      list<Invoice>(`/cards/${selected?.id}/invoices`, {
        month,
        page: invoicePage,
      }),
    enabled: !!selected,
  });
  const invoice = useQuery({
    queryKey: ['invoice', invoiceId],
    queryFn: () => api<Invoice>(`/invoices/${invoiceId}`),
    enabled: !!invoiceId,
  });
  const purchaseFields: FieldSpec[] = [
    { name: 'description', label: 'Descrição' },
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
    { name: 'totalCents', label: 'Valor total', kind: 'money', min: 1 },
    { name: 'purchasedOn', label: 'Data da compra', kind: 'date' },
    {
      name: 'installmentCount',
      label: 'Número de parcelas',
      kind: 'number',
      min: 1,
      max: 360,
    },
  ];
  const purchase = useMutation({
    mutationFn: (body: Record<string, string | number | null>) =>
      api(`/cards/${selected?.id}/purchases`, { method: 'POST', body }),
    onSuccess: async () => {
      await client.invalidateQueries();
      setPurchaseOpen(false);
      setMessage('Compra registrada.');
    },
  });
  const pay = useMutation({
    mutationFn: () =>
      api(`/invoices/${invoiceId}/pay`, {
        method: 'POST',
        body: { accountId: paymentAccount },
      }),
    onSuccess: async () => {
      await client.invalidateQueries();
      setMessage('Fatura paga.');
      setInvoiceId('');
    },
  });
  if (!selected) return null;
  return (
    <div className="section">
      <div className="section-head">
        <h2>Compras e faturas</h2>
        <button
          type="button"
          className="button secondary"
          onClick={() => setPurchaseOpen(true)}
        >
          Registrar compra
        </button>
      </div>
      <div className="filters">
        <label htmlFor="card-select">
          Cartão
          <select
            id="card-select"
            value={selected.id}
            onChange={(event) => {
              setCardId(event.target.value);
              setInvoiceId('');
            }}
          >
            {cards.map((card) => (
              <option key={card.id} value={card.id}>
                {card.name}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="invoice-month">
          Mês da fatura
          <input
            id="invoice-month"
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
          />
        </label>
      </div>
      <Feedback message={message} error={purchase.error ?? pay.error} />
      <section className="section">
        <h2>Faturas</h2>
        <Loading
          pending={invoices.isPending}
          error={invoices.error}
          retry={() => invoices.refetch()}
        />
        {invoices.data &&
          (invoices.data.data.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Vencimento</th>
                    <th>Estado</th>
                    <th className="right">Total</th>
                    <th className="right">Em aberto</th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.data.data.map((item) => (
                    <tr key={item.id}>
                      <td>{formatDate(item.dueOn)}</td>
                      <td>
                        {item.status === 'paid'
                          ? 'Paga'
                          : item.dueOn < currentDate()
                            ? 'Vencida'
                            : item.closesOn < currentDate()
                              ? 'Fechada'
                              : 'Aberta'}
                      </td>
                      <td className="right money">
                        {formatCurrency(item.totalCents)}
                      </td>
                      <td className="right money">
                        {formatCurrency(item.outstandingCents)}
                      </td>
                      <td>
                        <button
                          className="button-link"
                          type="button"
                          onClick={() => setInvoiceId(item.id)}
                        >
                          Ver parcelas
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty bordered">Nenhuma fatura neste mês.</p>
          ))}
        <Pagination
          page={invoicePage}
          totalPages={invoices.data?.pagination.totalPages ?? 0}
          setPage={setInvoicePage}
        />
      </section>
      <section className="section">
        <h2>Histórico de compras</h2>
        <Loading
          pending={purchases.isPending}
          error={purchases.error}
          retry={() => purchases.refetch()}
        />
        {purchases.data &&
          (purchases.data.data.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Compra</th>
                    <th>Parcelas</th>
                    <th className="right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.data.data.map((item) => (
                    <tr key={item.id}>
                      <td>{formatDate(item.purchasedOn)}</td>
                      <td>{item.description}</td>
                      <td>{item.installmentCount}×</td>
                      <td className="right money">
                        {formatCurrency(item.totalCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty bordered">Nenhuma compra registrada.</p>
          ))}
        <Pagination
          page={purchasePage}
          totalPages={purchases.data?.pagination.totalPages ?? 0}
          setPage={setPurchasePage}
        />
      </section>
      <Sheet
        open={purchaseOpen}
        onOpenChange={setPurchaseOpen}
        title="Registrar compra"
      >
        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault();
            try {
              setFormError('');
              purchase.mutate(toPayload(purchaseFields, values));
            } catch (failure) {
              setFormError(
                failure instanceof Error
                  ? failure.message
                  : 'Confira os campos.',
              );
            }
          }}
        >
          <FormFields
            fields={purchaseFields}
            values={values}
            setValues={setValues}
            error={formError}
          />
          <Feedback error={purchase.error} />
          <div className="form-actions">
            <button
              type="button"
              className="button secondary"
              onClick={() => setPurchaseOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="button"
              disabled={purchase.isPending}
            >
              Salvar compra
            </button>
          </div>
        </form>
      </Sheet>
      <Sheet
        open={!!invoiceId}
        onOpenChange={(open) => {
          if (!open) setInvoiceId('');
        }}
        title="Detalhes da fatura"
      >
        <Loading
          pending={invoice.isPending}
          error={invoice.error}
          retry={() => invoice.refetch()}
        />
        {invoice.data && (
          <>
            <p>Vencimento: {formatDate(invoice.data.dueOn)}</p>
            <p>
              Estado: {invoice.data.status === 'paid' ? 'Paga' : 'Em aberto'}
            </p>
            <p className="money">
              Total: {formatCurrency(invoice.data.totalCents)}
            </p>
            <h3>Parcelas</h3>
            {invoice.data.installments?.map((item) => (
              <div className="compact-row" key={item.id}>
                <span>
                  {item.description}
                  <small>
                    {item.installmentNumber} de {item.installmentCount}
                  </small>
                </span>
                <span className="money">
                  {formatCurrency(item.amountCents)}
                </span>
              </div>
            ))}
            {invoice.data.status === 'open' && (
              <form
                className="form section"
                onSubmit={(event) => {
                  event.preventDefault();
                  pay.mutate();
                }}
              >
                <div className="field">
                  <label htmlFor="payment-account">Pagar com a conta</label>
                  <select
                    id="payment-account"
                    required
                    value={paymentAccount}
                    onChange={(event) => setPaymentAccount(event.target.value)}
                  >
                    <option value="">Selecione</option>
                    {accounts.data?.data.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>
                <Feedback error={pay.error} />
                <button
                  className="button"
                  type="submit"
                  disabled={pay.isPending}
                >
                  Pagar fatura
                </button>
              </form>
            )}
          </>
        )}
      </Sheet>
    </div>
  );
}

export function CardsPage() {
  return (
    <ResourcePage<Card>
      title="Cartões de crédito"
      description="Limites, compras e faturas por mês."
      singular="Cartão"
      path="/cards"
      fields={cardFields}
      defaults={{ creditLimitCents: '0,00', closingDay: '20', dueDay: '28' }}
      valuesOf={(item) => ({
        name: item.name,
        creditLimitCents: (item.creditLimitCents / 100)
          .toFixed(2)
          .replace('.', ','),
        closingDay: String(item.closingDay),
        dueDay: String(item.dueDay),
      })}
      columns={[
        { label: 'Cartão', render: (item) => item.name },
        { label: 'Fechamento', render: (item) => `Dia ${item.closingDay}` },
        { label: 'Vencimento', render: (item) => `Dia ${item.dueDay}` },
        {
          label: 'Limite',
          render: (item) => (
            <span className="money">
              {formatCurrency(item.creditLimitCents)}
            </span>
          ),
          right: true,
        },
        {
          label: 'Disponível',
          render: (item) => (
            <span className="money">{formatCurrency(item.availableCents)}</span>
          ),
          right: true,
        },
      ]}
      extra={(cards) => <CardDetails cards={cards} />}
    />
  );
}
