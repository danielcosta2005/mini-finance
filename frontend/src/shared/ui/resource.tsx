import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { MonthSelector } from '@/components/layout/month-selector';
import { api, list } from '@/lib/api';
import { formatCurrency, parseMoney } from '@/lib/format';
import { ConfirmDialog, Sheet } from './sheet';

export type FieldSpec = {
  name: string;
  label: string;
  kind?:
    | 'text'
    | 'email'
    | 'date'
    | 'month'
    | 'money'
    | 'number'
    | 'select'
    | 'segmented';
  options?: { value: string; label: string; type?: 'income' | 'expense' }[];
  required?: boolean;
  min?: number;
  max?: number;
};
export type Column<T> = {
  label: string;
  render: (item: T) => React.ReactNode;
  right?: boolean;
};

export function FormFields({
  fields,
  values,
  setValues,
  error,
}: {
  fields: FieldSpec[];
  values: Record<string, string>;
  setValues: (values: Record<string, string>) => void;
  error?: string;
}) {
  return (
    <>
      {fields.map((field) => (
        <div className="field" key={field.name}>
          <label htmlFor={field.name}>{field.label}</label>
          {field.kind === 'segmented' ? (
            <fieldset className="segmented">
              <legend className="visually-hidden">{field.label}</legend>
              {field.options?.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={values[field.name] === option.value}
                  onClick={() =>
                    setValues({
                      ...values,
                      [field.name]: option.value,
                      categoryId: '',
                    })
                  }
                >
                  {option.label}
                </button>
              ))}
            </fieldset>
          ) : field.kind === 'month' ? (
            <MonthSelector
              label={field.label}
              value={values[field.name] ?? ''}
              onChange={(value) =>
                setValues({ ...values, [field.name]: value })
              }
            />
          ) : field.kind === 'select' ? (
            <select
              id={field.name}
              value={values[field.name] ?? ''}
              required={field.required !== false}
              onChange={(event) =>
                setValues({
                  ...values,
                  [field.name]: event.target.value,
                  ...(field.name === 'type' ? { categoryId: '' } : {}),
                })
              }
            >
              <option value="">Selecione</option>
              {field.options
                ?.filter(
                  (option) => !option.type || option.type === values.type,
                )
                .map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
            </select>
          ) : (
            <input
              id={field.name}
              type={
                field.kind === 'money'
                  ? 'text'
                  : field.kind === 'number'
                    ? 'number'
                    : (field.kind ?? 'text')
              }
              inputMode={field.kind === 'money' ? 'decimal' : undefined}
              value={values[field.name] ?? ''}
              required={field.required !== false}
              min={field.min}
              max={field.max}
              onChange={(event) =>
                setValues({ ...values, [field.name]: event.target.value })
              }
              onBlur={() => {
                if (field.kind === 'money') {
                  const cents = parseMoney(values[field.name] ?? '');
                  if (cents !== null)
                    setValues({
                      ...values,
                      [field.name]: formatCurrency(cents),
                    });
                }
              }}
            />
          )}
        </div>
      ))}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

export function toPayload(
  fields: FieldSpec[],
  values: Record<string, string>,
): Record<string, string | number | null> {
  const payload: Record<string, string | number | null> = {};
  for (const field of fields) {
    const value = values[field.name]?.trim() ?? '';
    if (!value && field.required === false) continue;
    if (field.kind === 'money') {
      const cents = parseMoney(value);
      if (cents === null || (field.min !== undefined && cents < field.min))
        throw new Error(
          `Informe um valor válido para ${field.label.toLowerCase()}.`,
        );
      payload[field.name] = cents;
    } else if (field.kind === 'number') {
      const number = Number(value);
      if (
        !Number.isInteger(number) ||
        (field.min !== undefined && number < field.min) ||
        (field.max !== undefined && number > field.max)
      )
        throw new Error(
          `Informe um valor válido para ${field.label.toLowerCase()}.`,
        );
      payload[field.name] = number;
    } else if (!value && field.required !== false)
      throw new Error(`Informe ${field.label.toLowerCase()}.`);
    else payload[field.name] = value;
  }
  return payload;
}

export function Feedback({
  message,
  error,
}: {
  message?: string;
  error?: unknown;
}) {
  if (error)
    return (
      <div role="alert" className="feedback error">
        {error instanceof Error
          ? error.message
          : 'Não foi possível concluir a operação.'}
      </div>
    );
  if (message)
    return (
      <div role="status" className="feedback">
        {message}
      </div>
    );
  return null;
}

export function Loading({
  pending,
  error,
  retry,
}: {
  pending: boolean;
  error: unknown;
  retry: () => void;
}) {
  if (pending) return <p role="status">Carregando dados…</p>;
  if (error)
    return (
      <div role="alert" className="feedback error">
        {error instanceof Error ? error.message : 'Erro ao carregar dados.'}{' '}
        <button type="button" className="button-link" onClick={retry}>
          Tentar novamente
        </button>
      </div>
    );
  return null;
}

export function Pagination({
  page,
  totalPages,
  setPage,
}: {
  page: number;
  totalPages: number;
  setPage: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="pagination">
      <button
        type="button"
        className="button secondary"
        disabled={page <= 1}
        onClick={() => setPage(page - 1)}
      >
        Anterior
      </button>
      <span className="numeric">
        {page} de {totalPages}
      </span>
      <button
        type="button"
        className="button secondary"
        disabled={page >= totalPages}
        onClick={() => setPage(page + 1)}
      >
        Próxima
      </button>
    </div>
  );
}

type Item = { id: string };
export function ResourcePage<T extends Item>({
  singular,
  path,
  fields,
  columns,
  defaults,
  valuesOf,
  filters,
  extra,
  canDelete = true,
  createLabel,
  tableClass,
}: {
  singular: string;
  path: string;
  fields: FieldSpec[];
  columns: Column<T>[];
  defaults?: Record<string, string>;
  valuesOf: (item: T) => Record<string, string>;
  filters?: Record<string, string | number | undefined>;
  extra?: (items: T[]) => React.ReactNode;
  canDelete?: boolean;
  createLabel?: string;
  tableClass?: string;
}) {
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<T | null | 'new'>(null);
  const [deleting, setDeleting] = useState<T | null>(null);
  const [values, setValues] = useState<Record<string, string>>(defaults ?? {});
  const [formError, setFormError] = useState('');
  const [message, setMessage] = useState('');
  const [actionError, setActionError] = useState<unknown>(null);
  const feminine = singular.endsWith('a') || singular.endsWith('ção');
  const newLabel = `${feminine ? 'Nova' : 'Novo'} ${singular.toLowerCase()}`;
  const query = useQuery({
    queryKey: [path, page, filters],
    queryFn: () => list<T>(path, { page, pageSize: 20, ...filters }),
  });
  const save = useMutation({
    mutationFn: (payload: Record<string, string | number | null>) =>
      editing && editing !== 'new'
        ? api(`${path}/${editing.id}`, { method: 'PATCH', body: payload })
        : api(path, { method: 'POST', body: payload }),
    onSuccess: async () => {
      await client.invalidateQueries();
      setEditing(null);
      setMessage(`${singular} salv${feminine ? 'a' : 'o'} com sucesso.`);
      setActionError(null);
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`${path}/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await client.invalidateQueries();
      setDeleting(null);
      setMessage(`${singular} excluíd${feminine ? 'a' : 'o'} com sucesso.`);
      setActionError(null);
    },
    onError: (error) => {
      setDeleting(null);
      setActionError(error);
    },
  });
  function open(item: T | 'new') {
    setValues(item === 'new' ? (defaults ?? {}) : valuesOf(item));
    setFormError('');
    save.reset();
    setEditing(item);
  }
  function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      setFormError('');
      save.mutate(toPayload(fields, values));
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : 'Confira os campos.',
      );
    }
  }
  return (
    <>
      <div className="resource-actions">
        <button type="button" className="button" onClick={() => open('new')}>
          {createLabel ?? newLabel}
        </button>
      </div>
      <Feedback message={message} error={actionError} />
      <Loading
        pending={query.isPending}
        error={query.error}
        retry={() => query.refetch()}
      />
      {query.data && (
        <>
          {query.data.data.length ? (
            <div className="table-wrap">
              <table className={tableClass}>
                <thead>
                  <tr>
                    {columns.map((column) => (
                      <th
                        key={column.label}
                        className={column.right ? 'right' : ''}
                      >
                        {column.label}
                      </th>
                    ))}
                    <th className="right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.data.map((item) => (
                    <tr key={item.id}>
                      {columns.map((column) => (
                        <td
                          key={column.label}
                          data-label={column.label}
                          className={column.right ? 'right numeric' : ''}
                        >
                          {column.render(item)}
                        </td>
                      ))}
                      <td className="right" data-label="Ações">
                        <details className="row-menu">
                          <summary
                            className="icon-button"
                            aria-label={`Ações para ${singular.toLowerCase()}`}
                          >
                            ⋯
                          </summary>
                          <div>
                            <button type="button" onClick={() => open(item)}>
                              Editar
                            </button>
                            {canDelete && (
                              <button
                                type="button"
                                onClick={() => setDeleting(item)}
                              >
                                Excluir
                              </button>
                            )}
                          </div>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bordered empty">
              {feminine ? 'Nenhuma' : 'Nenhum'} {singular.toLowerCase()}{' '}
              encontrad{feminine ? 'a' : 'o'}.{' '}
              <button
                type="button"
                className="button-link"
                onClick={() => open('new')}
              >
                Adicionar {singular.toLowerCase()}
              </button>
            </div>
          )}
          <Pagination
            page={page}
            totalPages={query.data.pagination.totalPages}
            setPage={setPage}
          />
          {extra?.(query.data.data)}
        </>
      )}
      <Sheet
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        title={
          editing === 'new' ? newLabel : `Editar ${singular.toLowerCase()}`
        }
      >
        <form className="form" onSubmit={submit}>
          <FormFields
            fields={fields}
            values={values}
            setValues={setValues}
            error={formError}
          />
          <Feedback error={save.error} />
          <div className="form-actions">
            <button
              type="button"
              className="button secondary"
              onClick={() => setEditing(null)}
            >
              Cancelar
            </button>
            <button type="submit" className="button" disabled={save.isPending}>
              Salvar {singular.toLowerCase()}
            </button>
          </div>
        </form>
      </Sheet>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={`Excluir ${singular.toLowerCase()}?`}
        description="Esta ação não pode ser desfeita. Registros com dependências podem ser protegidos pela API."
        confirm={() => {
          if (deleting) remove.mutate(deleting.id);
        }}
        pending={remove.isPending}
      />
    </>
  );
}

export const moneyValue = (cents: number) => formatCurrency(cents);
