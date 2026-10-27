"""Portable contract for the static vegetation workbench (no UE dependency)."""
import hashlib
import json
import re
from pathlib import Path

ROOT = '/Game/Day30/Vegetation/StaticUSD/Workbench'
HEADER = '#usda 1.0\n(defaultPrim = "Vegetation"\n upAxis = "Z"\n metersPerUnit = 1)\n'


def digest(data):
    return hashlib.sha256(data if isinstance(data, bytes) else data.encode('utf8')).hexdigest()


def identifier(value):
    if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_]{0,63}', value):
        raise ValueError('库编号和造型编号使用英文字母开头，最多 64 位字母、数字、下划线。')
    return value


def read_json(file, default=None):
    return json.loads(Path(file).read_text(encoding='utf-8-sig')) if Path(file).exists() else default


def atomic_json(file, value):
    file = Path(file)
    file.parent.mkdir(parents=True, exist_ok=True)
    temp = file.with_suffix('.writing')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf8')
    temp.replace(file)


def blocks(text, kind):
    """Read only BranchForge's exported USDA subset; braces inside strings are ignored."""
    found = []
    for m in re.finditer(r'\bdef ' + re.escape(kind) + r' "([A-Za-z0-9_]+)"[^\{]*\{', text):
        depth, quoted, escaped = 1, False, False
        for end in range(m.end(), len(text)):
            c = text[end]
            if escaped:
                escaped = False
            elif c == '\\' and quoted:
                escaped = True
            elif c == '"':
                quoted = not quoted
            elif not quoted:
                depth += (c == '{') - (c == '}')
                if not depth:
                    found.append((m.group(1), m.start(), end + 1, text[m.start():end + 1]))
                    break
        else:
            raise ValueError('USD 块不完整：' + m.group(1))
    return found


def numbers(block, name, width=1):
    m = re.search(r'\b' + re.escape(name) + r' = \[([^\]]*)\]', block)
    if not m:
        raise ValueError('USD 缺少 ' + name)
    import math
    values = [float(v) for v in re.sub(r'[()]', '', m[1]).split(',') if v.strip()]
    if len(values) % width or not all(math.isfinite(v) for v in values):
        raise ValueError('USD 数组无效：' + name)
    return values


def contract(package):
    package = Path(package).resolve()
    if package.is_file():
        if package.name != 'vegetation.usda':
            raise ValueError('请选择 vegetation.usda，不是工程 JSON 或其他 USD 文件。')
        package = package.parent
    m = read_json(package / 'static_vegetation.manifest.json')
    if not m or m.get('format') != 'BranchForgeStaticVegetation' or m.get('version') != 1 or m.get('entry') != 'vegetation.usda':
        raise ValueError('请选择“导出 UE 静态植被”生成的 vegetation.usda。')
    for name, item in m['files'].items():
        file = (package / name).resolve()
        if file.parent != package or not file.is_file():
            raise ValueError('配套文件缺失或越界：' + name)
        b = file.read_bytes()
        if len(b) != item['bytes'] or digest(b).lower() != item['sha256'].lower():
            raise ValueError('配套文件校验失败：' + name)
    text = (package / 'vegetation.usda').read_text(encoding='utf8')
    if not re.search(r'upAxis\s*=\s*"Z"',text) or not re.search(r'metersPerUnit\s*=\s*1(?:\.0)?\s*\)',text):
        raise ValueError('静态植被包必须保持 Z 向上、米单位。')
    materials = blocks(text, 'Material')
    meshes = blocks(text, 'Mesh')
    leaves = {}
    for name, _, _, body in meshes:
        if name.startswith('Leaf_'):
            if name in leaves and leaves[name] != body:
                raise ValueError('分包原型不一致：' + name)
            leaves[name] = body
    if len(leaves) != len(m['prototypes']):
        raise ValueError('叶片原型数量不符')
    # Bundle version excludes placements/base geometry. Includes *actual* mesh,
    # normal, UV, material shader and texture bytes, plus the importer contract.
    library_key = digest(json.dumps({'schema': 'UE58-StaticLibrary-v1', 'meshes': sorted(leaves.items()),
        'materials': [v[3] for v in materials], 'textures': {n: v['sha256'].lower() for n,v in m['files'].items() if n != 'vegetation.usda'}}, sort_keys=True))
    instancers = blocks(text, 'PointInstancer')
    count = sum(len(numbers(v[3], 'protoIndices')) for v in instancers)
    for _,_,_,block in instancers:
        proto=numbers(block,'protoIndices'); size=len(proto)
        if not all(v==int(v) and 0<=v<len(leaves) for v in proto):
            raise ValueError('实例引用了无效原型')
        if any(len(numbers(block,name,width))!=size*width for name,width in [('positions',3),('orientationsf',4),('scales',3)]):
            raise ValueError('实例变换数组不完整')
    if count != m['summary']['shared_leaves'] or len(m['instances']) != count:
        raise ValueError('实际实例数量与清单不符')
    return dict(package=package, manifest=m, text=text, leaves=leaves, materials=materials,
                library_key=library_key, instancers=instancers)


