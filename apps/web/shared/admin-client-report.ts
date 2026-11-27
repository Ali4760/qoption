import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { ClientReport, ClientReportPeriod } from '../../../functions/src/client-report';
import logoUrl from '../assets/qoption-logo.png';
import './admin-client-report.css';
import { credits, dateTime, errorMessage, esc } from './view';

const reportTitle = 'Client Performance Report';
const activityNote = 'The date range uses trade placement and funding request dates. Funding totals include approved requests. Trading P&L uses settled trades, and win rate counts wins and losses. The balance is current when the report is generated.';
const confidentiality = 'Confidential · For the client named in this report.';
const reportDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

type Field = { label: string; value: string; tone?: 'positive' | 'negative' };

function presentReport(report: ClientReport) {
  const { client, period } = report;
  const from = period.from === null ? null : reportDate.format(period.from);
  const through = period.until === null ? null : reportDate.format(period.until - 1);
  const range = from && through ? (from === through ? from : `${from} to ${through}`)
    : from ? `Since ${from}` : through ? `Through ${through}` : 'All available activity';
  const currency = /^[A-Z]{3}$/.test(client.currency) ? client.currency : 'INR';
  const money = (cents: number) => `${currency} ${credits(cents)}`;
  const decidedTrades = report.wins + report.losses;

  return {
    range,
    generated: dateTime(report.generatedAt),
    client: [
      { label: 'Client name', value: client.name },
      { label: 'Client ID', value: client.number === null ? client.uid : String(client.number) },
      { label: 'Email', value: client.email || 'Unavailable' },
    ],
    account: [
      { label: 'Account status', value: client.status },
      { label: 'VIP level', value: client.vipLevel },
      { label: 'Reputation', value: String(client.reputation) },
    ],
    financial: [
      { label: 'Total assets (balance)', value: money(report.available + report.held) },
      { label: 'Net trading P&L', value: money(report.netProfit), tone: report.netProfit > 0 ? 'positive' : report.netProfit < 0 ? 'negative' : undefined },
    ] satisfies Field[],
    balanceDetail: `${money(report.available)} available · ${money(report.held)} on hold`,
    activity: [
      { label: 'Total deposits', value: money(report.deposits) },
      { label: 'Total withdrawals', value: money(report.withdrawals) },
      { label: 'Total trades', value: report.trades.toLocaleString() },
      { label: 'Win rate', value: decidedTrades ? `${(report.wins / decidedTrades * 100).toFixed(1)}%` : 'N/A' },
    ],
  };
}

function fieldsHtml(fields: Field[]) {
  return fields.map(({ label, value, tone }) => `<div><dt>${esc(label)}</dt><dd${tone ? ` class="${tone}"` : ''}>${esc(value)}</dd></div>`).join('');
}

function reportSummaryHtml(display: ReturnType<typeof presentReport>) {
  return `<section>
      <h4>Financial summary</h4>
      <dl class="report-metrics report-financial">${fieldsHtml(display.financial)}</dl>
      <p class="report-balance-detail">${esc(display.balanceDetail)}</p>
    </section>
    <section>
      <h4>Account activity</h4>
      <dl class="report-metrics report-activity">${fieldsHtml(display.activity)}</dl>
    </section>
    <aside class="report-note"><h4>Statement notes</h4><p>${activityNote}</p></aside>
    <footer>${confidentiality}</footer>`;
}

const colors = { ink: '#17263b', muted: '#52647a', border: '#d8e0e7', green: '#117553', red: '#b62d40', soft: '#f4f8f7' };

function metricTable(fields: Field[]): Content {
  return {
    table: {
      widths: fields.map(() => '*'),
      body: [
        fields.map(({ label }) => ({ text: label, style: 'label', fillColor: colors.soft, fillOpacity: .8 })),
        fields.map(({ value, tone }) => ({
          text: value, style: 'metric', color: tone === 'positive' ? colors.green : tone === 'negative' ? colors.red : colors.ink,
        })),
      ],
    },
    layout: {
      hLineColor: () => colors.border, vLineColor: () => colors.border,
      paddingLeft: () => 10, paddingRight: () => 10, paddingTop: () => 8, paddingBottom: () => 8,
    },
  };
}

