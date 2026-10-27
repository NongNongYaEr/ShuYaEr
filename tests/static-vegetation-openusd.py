"""Independent OpenUSD 26.3 acceptance, no Unreal editor process or plugin edits.

Install usd-core==26.3 and scipy into .runtime/usd-validation-26.3 for this
development test; numpy and Pillow are also required by the Python environment.
The resolved reference is already checked against the actual browser scene by
static-vegetation.browser.cjs / pve-vine-reference acceptance fingerprints.
"""
import json
import hashlib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.runtime/usd-validation-26.3'))
from pxr import Usd, UsdGeom, UsdShade, Sdf
import numpy as np
from scipy.spatial import cKDTree
from PIL import Image

directory = Path(sys.argv[1]).resolve()
reference = Path(sys.argv[2]).resolve()
report_file = Path(sys.argv[3]).resolve()
manifest = json.loads((directory / 'static_vegetation.manifest.json').read_text(encoding='utf8'))
entry = str(directory / 'vegetation.usda')
# Use an absolute filename: USD resolves layer identifiers independently of the
# Python process's relative-path handling on Windows.
layer = Sdf.Layer.FindOrOpen(entry)
assert layer
stage = Usd.Stage.Open(layer)
assert stage.GetDefaultPrim().GetPath() == '/Vegetation'
assert UsdGeom.GetStageUpAxis(stage) == 'Z'
assert UsdGeom.GetStageMetersPerUnit(stage) == 1

def mesh_arrays(prim):
    mesh = UsdGeom.Mesh(prim)
    p = np.asarray(mesh.GetPointsAttr().Get(), dtype=np.float64)
    n = np.asarray(mesh.GetNormalsAttr().Get(), dtype=np.float64)
    uv = np.asarray(UsdGeom.PrimvarsAPI(prim).GetPrimvar('st').ComputeFlattened(), dtype=np.float64)
    indices = np.asarray(mesh.GetFaceVertexIndicesAttr().Get(), dtype=np.int64).reshape(-1, 3)
    valid, reason = UsdGeom.Mesh.ValidateTopology(mesh.GetFaceVertexIndicesAttr().Get(), mesh.GetFaceVertexCountsAttr().Get(), len(p))
    assert valid, reason
    assert mesh.GetNormalsInterpolation() == 'vertex'
    assert mesh.GetSubdivisionSchemeAttr().Get() == 'none'
    assert mesh.GetOrientationAttr().Get() == 'rightHanded'
    material = UsdShade.MaterialBindingAPI(prim).ComputeBoundMaterial()[0]
    assert material, prim.GetPath()
    index = int(str(material.GetPath()).rsplit('_', 1)[1])
    role = 'bark' if manifest['materials'][index]['name'] == 'M_Bark' else 'foliage'
    assert bool(mesh.GetDoubleSidedAttr().Get()) == manifest['materials'][index]['doubleSided']
    return p, n, uv, indices, role

actual = {'bark': [], 'foliage': []}
instances = 0
assemblies = 0
for child in stage.GetDefaultPrim().GetChildren():
    assert 'NaniteAssemblyRootAPI' in child.GetMetadata('apiSchemas').GetAppliedItems()
    assert child.GetAttribute('unreal:naniteAssembly:meshType').Get() == 'staticMesh'
    assemblies += 1
    for prim in child.GetChildren():
        if prim.IsA(UsdGeom.Mesh):
            p, n, uv, indices, role = mesh_arrays(prim)
            actual[role].append(np.concatenate([p, n, uv], axis=1)[indices])
        elif prim.IsA(UsdGeom.PointInstancer):
            instancer = UsdGeom.PointInstancer(prim)
            assert instancer.GetOrientationsfAttr().HasAuthoredValue()
            assert not instancer.GetOrientationsAttr().HasAuthoredValue()
            proto_indices = instancer.GetProtoIndicesAttr().Get()
            matrices = instancer.ComputeInstanceTransformsAtTime(Usd.TimeCode.Default(), Usd.TimeCode.Default())
            prototypes = [mesh_arrays(stage.GetPrimAtPath(p)) for p in instancer.GetPrototypesRel().GetTargets()]
            assert len(matrices) == len(proto_indices) <= 60000
            for proto_index, transform in zip(proto_indices, matrices):
                p, n, uv, indices, role = prototypes[proto_index]
                matrix = np.asarray(transform, dtype=np.float64)
                points = p @ matrix[:3, :3] + matrix[3, :3]
                normals = n @ np.linalg.inv(matrix[:3, :3]).T
                normals /= np.linalg.norm(normals, axis=1)[:, None]
                actual[role].append(np.concatenate([points, normals, uv], axis=1)[indices])
            instances += len(proto_indices)

