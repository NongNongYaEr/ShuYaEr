import { boundedProjectJson, projectSaveBody, projectSaveSizeError, PROJECT_SAVE_LIMIT, PROJECT_SAVE_TOO_LARGE } from './project-save-request.js';

export async function buildProjectRecoveryBody(document, metadata, {
  createWorker=()=>new Worker(new URL('./project-recovery-worker.js',import.meta.url),{type:'module'}),
  isCurrent=()=>true,
  timeoutMs=6000
}={}) {
  if (!isCurrent()) return null;
  let worker;
  let timeout;
  try {
    worker=createWorker();
    const result=await new Promise(resolve=>{
      // A null result means the worker failed to deliver a body or a serialization error.
      worker.onerror=event=>{event.preventDefault?.();resolve(null);};
      worker.onmessageerror=()=>resolve(null);
      worker.onmessage=event=>resolve(event.data);
      timeout=setTimeout(()=>resolve(null),timeoutMs);
      worker.postMessage({document,metadata});
    });
    if (!isCurrent()) return null;
    if (result?.body instanceof Blob) return result.body;
    if (result?.code===PROJECT_SAVE_TOO_LARGE) throw projectSaveSizeError();
  } catch(error) {
    if (error?.code===PROJECT_SAVE_TOO_LARGE) throw error;
  } finally {
    clearTimeout(timeout);
    worker?.terminate();
  }
  if (!isCurrent()) return null;
  return projectSaveBody(metadata,boundedProjectJson(document),PROJECT_SAVE_LIMIT);
}
