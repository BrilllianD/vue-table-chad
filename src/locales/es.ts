/**
 * Spanish.
 *
 * Whole record, not a `Partial` — see the note in `ru.ts` for why every locale
 * here is complete or is not shipped.
 */
import type { PinSide } from '../core/types'
import type { TableLabels } from '../core/labels'

/** `pinState` interpolates a side, so the sides need translating too. */
const SIDES: Record<PinSide | 'none', string> = {
  left: 'izquierda',
  right: 'derecha',
  none: 'ninguna',
}

export const es: TableLabels = Object.freeze({
  search: 'Buscar…',
  searchAllColumns: 'Buscar en todas las columnas',
  searchValuesPlaceholder: 'Buscar valores…',
  searchValues: 'Buscar valores',

  clear: 'Borrar',
  clearAll: 'Borrar todo',
  apply: 'Aplicar',
  save: 'Guardar',
  cancel: 'Cancelar',
  retry: 'Reintentar',
  loading: 'Cargando…',
  loadMore: 'Cargar más',

  noRows: 'Sin filas',
  noMatchingValues: 'Ningún valor coincide',
  noMatchingOptions: 'Ninguna opción coincide',
  emptyMessage: 'Sin datos',
  loadFailed: 'No se pudieron cargar los datos.',
  facetsFailed: 'No se pudieron cargar los valores del filtro.',
  optionsFailed: 'No se pudieron cargar las opciones.',
  loadingOptions: 'Cargando opciones',

  selectAllOnPage: 'Seleccionar todas las filas de esta página',
  selectAllValues: 'Seleccionar todo',
  selectAllRow: '(Seleccionar todo)',
  blanksCheckbox: 'Vacíos',
  blanksFacet: '(Vacíos)',
  clearSelection: 'Borrar la selección',

  pagination: 'Paginación',
  firstPage: 'Primera página',
  previousPage: 'Página anterior',
  nextPage: 'Página siguiente',
  lastPage: 'Última página',
  rowsPerPage: 'Filas por página',

  groupBy: 'Agrupar por',
  groupingOptions: 'Opciones de agrupación',
  expandAll: 'Expandir todo',
  collapseAll: 'Contraer todo',
  expandAllGroups: 'Expandir todos los grupos',
  collapseAllGroups: 'Contraer todos los grupos',
  moveUpLevel: 'Subir un nivel',
  moveDownLevel: 'Bajar un nivel',

  columns: 'Columnas',
  columnOptions: 'Opciones de columna',
  showAll: 'Mostrar todo',
  resetLayout: 'Restablecer el diseño',
  moveUp: 'Subir',
  moveDown: 'Bajar',
  rowActions: 'Acciones de fila',

  exportRows: 'Exportar',
  exportRowsDescription: 'Exportar todas las filas filtradas como CSV',

  filter: 'Filtrar',
  filterApplied: 'Filtro aplicado: haz clic para editarlo',
  filterValuesTab: 'Valores',
  filterConditionsTab: 'Condiciones',
  filterBlanksOnly: 'solo vacíos',
  filterNone: 'ninguno',
  conditionAnd: 'y',
  combineConditions: 'Combinar las condiciones con',
  conjunctionAnd: 'Y',
  conjunctionOr: 'O',
  conditionWhere: 'Donde',
  operator: 'Operador',
  conditionValue: 'Valor',
  conditionSecondValue: 'Segundo valor',
  conditionSecondValuePlaceholder: 'y',
  removeCondition: 'Quitar la condición',
  addCondition: 'Añadir una condición',

  selectPlaceholder: 'Seleccionar…',
  footerLabel: 'Total',

  clearFilterOn: (columnLabel: string) => `Borrar el filtro de ${columnLabel}`,
  filterChip: (columnLabel: string, summary: string) => `${columnLabel}: ${summary}`,
  filterColumn: (columnLabel: string) => `Filtrar ${columnLabel}`,
  resizeColumn: (columnLabel: string) => `Cambiar el ancho de la columna ${columnLabel}`,
  pinState: (side: PinSide | 'none') => `Fijar: ${SIDES[side]}`,
  pinColumn: (columnLabel: string) => `Fijar ${columnLabel}`,
  showColumn: (columnLabel: string) => `Mostrar ${columnLabel}`,
  groupByColumn: (columnLabel: string) => `Agrupar por ${columnLabel}`,
  stopGroupingBy: (levelLabel: string) => `Dejar de agrupar por ${levelLabel}`,
  sortByColumn: (columnLabel: string) =>
    `Ordenar por ${columnLabel} (mayús + clic para añadirlo a la ordenación múltiple)`,
  editCell: (columnLabel: string) => `Editar ${columnLabel}`,
  searchIn: (label: string | undefined) => (label ? `Buscar ${label}` : 'Buscar'),

  valueCount: (count: number) => `${count} valores`,
  rowRange: (first: number, last: number, total: number) => `${first}–${last} de ${total}`,
  pageSizeOption: (size: number) => `${size} / página`,
  selectedCount: (count: number) => `${count} seleccionadas`,
  allMatchingSelected: (count: number) =>
    `Se han seleccionado las ${count} filas que coinciden con los filtros actuales.`,
  allOnPageSelected: (count: number) =>
    `Se han seleccionado las ${count} filas de esta página.`,
  selectAllMatching: (total: number) => `Seleccionar las ${total} filas coincidentes`,

  expandGroup: (columnLabel: string, groupLabel: string) =>
    `Expandir el grupo ${groupLabel} de ${columnLabel}`,
  collapseGroup: (columnLabel: string, groupLabel: string) =>
    `Contraer el grupo ${groupLabel} de ${columnLabel}`,
  expandBand: (bandLabel: string) => `Expandir las columnas de ${bandLabel}`,
  collapseBand: (bandLabel: string) => `Contraer las columnas de ${bandLabel}`,
  expandColumnGroups: (columnLabel: string) => `Expandir todos los grupos de ${columnLabel}`,
  collapseColumnGroups: (columnLabel: string) => `Contraer todos los grupos de ${columnLabel}`,

  operators: Object.freeze({
    contains: 'contiene',
    notContains: 'no contiene',
    startsWith: 'empieza por',
    endsWith: 'termina en',
    eq: 'es igual a',
    neq: 'no es igual a',
    empty: 'está vacío',
    notEmpty: 'no está vacío',
    gt: 'es mayor que',
    gte: 'es mayor o igual que',
    lt: 'es menor que',
    lte: 'es menor o igual que',
    between: 'está entre',
    on: 'es el día',
    before: 'es anterior a',
    after: 'es posterior a',
  }),
  parse: Object.freeze({
    text: 'No es un texto válido',
    number: 'No es un número',
    date: 'No es una fecha',
    boolean: 'No es sí o no',
    enum: 'No es una de las opciones',
  }),
  required: 'Obligatorio',
  saveFailed: 'No se pudo guardar',
  blankGroup: 'Vacío',
})