for prim in stage.Traverse():
    if prim.IsA(UsdShade.Shader):
        shader = UsdShade.Shader(prim)
        if shader.GetIdAttr().Get() == 'UsdUVTexture':
            value = shader.GetInput('file').Get()
            assert value.resolvedPath and Path(value.resolvedPath).is_file(), value
            with Image.open(value.resolvedPath) as image:
                image.verify()
        for value in shader.GetInputs():
            if value.HasConnectedSource():
                assert value.GetConnectedSource()[0].GetPrim().IsValid(), value.GetFullName()

r = json.loads((reference / 'whole.resolved.json').read_text(encoding='utf8'))
binary = (reference / r['binary']).read_bytes()
expected = {'bark': [], 'foliage': []}
for chunk in r['chunks']:
    vertices = np.frombuffer(binary, dtype='<f4', count=chunk['vertex_count'] * 12, offset=chunk['vertex_offset']).reshape(-1, 12)[:, :8].astype(np.float64)
    vertices[:, :3] *= [0.01, -0.01, 0.01]
    vertices[:, 4] *= -1
    vertices[:, 7] = 1 - vertices[:, 7]
    indices = np.frombuffer(binary, dtype='<u4', count=chunk['index_count'], offset=chunk['index_offset']).reshape(-1, 3)
    expected[chunk['material_role']].append(vertices[indices])

result = {'openusd_version': Usd.GetVersion(), 'assemblies': assemblies, 'shared_leaf_instances': instances,
          'ue_import_verified': False, 'checks': {}, 'entry': entry,
          'entry_sha256': hashlib.sha256(Path(entry).read_bytes()).hexdigest().upper(),
          'source_sha256': manifest['source_sha256']}
for role in expected:
    wanted = np.concatenate(expected[role]); got = np.concatenate(actual[role])
    assert wanted.shape == got.shape
    # Match ordered triangles spatially, retaining winding and all three UVs and
    # normals. Compare both ways so an omitted surface cannot be hidden by a
    # duplicated triangle with an unchanged total count.
    errors = []
    for a, b in [(got, wanted), (wanted, got)]:
        tree = cKDTree(np.ascontiguousarray(b[:, :, :3].reshape(-1, 9)))
        _, ids = tree.query(np.ascontiguousarray(a[:, :, :3].reshape(-1, 9)), workers=2)
        delta = np.abs(a - b[ids])
        limits = np.array([.000006]*3 + [.000025]*3 + [.000001]*2)
        failed = np.flatnonzero(np.any(delta > limits, axis=(1, 2)))
        # Coincident surfaces can have different UVs/normals; try their nearest
        # candidates before treating them as a fidelity failure.
        for i in failed:
            _, options = tree.query(a[i, :, :3].reshape(-1), k=min(16, len(b)))
            candidates = np.abs(a[i] - b[np.atleast_1d(options)])
            valid = np.flatnonzero(np.all(candidates <= limits, axis=(1, 2)))
            assert len(valid), (role, int(i), 'position/winding/normal/UV mismatch')
            delta[i] = candidates[valid[0]]
        errors.append(np.max(delta, axis=(0, 1)))
    worst = np.max(errors, axis=0)
    result['checks'][role] = {'triangles': len(got), 'max_position_error_m': float(max(worst[:3])),
                             'max_normal_component_error': float(max(worst[3:6])), 'max_uv_error': float(max(worst[6:]))}

assert instances == manifest['summary']['shared_leaves']
assert sum(v['triangles'] for v in result['checks'].values()) == manifest['summary']['triangles']
result['passed'] = True
report_file.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf8')
print(json.dumps(result, ensure_ascii=True, indent=2))
