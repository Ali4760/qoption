import { esc, formStatus, type DepositSettings } from './view';

const imageTypes = ['image/png', 'image/jpeg', 'image/webp'];
const maxImageLength = 400_000;
const addressFields = ['upiId', 'upiName', 'usdtBscAddress'] as const;
const imageFields = ['upiQrImage', 'usdtBscQrImage'] as const;

function qrUpload(name: typeof imageFields[number], image?: string) {
  return `<label>QR code image
    <input type="file" name="${name}" accept="${imageTypes.join(',')}">
  </label>${image ? `<div class="deposit-qr-preview">
    <img src="${esc(image)}" width="96" height="96" alt="Current custom QR code">
    <label class="check-row"><input type="checkbox" name="remove-${name}"> Remove custom QR code</label>
  </div>` : ''}`;
}

export function depositSettingsForm(uid: string, client: string, settings: DepositSettings) {
  return `<p class="quiet">These payment details appear on ${esc(client)}’s Assets page. Enter payment details that match the QR code.</p>
    <form class="stack" data-form="admin.depositSettings.update">
      <input type="hidden" name="uid" value="${esc(uid)}">
      <div class="deposit-settings-grid">
        <fieldset class="stack">
          <legend>UPI / Bank</legend>
          <label>UPI ID<input name="upiId" maxlength="120" value="${esc(settings.upiId || '')}"></label>
          <label>Name<input name="upiName" maxlength="120" value="${esc(settings.upiName || '')}"></label>
          ${qrUpload('upiQrImage', settings.upiQrImage)}
        </fieldset>
        <fieldset class="stack">
          <legend>USDT (BNB Smart Chain)</legend>
          <label>Wallet address<input name="usdtBscAddress" maxlength="42" value="${esc(settings.usdtBscAddress || '')}"></label>
          ${qrUpload('usdtBscQrImage', settings.usdtBscQrImage)}
        </fieldset>
      </div>
      <div class="button-row"><button class="button">Save deposit settings</button></div>
      ${formStatus()}
    </form>`;
}

async function readQrImage(file: File): Promise<string> {
  if (!imageTypes.includes(file.type)) throw new Error('Choose a PNG, JPEG, or WebP image for the QR code.');
  if (file.size <= Math.floor((maxImageLength - 32) * 3 / 4)) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Could not read the QR code image.'));
      reader.readAsDataURL(file);
    });
  }

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not process the QR code image.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const image = canvas.toDataURL('image/png');
    if (image.length <= maxImageLength) return image;
    const compressed = canvas.toDataURL('image/jpeg', 0.85);
    if (compressed.length > maxImageLength) throw new Error('Choose a smaller QR code image.');
    return compressed;
  } finally {
    bitmap.close();
  }
}

export async function depositSettingsChanges(form: HTMLFormElement, values: Record<string, FormDataEntryValue>) {
  const changes: DepositSettings = {};
  for (const name of addressFields) {
    const original = form.querySelector<HTMLInputElement>(`[name="${name}"]`)!.defaultValue.trim();
    const value = String(values[name] || '').trim();
    if (value !== original) changes[name] = value;
  }
  for (const name of imageFields) {
    const file = values[name];
    if (file instanceof File && file.name) {
      changes[name] = await readQrImage(file);
    } else if (values[`remove-${name}`] === 'on') {
      changes[name] = '';
    }
  }
  return changes;
}
