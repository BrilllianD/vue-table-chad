/**
 * Simplified Chinese.
 *
 * Whole record, not a `Partial` — see the note in `ru.ts` for why every locale
 * here is complete or is not shipped.
 *
 * Punctuation is the full-width form throughout (`（）`, `：`, `。`), which is
 * what a Chinese reader expects inside Chinese text; the ASCII forms look like
 * a half-finished translation even when every word is right. Latin runs and
 * numbers keep a space around them for the same reason.
 */
import type { PinSide } from '../core/types'
import type { TableLabels } from '../core/labels'

/** `pinState` interpolates a side, so the sides need translating too. */
const SIDES: Record<PinSide | 'none', string> = {
  left: '左侧',
  right: '右侧',
  none: '不冻结',
}

export const zhCN: TableLabels = Object.freeze({
  search: '搜索…',
  searchAllColumns: '搜索所有列',
  searchValuesPlaceholder: '搜索值…',
  searchValues: '搜索值',

  clear: '清除',
  clearAll: '全部清除',
  apply: '应用',
  save: '保存',
  cancel: '取消',
  retry: '重试',
  loading: '加载中…',
  loadMore: '加载更多',

  noRows: '没有数据',
  noMatchingValues: '没有匹配的值',
  noMatchingOptions: '没有匹配的选项',
  emptyMessage: '没有符合当前筛选条件的行。',
  loadFailed: '数据加载失败。',
  facetsFailed: '无法加载筛选值。',
  optionsFailed: '无法加载选项。',
  loadingOptions: '正在加载选项',

  selectAllOnPage: '选择本页所有行',
  selectAllValues: '全选',
  selectAllRow: '（全选）',
  blanksCheckbox: '空白',
  blanksFacet: '（空白）',
  clearSelection: '清除选择',

  pagination: '分页',
  firstPage: '第一页',
  previousPage: '上一页',
  nextPage: '下一页',
  lastPage: '最后一页',
  rowsPerPage: '每页行数',

  groupBy: '分组依据',
  groupingOptions: '分组选项',
  expandAll: '全部展开',
  collapseAll: '全部折叠',
  expandAllGroups: '展开所有分组',
  collapseAllGroups: '折叠所有分组',
  moveUpLevel: '上移一级',
  moveDownLevel: '下移一级',

  columns: '列',
  columnOptions: '列选项',
  showAll: '显示全部',
  resetLayout: '重置布局',
  moveUp: '上移',
  moveDown: '下移',
  rowActions: '行操作',

  exportRows: '导出',
  exportRowsDescription: '将所有筛选后的行导出为 CSV',

  filter: '筛选',
  filterApplied: '已应用筛选 — 点击可修改',
  filterValuesTab: '值',
  filterConditionsTab: '条件',
  filterBlanksOnly: '仅空白',
  filterNone: '无',
  conditionAnd: '并且',
  combineConditions: '条件组合方式',
  conjunctionAnd: '并且',
  conjunctionOr: '或者',
  conditionWhere: '当',
  operator: '运算符',
  conditionValue: '值',
  conditionSecondValue: '第二个值',
  conditionSecondValuePlaceholder: '至',
  removeCondition: '删除条件',
  addCondition: '添加条件',

  selectPlaceholder: '请选择…',
  footerLabel: '合计',

  clearFilterOn: (columnLabel: string) => `清除“${columnLabel}”的筛选`,
  filterChip: (columnLabel: string, summary: string) => `${columnLabel}：${summary}`,
  filterColumn: (columnLabel: string) => `筛选“${columnLabel}”`,
  resizeColumn: (columnLabel: string) => `调整“${columnLabel}”列宽`,
  pinState: (side: PinSide | 'none') => `冻结：${SIDES[side]}`,
  pinColumn: (columnLabel: string) => `冻结“${columnLabel}”`,
  showColumn: (columnLabel: string) => `显示“${columnLabel}”`,
  groupByColumn: (columnLabel: string) => `按“${columnLabel}”分组`,
  stopGroupingBy: (levelLabel: string) => `取消按“${levelLabel}”分组`,
  sortByColumn: (columnLabel: string) =>
    `按“${columnLabel}”排序（Shift + 点击可加入多列排序）`,
  editCell: (columnLabel: string) => `编辑“${columnLabel}”`,
  searchIn: (label: string | undefined) => (label ? `搜索${label}` : '搜索'),

  valueCount: (count: number) => `${count} 个值`,
  rowRange: (first: number, last: number, total: number) =>
    `第 ${first}–${last} 条，共 ${total} 条`,
  pageSizeOption: (size: number) => `${size} 条/页`,
  selectedCount: (count: number) => `已选 ${count} 项`,
  allMatchingSelected: (count: number) => `已选中符合当前筛选条件的全部 ${count} 行。`,
  allOnPageSelected: (count: number) => `已选中本页全部 ${count} 行。`,
  selectAllMatching: (total: number) => `选择符合条件的全部 ${total} 行`,

  expandGroup: (columnLabel: string, groupLabel: string) =>
    `展开“${columnLabel}”分组：${groupLabel}`,
  collapseGroup: (columnLabel: string, groupLabel: string) =>
    `折叠“${columnLabel}”分组：${groupLabel}`,
  expandBand: (bandLabel: string) => `展开“${bandLabel}”的列`,
  collapseBand: (bandLabel: string) => `折叠“${bandLabel}”的列`,
  expandColumnGroups: (columnLabel: string) => `展开“${columnLabel}”的所有分组`,
  collapseColumnGroups: (columnLabel: string) => `折叠“${columnLabel}”的所有分组`,

  operators: Object.freeze({
    contains: '包含',
    notContains: '不包含',
    startsWith: '开头是',
    endsWith: '结尾是',
    eq: '等于',
    neq: '不等于',
    empty: '为空',
    notEmpty: '不为空',
    gt: '大于',
    gte: '大于或等于',
    lt: '小于',
    lte: '小于或等于',
    between: '介于',
    on: '在该日期',
    before: '早于',
    after: '晚于',
  }),
  parse: Object.freeze({
    text: '不是有效的文本',
    number: '不是数字',
    date: '不是日期',
    boolean: '不是“是”或“否”',
    enum: '不在选项范围内',
  }),
  required: '必填',
  saveFailed: '保存失败',
  blankGroup: '空白',
})
