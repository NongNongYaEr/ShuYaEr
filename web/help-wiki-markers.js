import { assemblyMarkers } from './help-wiki-assembly-markers.js';
import { barkMarkers } from './help-wiki-bark-markers.js';
import { bonsaiMarkers } from './help-wiki-bonsai-markers.js';
import { branchVariantsMarkers } from './help-wiki-branch-variants-markers.js';
import { directBoundTreeCaseMarkers } from './help-wiki-case-direct-bound-tree-markers.js';
import { facadeMarkers } from './help-wiki-case-facade-markers.js';
import { fastTreeCaseMarkers } from './help-wiki-case-fast-tree-markers.js';
import { sculptedTreeCaseMarkers } from './help-wiki-case-sculpted-tree-markers.js';
import { deliveryExtraMarkers } from './help-wiki-delivery-extra-markers.js';
import { workspaceHelpMarkers } from './help-wiki-home-window-media.js';
import { libraryMarkers } from './help-wiki-library-markers.js';
import { materialExpandedMarkers } from './help-wiki-material-expanded-markers.js';
import { materialExtraMarkers } from './help-wiki-material-extra-markers.js';
import { materialMarkers } from './help-wiki-material-markers.js';
import { projectExpandedMarkers } from './help-wiki-project-expanded-markers.js';
import { regionPaintMarkers } from './help-wiki-region-paint-markers.js';
import { treeMarkers } from './help-wiki-tree-markers.js';
import { treeRepairMarkers } from './help-wiki-tree-repair-markers.js';
import { treeWorkbenchMarkers } from './help-wiki-tree-workbench-expanded-markers.js';
import { materialTroubleshootingMarkers } from './help-wiki-troubleshoot-material-markers.js';
import { vineExpandedMarkers } from './help-wiki-vines-expanded-media.js';
import { viewportExtraMarkers } from './help-wiki-viewport-extra-markers.js';
import { workflowMarkers } from './help-wiki-workflow-markers.js';

export const wikiImageMarkers = {
  ...treeMarkers,
  ...workflowMarkers,
  ...materialMarkers,
  ...materialExtraMarkers,
  ...libraryMarkers,
  ...assemblyMarkers,
  ...barkMarkers,
  ...viewportExtraMarkers,
  ...branchVariantsMarkers,
  ...regionPaintMarkers,
  ...bonsaiMarkers,
  ...vineExpandedMarkers,
  ...treeWorkbenchMarkers,
  ...materialExpandedMarkers,
  ...projectExpandedMarkers,
  ...fastTreeCaseMarkers,
  ...sculptedTreeCaseMarkers,
  ...directBoundTreeCaseMarkers,
  ...facadeMarkers,
  ...deliveryExtraMarkers,
  ...workspaceHelpMarkers,
  ...treeRepairMarkers,
  ...materialTroubleshootingMarkers,
};
