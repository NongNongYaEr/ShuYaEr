// Exported helpers are explicit material setup tools; they are not executed by
// the desktop app and do not replace an existing engine material automatically.
export const MICRODETAIL_UE_CUSTOM=String.raw`// UE Custom expression, Output Type = Float4.
// Inputs: PackedTex (TextureObject), LocalMetres (float3), GeometricLocalNormal,
// BaseLocalNormal, TileWidth, HeightMm, Strength, RoughnessAmount,
// GradientRange, BaseRoughness. PackedTex: sRGB OFF, linear/HDR data sampler.
float3 n = normalize(GeometricLocalNormal);
float3 b = normalize(BaseLocalNormal);
float3 w = pow(abs(n),4.0);
w /= max(w.x+w.y+w.z,0.0001);
float3 q = LocalMetres / max(TileWidth,0.000001);
float3 x = (Texture2DSample(PackedTex,PackedTexSampler,q.zy).rgb*65535.0-32768.0)/32767.0;
float3 y = (Texture2DSample(PackedTex,PackedTexSampler,q.xz).rgb*65535.0-32768.0)/32767.0;
float3 z = (Texture2DSample(PackedTex,PackedTexSampler,q.xy).rgb*65535.0-32768.0)/32767.0;
float3 g = float3(w.y*y.x+w.z*z.x,w.x*x.y+w.z*z.y,w.x*x.x+w.y*y.y)*GradientRange;
float3 surface = g-n*dot(g,n);
float factor = HeightMm*Strength*0.001/max(TileWidth,0.000001);
float3 combined = normalize(b/max(dot(b,n),0.0001)-surface*factor);
float rough = clamp(BaseRoughness+(w.x*x.z+w.y*y.z+w.z*z.z)*RoughnessAmount,0.02,1.0);
return float4(combined,rough);
`;
export const MICRODETAIL_BLENDER=String.raw`# TreeMaterialLab shared microdetail material builder. Blender 4.x/5.x API.
# Creates a NEW material. Existing materials/objects are left alone by default.
# Optional CLI after -- : --import-model --apply-selected
# The packed 16-bit texture is gradient/roughness DATA, not a normal-map image.
import bpy, json, hashlib, sys
from pathlib import Path

BASE = Path(__file__).resolve().parent
APPLY_TO_SELECTED = False
IMPORT_PAIRED_MODEL = False

def _local_file(name):
    path = (BASE / name).resolve()
    path.relative_to(BASE)
    if not path.is_file():
        raise RuntimeError("Missing exported texture: " + str(path))
    return path

def build_material():
    manifest = json.loads(_local_file("material_manifest.json").read_text(encoding="utf-8-sig"))
    detail = manifest.get("microdetail")
    if not detail or not detail.get("enabled"):
        raise RuntimeError("This export has no enabled shared microdetail.")
    options = detail["settings"]
    packed_info = detail["assets"]["gradientRoughness"]
    packed_path = _local_file(packed_info["file"])
    if hashlib.sha256(packed_path.read_bytes()).hexdigest() != packed_info["sha256"]:
        raise RuntimeError("Shared texture SHA mismatch; use one complete export.")
    material = bpy.data.materials.new("TML_SharedDetail_" + manifest["sourceSHA256"][:8])
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    nodes.clear()
    frame = nodes.new("NodeFrame")
    frame.label = "G12 shared detail - object local metres"
    position = [0]
    def node(kind, label="", internal=True):
        value = nodes.new(kind)
        value.label = label
        position[0] += 1
        value.location = ((position[0] % 8) * 210, -(position[0] // 8) * 150)
        if internal:
            value.parent = frame
        return value
    def feed(socket, value):
        if hasattr(value, "is_output"):
            links.new(value, socket)
        else:
            socket.default_value = value
    def scalar(operation, a, b=0):
        value = node("ShaderNodeMath", operation)
        value.operation = operation
        feed(value.inputs[0], a)
        feed(value.inputs[1], b)
        return value.outputs[0]
    def vector(operation, a, b=(0,0,0)):
        value = node("ShaderNodeVectorMath", operation)
        value.operation = operation
        feed(value.inputs[0], a)
        feed(value.inputs[1], b)
        return value.outputs[1] if operation == "DOT_PRODUCT" else value.outputs[0]
    def scale(a, amount):
        value = node("ShaderNodeVectorMath", "Scale")
        value.operation = "SCALE"
        feed(value.inputs[0], a)
        feed(value.inputs["Scale"], amount)
        return value.outputs[0]
    def split(a):
        value = node("ShaderNodeSeparateXYZ")
        feed(value.inputs[0], a)
        return value.outputs[0], value.outputs[1], value.outputs[2]
    def combine(x,y,z):
        value = node("ShaderNodeCombineXYZ")
        for socket, component in zip(value.inputs, [x,y,z]):
            feed(socket, component)
        return value.outputs[0]
    def transform(a, kind, source, target):
        value = node("ShaderNodeVectorTransform", source + " -> " + target)
        value.vector_type, value.convert_from, value.convert_to = kind, source, target
        feed(value.inputs[0], a)
        return value.outputs[0]
    def image_file(name, color_space, sha=None):
        if sha:
            for image in bpy.data.images:
                if image.get("tml_sha256") == sha and not image.is_dirty and image.colorspace_settings.name == color_space:
                    return image
        image = bpy.data.images.load(str(_local_file(name)), check_existing=False)
        image.colorspace_settings.name = color_space
        if sha:
            image["tml_sha256"] = sha
        return image
    uv = node("ShaderNodeTexCoord", "UV0 base maps", False).outputs["UV"]
    def image_node(image, coords, label):
        value = node("ShaderNodeTexImage", label)
        value.image, value.interpolation, value.extension = image, "Linear", "REPEAT"
        feed(value.inputs["Vector"], coords)
        return value.outputs["Color"]
    maps = detail["baseTextures"]
    color = image_node(image_file(maps["baseColor"], "sRGB"), uv, "BaseColor sRGB")
    base_normal_color = image_node(image_file(maps["normalGL"], "Non-Color"), uv, "Base Normal GL")
    orm = image_node(image_file(maps["orm"], "Non-Color"), uv, "ORM linear")
    ao, base_rough, metal = split(orm)
    normal_node = node("ShaderNodeNormalMap", "Base Mikk tangent normal", False)
    normal_node.space = "TANGENT"
    feed(normal_node.inputs["Strength"], 1.0)
    feed(normal_node.inputs["Color"], base_normal_color)
    geometry = node("ShaderNodeNewGeometry", "Geometry", False)
    geometric_local = vector("NORMALIZE", transform(geometry.outputs["Normal"], "NORMAL", "WORLD", "OBJECT"))
    base_local = vector("NORMALIZE", transform(normal_node.outputs["Normal"], "NORMAL", "WORLD", "OBJECT"))
    paired = bool(manifest.get("model"))
    metres = 1.0 if paired else detail["mapping"]["originalSourceMetresPerUnit"]
    local = transform(geometry.outputs["Position"], "POINT", "WORLD", "OBJECT")
    q = scale(local, metres / options["tileWidthMeters"])
    qx,qy,qz = split(q)
    weights = vector("MULTIPLY", geometric_local, geometric_local)
    weights = vector("MULTIPLY", weights, weights)
    total = scalar("MAXIMUM", vector("DOT_PRODUCT", weights, (1,1,1)), 0.0001)
    weights = scale(weights, scalar("DIVIDE", 1, total))
    wx,wy,wz = split(weights)
    packed_image = image_file(packed_info["file"], "Non-Color", packed_info["sha256"])
    def packed(coords, label):
        # PNG row zero is the local v=0 row used by WebGL/UE. Blender images
        # use a bottom origin: flip only sampling V, not the stored gradient.
        cu,cv,unused = split(coords)
        coords = combine(cu,scalar("MULTIPLY",cv,-1),0)
        raw = image_node(packed_image, coords, label)
        decoded = scale(vector("SUBTRACT", scale(raw,65535.0),(32768,32768,32768)),1.0/32767.0)
        return split(decoded)
    xr,xg,xb = packed(combine(qz,qy,0), "Micro .zy")
    yr,yg,yb = packed(combine(qx,qz,0), "Micro .xz")
    zr,zg,zb = packed(combine(qx,qy,0), "Micro .xy")
    mul = lambda a,b: scalar("MULTIPLY",a,b)
    add = lambda a,b: scalar("ADD",a,b)
    gradient = combine(add(mul(wy,yr),mul(wz,zr)),add(mul(wx,xg),mul(wz,zg)),add(mul(wx,xr),mul(wy,yg)))
    gradient = scale(gradient, detail["sampling"]["gradientRange"])
    along = vector("DOT_PRODUCT",gradient,geometric_local)
    surface = vector("SUBTRACT",gradient,scale(geometric_local,along))
    factor = options["heightMm"] * options["strength"] * 0.001 / options["tileWidthMeters"]
    base_dot = scalar("MAXIMUM",vector("DOT_PRODUCT",base_local,geometric_local),0.0001)
    combined = vector("NORMALIZE",vector("SUBTRACT",scale(base_local,scalar("DIVIDE",1,base_dot)),scale(surface,factor)))
    combined_world = transform(combined,"NORMAL","OBJECT","WORLD")
    rough_signal = add(add(mul(wx,xb),mul(wy,yb)),mul(wz,zb))
    rough = scalar("MINIMUM",scalar("MAXIMUM",add(base_rough,mul(rough_signal,options["roughnessAmount"])),0.02),1.0)
    principled = node("ShaderNodeBsdfPrincipled", "Tree + shared detail", False)
    feed(principled.inputs["Base Color"], color)
    feed(principled.inputs["Metallic"], metal)
    feed(principled.inputs["Roughness"], rough)
    feed(principled.inputs["Normal"], combined_world)
    output = node("ShaderNodeOutputMaterial", "Output", False)
    links.new(principled.outputs["BSDF"], output.inputs["Surface"])
    material["tml_microdetail_sha256"] = packed_info["sha256"]
    material["tml_ao_note"] = "ORM.R remains available separately; no automatic AO multiply."
    material["tml_coordinate_space"] = "object-local-metres; calibrated object scale"
    print("Created NEW material:", material.name, "Apply calibrated scale; nonuniform scale should be applied before engine use.")
    return material, manifest

if __name__ == "__main__":
    arguments = sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
    material, manifest = build_material()
    if IMPORT_PAIRED_MODEL or "--import-model" in arguments:
        if not manifest.get("model"):
            raise RuntimeError("No paired model in this export; import and calibrate the original model first.")
        bpy.ops.import_scene.gltf(filepath=str(_local_file(manifest["model"]["file"])))
    if APPLY_TO_SELECTED or "--apply-selected" in arguments:
        for obj in bpy.context.selected_objects:
            if obj.type == "MESH":
                if obj.data.users > 1:
                    obj.data = obj.data.copy()
                obj.data.materials.clear()
                obj.data.materials.append(material)
`;
export function microdetailInstructions(){return`共享近景细节（可选，额外材质设置）
基础BaseColor / Normal GL-DX / ORM没有混入本层。GLB内嵌的是基础PBR；只导入GLB或只接三张整树图，不会自动出现共享细节。

共享GradientRoughness16是线性数据：R/G是有符号高度梯度，B是有符号微粗糙度。解码=(采样值×65535−32768)/32767，RG再乘清单gradientRange，B不乘。Height16仅供参考，默认接法使用梯度图。共享PNG的首行对应投射v=0；Blender图像原点相反，所附脚本只翻转采样V，不翻转解码梯度。UE共享采样使用Wrap与三线性过滤，不使用镜像寻址。
模型本地坐标先转成米，再除tileWidthMeters；以原始几何法线abs(N)^4归一化权重混合.zy、.xz、.xy投射。按清单的surface-gradient公式组合基础法线与微细节，粗糙度=clamp(ORM.G+微粗×roughnessAmount,0.02,1)。物理高度为heightMm×strength。本地材质随对象缩放；请按导出树高校准并应用非均匀缩放。

Blender：在副本中打开本目录Blender_共享细节.py运行，默认只新建材质，不覆盖对象原材质。颜色用sRGB，Normal_GL / ORM / 共享梯度用Non-Color。可显式将APPLY_TO_SELECTED设True，或命令行 -- --import-model --apply-selected。无配套模型时先导入同一原模型并校准实际树高。ORM.R作为独立AO数据保留，不默认乘到颜色。

UE：这是Custom节点接线文件，不会自动修改工程。
1. 导入基础BaseColor、Normal_DX、ORM；Normal按法线导入，ORM和共享梯度关闭sRGB；共享梯度按线性/HDR数据保留精度，勿当Normal Map压缩。
2. Custom输入PackedTex接共享图TextureObject；LocalMetres接WorldPosition→TransformPosition(World→Local)后转米。配套GLB导入UE后本地厘米×0.01；原模型需按清单originalSourceMetresPerUnit和本机导入单位换算。
3. GeometricLocalNormal接VertexNormalWS→Transform(World→Local)；BaseLocalNormal接Normal_DX采样后Transform(Tangent→Local)。非均匀对象缩放先应用，常规静态模型使用。
4. 其余标量TileWidth、HeightMm、Strength、RoughnessAmount、GradientRange读material_manifest.json.microdetail；BaseRoughness接ORM.G。
5. Custom输出类型Float4，粘贴UE_共享细节_Custom.hlsl。RGB从Local变换到World后接Normal，并关闭材质Tangent Space Normal；A接Roughness。BaseColor、ORM.R/AO、ORM.B/Metallic照常连接。

同一生成参数的共享贴图内容与模型无关，可跨树复用。每棵树的原模型单位换算各自读取清单。当前软件预览和数据/接线算法可自动验证；实际UE/Blender材质显示仍需在目标项目验收。
参考（原始技术文档）：
https://docs.blender.org/api/4.5/bpy.types.ShaderNodeVectorTransform.html
https://dev.epicgames.com/documentation/en-us/unreal-engine/bump-mapping-w/o-tangent-space?application_version=4.27
`};
