const priority:Record<string,number> = {
  PENDING:0, OVERDUE:1, CONFIRMED:2, RECEIVED:3,
  REFUND_IN_PROGRESS:4, PARTIALLY_REFUNDED:5, REFUNDED:6,
  CHARGEBACK_REQUESTED:5, DELETED:6,
};
/** Prevent a delayed creation/overdue notification from undoing a receipt or refund. */
export function newerPaymentStatus(previous:string|undefined,next:string):string {
  if (!previous) return next;
  const before=priority[previous],after=priority[next];
  return before!==undefined && after!==undefined && after<before ? previous : next;
}
