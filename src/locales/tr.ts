/**
 * Türkçe.
 *
 * A whole `TableLabels`, not a `Partial`, for the reason `ru.ts` gives: the
 * type breaks this file when a key is added until it is translated.
 *
 * Two rules keep the label functions free of Turkish grammar machinery. An
 * interpolated name never takes a case suffix, because the suffix's vowel
 * harmony depends on the name: the value is quoted and the suffix goes on a
 * fixed noun (`"Ad" sütununu`, `"Tasarım" grubunu`). And a noun after a numeral
 * stays singular (`3 değer`), as Turkish itself has it, so no plural forms are
 * needed.
 */
import type { PinSide } from '../core/types'
import type { TableLabels } from '../core/labels'

/** `pinState` interpolates a side, so the sides need translating too. */
const SIDES: Record<PinSide | 'none', string> = {
  left: 'sol',
  right: 'sağ',
  none: 'yok',
}

export const tr: TableLabels = Object.freeze({
  locale: 'tr-TR',
  search: 'Ara…',
  searchAllColumns: 'Tüm sütunlarda ara',
  searchValuesPlaceholder: 'Değerlerde ara…',
  searchValues: 'Değerlerde ara',

  clear: 'Temizle',
  clearAll: 'Tümünü temizle',
  apply: 'Uygula',
  save: 'Kaydet',
  cancel: 'İptal',
  retry: 'Yeniden dene',
  loading: 'Yükleniyor…',
  loadMore: 'Daha fazla yükle',

  noRows: 'Satır yok',
  noMatchingValues: 'Eşleşen değer yok',
  noMatchingOptions: 'Eşleşen seçenek yok',
  emptyMessage: 'Veri yok',
  loadFailed: 'Veriler yüklenemedi.',
  facetsFailed: 'Filtre değerleri yüklenemedi.',
  optionsFailed: 'Seçenekler yüklenemedi.',
  loadingOptions: 'Seçenekler yükleniyor',

  selectAllOnPage: 'Bu sayfadaki tüm satırları seç',
  selectRow: 'Satırı seç',
  selectAllValues: 'Tümünü seç',
  selectAllRow: '(Tümünü seç)',
  blanksCheckbox: 'Boş',
  blanksFacet: '(Boş)',
  clearSelection: 'Seçimi temizle',

  pagination: 'Sayfalama',
  firstPage: 'İlk sayfa',
  previousPage: 'Önceki sayfa',
  nextPage: 'Sonraki sayfa',
  lastPage: 'Son sayfa',
  rowsPerPage: 'Sayfa başına satır',

  groupBy: 'Grupla',
  groupingOptions: 'Gruplama seçenekleri',
  expandAll: 'Tümünü genişlet',
  collapseAll: 'Tümünü daralt',
  expandAllGroups: 'Tüm grupları genişlet',
  collapseAllGroups: 'Tüm grupları daralt',
  moveUpLevel: 'Bir düzey yukarı taşı',
  moveDownLevel: 'Bir düzey aşağı taşı',

  columns: 'Sütunlar',
  columnOptions: 'Sütun seçenekleri',
  showAll: 'Tümünü göster',
  resetLayout: 'Düzeni sıfırla',
  moveUp: 'Yukarı taşı',
  moveDown: 'Aşağı taşı',
  rowActions: 'Satır işlemleri',

  contextMenu: 'Hücre işlemleri',
  filterByValue: 'Bu değere göre filtrele',
  sortAscending: 'Artan sırala',
  sortDescending: 'Azalan sırala',
  groupByThisColumn: 'Bu sütuna göre grupla',
  stopGroupingByThisColumn: 'Bu sütuna göre gruplamayı kaldır',
  hideColumn: 'Sütunu gizle',
  copyCell: 'Kopyala',

  exportRows: 'Dışa aktar',
  exportRowsDescription: 'Filtrelenen tüm satırları CSV olarak dışa aktar',

  filter: 'Filtre',
  filterApplied: 'Filtre uygulandı — düzenlemek için tıklayın',
  filterValuesTab: 'Değerler',
  filterConditionsTab: 'Koşullar',
  filterBlanksOnly: 'yalnızca boşlar',
  filterNone: 'hiçbiri',
  conditionAnd: 've',
  combineConditions: 'Koşulları birleştirme şekli',
  conjunctionAnd: 'Ve',
  conjunctionOr: 'Veya',
  conditionWhere: 'Koşul',
  operator: 'Operatör',
  conditionValue: 'Değer',
  conditionSecondValue: 'İkinci değer',
  conditionSecondValuePlaceholder: 've',
  removeCondition: 'Koşulu kaldır',
  addCondition: 'Koşul ekle',

  selectPlaceholder: 'Seçin…',
  footerLabel: 'Toplam',

  clearFilterOn: (columnLabel: string) => `"${columnLabel}" sütunundaki filtreyi temizle`,
  filterChip: (columnLabel: string, summary: string) => `${columnLabel}: ${summary}`,
  filterColumn: (columnLabel: string) => `"${columnLabel}" sütununu filtrele`,
  resizeColumn: (columnLabel: string) => `"${columnLabel}" sütununun genişliğini değiştir`,
  pinState: (side: PinSide | 'none') => `Sabitleme: ${SIDES[side]}`,
  pinColumn: (columnLabel: string) => `"${columnLabel}" sütununu sabitle`,
  showColumn: (columnLabel: string) => `"${columnLabel}" sütununu göster`,
  groupByColumn: (columnLabel: string) => `"${columnLabel}" sütununa göre grupla`,
  stopGroupingBy: (levelLabel: string) => `"${levelLabel}" ölçütüne göre gruplamayı kaldır`,
  sortByColumn: (columnLabel: string) =>
    `"${columnLabel}" sütununa göre sırala (Shift + tıklama: sıralamaya ekle)`,
  editCell: (columnLabel: string) => `"${columnLabel}" değerini düzenle`,
  searchIn: (label: string | undefined) => (label ? `Ara: ${label}` : 'Ara'),

  valueCount: (count: number) => `${count} değer`,
  rowRange: (first: number, last: number, total: number) => `${first}–${last} / ${total}`,
  pageSizeOption: (size: number) => `${size} / sayfa`,
  selectedCount: (count: number) => `${count} seçili`,
  allMatchingSelected: (count: number) => `Geçerli filtrelere uyan ${count} satırın tümü seçildi.`,
  allOnPageSelected: (count: number) => `Bu sayfadaki ${count} satırın tümü seçildi.`,
  selectAllMatching: (total: number) => `Eşleşen ${total} satırın tümünü seç`,

  expandGroup: (columnLabel: string, groupLabel: string) =>
    `"${columnLabel}" sütunundaki "${groupLabel}" grubunu genişlet`,
  collapseGroup: (columnLabel: string, groupLabel: string) =>
    `"${columnLabel}" sütunundaki "${groupLabel}" grubunu daralt`,
  expandBand: (bandLabel: string) => `"${bandLabel}" sütun grubunu genişlet`,
  collapseBand: (bandLabel: string) => `"${bandLabel}" sütun grubunu daralt`,
  expandColumnGroups: (columnLabel: string) =>
    `"${columnLabel}" sütunundaki tüm grupları genişlet`,
  collapseColumnGroups: (columnLabel: string) =>
    `"${columnLabel}" sütunundaki tüm grupları daralt`,
  expandRow: 'Ayrıntıları göster',
  collapseRow: 'Ayrıntıları gizle',

  operators: Object.freeze({
    contains: 'içerir',
    notContains: 'içermez',
    startsWith: 'ile başlar',
    endsWith: 'ile biter',
    eq: 'eşittir',
    neq: 'eşit değildir',
    empty: 'boş',
    notEmpty: 'boş değil',
    gt: 'büyüktür',
    gte: 'büyük veya eşittir',
    lt: 'küçüktür',
    lte: 'küçük veya eşittir',
    between: 'arasında',
    on: 'tarihinde',
    before: 'öncesinde',
    after: 'sonrasında',
  }),
  parse: Object.freeze({
    text: 'Geçersiz metin',
    number: 'Geçersiz sayı',
    date: 'Geçersiz tarih',
    boolean: 'Evet veya hayır olmalıdır',
    enum: 'Seçeneklerden biri olmalıdır',
  }),
  required: 'Zorunlu alan',
  saveFailed: 'Kaydedilemedi',
  blankGroup: 'Boş',
})
