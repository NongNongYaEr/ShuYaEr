"""Pure contract regressions; UE integration is covered by the commandlet suite."""
import copy
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from branchforge_static_contract import blocks, contract, digest, identifier, prepare_variant


USD='''#usda 1.0
(upAxis = "Z"\nmetersPerUnit = 1)
def Scope "Looks" { def Material "M_0" { token outputs:surface.connect = </Looks/M_0/S.outputs:surface>
def Shader "S" { uniform token info:id = "UsdPreviewSurface" float inputs:roughness = 0.5 } } }
def Xform "Vegetation" { def Xform "Assembly_0" (prepend apiSchemas=["NaniteAssemblyRootAPI"]) {
def PointInstancer "Leaves" {
rel prototypes = [</Vegetation/Assembly_0/Leaves/Prototypes/Leaf_0>]
int[] protoIndices = [0]
point3f[] positions = [(1,2,3)]
quatf[] orientationsf = [(1,0,0,0)]
float3[] scales = [(1,2,3)]
def Scope "Prototypes" { def Mesh "Leaf_0" {
 point3f[] points = [(0,0,0),(1,0,0),(0,1,0)]
 normal3f[] normals = [(0,0,1),(0,0,1),(0,0,1)]
 texCoord2f[] primvars:st = [(0,0),(1,0),(0,1)]
 int[] faceVertexCounts = [3]
 int[] faceVertexIndices = [0,1,2]
 rel material:binding = </Looks/M_0>
} } } } }
'''


def fixture(folder,text=USD):
    (folder/'vegetation.usda').write_text(text,encoding='utf8')
    (folder/'color.png').write_bytes(b'test-png')
    manifest=dict(format='BranchForgeStaticVegetation',version=1,entry='vegetation.usda',
        files={n:dict(bytes=(folder/n).stat().st_size,sha256=digest((folder/n).read_bytes())) for n in ['vegetation.usda','color.png']},
        prototypes=[{'index':0}], instances=[{'id':'leaf-1','prototype':0}],summary={'shared_leaves':1})
    (folder/'static_vegetation.manifest.json').write_text(json.dumps(manifest))


class ContractTests(unittest.TestCase):
    def test_pose_changes_share_library_geometry_changes_version(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d); fixture(p); original=contract(p)['library_key']
            fixture(p,USD.replace('[(1,2,3)]','[(3,4,5)]'))
            self.assertEqual(contract(p)['library_key'],original)
            fixture(p,USD.replace('(0,1,0)]','(0,2,0)]'))
            self.assertNotEqual(contract(p)['library_key'],original)

    def test_material_and_uv_changes_version(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d); fixture(p); original=contract(p)['library_key']
            fixture(p,USD.replace('roughness = 0.5','roughness = 0.7'))
            self.assertNotEqual(contract(p)['library_key'],original)
            fixture(p,USD.replace('[(0,0),(1,0),(0,1)]','[(0,0),(0.8,0),(0,1)]'))
            self.assertNotEqual(contract(p)['library_key'],original)

    def test_hash_tamper_missing_and_path_escape(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d); fixture(p); (p/'color.png').write_bytes(b'changed')
            with self.assertRaises(ValueError):contract(p)
            fixture(p); (p/'color.png').unlink()
            with self.assertRaises(ValueError):contract(p)
            fixture(p); m=json.loads((p/'static_vegetation.manifest.json').read_text()); m['files']['../bad']={}
            (p/'static_vegetation.manifest.json').write_text(json.dumps(m))
            with self.assertRaises(ValueError):contract(p)

    def test_actual_instance_count(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d); fixture(p,USD.replace('protoIndices = [0]','protoIndices = [0,0]'))
            with self.assertRaises(ValueError):contract(p)

    def test_external_native_instances_and_material_refs(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d); fixture(p); c=contract(p)
            file=prepare_variant(c,dict(leaves={'Leaf_0':'/Game/Shared/Leaf.Leaf'},materials={'M_0':'/Game/Shared/MI.MI'}),p/'out')
            text=file.read_text(); self.assertNotIn('def PointInstancer',text)
            self.assertIn('NaniteAssemblyExternalRefAPI',text); self.assertIn('xformOp:translate = (1, 2, 3)',text)
            self.assertIn('xformOp:scale = (1, 2, 3)',text); self.assertIn('@/Game/Shared/MI.MI@',text)
            self.assertEqual((p/'vegetation.usda').read_text(),USD)

    def test_identifiers(self):
        for name in ['../Ivy','A/B','', 'Ivy name','a'*65]:
            with self.assertRaises(ValueError):identifier(name)
        self.assertEqual(identifier('Ivy_02'),'Ivy_02')


if __name__=='__main__':unittest.main()