function reportDocument(report: ClientReport, logo: string): TDocumentDefinitions {
  const display = presentReport(report);
  const identity = (fields: Field[]) => fields.map(({ label, value }) => ({
    stack: [{ text: label, style: 'label' }, { text: value }], margin: [0, 0, 0, 8] as [number, number, number, number],
  }));
  return {
    info: { title: reportTitle, author: 'Qoption' },
    pageSize: 'LETTER',
    pageMargins: [44, 44, 44, 52],
    images: { qoptionLogo: logo },
    background: (_page, pageSize) => ({
      stack: [
        { image: 'qoptionLogo', width: 76, alignment: 'center', opacity: .085, margin: [0, 0, 0, 4] },
        { text: 'QOPTION', fontSize: 64, bold: true, alignment: 'center', color: '#21466c', opacity: .085 },
      ],
      margin: [0, (pageSize.height - 155) / 2, 0, 0],
    }),
    defaultStyle: { fontSize: 10, color: colors.ink, lineHeight: 1.18 },
    styles: {
      brand: { fontSize: 23, bold: true, characterSpacing: 2, alignment: 'center' },
      heading: { fontSize: 13, bold: true, alignment: 'center', margin: [0, 8, 0, 5] },
      label: { fontSize: 9, color: colors.muted, bold: true },
      metric: { fontSize: 15, bold: true },
      section: { fontSize: 13, bold: true, margin: [0, 18, 0, 8] },
      detail: { fontSize: 9, color: colors.muted },
    },
    content: [
      { image: 'qoptionLogo', width: 50, alignment: 'center', margin: [0, 0, 0, 5] },
      { text: 'OPTION', style: 'brand' },
      { text: reportTitle, style: 'heading' },
      { text: `${display.range} · Generated ${display.generated}`, style: 'detail', alignment: 'center', margin: [0, 0, 0, 16] },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 524, y2: 0, lineColor: colors.green, lineWidth: 1.6 }], margin: [0, 0, 0, 16] },
      { columns: [{ width: '*', stack: identity(display.client) }, { width: '34%', stack: identity(display.account) }], columnGap: 20 },
      { text: 'Financial summary', style: 'section' },
      metricTable(display.financial),
      { text: display.balanceDetail, style: 'detail', margin: [0, 6, 0, 0] },
      { text: 'Account activity', style: 'section' },
      metricTable(display.activity),
      { text: 'Statement notes', style: 'section' },
      { text: activityNote, style: 'detail' },
    ],
    footer: (page, pages) => ({
      columns: [{ text: confidentiality, style: 'detail' }, { text: `${page} / ${pages}`, width: 'auto', style: 'detail' }],
      margin: [44, 10, 44, 0],
    }),
  };
}

function dateBoundary(date: string, end: boolean) {
  if (!date) return null;
  const localMidnight = new Date(date + 'T00:00:00');
  if (end) localMidnight.setDate(localMidnight.getDate() + 1);
  const time = localMidnight.getTime();
  if (!Number.isFinite(time)) throw new Error('Choose valid report dates.');
  return time;
}

async function reportLogoDataUrl() {
  const response = await fetch(logoUrl);
  if (!response.ok) throw new Error('The Qoption logo could not be loaded. Try downloading the report again.');
  const image = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(image);
  });
}

