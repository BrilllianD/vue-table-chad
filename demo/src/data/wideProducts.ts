/**
 * A wide dataset, and the only one in the demo that is not the shared fixture.
 *
 * `bench/fixtures.ts` is eleven columns with a declared `width` on every one of
 * them, which is exactly the shape in which the sizing defaults are invisible —
 * and widening it here would change what `bench/BASELINE.md` measured. So the
 * Wide table view brings its own 34 columns, none of which declares a width,
 * and leaves the fixture alone.
 *
 * A `type` rather than an `interface`: `DataTable` constrains `TRow` to
 * `Record<string, unknown>`, and only an alias satisfies that implicitly.
 */
import type { ColumnDef } from '@brillliand/vue-table-chad'

export type Product = {
  id: number
  sku: string
  name: string
  description: string
  category: string
  subcategory: string
  status: string
  priority: string
  owner: string
  ownerEmail: string
  team: string
  department: string
  region: string
  country: string
  city: string
  postcode: string
  phone: string
  createdAt: string
  updatedAt: string
  dueAt: string
  price: number
  cost: number
  margin: number
  quantity: number
  stock: number
  reorderPoint: number
  weightKg: number
  volumeM3: number
  rating: number
  reviews: number
  active: boolean
  archived: boolean
  tags: string
  notes: string
}

const CATEGORIES = ['Hardware', 'Software', 'Services', 'Consumables', 'Subscriptions']
const SUBCATEGORIES = ['Peripherals', 'Networking', 'Licensing', 'Support', 'Storage', 'Training']
const STATUSES = ['Active', 'Draft', 'Discontinued', 'Backordered']
const PRIORITIES = ['Low', 'Normal', 'High', 'Critical']
const TEAMS = ['Platform', 'Growth', 'Field Operations', 'Supply Chain']
const DEPARTMENTS = ['Engineering', 'Procurement', 'Logistics', 'Customer Success']
const REGIONS = ['EMEA', 'APAC', 'LATAM', 'North America']
const COUNTRIES = ['Germany', 'Japan', 'Brazil', 'United States', 'Netherlands', 'Singapore']
const CITIES = ['Berlin', 'Osaka', 'São Paulo', 'Austin', 'Rotterdam', 'Singapore']
const FIRST = ['Ada', 'Grace', 'Linus', 'Margaret', 'Ken', 'Barbara', 'Alan', 'Radia']
const LAST = ['Lovelace', 'Hopper', 'Torvalds', 'Hamilton', 'Thompson', 'Liskov', 'Kay', 'Perlman']
const TAGS = ['refurbished', 'bulk-order', 'fragile', 'export-controlled', 'promo', 'end-of-life']

