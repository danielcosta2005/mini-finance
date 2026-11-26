import { useState } from 'react';
import { list } from '@/lib/api';
import type { Category } from '@/lib/types';
import { type FieldSpec, ResourcePage } from '@/shared/ui/resource';

const fields: FieldSpec[] = [
  { name: 'name', label: 'Nome' },
  {
    name: 'type',
    label: 'Tipo',
    kind: 'select',
    options: [
      { value: 'expense', label: 'Despesa' },
      { value: 'income', label: 'Receita' },
    ],
  },
];
export const categoryOptions = async (type?: 'income' | 'expense') =>
  (await list<Category>('/categories', { pageSize: 100, type })).data.map(
    (category) => ({ value: category.id, label: category.name }),
  );

export function CategoriesPage() {
  const [type, setType] = useState('');
  return (
    <>
      <div className="filters">
        <label htmlFor="category-filter">
          Tipo
          <select
            id="category-filter"
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            <option value="">Todos</option>
            <option value="income">Receitas</option>
            <option value="expense">Despesas</option>
          </select>
        </label>
      </div>
      <ResourcePage<Category>
        singular="Categoria"
        path="/categories"
        fields={fields}
        defaults={{ type: 'expense' }}
        valuesOf={(item) => ({ name: item.name, type: item.type })}
        filters={{ type }}
        columns={[
          { label: 'Nome', render: (item) => item.name },
          {
            label: 'Tipo',
            render: (item) => (item.type === 'income' ? 'Receita' : 'Despesa'),
          },
        ]}
      />
    </>
  );
}
