/**
 * Japanese.
 *
 * Whole record, not a `Partial` — see the note in `ru.ts` for why every locale
 * here is complete or is not shipped.
 *
 * The count labels put the number before its counter word (`12 件`), which is
 * the order Japanese uses, and `rowRange` puts the total first (`240 件中
 * 1–10 件`). That reordering is the reason those keys are functions rather
 * than templates with placeholders in them.
 */
import type { PinSide } from '../core/types'
import type { TableLabels } from '../core/labels'

/** `pinState` interpolates a side, so the sides need translating too. */
const SIDES: Record<PinSide | 'none', string> = {
  left: '左',
  right: '右',
  none: 'なし',
}

export const ja: TableLabels = Object.freeze({
  search: '検索…',
  searchAllColumns: 'すべての列を検索',
  searchValuesPlaceholder: '値を検索…',
  searchValues: '値を検索',

  clear: 'クリア',
  clearAll: 'すべてクリア',
  apply: '適用',
  save: '保存',
  cancel: 'キャンセル',
  retry: '再試行',
  loading: '読み込み中…',
  loadMore: 'さらに読み込む',

  noRows: '行がありません',
  noMatchingValues: '一致する値がありません',
  noMatchingOptions: '一致する選択肢がありません',
  emptyMessage: '現在のフィルターに一致する行はありません。',
  loadFailed: 'データを読み込めませんでした。',
  facetsFailed: 'フィルターの値を読み込めませんでした。',
  optionsFailed: '選択肢を読み込めませんでした。',
  loadingOptions: '選択肢を読み込み中',

  selectAllOnPage: 'このページのすべての行を選択',
  selectAllValues: 'すべて選択',
  selectAllRow: '（すべて選択）',
  blanksCheckbox: '空白',
  blanksFacet: '（空白）',
  clearSelection: '選択を解除',

  pagination: 'ページ送り',
  firstPage: '最初のページ',
  previousPage: '前のページ',
  nextPage: '次のページ',
  lastPage: '最後のページ',
  rowsPerPage: '1 ページの行数',

  groupBy: 'グループ化',
  groupingOptions: 'グループ化の設定',
  expandAll: 'すべて展開',
  collapseAll: 'すべて折りたたむ',
  expandAllGroups: 'すべてのグループを展開',
  collapseAllGroups: 'すべてのグループを折りたたむ',
  moveUpLevel: '1 つ上の階層へ',
  moveDownLevel: '1 つ下の階層へ',

  columns: '列',
  columnOptions: '列の設定',
  showAll: 'すべて表示',
  resetLayout: 'レイアウトをリセット',
  moveUp: '上へ',
  moveDown: '下へ',
  rowActions: '行の操作',

  filter: 'フィルター',
  filterApplied: 'フィルター適用中 — クリックして編集',
  filterValuesTab: '値',
  filterConditionsTab: '条件',
  filterBlanksOnly: '空白のみ',
  filterNone: 'なし',
  conditionAnd: 'かつ',
  combineConditions: '条件の組み合わせ',
  conjunctionAnd: 'かつ',
  conjunctionOr: 'または',
  conditionWhere: '条件',
  operator: '演算子',
  conditionValue: '値',
  conditionSecondValue: '2 つ目の値',
  conditionSecondValuePlaceholder: 'から',
  removeCondition: '条件を削除',
  addCondition: '条件を追加',

  selectPlaceholder: '選択…',
  footerLabel: '合計',

  clearFilterOn: (columnLabel: string) => `${columnLabel}のフィルターをクリア`,
  filterChip: (columnLabel: string, summary: string) => `${columnLabel}: ${summary}`,
  filterColumn: (columnLabel: string) => `${columnLabel}を絞り込む`,
  resizeColumn: (columnLabel: string) => `${columnLabel}列の幅を変更`,
  pinState: (side: PinSide | 'none') => `固定: ${SIDES[side]}`,
  pinColumn: (columnLabel: string) => `${columnLabel}を固定`,
  showColumn: (columnLabel: string) => `${columnLabel}を表示`,
  groupByColumn: (columnLabel: string) => `${columnLabel}でグループ化`,
  stopGroupingBy: (levelLabel: string) => `${levelLabel}でのグループ化を解除`,
  sortByColumn: (columnLabel: string) =>
    `${columnLabel}で並べ替え（Shift + クリックで複数列の並べ替えに追加）`,
  editCell: (columnLabel: string) => `${columnLabel}を編集`,
  searchIn: (label: string | undefined) => (label ? `${label}を検索` : '検索'),

  valueCount: (count: number) => `${count} 件の値`,
  rowRange: (first: number, last: number, total: number) =>
    `${total} 件中 ${first}–${last} 件`,
  pageSizeOption: (size: number) => `${size} 件/ページ`,
  selectedCount: (count: number) => `${count} 件選択中`,
  allMatchingSelected: (count: number) =>
    `現在のフィルターに一致する ${count} 行すべてを選択しました。`,
  allOnPageSelected: (count: number) => `このページの ${count} 行すべてを選択しました。`,
  selectAllMatching: (total: number) => `一致する ${total} 行すべてを選択`,

  expandGroup: (columnLabel: string, groupLabel: string) =>
    `${columnLabel}のグループ「${groupLabel}」を展開`,
  collapseGroup: (columnLabel: string, groupLabel: string) =>
    `${columnLabel}のグループ「${groupLabel}」を折りたたむ`,
  expandBand: (bandLabel: string) => `${bandLabel}の列を展開`,
  collapseBand: (bandLabel: string) => `${bandLabel}の列を折りたたむ`,
  expandColumnGroups: (columnLabel: string) => `${columnLabel}のすべてのグループを展開`,
  collapseColumnGroups: (columnLabel: string) =>
    `${columnLabel}のすべてのグループを折りたたむ`,

  operators: Object.freeze({
    contains: '含む',
    notContains: '含まない',
    startsWith: 'で始まる',
    endsWith: 'で終わる',
    eq: '等しい',
    neq: '等しくない',
    empty: '空である',
    notEmpty: '空でない',
    gt: 'より大きい',
    gte: '以上',
    lt: 'より小さい',
    lte: '以下',
    between: '範囲内',
    on: 'その日付',
    before: 'より前',
    after: 'より後',
  }),
  parse: Object.freeze({
    text: '有効なテキストではありません',
    number: '数値ではありません',
    date: '日付ではありません',
    boolean: '「はい」または「いいえ」ではありません',
    enum: '選択肢にありません',
  }),
  required: '必須です',
  saveFailed: '保存できませんでした',
  blankGroup: '空白',
})