function isoDate(year: number, step: number): string {
  const month = 1 + (step % 12)
  const day = 1 + (step % 28)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * Deterministic like the fixture's generator, and for the same reason: a column
 * is measured from the widest string it holds, so rows that changed per reload
 * would move the widths this view is about.
 */
export function makeProducts(count = 300): Product[] {
  const rows: Product[] = []
  for (let i = 0; i < count; i += 1) {
    const first = FIRST[i % FIRST.length]!
    const last = LAST[(i * 3) % LAST.length]!
    const category = CATEGORIES[i % CATEGORIES.length]!
    const subcategory = SUBCATEGORIES[i % SUBCATEGORIES.length]!
    const region = REGIONS[i % REGIONS.length]!
    const price = 40 + ((i * 37) % 960)
    const cost = Math.round(price * (0.42 + (i % 17) / 100) * 100) / 100
    rows.push({
      id: 1000 + i,
      sku: `SKU-${String(10_000 + i * 7)}`,
      name: `${category} unit ${String.fromCharCode(65 + (i % 26))}${i % 90}`,
      description: `${category} line item covering ${subcategory.toLowerCase()} for the ${region} rollout`,
      category,
      subcategory,
      status: STATUSES[i % STATUSES.length]!,
      priority: PRIORITIES[(i * 5) % PRIORITIES.length]!,
      owner: `${first} ${last}`,
      ownerEmail: `${first.toLowerCase()}.${last.toLowerCase()}@example-corporation.com`,
      team: TEAMS[i % TEAMS.length]!,
      department: DEPARTMENTS[(i * 3) % DEPARTMENTS.length]!,
      region,
      country: COUNTRIES[i % COUNTRIES.length]!,
      city: CITIES[i % CITIES.length]!,
      postcode: `${10 + (i % 89)}-${String(100 + (i % 899))}`,
      phone: `+1 (555) ${String(100 + (i % 900))}-${String(1000 + (i % 9000))}`,
      createdAt: isoDate(2023, i),
      updatedAt: isoDate(2024, i * 2),
      dueAt: isoDate(2025, i * 3),
      price,
      cost,
      margin: Math.round(((price - cost) / price) * 1000) / 10,
      quantity: 1 + (i % 240),
      stock: (i * 13) % 5000,
      reorderPoint: 25 + (i % 200),
      weightKg: Math.round((0.2 + (i % 40) * 0.35) * 100) / 100,
      volumeM3: Math.round((0.001 + (i % 30) * 0.004) * 1000) / 1000,
      rating: Math.round((2.5 + (i % 25) / 10) * 10) / 10,
      reviews: (i * 29) % 4200,
      active: i % 3 !== 0,
      archived: i % 11 === 0,
      tags: [TAGS[i % TAGS.length]!, TAGS[(i * 4) % TAGS.length]!].join(', '),
      notes:
        i % 4 === 0
          ? 'Awaiting supplier confirmation before the next procurement window opens.'
          : 'No outstanding actions.',
    })
  }
  return rows
}

const money = (value: unknown) => `$${(value as number).toFixed(2)}`

/**
 * 34 columns, not one `width` among them: every one is measured once from what
 * it holds and clamped into `[minWidth, maxWidth ?? 160]`.
 *
 * `minWidth` is 40 rather than the default 60, so the floor is below anything a
 * header can measure to and the widths on screen are the measurements rather
 * than the clamp.
 */
export const wideProductColumns: ColumnDef<Product>[] = (
  [
    { id: 'id', header: 'ID', type: 'number', sortable: true, filterable: true },
    { id: 'sku', header: 'SKU', type: 'text', sortable: true, filterable: true },
    { id: 'name', header: 'Name', type: 'text', sortable: true, filterable: true },
    { id: 'description', header: 'Description', type: 'text', sortable: true },
    { id: 'category', header: 'Category', type: 'enum', sortable: true, filterable: true },
    { id: 'subcategory', header: 'Subcategory', type: 'enum', sortable: true, filterable: true },
    { id: 'status', header: 'Status', type: 'enum', sortable: true, filterable: true },
    { id: 'priority', header: 'Priority', type: 'enum', sortable: true, filterable: true },
    { id: 'owner', header: 'Owner', type: 'text', sortable: true, filterable: true },
    { id: 'ownerEmail', header: 'Owner email', type: 'text', sortable: true },
    { id: 'team', header: 'Team', type: 'enum', sortable: true, filterable: true },
    { id: 'department', header: 'Department', type: 'enum', sortable: true, filterable: true },
    { id: 'region', header: 'Region', type: 'enum', sortable: true, filterable: true },
    { id: 'country', header: 'Country', type: 'enum', sortable: true, filterable: true },
    { id: 'city', header: 'City', type: 'enum', sortable: true, filterable: true },
    { id: 'postcode', header: 'Postcode', type: 'text', sortable: true },
    { id: 'phone', header: 'Phone', type: 'text' },
    { id: 'createdAt', header: 'Created', type: 'date', sortable: true, filterable: true },
    { id: 'updatedAt', header: 'Updated', type: 'date', sortable: true },
    { id: 'dueAt', header: 'Due', type: 'date', sortable: true },
    { id: 'price', header: 'Price', type: 'number', sortable: true, format: money },
    { id: 'cost', header: 'Cost', type: 'number', sortable: true, format: money },
    {
      id: 'margin',
      header: 'Margin',
      type: 'number',
      sortable: true,
      format: (value: unknown) => `${(value as number).toFixed(1)}%`,
    },
    { id: 'quantity', header: 'Qty', type: 'number', sortable: true },
    { id: 'stock', header: 'Stock', type: 'number', sortable: true },
    { id: 'reorderPoint', header: 'Reorder point', type: 'number', sortable: true },
    { id: 'weightKg', header: 'Weight (kg)', type: 'number', sortable: true },
    { id: 'volumeM3', header: 'Volume (m³)', type: 'number', sortable: true },
    { id: 'rating', header: 'Rating', type: 'number', sortable: true },
    { id: 'reviews', header: 'Reviews', type: 'number', sortable: true },
    { id: 'active', header: 'Active', type: 'boolean', sortable: true, filterable: true },
    { id: 'archived', header: 'Archived', type: 'boolean', sortable: true, filterable: true },
    { id: 'tags', header: 'Tags', type: 'text', filterable: true },
    { id: 'notes', header: 'Notes', type: 'text' },
  ] as ColumnDef<Product>[]
).map((column) => ({ ...column, minWidth: 40 }))
