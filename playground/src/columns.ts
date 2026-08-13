import type { ColumnDef } from '@sandbox/vue-table'
import type { Employee } from '../mock/fakeApi'

const money = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

export const employeeColumns: ColumnDef<Employee>[] = [
  { id: 'name', header: 'Name', type: 'text', width: 190, pinned: 'left' },
  { id: 'email', header: 'Email', type: 'text', width: 250 },
  {
    id: 'department',
    header: 'Department',
    type: 'enum',
    width: 150,
    options: ['Engineering', 'Research', 'Design', 'Support', 'Sales', 'Finance'],
  },
  { id: 'role', header: 'Role', type: 'enum', width: 120 },
  {
    id: 'salary',
    header: 'Salary',
    type: 'number',
    width: 130,
    align: 'right',
    format: (value) => (value === null || value === undefined ? '—' : money.format(Number(value))),
  },
  {
    id: 'hiredAt',
    header: 'Hired',
    type: 'date',
    width: 130,
    format: (value) => (value ? new Date(String(value)).toLocaleDateString() : '—'),
  },
  {
    id: 'rating',
    header: 'Rating',
    type: 'number',
    width: 100,
    align: 'right',
    format: (value) => `${Number(value).toFixed(1)} ★`,
  },
  {
    id: 'active',
    header: 'Active',
    type: 'boolean',
    width: 100,
    align: 'center',
    format: (value) => (value ? 'Yes' : 'No'),
  },
]
