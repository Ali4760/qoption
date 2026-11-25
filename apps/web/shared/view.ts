export type Row = { id: string; [key: string]: unknown };
export type Page = { rows: Row[]; cursor: string | null };
export type Wallet = { available: number; held: number };
export type Profile = { uid: string; name: string; email: string; tradeEnabled: boolean; withdrawalEnabled: boolean; notificationReadAt?: number };
export type Home = { profile: Profile; wallet: Wallet; active: Row[]; serverTime: number };

const decimal = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const credits = (value: unknown) => decimal.format(Number(value ?? 0) / 100);
export const dateTime = (value: unknown) => Number.isFinite(Number(value))
  ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(Number(value)) : '—';
export const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
// Keep existing emulator document keys stable while showing current practice labels.
export const recordReference = (value: unknown) => String(value ?? '')
  .replace(/^demo-(user|staff|jordan|sam|deposit|withdrawal)$/, 'practice-$1');

export const label = (value: unknown) => String(value ?? '').replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ').replace(/^./, character => character.toUpperCase());
export const state = (value: unknown) => '<span class="state" data-state="' + esc(value) + '">' + esc(label(value)) + '</span>';
export const blank = (heading: string, detail: string) => '<div class="blank"><div class="blank-icon">◇</div><h3>' + esc(heading) + '</h3><p>' + esc(detail) + '</p></div>';

export function table(headings: string[], rows: string[][], empty: string) {
  if (!rows.length) return blank(empty, 'Records will appear here as activity comes in.');
  return '<div class="table-wrap"><table><thead><tr>' + headings.map(heading => '<th scope="col">' + esc(heading) + '</th>').join('') +
    '</tr></thead><tbody>' + rows.map(row => '<tr>' + row.map(item => '<td>' + item + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
}
export function formStatus() { return '<p class="form-status" role="status"></p>'; }
export function showFormStatus(form: HTMLFormElement, text: string, error = false) {
  const node = form.querySelector<HTMLElement>('.form-status');
  if (node) { node.textContent = text; node.classList.toggle('error', error); }
}
export function amountField(value = '10', name = 'amount', signed = false) {
  return '<label>Amount <span class="quiet">Practice Credits</span><input inputmode="decimal" type="number" step=".01" ' +
    (signed ? 'min="-100000"' : 'min="1"') + ' max="100000" name="' + esc(name) + '" value="' + esc(value) + '" required></label>';
}
export function actionButton(action: string, id: unknown, caption: string) {
  return '<button type="button" class="button secondary compact" data-action="' + esc(action) + '" data-id="' + esc(id) + '">' + esc(caption) + '</button>';
}
export function section(title: string, content: string, detail = '') {
  return '<section class="panel"><header class="panel-heading"><h2>' + esc(title) + '</h2>' + (detail ? '<p>' + esc(detail) + '</p>' : '') + '</header>' + content + '</section>';
}
export function pager(pageIndex: number, next: string | null) {
  return '<div class="pagination"><button class="button secondary compact" data-action="previous" ' +
    (!pageIndex ? 'disabled' : '') + '>Previous</button><span>Page ' + (pageIndex + 1) + '</span><button class="button secondary compact" data-action="next" ' +
    (!next ? 'disabled' : '') + '>Next</button></div>';
}
export function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    switch (error.code) {
      case 'auth/invalid-credential': return 'The email or password is incorrect.';
      case 'auth/email-already-in-use': return 'An account already uses this email.';
      case 'auth/too-many-requests': return 'Too many attempts. Please try again later.';
      case 'functions/internal': return 'The workspace could not complete this operation. Try again shortly.';
      case 'functions/unavailable': case 'auth/network-request-failed': return 'The workspace is offline. Check your connection and try again.';
    }
  }
  return error instanceof Error ? error.message : 'Unable to complete the request.';
}
