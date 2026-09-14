// One named icon per action, reused everywhere via ActionButton so the same action always shows
// the same icon app-wide. Emoji, not an SVG/icon-font set — they carry their own built-in
// colors, so they stay legible in both light and dark themes with zero extra styling (see
// DEVELOPER_GUIDE.md's theme section for why an SVG set would need currentColor work instead).
export const EDIT_ICON = '✏️'
export const DELETE_ICON = '🗑️'
export const DUPLICATE_ICON = '📄'
/** WhatsApp message copy, and any other "copy to clipboard" action. */
export const COPY_ICON = '📋'
/** Expected -> Actual conversions: Convert to Donation, Move to Expenses, Convert to Expected
 *  Donation (the Auction pledge flow). */
export const MOVE_ICON = '➡️'
/** Undoing a conversion: Move back to Expected. */
export const REVERT_ICON = '↩️'
export const DONE_ICON = '✅'
export const UNDO_DONE_ICON = '↩️'
/** Recording one installment of a pledge paid in parts (Record Partial Payment). */
export const PARTIAL_PAYMENT_ICON = '💵'