def prepare_library(c, folder):
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    import shutil
    for name in c['manifest']['files']:
        if name != 'vegetation.usda':
            shutil.copy2(c['package'] / name, folder / name)
    # Material probes ensure even a bark-only material is imported without
    # storing a full variant's stems in the shared library.
    probes = []
    for i, material in enumerate(c['manifest']['materials']):
        probes.append(f'''def Mesh "Probe_{i}" {{
            point3f[] points = [(0,0,0),({0.001*(i+1)},0,0),(0,0.001,0)]
            normal3f[] normals = [(0,0,1),(0,0,1),(0,0,1)] (interpolation = "vertex")
            texCoord2f[] primvars:st = [(0,0),(1,0),(0,1)] (interpolation = "vertex")
            int[] faceVertexCounts = [3]
            int[] faceVertexIndices = [0,1,2]
            uniform token subdivisionScheme = "none"
            uniform bool doubleSided = {str(material['doubleSided']).lower()}
            rel material:binding = </Looks/M_{i}>
        }}''')
    output = HEADER + 'def Scope "Looks" {\n' + '\n'.join(v[3] for v in c['materials']) + '\n}\ndef Xform "Vegetation" {\n' + '\n'.join(c['leaves'].values()) + '\n' + '\n'.join(probes) + '\n}\n'
    file = folder / 'library.usda'
    file.write_text(output, encoding='utf8')
    return file


def prepare_variant(c, library, folder):
    text = c['text']
    edits = []
    # UE 5.8's PointInstancer path only looks at newly translated prototype
    # meshes; it does not resolve ExternalRefAPI on those prototypes. Ordinary
    # Xform children *do* resolve it and still become native shared assembly nodes.
    for name, start, end, body in c['instancers']:
        proto=numbers(body,'protoIndices'); pos=numbers(body,'positions',3)
        rot=numbers(body,'orientationsf',4); scales=numbers(body,'scales',3)
        nodes=[]
        fmt=lambda values: '('+', '.join(format(v,'.9g') for v in values)+')'
        for i, index in enumerate(proto):
            asset=library['leaves']['Leaf_'+str(int(index))]
            nodes.append(f'''def Xform "LeafInstance_{i}" (prepend apiSchemas = ["NaniteAssemblyExternalRefAPI"]) {{
                uniform token unreal:naniteAssembly:meshAssetPath = "{asset}"
                double3 xformOp:translate = {fmt(pos[i*3:i*3+3])}
                quatf xformOp:orient = {fmt(rot[i*4:i*4+4])}
                float3 xformOp:scale = {fmt(scales[i*3:i*3+3])}
                uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:orient", "xformOp:scale"]
            }}''')
        edits.append((start,end,'def Xform "Leaves" {\n'+'\n'.join(nodes)+'\n}'))
    for name, start, end, _ in c['materials']:
        asset = library['materials'][name]
        edits.append((start, end, f'''def Material "{name}" {{
            token outputs:unreal:surface.connect = </Looks/{name}/UnrealShader.outputs:out>
            def Shader "UnrealShader" {{
                uniform token info:implementationSource = "sourceAsset"
                uniform asset info:unreal:sourceAsset = @{asset}@
                token outputs:out
            }}
        }}'''))
    for start, end, replacement in sorted(edits, reverse=True):
        text = text[:start] + replacement + text[end:]
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    file = folder / 'vegetation.usda'
    file.write_text(text, encoding='utf8')
    return file
