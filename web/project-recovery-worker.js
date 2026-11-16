import { boundedProjectJson, projectSaveBody, PROJECT_SAVE_LIMIT } from './project-save-request.js';

self.onmessage = ({data:{document,metadata}}) => {
  try {
    const body=projectSaveBody(metadata,boundedProjectJson(document),PROJECT_SAVE_LIMIT);
    self.postMessage({body});
  } catch(error) {
    self.postMessage({error:error.message,code:error.code});
  }
};
