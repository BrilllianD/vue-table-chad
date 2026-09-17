---
layout: home
hero:
  name: vue-table-chad
  text: Headless table primitives for Vue 3
  tagline: Sorting, Excel-style filters, pagination, selection, grouping, column layout, header bands, inline editing and a keyboard cell cursor — over local arrays or server endpoints, interchangeably.
  actions:
    - theme: brand
      text: Documentation
      link: /getting-started
    - theme: alt
      text: Demo
      # `_self` for the same reason the nav's Demo link carries one — see
      # `.vitepress/config.ts`. The demo is not a VitePress page, and the router
      # intercepts every internal link that does not carry a target.
      link: /demo/
      target: _self
features:
  - title: core/
    details: Composables + pure functions. No components. You want the logic and none of the markup.
  - title: primitives/
    details: Headless components. Slots, data-* attributes, no CSS. You want your own markup.
  - title: preset/
    details: DataTable + a stylesheet, assembled from the primitives. You want a table right now.
---
