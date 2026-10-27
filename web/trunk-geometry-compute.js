import {createSweptBranchGeometry,adaptiveCurvePoints} from './branch-sweep-kernel.js';
import {prepareBranchBarkSurface} from './branch-bark-surface.js';
import {decodeGeometryRuntime,packComputedGeometry} from './geometry-transfer.js';

export function computeTrunkGeometry(job){
  const branch=decodeGeometryRuntime(job.branch);branch.trunkForm=job.form?.enabled===false?null:job.form;
  const source=branch.legacyRigidGeometry?.baseline||branch;
  const rendered=!job.rendered&&job.settings.adaptive_tessellation&&job.lodIndex<2&&!source.surfaceNormals?{...source,points:adaptiveCurvePoints(source.points,job.adaptiveCurveDetail??job.settings.curvature_detail)}:source;
  const renderBranch=branch.legacyRigidGeometry?{...branch,legacyRigidGeometry:{...branch.legacyRigidGeometry,baseline:rendered}}:rendered;
  const geometry=createSweptBranchGeometry(renderBranch,job.radialSegments,job.settings,{...job.options,continuousBark:job.continuousBark});
  if(job.continuousBark)prepareBranchBarkSurface(geometry,branch,job.settings);
  return packComputedGeometry(geometry);
}
