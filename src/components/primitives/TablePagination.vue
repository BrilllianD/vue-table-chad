<script setup lang="ts">
/**
 * Pagination bar. Falls back to the injected table context, but every input can
 * be passed explicitly — so it also works as a standalone pager for any list.
 */
import { computed } from 'vue'
import { useTableContext } from '../../core/context'
import { usePagination } from '../../core/usePagination'

const props = withDefaults(
  defineProps<{
    page?: number
    pageSize?: number
    total?: number
    pageSizes?: number[]
    siblingCount?: number
    showPageSize?: boolean
    showSummary?: boolean
  }>(),
  {
    pageSizes: () => [10, 25, 50, 100],
    siblingCount: 1,
    showPageSize: true,
    showSummary: true,
  },
)

const emit = defineEmits<{
  'update:page': [page: number]
  'update:pageSize': [size: number]
}>()

const context = useTableContext()

const page = computed(() => props.page ?? context?.state.page.value ?? 1)
const pageSize = computed(() => props.pageSize ?? context?.state.pageSize.value ?? 25)
const total = computed(() => props.total ?? context?.source.total.value ?? 0)

function goTo(next: number): void {
  emit('update:page', next)
  context?.state.setPage(next)
}

const pagination = usePagination(page, pageSize, total, {
  siblingCount: () => props.siblingCount,
  onChange: goTo,
})

function onPageSize(event: Event): void {
  const size = Number((event.target as HTMLSelectElement).value)
  emit('update:pageSize', size)
  context?.state.setPageSize(size)
}
</script>

<template>
  <nav class="vt-pagination" aria-label="Pagination">
    <slot name="summary" :pagination="pagination" :total="total">
      <span v-if="showSummary" class="vt-pagination-summary">
        <template v-if="total === 0">No rows</template>
        <template v-else>
          {{ pagination.firstRow.value }}–{{ pagination.lastRow.value }} of {{ total }}
        </template>
      </span>
    </slot>

    <div class="vt-pagination-controls">
      <button
        type="button"
        class="vt-page-btn"
        :disabled="!pagination.canPrev.value"
        aria-label="First page"
        @click="pagination.first()"
      >
        «
      </button>
      <button
        type="button"
        class="vt-page-btn"
        :disabled="!pagination.canPrev.value"
        aria-label="Previous page"
        @click="pagination.prev()"
      >
        ‹
      </button>

      <template v-for="(item, i) in pagination.items.value" :key="`${item}-${i}`">
        <span v-if="item === 'ellipsis'" class="vt-page-ellipsis">…</span>
        <button
          v-else
          type="button"
          class="vt-page-btn"
          :data-current="item === pagination.page.value || undefined"
          :aria-current="item === pagination.page.value ? 'page' : undefined"
          @click="pagination.go(item)"
        >
          {{ item }}
        </button>
      </template>

      <button
        type="button"
        class="vt-page-btn"
        :disabled="!pagination.canNext.value"
        aria-label="Next page"
        @click="pagination.next()"
      >
        ›
      </button>
      <button
        type="button"
        class="vt-page-btn"
        :disabled="!pagination.canNext.value"
        aria-label="Last page"
        @click="pagination.last()"
      >
        »
      </button>
    </div>

    <label v-if="showPageSize" class="vt-pagination-size">
      <span class="vt-visually-hidden">Rows per page</span>
      <select :value="pageSize" @change="onPageSize">
        <option v-for="size in pageSizes" :key="size" :value="size">{{ size }} / page</option>
      </select>
    </label>
  </nav>
</template>
