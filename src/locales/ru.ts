/**
 * Russian.
 *
 * A whole `TableLabels`, not a `Partial`: a locale that covered nine tenths of
 * the record would render the last tenth in English with nothing to say which
 * tenth, and a caller cannot audit what they cannot see. The type is what
 * enforces it — adding a key to `TableLabels` breaks this file until it is
 * translated, which is the cost of shipping locales and is meant to be paid
 * here rather than by a consumer at runtime.
 *
 * Counts read `значений: 12` rather than `12 значений` throughout. Russian
 * agrees the noun with the number in three forms, and a label record has no
 * plural machinery; putting the number last sidesteps the agreement instead of
 * getting it wrong two thirds of the time.
 */
import type { PinSide } from '../core/types'
import type { TableLabels } from '../core/labels'

/** `pinState` interpolates a side, so the sides need translating too. */
const SIDES: Record<PinSide | 'none', string> = {
  left: 'слева',
  right: 'справа',
  none: 'нет',
}

export const ru: TableLabels = Object.freeze({
  search: 'Поиск…',
  searchAllColumns: 'Поиск по всем столбцам',
  searchValuesPlaceholder: 'Поиск значений…',
  searchValues: 'Поиск значений',

  clear: 'Очистить',
  clearAll: 'Очистить всё',
  apply: 'Применить',
  save: 'Сохранить',
  cancel: 'Отмена',
  retry: 'Повторить',
  loading: 'Загрузка…',
  loadMore: 'Загрузить ещё',

  noRows: 'Нет строк',
  noMatchingValues: 'Подходящих значений нет',
  noMatchingOptions: 'Подходящих вариантов нет',
  emptyMessage: 'Нет данных',
  loadFailed: 'Не удалось загрузить данные.',
  facetsFailed: 'Не удалось загрузить значения фильтра.',
  optionsFailed: 'Не удалось загрузить варианты.',
  loadingOptions: 'Загрузка вариантов',

  selectAllOnPage: 'Выбрать все строки на этой странице',
  selectAllValues: 'Выбрать все',
  selectAllRow: '(Выбрать все)',
  blanksCheckbox: 'Пустые',
  blanksFacet: '(Пустые)',
  clearSelection: 'Снять выделение',

  pagination: 'Постраничная навигация',
  firstPage: 'Первая страница',
  previousPage: 'Предыдущая страница',
  nextPage: 'Следующая страница',
  lastPage: 'Последняя страница',
  rowsPerPage: 'Строк на странице',

  groupBy: 'Группировать по',
  groupingOptions: 'Параметры группировки',
  expandAll: 'Развернуть все',
  collapseAll: 'Свернуть все',
  expandAllGroups: 'Развернуть все группы',
  collapseAllGroups: 'Свернуть все группы',
  moveUpLevel: 'Поднять на уровень выше',
  moveDownLevel: 'Опустить на уровень ниже',

  columns: 'Столбцы',
  columnOptions: 'Параметры столбцов',
  showAll: 'Показать все',
  resetLayout: 'Сбросить расположение',
  moveUp: 'Вверх',
  moveDown: 'Вниз',
  rowActions: 'Действия со строкой',

  exportRows: 'Экспорт',
  exportRowsDescription: 'Экспортировать все отфильтрованные строки в CSV',

  filter: 'Фильтр',
  filterApplied: 'Фильтр применён — нажмите, чтобы изменить',
  filterValuesTab: 'Значения',
  filterConditionsTab: 'Условия',
  filterBlanksOnly: 'только пустые',
  filterNone: 'ничего',
  conditionAnd: 'и',
  combineConditions: 'Объединять условия через',
  conjunctionAnd: 'И',
  conjunctionOr: 'Или',
  conditionWhere: 'Где',
  operator: 'Оператор',
  conditionValue: 'Значение',
  conditionSecondValue: 'Второе значение',
  conditionSecondValuePlaceholder: 'и',
  removeCondition: 'Удалить условие',
  addCondition: 'Добавить условие',

  selectPlaceholder: 'Выберите…',
  footerLabel: 'Итого',

  clearFilterOn: (columnLabel: string) => `Очистить фильтр по столбцу «${columnLabel}»`,
  filterChip: (columnLabel: string, summary: string) => `${columnLabel}: ${summary}`,
  filterColumn: (columnLabel: string) => `Фильтр по столбцу «${columnLabel}»`,
  resizeColumn: (columnLabel: string) => `Изменить ширину столбца «${columnLabel}»`,
  pinState: (side: PinSide | 'none') => `Закрепление: ${SIDES[side]}`,
  pinColumn: (columnLabel: string) => `Закрепить столбец «${columnLabel}»`,
  showColumn: (columnLabel: string) => `Показать столбец «${columnLabel}»`,
  groupByColumn: (columnLabel: string) => `Группировать по столбцу «${columnLabel}»`,
  stopGroupingBy: (levelLabel: string) => `Прекратить группировку по «${levelLabel}»`,
  sortByColumn: (columnLabel: string) =>
    `Сортировать по столбцу «${columnLabel}» (Shift + клик — добавить к сортировке)`,
  editCell: (columnLabel: string) => `Изменить «${columnLabel}»`,
  searchIn: (label: string | undefined) => (label ? `Поиск: ${label}` : 'Поиск'),

  valueCount: (count: number) => `значений: ${count}`,
  rowRange: (first: number, last: number, total: number) => `${first}–${last} из ${total}`,
  pageSizeOption: (size: number) => `${size} / страница`,
  selectedCount: (count: number) => `выбрано: ${count}`,
  allMatchingSelected: (count: number) =>
    `Выбраны все строки, соответствующие текущим фильтрам: ${count}.`,
  allOnPageSelected: (count: number) => `Выбраны все строки на этой странице: ${count}.`,
  selectAllMatching: (total: number) => `Выбрать все подходящие строки: ${total}`,

  expandGroup: (columnLabel: string, groupLabel: string) =>
    `Развернуть группу «${groupLabel}» по столбцу «${columnLabel}»`,
  collapseGroup: (columnLabel: string, groupLabel: string) =>
    `Свернуть группу «${groupLabel}» по столбцу «${columnLabel}»`,
  expandBand: (bandLabel: string) => `Развернуть столбцы группы «${bandLabel}»`,
  collapseBand: (bandLabel: string) => `Свернуть столбцы группы «${bandLabel}»`,
  expandColumnGroups: (columnLabel: string) =>
    `Развернуть все группы по столбцу «${columnLabel}»`,
  collapseColumnGroups: (columnLabel: string) =>
    `Свернуть все группы по столбцу «${columnLabel}»`,
  expandRow: 'Показать подробности',
  collapseRow: 'Скрыть подробности',

  operators: Object.freeze({
    contains: 'содержит',
    notContains: 'не содержит',
    startsWith: 'начинается с',
    endsWith: 'заканчивается на',
    eq: 'равно',
    neq: 'не равно',
    empty: 'пусто',
    notEmpty: 'не пусто',
    gt: 'больше',
    gte: 'больше или равно',
    lt: 'меньше',
    lte: 'меньше или равно',
    between: 'между',
    on: 'в дату',
    before: 'до',
    after: 'после',
  }),
  parse: Object.freeze({
    text: 'Недопустимый текст',
    number: 'Не число',
    date: 'Не дата',
    boolean: 'Не «да» или «нет»',
    enum: 'Нет среди вариантов',
  }),
  required: 'Обязательное поле',
  saveFailed: 'Не удалось сохранить',
  blankGroup: 'Пусто',
})
