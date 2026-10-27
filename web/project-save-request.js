// A small UTF-8 metadata envelope followed by the unchanged project JSON.
// Blob avoids escaping/copying every atlas into an outer JSON string.
export async function sendProjectSave(path, metadata, projectJson) {
  const header=new Blob([JSON.stringify(metadata)],{type:'application/json'});
  const body=new Blob([String(header.size)+'\n',header,projectJson],{type:'application/octet-stream'});
  const response=await fetch(path,{method:'POST',headers:{'X-BranchForge-Save':'1'},body});
  const result=await response.json();if(!response.ok||result.success===false)throw Error(result.message||'保存失败，请重试');
  return result;
}
