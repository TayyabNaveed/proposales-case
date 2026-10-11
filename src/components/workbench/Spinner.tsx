// A small activity ring beside text that already says what is happening; the
// text carries the meaning for screen readers, so the ring is hidden from them.
export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}
