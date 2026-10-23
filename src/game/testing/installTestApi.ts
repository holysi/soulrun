import { FoundationTestRuntime } from './FoundationTestRuntime';

function canvasReady(): Promise<void> {
  return new Promise((resolve) => {
    const waitForCanvas = (): void => {
      if (document.querySelector('canvas')) {
        requestAnimationFrame(() => resolve());
        return;
      }
      requestAnimationFrame(waitForCanvas);
    };
    waitForCanvas();
  });
}

export function installTestApi(mount: HTMLElement): void {
  const parameters = new URLSearchParams(window.location.search);
  const exposesTestApi = import.meta.env.MODE === 'development' || import.meta.env.MODE === 'test';
  if (!exposesTestApi || parameters.get('test') !== '1') return;

  const seed = parameters.get('seed') || 'smoke-seed-001';
  window.__SOULRUN_TEST__ = new FoundationTestRuntime(mount, seed, canvasReady());
}
