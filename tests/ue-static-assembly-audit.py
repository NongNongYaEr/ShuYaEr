"""Compare saved UE Nanite assembly structs with original USD, without a GUI."""
import hashlib, json, re, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / '.runtime/usd-validation-26.3'))
from pxr import Usd, UsdGeom
import numpy as np

report = json.loads(Path(sys.argv[1]).read_text(encoding='utf8'))
entry = Path(sys.argv[2]).resolve()
assert report['passed']
assert report['usd_sha256'] == hashlib.sha256(entry.read_bytes()).hexdigest().upper()
stage = Usd.Stage.Open(str(entry))
meshes = {r['path']: r for r in report['assets'] if r['class'] == 'StaticMesh'}
maximum = np.zeros(3)
leaf_count = 0
base_count = 0
for row in meshes.values():
    if not row['instances']:
        prim = stage.GetPrimAtPath(row['usd_prim_paths'][0])
        assert row['nanite_triangles'] == len(UsdGeom.Mesh(prim).GetFaceVertexCountsAttr().Get())
        continue
    root = row['usd_prim_paths'][0]
    instancer = UsdGeom.PointInstancer(stage.GetPrimAtPath(root + '/Leaves'))
    positions = instancer.GetPositionsAttr().Get()
    rotations = instancer.GetOrientationsfAttr().Get()
    scales = instancer.GetScalesAttr().Get()
    prototypes = instancer.GetPrototypesRel().GetTargets()
    proto_indices = instancer.GetProtoIndicesAttr().Get()
    nodes = re.split(r'(?=\(PartIndex=)', row['assembly_text'].split(',Nodes=(',1)[1])[1:]
    index = 0
    for node in nodes:
        part_index = int(re.search(r'PartIndex=(\d+)', node).group(1))
        prim_path = meshes[row['part_paths'][part_index]]['usd_prim_paths'][0]
        if '/Base_' in prim_path:
            assert 'Transform=' not in node, 'Base must preserve identity'
            base_count += 1
            continue
        assert prim_path == str(prototypes[proto_indices[index]])
        def fields(name, names, default):
            match = re.search(name + r'=\(([^)]+)\)', node)
            return np.array([float(re.search(k+r'=([-+\d.eE]+)',match.group(1)).group(1)) for k in names]) if match else np.array(default)
        position = fields('Translation', 'XYZ', [0,0,0])
        rotation = fields('Rotation', 'XYZW', [0,0,0,1])
        scale = fields('Scale3D', 'XYZ', [1,1,1])
        p = np.array(positions[index]) * [100,-100,100]
        q = rotations[index]
        q = np.array([*q.GetImaginary(),q.GetReal()]) * [-1,1,-1,1]
        q /= np.linalg.norm(q)
        differences = np.array([max(abs(position-p)), min(max(abs(rotation-q)),max(abs(rotation+q))),max(abs(scale-np.array(scales[index])))])
        assert np.all(differences <= [.00015,.000002,.000001]), (index,differences)
        maximum = np.maximum(maximum,differences)
        index += 1
    assert index == len(positions)
    leaf_count += index
assert leaf_count == report['expected']['shared_leaves']
assert sum(r['nanite_triangles'] for r in meshes.values() if r['instances']) == report['expected']['triangles']
result = dict(passed=True,leaf_instances=leaf_count,base_instances=base_count,
              nanite_triangles=report['expected']['triangles'],usd_sha256=report['usd_sha256'],
              max_position_component_error_cm=float(maximum[0]),max_quaternion_component_error=float(maximum[1]),
              max_scale_component_error=float(maximum[2]),note='UE struct text has 6 decimal digits; bounds include transformed prototype boxes.')
Path(sys.argv[3]).write_text(json.dumps(result,indent=2),encoding='utf8')
print(json.dumps(result))
