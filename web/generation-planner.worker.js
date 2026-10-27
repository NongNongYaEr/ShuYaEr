import { compileGenerationPlan } from './v4-tools.js';

self.addEventListener('message', (event) => {
  const { id, previous, next } = event.data || {};
  try {
    self.postMessage({ id, ok: true, plan: compileGenerationPlan(previous, next) });
  } catch (error) {
    self.postMessage({ id, ok: false, message: error?.message || String(error) });
  }
});
