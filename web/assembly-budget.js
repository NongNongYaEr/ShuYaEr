// Complete reusable models use the established dense-assembly graph capacity.
// The per-model authoring limit and procedural skeleton limits remain separate.
export const COMPLETE_ASSEMBLY_BRANCH_LIMIT = 11000;
export function assemblyBranchLimit(authoring, {hadInstances = false} = {}) {
  const tags = authoring.recipe?.tags || [];
  if (hadInstances || authoring.branch_instances?.length || tags.includes('DENSE_AUTHORED_SAMPLE_ASSEMBLY')) return COMPLETE_ASSEMBLY_BRANCH_LIMIT;
  return tags.includes('DENSE_AUTHORED_CROWN') ? 3200 : 2200;
}
