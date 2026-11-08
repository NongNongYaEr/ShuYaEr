export const PROJECT_SAVE_LIMIT = 200 * 1024 * 1024;
export const PROJECT_SAVE_TOO_LARGE = 'PROJECT_SAVE_TOO_LARGE';

function sizeError() {
  return Object.assign(new RangeError('工程超出 200 MiB 容量，请另存为本地工程文件。'), {code:PROJECT_SAVE_TOO_LARGE});
}

export function boundedProjectJson(document) {
  let remaining = PROJECT_SAVE_LIMIT;
  // Embedded models and atlases are strings. Count their minimum UTF-8 size
  // without joining them into a second full copy of an over-budget project.
  function countStrings(value) {
    if (typeof value === 'string') {
      remaining -= value.length;
      if (remaining < 0) throw sizeError();
    } else if (Array.isArray(value)) {
      for (const child of value) countStrings(child);
    } else if (value && typeof value === 'object') {
      for (const key of Object.keys(value)) countStrings(value[key]);
    }
  }
  countStrings(document);
  return JSON.stringify(document);
}

// A small UTF-8 metadata envelope followed by the unchanged project JSON.
// Blob avoids escaping/copying every atlas into an outer JSON string.
export async function sendProjectSave(path, metadata, projectJson, maxBytes = Infinity) {
  const header=new Blob([JSON.stringify(metadata)],{type:'application/json'});
  const prefix=String(header.size)+'\n';
  if(prefix.length+header.size+projectJson.length>maxBytes)throw sizeError();
  const body=new Blob([prefix,header,projectJson],{type:'application/octet-stream'});
  if(body.size>maxBytes)throw sizeError();
  const response=await fetch(path,{method:'POST',headers:{'X-BranchForge-Save':'1'},body});
  if(response.status===413&&Number.isFinite(maxBytes))throw sizeError();
  const result=await response.json();if(!response.ok||result.success===false)throw Error(result.message||'保存失败，请重试');
  return result;
}