async function downloadReport(report: ClientReport, host: HTMLElement, canDownload: () => boolean) {
  const [{ default: pdfMake }, { default: pdfFonts }, logo] = await Promise.all([
    import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts'), reportLogoDataUrl(),
  ]);
  if (!canDownload()) return;
  pdfMake.addVirtualFileSystem(pdfFonts);
  const blob = await pdfMake.createPdf(reportDocument(report, logo)).getBlob();
  if (!canDownload()) return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.hidden = true;
  link.href = url;
  const client = String(report.client.number ?? report.client.uid);
  link.download = `Qoption-Client-Report-${client}-${new Date(report.generatedAt).toISOString().slice(0, 10)}.pdf`;
  host.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function openAdminClientReport(dialog: HTMLDialogElement, load: (period: ClientReportPeriod) => Promise<ClientReport>, isAuthorized: () => boolean) {
  dialog.innerHTML = `<div class="client-report">
    <header class="report-dialog-heading">
      <h2 id="detail-heading">Client financial report</h2>
      <button type="button" class="report-close" data-action="close" aria-label="Close report">×</button>
    </header>
    <div class="report-scroll">
      <article class="report-paper">
        <div class="report-watermark" aria-hidden="true"><img src="${esc(logoUrl)}" alt="">QOPTION</div>
        <header class="report-heading">
          <img class="report-logo" src="${esc(logoUrl)}" width="56" height="56" alt="Qoption logo">
          <div class="report-brand">OPTION</div>
          <h3>${reportTitle}</h3>
          <p id="report-meta"></p>
        </header>
        <div id="report-identity" class="report-identity"></div>
        <form id="report-period" class="report-toolbar">
          <label>Start date<input type="date" id="report-from"></label>
          <label>End date<input type="date" id="report-through"></label>
          <button type="submit" class="button secondary compact">Load statement</button>
        </form>
        <p id="report-status" role="status"></p>
        <div id="report-preview"></div>
      </article>
    </div>
    <footer class="report-dialog-footer">
      <p id="report-download-status" role="status"></p>
      <button type="button" class="button secondary compact" data-action="close">Close</button>
      <button type="button" class="button compact download-pdf" disabled>Download PDF</button>
    </footer>
  </div>`;

  const view = dialog.querySelector<HTMLElement>('.client-report')!;
  const form = view.querySelector<HTMLFormElement>('#report-period')!;
  const start = view.querySelector<HTMLInputElement>('#report-from')!;
  const end = view.querySelector<HTMLInputElement>('#report-through')!;
  const submit = form.querySelector<HTMLButtonElement>('button')!;
  const download = view.querySelector<HTMLButtonElement>('.download-pdf')!;
  const status = view.querySelector<HTMLElement>('#report-status')!;
  const downloadStatus = view.querySelector<HTMLElement>('#report-download-status')!;
  const meta = view.querySelector<HTMLElement>('#report-meta')!;
  const identity = view.querySelector<HTMLElement>('#report-identity')!;
  const host = view.querySelector<HTMLElement>('#report-preview')!;
  let snapshot: ClientReport | undefined, loadedRange = '', busy = false;
  const isOpen = () => dialog.open && view.isConnected;
  const selectedRange = () => start.value + '/' + end.value;
  const updateButtons = () => {
    submit.disabled = busy;
    download.disabled = busy || !snapshot || loadedRange !== selectedRange();
  };
  const checkSession = () => {
    if (!isAuthorized()) throw new Error('The admin session ended. Sign in and reopen the report.');
  };
  const refresh = async () => {
    if (busy) return;
    const range = selectedRange();
    busy = true;
    status.textContent = 'Loading client report…';
    updateButtons();
    try {
      checkSession();
      const from = dateBoundary(start.value, false), until = dateBoundary(end.value, true);
      if (from !== null && until !== null && from >= until) throw new Error('The end date must be on or after the start date.');
      const report = await load({ from, until });
      if (!isOpen()) return;
      checkSession();
      const display = presentReport(report);
      meta.textContent = `${display.range} · Generated ${display.generated}`;
      identity.innerHTML = `<dl>${fieldsHtml(display.client)}</dl><dl>${fieldsHtml(display.account)}</dl>`;
      host.innerHTML = reportSummaryHtml(display);
      snapshot = report;
      loadedRange = range;
      status.textContent = '';
    } catch (error) {
      status.textContent = errorMessage(error);
    } finally {
      busy = false;
      updateButtons();
    }
  };

  form.addEventListener('input', updateButtons);
  form.addEventListener('submit', event => { event.preventDefault(); void refresh(); });
  download.addEventListener('click', async () => {
    if (!snapshot || busy || loadedRange !== selectedRange()) return;
    busy = true;
    downloadStatus.textContent = 'Preparing PDF…';
    updateButtons();
    try {
      checkSession();
      await downloadReport(snapshot, view, () => isOpen() && isAuthorized());
      if (!isOpen()) return;
      checkSession();
      downloadStatus.textContent = '';
    } catch (error) {
      downloadStatus.textContent = errorMessage(error);
    } finally {
      busy = false;
      updateButtons();
    }
  });
  dialog.addEventListener('close', () => view.remove(), { once: true });
  if (!dialog.open) dialog.showModal();
  void refresh();
}
