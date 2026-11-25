const screen = document.querySelector<HTMLElement>('#startup')!;
const minimumVisibleMs = 480;

function nextPaint() {
  return new Promise<number>(resolve => window.requestAnimationFrame(resolve));
}

let firstFrame = nextPaint();
let revision = 0;

export function showStartup(content: HTMLElement) {
  revision++;
  if (screen.hidden) {
    screen.hidden = false;
    firstFrame = nextPaint();
  }
  content.inert = true;
}

export async function finishStartup(content?: HTMLElement) {
  const release = ++revision;
  const firstFrameAt = await firstFrame;
  const remaining = minimumVisibleMs - (performance.now() - firstFrameAt);
  if (remaining > 0) await new Promise<void>(resolve => window.setTimeout(resolve, remaining));
  if (release !== revision) return;
  screen.hidden = true;
  if (content) content.inert = false;
}
