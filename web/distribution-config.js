// Packaging may narrow the bundled catalog; existing user documents remain compatible.
export const DISTRIBUTION = {
  edition: 'sample', treeSpecies: ['CAMPHOR','AZALEA','FIDDLE_FIG'], scenePlants: true,
  defaultTree: { id: 'template-a5e7e5356aeeadd6663f025a8c156d39', name: '香樟整株样板', species: 'CAMPHOR', path: 'assets/tree-template-library/template-a5e7e5356aeeadd6663f025a8c156d39.branch.json' },
  defaultBranch: 'FINISHED_CAMPHOR_SIDE_MIXED_V1',
  surfaceExample: { url: './assets/models/QiaoDunTest.glb', name: 'QiaoDunTest.glb', scale: 1 },
  baseBranchExample: {
    url: './assets/models/base-branch-sample.glb',
    name: '弯枝与叶花果.glb',
    pack: { id: 'builtin:base-branch-practice-v1', name: '内置测试 · 弯枝与叶花果',
      count: 5, url: './assets/models/base-branch-sample.plantunits.json' },
  },
};
