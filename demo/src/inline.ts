/**
 * A prose string with Markdown's two inline marks, split into the pieces it
 * should render as.
 *
 * The strings that carry these — a recipe's `why`, an example's note — are
 * written the way the README writes them, with `` `code` `` and `*emphasis*`,
 * and interpolating one straight into a template puts the punctuation on the
 * screen. Segments rather than `v-html`: the copy is static and safe today,
 * and a helper that renders any string as markup is the sort of thing someone
 * later feeds a variable.
 *
 * One regex, alternating: whatever is between the marks becomes the segment's
 * text, and which mark matched decides the tag.
 */
export interface Segment {
  tag: 'code' | 'em' | 'text'
  text: string
}

export function segments(prose: string): Segment[] {
  const out: Segment[] = []
  let last = 0
  for (const match of prose.matchAll(/`([^`]+)`|\*([^*]+)\*/g)) {
    if (match.index > last) out.push({ tag: 'text', text: prose.slice(last, match.index) })
    out.push(match[1] ? { tag: 'code', text: match[1] } : { tag: 'em', text: match[2]! })
    last = match.index + match[0].length
  }
  if (last < prose.length) out.push({ tag: 'text', text: prose.slice(last) })
  return out
}
