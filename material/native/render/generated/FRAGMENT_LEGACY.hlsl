struct PatchSurface
{
    float3 color;
    float colorAlpha;
    float rough;
    float roughAlpha;
    float h;
    float normalKeep;
};

struct Surface
{
    float3 color;
    float h;
    float rough;
    float normalWeight;
    float coatH;
    float localAO;
    float3 detailGradient;
    float paintMask;
    float layerCoverage;
    float selectedCoverage;
};

static const PatchSurface _888 = { 0.0f.xxx, 0.0f, 0.0f, 0.0f, 0.0f, 1.0f };
static const Surface _8775 = { 0.0f.xxx, 0.0f, 0.0f, 1.0f, 0.0f, 1.0f, 0.0f.xxx, 0.0f, 1.0f, 0.0f };

cbuffer PixelUniforms : register(b12, space0)
{
    int _453_uPass : packoffset(c0);
    uint _453_uBake : packoffset(c0.y);
    uint _453_uPixelMasks : packoffset(c0.z);
    uint _453_uHasHeightMap : packoffset(c0.w);
    uint _453_uHasRoughMap : packoffset(c1);
    uint _453_uHasBarkFlow : packoffset(c1.y);
    uint _453_uHasNormalMap : packoffset(c1.z);
    uint _453_uFloatHeight : packoffset(c1.w);
    uint _453_uHeightWithNormal : packoffset(c2);
    uint _453_uHasMaskHeight : packoffset(c2.y);
    int _453_uHeightLevels : packoffset(c2.z);
    float _453_uBarkRelief : packoffset(c2.w);
    float _453_uBarkCavity : packoffset(c3);
    float _453_uNormalStrength : packoffset(c3.y);
    float _453_uNormalY : packoffset(c3.z);
    float _453_uLightMode : packoffset(c3.w);
    float _453_uLightStyle : packoffset(c4);
    float _453_uDirectionMode : packoffset(c4.y);
    float4 _453_uSculptResponse : packoffset(c5);
    uint _453_uBakedPreview : packoffset(c6);
    uint _453_uBakedShared : packoffset(c6.y);
    uint _453_uMicroEnabled : packoffset(c6.z);
    int _453_uMicroLevels : packoffset(c6.w);
    float3 _453_uMicroPhase : packoffset(c7);
    float4 _453_uMicroParams : packoffset(c8);
    int _453_uPatchCount : packoffset(c9);
    int _453_uPatchBits : packoffset(c9.y);
    int _453_uPatchHeightBits : packoffset(c9.z);
    float4 _453_uPatchOrigin[8] : packoffset(c10);
    float4 _453_uPatchU[8] : packoffset(c18);
    float4 _453_uPatchV[8] : packoffset(c26);
    float4 _453_uPatchN[8] : packoffset(c34);
    float4 _453_uPatchColor[8] : packoffset(c42);
    float4 _453_uPatchShape[8] : packoffset(c50);
    float4 _453_uPatchChannels[8] : packoffset(c58);
    float _453_uPatchEpsilon : packoffset(c66);
    int _453_uEffectCount : packoffset(c66.y);
    int _453_uEffectSelected : packoffset(c66.z);
    uint _453_uSurfacePreview : packoffset(c66.w);
    float4 _453_uEffectConfig[16] : packoffset(c67);
    float4 _453_uEffectMeta[16] : packoffset(c83);
    float4 _453_uEffectData[160] : packoffset(c99);
    float3 _453_uEffectColor[16] : packoffset(c259);
    float4 _453_uEffectEmission[16] : packoffset(c275);
    float4 _453_uEffectEmissionShape[16] : packoffset(c291);
    float _453_uEmissionMaximum : packoffset(c307);
    uint _453_uHasBakedEmission : packoffset(c307.y);
    float _453_uBakedEmissionStrength : packoffset(c307.z);
    float4 _453_uBlendColor[16] : packoffset(c308);
    float4 _453_uBlendChannels[16] : packoffset(c324);
    float4 _453_uBlendExtra[16] : packoffset(c340);
    float4 _453_uBlendHeight[16] : packoffset(c356);
    float4 _453_uBlendHeightSource[16] : packoffset(c372);
    float4 _453_uBlendLimits[16] : packoffset(c388);
    float4 _453_uBlendTarget[16] : packoffset(c404);
    int _453_uLayerOrder[6] : packoffset(c420);
    float4 _453_uLayerParams[6] : packoffset(c426);
    float _453_uLayerSeed[6] : packoffset(c432);
    float _453_uLayerAO[6] : packoffset(c438);
    float3 _453_uEye : packoffset(c444);
    float3 _453_uTint : packoffset(c445);
    float3 _453_uMossColor : packoffset(c446);
    float3 _453_uPaintColor : packoffset(c447);
    float3 _453_uOriginalFactor : packoffset(c448);
    uint _453_uCoatEnabled : packoffset(c448.w);
    float _453_uCoatWidth : packoffset(c449);
    float _453_uMossNormalStrength : packoffset(c449.y);
    float _453_uPaintNormalStrength : packoffset(c449.z);
    float _453_uPaintBarkKeep : packoffset(c449.w);
    float _453_uMossThickness : packoffset(c450);
    float _453_uMossClump : packoffset(c450.y);
    float _453_uMossPorosity : packoffset(c450.z);
    float _453_uMossFiberMm : packoffset(c450.w);
    float _453_uMossAO : packoffset(c451);
    float _453_uPaintAO : packoffset(c451.y);
    float _453_uPaintCoverage : packoffset(c451.z);
    float _453_uPaintDepthAmount : packoffset(c451.w);
    float _453_uPaintDepthContrast : packoffset(c452);
    float _453_uPaintPeel : packoffset(c452.y);
    float _453_uPaintPeelSize : packoffset(c452.z);
    float _453_uPaintPeelEdge : packoffset(c452.w);
    float _453_uPaintPeelDetail : packoffset(c453);
    float _453_uPaintPeelChips : packoffset(c453.y);
    float3 _453_uCoatMossMean : packoffset(c454);
    float3 _453_uCoatPaintMean : packoffset(c455);
    float _453_uTreeHeight : packoffset(c455.w);
    float _453_uScale : packoffset(c456);
    float _453_uBarkScale : packoffset(c456.y);
    float _453_uBump : packoffset(c456.z);
    float _453_uRough : packoffset(c456.w);
    float _453_uVariation : packoffset(c457);
    float _453_uOriginalMix : packoffset(c457.y);
    float _453_uMoss : packoffset(c457.z);
    float _453_uMossRough : packoffset(c457.w);
    float _453_uMossEnabled : packoffset(c458);
    float _453_uPaintEnabled : packoffset(c458.y);
    float _453_uPaintHeight : packoffset(c458.z);
    float _453_uPaintWear : packoffset(c458.w);
    float _453_uPaintRough : packoffset(c459);
    float _453_uAOAmount : packoffset(c459.y);
    float _453_uSeed : packoffset(c459.z);
    float _453_uBarkAspect : packoffset(c459.w);
    float _453_uDirectional : packoffset(c460);
    float _453_uDetail : packoffset(c460.y);
    float _453_uRelief : packoffset(c460.z);
    float _453_uLichen : packoffset(c460.w);
    float _453_uLichenEnabled : packoffset(c461);
    float _453_uDirt : packoffset(c461.y);
    float _453_uDirtEnabled : packoffset(c461.z);
    float _453_uWet : packoffset(c461.w);
    float _453_uWetEnabled : packoffset(c462);
    int _453_uBarkStyle : packoffset(c462.y);
    int _453_uMaskChannel : packoffset(c462.z);
    uint _453_uPaintPacked : packoffset(c462.w);
    float4 _453_uPaintMaskRect : packoffset(c463);
    float4 _453_uPaintRects[48] : packoffset(c464);
    float4 _453_uPaintAdjust[16] : packoffset(c512);
    float3 _453_uPaintTint[16] : packoffset(c528);
    float4 _453_uPaintUVRegion : packoffset(c544);
};

Texture2D<float4> uMicroMap : register(t7, space0);
SamplerState _uMicroMap_sampler : register(s7, space0);
Texture2D<float4> uHeightMap : register(t4, space0);
SamplerState _uHeightMap_sampler : register(s4, space0);
Texture2D<float4> uNormalMap : register(t6, space0);
SamplerState _uNormalMap_sampler : register(s6, space0);
Texture2D<float4> uMaskMap1 : register(t3, space0);
SamplerState _uMaskMap1_sampler : register(s3, space0);
Texture2D<float4> uBakedORM : register(t10, space0);
SamplerState _uBakedORM_sampler : register(s10, space0);
Texture2D<float4> uMaskMap0 : register(t2, space0);
SamplerState _uMaskMap0_sampler : register(s2, space0);
Texture2D<float4> uMaskMap2 : register(t11, space0);
SamplerState _uMaskMap2_sampler : register(s11, space0);
Texture2D<float4> uMaskMap3 : register(t12, space0);
SamplerState _uMaskMap3_sampler : register(s12, space0);
Texture2D<float4> uRoughMap : register(t5, space0);
SamplerState _uRoughMap_sampler : register(s5, space0);
Texture2D<float4> uBark : register(t0, space0);
SamplerState _uBark_sampler : register(s0, space0);
Texture2D<float4> uOriginal : register(t1, space0);
SamplerState _uOriginal_sampler : register(s1, space0);
Texture2D<float4> uBakedColor : register(t8, space0);
SamplerState _uBakedColor_sampler : register(s8, space0);
Texture2D<float4> uBakedNormal : register(t9, space0);
SamplerState _uBakedNormal_sampler : register(s9, space0);

static float vSculpt;
static float3 vFlowPosition;
static float3 vFlowAcross;
static float3 vGrowth;
static float3 vFlowAxis;
static float3 vP;
static float4 vMask0;
static float2 vMask1;
static float2 vSourceUV;
static float2 vUV;
static float4 outColor;
static float3 vN;
static float vAO;
static float4 vT;

struct SPIRV_Cross_Input
{
    float3 vP : TEXCOORD0;
    float3 vN : TEXCOORD1;
    float2 vUV : TEXCOORD2;
    float2 vSourceUV : TEXCOORD3;
    float4 vT : TEXCOORD4;
    float vAO : TEXCOORD5;
    float4 vMask0 : TEXCOORD6;
    float2 vMask1 : TEXCOORD7;
    float3 vGrowth : TEXCOORD8;
    float3 vFlowPosition : TEXCOORD9;
    float3 vFlowAcross : TEXCOORD10;
    float3 vFlowAxis : TEXCOORD11;
    float vSculpt : TEXCOORD12;
};

struct SPIRV_Cross_Output
{
    float4 outColor : SV_Target0;
};

static int surfaceEffectSlot;
static float3 surfaceEmission;
static float materialBarkWeight;
static float materialPaintWeight;
static float materialMossWeight;
static float lastMaterialCoverage;
static float3 continuousBarkWeights;
static float materialHeights[16];
static float materialWeights[16];

float mod(float x, float y)
{
    return x - y * floor(x / y);
}

float2 mod(float2 x, float2 y)
{
    return x - y * floor(x / y);
}

float3 mod(float3 x, float3 y)
{
    return x - y * floor(x / y);
}

float4 mod(float4 x, float4 y)
{
    return x - y * floor(x / y);
}

uint2 spvTextureSize(Texture2D<float4> Tex, uint Level, out uint Param)
{
    uint2 ret;
    Tex.GetDimensions(Level, ret.x, ret.y, Param);
    return ret;
}

void prepareBarkProjection()
{
    continuousBarkWeights = float3(0.0f, 0.0f, 1.0f);
    bool _1762 = _453_uDirectional > 0.5f;
    bool _1769;
    if (_1762)
    {
        _1769 = _453_uDirectionMode > 4.5f;
    }
    else
    {
        _1769 = _1762;
    }
    if (_1769 && (_453_uHasBarkFlow != 0u))
    {
        float3 face = cross(ddx(vFlowPosition), ddy(vFlowPosition));
        float len = length(face);
        float3 _1790;
        if (len > 9.9999996826552253889678874634872e-21f)
        {
            _1790 = abs(face / len.xxx);
        }
        else
        {
            _1790 = float3(0.0f, 0.0f, 1.0f);
        }
        face = _1790;
        float3 n = vFlowAcross;
        float nl = length(n);
        float3 _1809;
        if (nl > 9.9999999392252902907785028219223e-09f)
        {
            _1809 = n / nl.xxx;
        }
        else
        {
            _1809 = face;
        }
        n = _1809;
        float3 w = pow(abs(n), 5.0f.xxx) * smoothstep(0.449999988079071044921875f.xxx, 0.64999997615814208984375f.xxx, face);
        float sum = dot(w, 1.0f.xxx);
        if (sum < 9.9999999392252902907785028219223e-09f)
        {
            w = pow(face, 5.0f.xxx) * smoothstep(0.449999988079071044921875f.xxx, 0.64999997615814208984375f.xxx, face);
            sum = dot(w, 1.0f.xxx);
        }
        continuousBarkWeights = w / max(sum, 9.9999996826552253889678874634872e-21f).xxx;
    }
}

float3x3 growthFrame()
{
    float3 a = normalize(vGrowth + float3(0.0f, 9.9999997473787516355514526367188e-06f, 0.0f));
    if (a.y < (-0.99989998340606689453125f))
    {
        return float3x3(float3(1.0f, 0.0f, 0.0f), float3(a), float3(0.0f, 0.0f, -1.0f));
    }
    float b = 1.0f / (1.0f + a.y);
    return float3x3(float3(float3(1.0f - ((a.x * a.x) * b), -a.x, ((-a.x) * a.z) * b)), float3(a), float3(float3(((-a.x) * a.z) * b, -a.z, 1.0f - ((a.z * a.z) * b))));
}

float3x3 barkFrame()
{
    if (_453_uDirectionMode > 4.5f)
    {
        float3 y = normalize(vFlowAxis);
        bool3 _2032 = (abs(y.x) < 0.800000011920928955078125f).xxx;
        float3 x = float3(_2032.x ? float3(1.0f, 0.0f, 0.0f).x : float3(0.0f, 0.0f, 1.0f).x, _2032.y ? float3(1.0f, 0.0f, 0.0f).y : float3(0.0f, 0.0f, 1.0f).y, _2032.z ? float3(1.0f, 0.0f, 0.0f).z : float3(0.0f, 0.0f, 1.0f).z);
        x = normalize(x - (y * dot(x, y)));
        return float3x3(float3(x), float3(y), float3(normalize(cross(x, y))));
    }
    if (_453_uDirectionMode < 1.5f)
    {
        return float3x3(float3(1.0f, 0.0f, 0.0f), float3(0.0f, 1.0f, 0.0f), float3(0.0f, 0.0f, 1.0f));
    }
    if ((_453_uDirectionMode > 2.5f) && (_453_uHasBarkFlow != 0u))
    {
        float3 y_1 = normalize(vFlowAxis);
        float3 x_1 = normalize(vFlowAcross - (y_1 * dot(y_1, vFlowAcross)));
        return float3x3(float3(x_1), float3(y_1), float3(normalize(cross(x_1, y_1))));
    }
    return growthFrame();
}

float3 barkProjectionNormal(float3 n)
{
    if (_453_uDirectional < 0.5f)
    {
        return n;
    }
    if ((_453_uDirectionMode > 4.5f) && (_453_uHasBarkFlow != 0u))
    {
        float len = length(vFlowAcross);
        if (len > 9.9999999392252902907785028219223e-09f)
        {
            return vFlowAcross / len.xxx;
        }
    }
    if ((_453_uDirectionMode > 3.5f) && (_453_uHasBarkFlow != 0u))
    {
        float3 mapped = cross(ddx(vFlowPosition), ddy(vFlowPosition));
        float len_1 = length(mapped);
        if (len_1 > 9.9999996826552253889678874634872e-21f)
        {
            return mapped / len_1.xxx;
        }
    }
    return mul(n, transpose(barkFrame()));
}

float3 barkProjectionWeights(float3 n)
{
    bool _1850 = _453_uDirectional > 0.5f;
    bool _1856;
    if (_1850)
    {
        _1856 = _453_uDirectionMode > 4.5f;
    }
    else
    {
        _1856 = _1850;
    }
    if (_1856 && (_453_uHasBarkFlow != 0u))
    {
        return continuousBarkWeights;
    }
    float3 w = pow(abs(n), 5.0f.xxx);
    return w / max(dot(w, 1.0f.xxx), 9.9999997473787516355514526367188e-05f).xxx;
}

float4 mask0(float2 uv)
{
    float4 _7654;
    if (_453_uPixelMasks != 0u)
    {
        _7654 = uMaskMap0.Sample(_uMaskMap0_sampler, uv);
    }
    else
    {
        _7654 = vMask0;
    }
    return _7654;
}

float2 mask1(float2 uv)
{
    float2 _7670;
    if (_453_uPixelMasks != 0u)
    {
        _7670 = uMaskMap1.Sample(_uMaskMap1_sampler, uv).xy;
    }
    else
    {
        _7670 = vMask1;
    }
    return _7670;
}

float4 paintSample(float2 uv, float4 rect)
{
    float2 q = clamp((uv - _453_uPaintUVRegion.xy) / _453_uPaintUVRegion.zw, 0.0f.xx, 1.0f.xx);
    uint _2886_dummy_parameter;
    float2 size = float2(int2(spvTextureSize(uMaskMap1, uint(0), _2886_dummy_parameter)));
    float2 dx = ddx(uv / _453_uPaintUVRegion.zw) * rect.zw;
    float2 dy = ddy(uv / _453_uPaintUVRegion.zw) * rect.zw;
    float lod = clamp(log2(max(max(length(dx), length(dy)), 1.0f)), 0.0f, log2(rect.z) - 2.0f);
    float margin = 0.5f * exp2(ceil(lod));
    float2 _point = rect.xy + clamp(q * rect.zw, margin.xx, rect.zw - margin.xx);
    return uMaskMap1.SampleLevel(_uMaskMap1_sampler, _point / size, lod);
}

float effectMask(int slot, float2 uv)
{
    if (slot < 4)
    {
        return uMaskMap0.Sample(_uMaskMap0_sampler, uv)[slot];
    }
    if (slot < 8)
    {
        float4 _4223;
        if (_453_uPaintPacked != 0u)
        {
            float2 param = uv;
            float4 param_1 = _453_uPaintMaskRect;
            _4223 = paintSample(param, param_1);
        }
        else
        {
            _4223 = uMaskMap1.Sample(_uMaskMap1_sampler, uv);
        }
        return _4223[slot - 4];
    }
    if (slot < 12)
    {
        return uMaskMap2.Sample(_uMaskMap2_sampler, uv)[slot - 8];
    }
    return uMaskMap3.Sample(_uMaskMap3_sampler, uv)[slot - 12];
}

float3 tileMap(Texture2D<float4> map, SamplerState _map_sampler, inout float2 uv)
{
    uv.y *= _453_uBarkAspect;
    float2 dx = ddx(uv);
    float2 dy = ddy(uv);
    float2 p = frac(uv);
    float2 edge = min(p, 1.0f.xx - p);
    float2 blend = 1.0f.xx - smoothstep(0.0f.xx, 0.054999999701976776123046875f.xx, edge);
    float3 a = map.SampleGrad(_map_sampler, p, dx, dy).xyz;
    if (blend.x > 0.0f)
    {
        a = lerp(a, map.SampleGrad(_map_sampler, float2(frac(p.x + 0.5f), p.y), dx, dy).xyz, blend.x.xxx);
    }
    if (blend.y > 0.0f)
    {
        float3 b = map.SampleGrad(_map_sampler, float2(p.x, frac(p.y + 0.5f)), dx, dy).xyz;
        if (blend.x > 0.0f)
        {
            b = lerp(b, map.SampleGrad(_map_sampler, frac(p + 0.5f.xx), dx, dy).xyz, blend.x.xxx);
        }
        a = lerp(a, b, blend.y.xxx);
    }
    return a;
}

float3 triplanarMap(Texture2D<float4> map, SamplerState _map_sampler, inout float3 p, float3 n)
{
    float3 param = n;
    float3 w = barkProjectionWeights(param);
    p = (p * _453_uBarkScale) + float3(_453_uSeed * 0.731000006198883056640625f, _453_uSeed * 0.310000002384185791015625f, _453_uSeed * 0.517000019550323486328125f);
    float2 param_1 = p.zy;
    float3 _1904 = tileMap(map, _map_sampler, param_1);
    float2 param_2 = p.xz;
    float3 _1911 = tileMap(map, _map_sampler, param_2);
    float2 param_3 = p.xy;
    float3 _1919 = tileMap(map, _map_sampler, param_3);
    return ((_1904 * w.x) + (_1911 * w.y)) + (_1919 * w.z);
}

float3 flowDisplacement(float3 displacement)
{
    float3 a = ddx(vP);
    float3 b = ddy(vP);
    float aa = dot(a, a);
    float bb = dot(b, b);
    float ab = dot(a, b);
    float det = (aa * bb) - (ab * ab);
    if (det < 1.0000000031710768509710513471353e-30f)
    {
        return mul(displacement, transpose(barkFrame()));
    }
    float da = dot(displacement, a);
    float db = dot(displacement, b);
    return (ddx(vFlowPosition) * (((da * bb) - (db * ab)) / det)) + (ddy(vFlowPosition) * (((db * aa) - (da * ab)) / det));
}

float3 barkCoordinates(float3 p)
{
    if (_453_uDirectional < 0.5f)
    {
        return p;
    }
    if ((_453_uDirectionMode > 2.5f) && (_453_uHasBarkFlow != 0u))
    {
        float3 param = p - vP;
        return vFlowPosition + flowDisplacement(param);
    }
    return mul(p, transpose(barkFrame()));
}

float3 barkMapSample(Texture2D<float4> map, SamplerState _map_sampler, float3 p, float3 n)
{
    if (_453_uDirectional < 0.5f)
    {
        float3 param = p;
        float3 param_1 = n;
        float3 _2285 = triplanarMap(map, _map_sampler, param, param_1);
        return _2285;
    }
    float3 param_2 = p;
    float3 param_3 = n;
    float3 param_4 = barkCoordinates(param_2);
    float3 param_5 = barkProjectionNormal(param_3);
    float3 _2295 = triplanarMap(map, _map_sampler, param_4, param_5);
    return _2295;
}

float hash(inout float3 p)
{
    p = frac(p * 0.103100001811981201171875f);
    p += dot(p, p.yzx + 33.3300018310546875f.xxx).xxx;
    return frac((p.x + p.y) * p.z);
}

float _noise(float3 p)
{
    float3 i = floor(p);
    float3 f = frac(p);
    f = (f * f) * (3.0f.xxx - (f * 2.0f));
    float3 param = i;
    float _828 = hash(param);
    float3 param_1 = i + float3(1.0f, 0.0f, 0.0f);
    float _833 = hash(param_1);
    float3 param_2 = i + float3(0.0f, 1.0f, 0.0f);
    float _841 = hash(param_2);
    float3 param_3 = i + float3(1.0f, 1.0f, 0.0f);
    float _846 = hash(param_3);
    float3 param_4 = i + float3(0.0f, 0.0f, 1.0f);
    float _857 = hash(param_4);
    float3 param_5 = i + float3(1.0f, 0.0f, 1.0f);
    float _862 = hash(param_5);
    float3 param_6 = i + float3(0.0f, 1.0f, 1.0f);
    float _870 = hash(param_6);
    float3 param_7 = i + 1.0f.xxx;
    float _874 = hash(param_7);
    return lerp(lerp(lerp(_828, _833, f.x), lerp(_841, _846, f.x), f.y), lerp(lerp(_857, _862, f.x), lerp(_870, _874, f.x), f.y), f.z);
}

float3 fromSRGB(float3 c)
{
    return lerp(c / 12.9200000762939453125f.xxx, pow((c + 0.054999999701976776123046875f.xxx) / 1.05499994754791259765625f.xxx, 2.400000095367431640625f.xxx), step(0.040449999272823333740234375f.xxx, c));
}

float3 toSRGB(float3 c)
{
    return lerp(c * 12.9200000762939453125f, (pow(max(c, 0.0f.xxx), 0.4166666567325592041015625f.xxx) * 1.05499994754791259765625f) - 0.054999999701976776123046875f.xxx, step(0.003130800090730190277099609375f.xxx, c));
}

float heightLOD(float2 uv)
{
    uint _1596_dummy_parameter;
    float2 size = float2(int2(spvTextureSize(uHeightMap, uint(0), _1596_dummy_parameter)));
    float rho = max(length(ddx(uv) * size), length(ddy(uv) * size));
    float _1618;
    if (_453_uFloatHeight != 0u)
    {
        _1618 = float(_453_uHeightLevels - 1);
    }
    else
    {
        _1618 = floor(log2(max(size.x, size.y)));
    }
    return clamp(log2(max(rho, 1.0f)), 0.0f, _1618);
}

float heightBilinear(float2 uv, int level)
{
    uint _1505_dummy_parameter;
    int2 size = int2(spvTextureSize(uHeightMap, uint(level), _1505_dummy_parameter));
    float2 q = (frac(uv) * float2(size)) - 0.5f.xx;
    float2 f = frac(q);
    int2 i = int2(floor(q));
    int2 a = int2(((i.x % size.x) + size.x) % size.x, ((i.y % size.y) + size.y) % size.y);
    int2 b = (a + int2(1, 1)) % size;
    return lerp(lerp(uHeightMap.Load(int3(a, level)).x, uHeightMap.Load(int3(int2(b.x, a.y), level)).x, f.x), lerp(uHeightMap.Load(int3(int2(a.x, b.y), level)).x, uHeightMap.Load(int3(b, level)).x, f.x), f.y);
}

float heightSample(float2 uv, float lod)
{
    int lo = int(floor(lod));
    int hi = min((lo + 1), (_453_uHeightLevels - 1));
    float2 param = uv;
    int param_1 = lo;
    float2 param_2 = uv;
    int param_3 = hi;
    return lerp(heightBilinear(param, param_1), heightBilinear(param_2, param_3), frac(lod));
}

float heightTile(inout float2 uv)
{
    if (!(_453_uFloatHeight != 0u))
    {
        float2 param = uv;
        float3 _1672 = tileMap(uHeightMap, _uHeightMap_sampler, param);
        return _1672.x;
    }
    uv.y *= _453_uBarkAspect;
    float2 param_1 = uv;
    float lod = heightLOD(param_1);
    float2 p = frac(uv);
    float2 edge = min(p, 1.0f.xx - p);
    float2 blend = 1.0f.xx - smoothstep(0.0f.xx, 0.054999999701976776123046875f.xx, edge);
    float2 param_2 = uv;
    float param_3 = lod;
    float a = heightSample(param_2, param_3);
    if (blend.x > 0.0f)
    {
        float2 param_4 = uv + float2(0.5f, 0.0f);
        float param_5 = lod;
        a = lerp(a, heightSample(param_4, param_5), blend.x);
    }
    if (blend.y > 0.0f)
    {
        float2 param_6 = uv + float2(0.0f, 0.5f);
        float param_7 = lod;
        float b = heightSample(param_6, param_7);
        if (blend.x > 0.0f)
        {
            float2 param_8 = uv + 0.5f.xx;
            float param_9 = lod;
            b = lerp(b, heightSample(param_8, param_9), blend.x);
        }
        a = lerp(a, b, blend.y);
    }
    return a;
}

float barkHeight(float3 p, float3 n)
{
    float3 param = p;
    float3 q = barkCoordinates(param);
    float3 param_1 = n;
    float3 nn = barkProjectionNormal(param_1);
    float3 param_2 = nn;
    float3 w = barkProjectionWeights(param_2);
    q = (q * _453_uBarkScale) + float3(_453_uSeed * 0.731000006198883056640625f, _453_uSeed * 0.310000002384185791015625f, _453_uSeed * 0.517000019550323486328125f);
    float2 param_3 = q.zy;
    float _2328 = heightTile(param_3);
    float2 param_4 = q.xz;
    float _2335 = heightTile(param_4);
    float2 param_5 = q.xy;
    float _2343 = heightTile(param_5);
    return ((_2328 * w.x) + (_2335 * w.y)) + (_2343 * w.z);
}

float coarseHeightTile(inout float2 uv, float minimumLevel)
{
    uv.y *= _453_uBarkAspect;
    uint _2359_dummy_parameter;
    uint _2363_dummy_parameter;
    float maxLevel = floor(log2(float(max(int2(spvTextureSize(uHeightMap, uint(0), _2359_dummy_parameter)).x, int2(spvTextureSize(uHeightMap, uint(0), _2363_dummy_parameter)).y))));
    float _2372;
    if (minimumLevel < 0.0f)
    {
        _2372 = -minimumLevel;
    }
    else
    {
        float2 param = uv;
        _2372 = max(minimumLevel, heightLOD(param));
    }
    float lod = _2372;
    lod = min(lod, maxLevel);
    float2 p = frac(uv);
    float2 edge = min(p, 1.0f.xx - p);
    float2 blend = 1.0f.xx - smoothstep(0.0f.xx, 0.054999999701976776123046875f.xx, edge);
    float _2405;
    if (_453_uFloatHeight != 0u)
    {
        float2 param_1 = p;
        float param_2 = min(lod, float(_453_uHeightLevels - 1));
        _2405 = heightSample(param_1, param_2);
    }
    else
    {
        _2405 = uHeightMap.SampleLevel(_uHeightMap_sampler, p, lod).x;
    }
    float a = _2405;
    if (blend.x > 0.0f)
    {
        float _2434;
        if (_453_uFloatHeight != 0u)
        {
            float2 param_3 = p + float2(0.5f, 0.0f);
            float param_4 = min(lod, float(_453_uHeightLevels - 1));
            _2434 = heightSample(param_3, param_4);
        }
        else
        {
            _2434 = uHeightMap.SampleLevel(_uHeightMap_sampler, frac(p + float2(0.5f, 0.0f)), lod).x;
        }
        a = lerp(a, _2434, blend.x);
    }
    if (blend.y > 0.0f)
    {
        float2 v = p + float2(0.0f, 0.5f);
        float _2472;
        if (_453_uFloatHeight != 0u)
        {
            float2 param_5 = v;
            float param_6 = min(lod, float(_453_uHeightLevels - 1));
            _2472 = heightSample(param_5, param_6);
        }
        else
        {
            _2472 = uHeightMap.SampleLevel(_uHeightMap_sampler, frac(v), lod).x;
        }
        float b = _2472;
        if (blend.x > 0.0f)
        {
            float _2502;
            if (_453_uFloatHeight != 0u)
            {
                float2 param_7 = p + 0.5f.xx;
                float param_8 = min(lod, float(_453_uHeightLevels - 1));
                _2502 = heightSample(param_7, param_8);
            }
            else
            {
                _2502 = uHeightMap.SampleLevel(_uHeightMap_sampler, frac(p + 0.5f.xx), lod).x;
            }
            b = lerp(b, _2502, blend.x);
        }
        a = lerp(a, b, blend.y);
    }
    return a;
}

float coarseBarkHeight(float3 p, float3 n, float level)
{
    float3 param = p;
    float3 q = barkCoordinates(param);
    float3 param_1 = n;
    float3 nn = barkProjectionNormal(param_1);
    float3 param_2 = nn;
    float3 w = barkProjectionWeights(param_2);
    q = (q * _453_uBarkScale) + float3(_453_uSeed * 0.731000006198883056640625f, _453_uSeed * 0.310000002384185791015625f, _453_uSeed * 0.517000019550323486328125f);
    float h = 0.0f;
    if (w.x > 9.9999997473787516355514526367188e-05f)
    {
        float2 param_3 = q.zy;
        float param_4 = level;
        float _2576 = coarseHeightTile(param_3, param_4);
        h += (_2576 * w.x);
    }
    if (w.y > 9.9999997473787516355514526367188e-05f)
    {
        float2 param_5 = q.xz;
        float param_6 = level;
        float _2592 = coarseHeightTile(param_5, param_6);
        h += (_2592 * w.y);
    }
    if (w.z > 9.9999997473787516355514526367188e-05f)
    {
        float2 param_7 = q.xy;
        float param_8 = level;
        float _2608 = coarseHeightTile(param_7, param_8);
        h += (_2608 * w.z);
    }
    return h;
}

float cavityAt(float3 p, float3 n)
{
    float3 param = p;
    float3 param_1 = n;
    float param_2 = -4.0f;
    float3 param_3 = p;
    float3 param_4 = n;
    float param_5 = -1.0f;
    return smoothstep(0.004999999888241291046142578125f, 0.07500000298023223876953125f, max(0.0f, coarseBarkHeight(param, param_1, param_2) - coarseBarkHeight(param_3, param_4, param_5)));
}

float barkCavityAO(float3 p, float3 n)
{
    bool _2640 = !(_453_uHasHeightMap != 0u);
    bool _2648;
    if (!_2640)
    {
        _2648 = _453_uBarkCavity <= 0.0f;
    }
    else
    {
        _2648 = _2640;
    }
    if (_2648)
    {
        return 1.0f;
    }
    float3 dx = ddx(p) * 0.25f;
    float3 dy = ddy(p) * 0.25f;
    float3 param = (p + dx) + dy;
    float3 param_1 = n;
    float3 param_2 = (p + dx) - dy;
    float3 param_3 = n;
    float3 param_4 = (p - dx) + dy;
    float3 param_5 = n;
    float3 param_6 = (p - dx) - dy;
    float3 param_7 = n;
    float cavity = (((cavityAt(param, param_1) + cavityAt(param_2, param_3)) + cavityAt(param_4, param_5)) + cavityAt(param_6, param_7)) * 0.25f;
    return 1.0f - ((_453_uBarkCavity * 0.64999997615814208984375f) * cavity);
}

float layerMask(int id, float4 a, float2 b)
{
    float _7686;
    if (id < 4)
    {
        _7686 = a[id];
    }
    else
    {
        _7686 = b[id - 4];
    }
    return _7686;
}

float2 shiftedUV(float3 displacement)
{
    float3 a = ddx(vP);
    float3 b = ddy(vP);
    float aa = dot(a, a);
    float bb = dot(b, b);
    float ab = dot(a, b);
    float det = (aa * bb) - (ab * ab);
    if (det < 1.0000000031710768509710513471353e-30f)
    {
        return vUV;
    }
    float da = dot(displacement, a);
    float db = dot(displacement, b);
    return (vUV + (ddx(vUV) * (((da * bb) - (db * ab)) / det))) + (ddy(vUV) * (((db * aa) - (da * ab)) / det));
}

float effectParameter(int field, float fallback)
{
    if (surfaceEffectSlot < 0)
    {
        return fallback;
    }
    return _453_uEffectData[(surfaceEffectSlot * 10) + (field / 4)][field % 4];
}

float4 paintColony(float3 p, float meters, float3 phase)
{
    float3 q = ((p * _453_uTreeHeight) / meters.xxx) + phase;
    float3 i = floor(q);
    float3 f = frac(q);
    float3 u = (f * f) * (3.0f.xxx - (f * 2.0f));
    float3 du = (f * 6.0f) * (1.0f.xxx - f);
    float3 param = i;
    float _3349 = hash(param);
    float a = _3349;
    float3 param_1 = i + float3(1.0f, 0.0f, 0.0f);
    float _3354 = hash(param_1);
    float b = _3354;
    float3 param_2 = i + float3(0.0f, 1.0f, 0.0f);
    float _3359 = hash(param_2);
    float c = _3359;
    float3 param_3 = i + float3(1.0f, 1.0f, 0.0f);
    float _3364 = hash(param_3);
    float d = _3364;
    float3 param_4 = i + float3(0.0f, 0.0f, 1.0f);
    float _3369 = hash(param_4);
    float e = _3369;
    float3 param_5 = i + float3(1.0f, 0.0f, 1.0f);
    float _3374 = hash(param_5);
    float g = _3374;
    float3 param_6 = i + float3(0.0f, 1.0f, 1.0f);
    float _3379 = hash(param_6);
    float h = _3379;
    float3 param_7 = i + 1.0f.xxx;
    float _3384 = hash(param_7);
    float j = _3384;
    float x0 = lerp(a, b, u.x);
    float x1 = lerp(c, d, u.x);
    float x2 = lerp(e, g, u.x);
    float x3 = lerp(h, j, u.x);
    float y0 = lerp(x0, x1, u.y);
    float y1 = lerp(x2, x3, u.y);
    float3 grad = float3(lerp(lerp(b - a, d - c, u.y), lerp(g - e, j - h, u.y), u.z) * du.x, lerp(x1 - x0, x3 - x2, u.z) * du.y, (y1 - y0) * du.z) / meters.xxx;
    float footprint = max(length((ddx(vP) * _453_uTreeHeight) / meters.xxx), length((ddy(vP) * _453_uTreeHeight) / meters.xxx));
    float keep = 1.0f - smoothstep(0.3499999940395355224609375f, 1.14999997615814208984375f, footprint);
    return float4(grad * keep, lerp(0.5f, lerp(y0, y1, u.z), keep));
}

float3 coatBilinear(float2 uv, int tile, int level)
{
    uint _4267_dummy_parameter;
    int2 size = int2(spvTextureSize(uBakedORM, uint(level), _4267_dummy_parameter));
    uint _4272_dummy_parameter;
    bool grid = int2(spvTextureSize(uBakedORM, uint(0), _4272_dummy_parameter)).x >= 8192;
    int2 _4277;
    if (grid)
    {
        _4277 = max(1, (1024 >> level)).xx;
    }
    else
    {
        uint _4292_dummy_parameter;
        uint _4296_dummy_parameter;
        _4277 = int2(size.x, max(1, (size.y / max(1, (int2(spvTextureSize(uBakedORM, uint(0), _4292_dummy_parameter)).y / int2(spvTextureSize(uBakedORM, uint(0), _4296_dummy_parameter)).x)))));
    }
    int2 ts = _4277;
    float2 q = (frac(uv) * float2(ts)) - 0.5f.xx;
    float2 f = frac(q);
    int2 i = int2(floor(q));
    int2 a = int2(((i.x % ts.x) + ts.x) % ts.x, ((i.y % ts.y) + ts.y) % ts.y);
    int2 b = (a + int2(1, 1)) % ts;
    int2 _4351;
    if (grid)
    {
        _4351 = int2(tile * ts.x, 0);
    }
    else
    {
        _4351 = int2(0, tile * ts.y);
    }
    int2 offset = _4351;
    a += offset;
    b += offset;
    return lerp(lerp(uBakedORM.Load(int3(a, level)).xyz, uBakedORM.Load(int3(int2(b.x, a.y), level)).xyz, f.x.xxx), lerp(uBakedORM.Load(int3(int2(a.x, b.y), level)).xyz, uBakedORM.Load(int3(b, level)).xyz, f.x.xxx), f.y.xxx);
}

float3 paintMossTile(float2 uv, float2 dx, float2 dy, int tile)
{
    uint _2954_dummy_parameter;
    float _2958;
    if (int2(spvTextureSize(uBakedORM, uint(0), _2954_dummy_parameter)).x >= 8192)
    {
        _2958 = 1024.0f;
    }
    else
    {
        uint _2965_dummy_parameter;
        _2958 = float(int2(spvTextureSize(uBakedORM, uint(0), _2965_dummy_parameter)).x);
    }
    float width = _2958;
    float top = floor(log2(width));
    float lod = clamp(log2(max(max(length(dx * width), length(dy * width)), 1.0f)), 0.0f, top);
    int lo = int(floor(lod));
    int hi = min((lo + 1), int(top));
    float2 param = uv;
    int param_1 = tile;
    int param_2 = lo;
    float2 param_3 = uv;
    int param_4 = tile;
    int param_5 = hi;
    return lerp(coatBilinear(param, param_1, param_2), coatBilinear(param_3, param_4, param_5), frac(lod).xxx);
}

float3 paintMossMap(float3 p, float3 n, float width, float3 phase, int tile)
{
    float3 q = ((p * _453_uTreeHeight) / width.xxx) + phase;
    float3 dx = (ddx(vP) * _453_uTreeHeight) / width.xxx;
    float3 dy = (ddy(vP) * _453_uTreeHeight) / width.xxx;
    float3 w = pow(abs(n), 5.0f.xxx);
    w /= max(dot(w, 1.0f.xxx), 9.9999997473787516355514526367188e-05f).xxx;
    float3 value = 0.0f.xxx;
    if (w.x > 9.9999997473787516355514526367188e-05f)
    {
        float2 param = q.zy;
        float2 param_1 = dx.zy;
        float2 param_2 = dy.zy;
        int param_3 = tile;
        value += (paintMossTile(param, param_1, param_2, param_3) * w.x);
    }
    if (w.y > 9.9999997473787516355514526367188e-05f)
    {
        float2 param_4 = q.xz;
        float2 param_5 = dx.xz;
        float2 param_6 = dy.xz;
        int param_7 = tile;
        value += (paintMossTile(param_4, param_5, param_6, param_7) * w.y);
    }
    if (w.z > 9.9999997473787516355514526367188e-05f)
    {
        float2 param_8 = q.xy;
        float2 param_9 = dx.xy;
        float2 param_10 = dy.xy;
        int param_11 = tile;
        value += (paintMossTile(param_8, param_9, param_10, param_11) * w.z);
    }
    return value;
}

float mossSurfaceCoverage(float macro, float leaf, float pocket, float porosity)
{
    float m = macro * lerp(0.920000016689300537109375f + (leaf * 0.07999999821186065673828125f), leaf, 1.0f - smoothstep(0.100000001490116119384765625f, 0.800000011920928955078125f, macro));
    if (porosity > 0.0f)
    {
        m *= smoothstep(porosity * 0.4000000059604644775390625f, (porosity * 0.4000000059604644775390625f) + 0.180000007152557373046875f, leaf + ((pocket - 0.5f) * 0.100000001490116119384765625f));
    }
    return m;
}

float3 mossSurfaceColor(float3 atlasColor, float3 tint)
{
    return (atlasColor * (dot(tint, float3(0.2125999927520751953125f, 0.715200006961822509765625f, 0.072200000286102294921875f)) / max(0.00999999977648258209228515625f, dot(_453_uCoatMossMean, float3(0.2125999927520751953125f, 0.715200006961822509765625f, 0.072200000286102294921875f))))) * (tint / float3(0.2745099961757659912109375f, 0.32548999786376953125f, 0.21175999939441680908203125f));
}

float mossSurfaceRoughness(float leafRough, float roughness)
{
    return clamp((leafRough * roughness) / 0.939999997615814208984375f, 0.20000000298023223876953125f, 1.0f);
}

float3 mossMapNormal(float3 p, float3 n, float width, float3 phase, int tile)
{
    float3 q = ((p * _453_uTreeHeight) / width.xxx) + phase;
    float3 dx = (ddx(vP) * _453_uTreeHeight) / width.xxx;
    float3 dy = (ddy(vP) * _453_uTreeHeight) / width.xxx;
    float3 w = pow(abs(n), 5.0f.xxx);
    w /= max(dot(w, 1.0f.xxx), 9.9999997473787516355514526367188e-05f).xxx;
    float3 gx = float3(1.0f, 0.0f, 0.0f) - (n * n.x);
    float3 gy = float3(0.0f, 1.0f, 0.0f) - (n * n.y);
    float3 gz = float3(0.0f, 0.0f, 1.0f) - (n * n.z);
    float3 g = 0.0f.xxx;
    if (w.x > 9.9999997473787516355514526367188e-05f)
    {
        float2 param = q.zy;
        float2 param_1 = dx.zy;
        float2 param_2 = dy.zy;
        int param_3 = tile;
        float3 v = normalize((paintMossTile(param, param_1, param_2, param_3) * 2.0f) - 1.0f.xxx);
        g += ((((gz * v.x) + (gy * v.y)) * w.x) / max(v.z, 0.07999999821186065673828125f).xxx);
    }
    if (w.y > 9.9999997473787516355514526367188e-05f)
    {
        float2 param_4 = q.xz;
        float2 param_5 = dx.xz;
        float2 param_6 = dy.xz;
        int param_7 = tile;
        float3 v_1 = normalize((paintMossTile(param_4, param_5, param_6, param_7) * 2.0f) - 1.0f.xxx);
        g += ((((gx * v_1.x) + (gz * v_1.y)) * w.y) / max(v_1.z, 0.07999999821186065673828125f).xxx);
    }
    if (w.z > 9.9999997473787516355514526367188e-05f)
    {
        float2 param_8 = q.xy;
        float2 param_9 = dx.xy;
        float2 param_10 = dy.xy;
        int param_11 = tile;
        float3 v_2 = normalize((paintMossTile(param_8, param_9, param_10, param_11) * 2.0f) - 1.0f.xxx);
        g += ((((gx * v_2.x) + (gy * v_2.y)) * w.z) / max(v_2.z, 0.07999999821186065673828125f).xxx);
    }
    return (g * 0.20000000298023223876953125f) / width.xxx;
}

float mossSurfaceAO(float atlasAO, float strength)
{
    return 1.0f - ((1.0f - atlasAO) * strength);
}

Surface paintedLayer(inout Surface s, float3 p, float3 n, float2 uv, int slot, float4 cfg, float amount)
{
    float2 param = uv;
    float4 param_1 = _453_uPaintRects[slot * 3];
    float4 color = paintSample(param, param_1);
    float coverage = color.w;
    float denom = max(coverage, 9.9999999747524270787835121154785e-07f);
    float2 param_2 = uv;
    float4 param_3 = _453_uPaintRects[(slot * 3) + 1];
    float4 params = paintSample(param_2, param_3) / denom.xxxx;
    float2 param_4 = uv;
    float4 param_5 = _453_uPaintRects[(slot * 3) + 2];
    float4 data = paintSample(param_4, param_5) / denom.xxxx;
    float4 adjust = _453_uPaintAdjust[slot];
    float denseStyle = step(1.5f, adjust.x);
    float width = clamp(params.w, 0.0500000007450580596923828125f, 1.0f);
    float clump = clamp(params.z * 0.20000000298023223876953125f, 0.004999999888241291046142578125f, 0.20000000298023223876953125f);
    float seed = _453_uEffectMeta[slot].y;
    float3 legacyPhase = float3(17.700000762939453125f, 9.30000019073486328125f, 13.1000003814697265625f) + (float3(0.17000000178813934326171875f, 0.23000000417232513427734375f, 0.310000002384185791015625f) * seed);
    float3 phase = lerp(legacyPhase, float3(_453_uSeed * 0.17000000178813934326171875f, _453_uSeed * 0.23000000417232513427734375f, _453_uSeed * 0.310000002384185791015625f), denseStyle.xxx);
    float surfaceSeed = _453_uSeed + seed;
    float3 noisePhase = lerp(legacyPhase, float3((surfaceSeed * 0.37000000476837158203125f) + 17.0f, (surfaceSeed * 0.61000001430511474609375f) + 3.0f, (surfaceSeed * 0.430000007152557373046875f) + 7.0f), denseStyle.xxx);
    float3 param_6 = p;
    float param_7 = clump;
    float3 param_8 = noisePhase + 67.0f.xxx;
    float4 colony = paintColony(param_6, param_7, param_8);
    float3 _3712;
    if (_453_uCoatEnabled != 0u)
    {
        float3 param_9 = p;
        float3 param_10 = n;
        float param_11 = width;
        float3 param_12 = phase;
        int param_13 = 3;
        _3712 = paintMossMap(param_9, param_10, param_11, param_12, param_13);
    }
    else
    {
        float3 param_14 = ((p * _453_uTreeHeight) / 0.00200000009499490261077880859375f.xxx) + phase;
        _3712 = float3(_noise(param_14), 0.939999997615814208984375f, 0.0f);
    }
    float3 leaf = _3712;
    float cut = lerp(0.819999992847442626953125f, 0.180000007152557373046875f, clamp(data.w, 0.0f, 1.0f));
    float edge = max(0.02500000037252902984619140625f, min(0.2199999988079071044921875f, length(colony.xyz) * max(length(ddx(vP) * _453_uTreeHeight), length(ddy(vP) * _453_uTreeHeight))));
    float _3769;
    if (data.w <= 0.0f)
    {
        _3769 = 0.0f;
    }
    else
    {
        _3769 = smoothstep(cut - edge, cut + edge, colony.w + ((leaf.x - 0.5f) * 0.07999999821186065673828125f));
    }
    float clusters = _3769;
    float leafMask = smoothstep(0.2199999988079071044921875f, 0.439999997615814208984375f, leaf.x);
    float3 param_15 = p;
    float param_16 = 0.0199999995529651641845703125f;
    float3 param_17 = noisePhase + 83.0f.xxx;
    float pocket = paintColony(param_15, param_16, param_17).w;
    float param_18 = 1.0f;
    float param_19 = leaf.x;
    float param_20 = pocket;
    float param_21 = 1.0f - data.w;
    coverage *= lerp(clusters * leafMask, mossSurfaceCoverage(param_18, param_19, param_20, param_21), denseStyle);
    float alpha = clamp(coverage * amount, 0.0f, 1.0f);
    float keep = clamp(data.z, 0.0f, 1.0f);
    float3 pigment = color.xyz / denom.xxx;
    if (_453_uCoatEnabled != 0u)
    {
        float3 param_22 = p;
        float3 param_23 = n;
        float param_24 = width;
        float3 param_25 = phase;
        int param_26 = 0;
        float3 sourceColor = paintMossMap(param_22, param_23, param_24, param_25, param_26);
        float3 param_27 = sourceColor;
        float3 param_28 = pigment;
        pigment = lerp((pigment * sourceColor) / float3(0.2745099961757659912109375f, 0.32548999786376953125f, 0.21175999939441680908203125f), mossSurfaceColor(param_27, param_28), denseStyle.xxx);
    }
    else
    {
        if (!(_453_uCoatEnabled != 0u))
        {
            pigment *= ((0.800000011920928955078125f + (colony.w * 0.25f)) + (leaf.x * 0.1500000059604644775390625f));
        }
    }
    s.color = lerp(s.color, clamp(pigment * _453_uPaintTint[slot], 0.0f.xxx, 1.0f.xxx), (alpha * cfg.y).xxx);
    float param_29 = leaf.y;
    float param_30 = data.y;
    float rough = lerp((leaf.y * data.y) / 0.939999997615814208984375f, mossSurfaceRoughness(param_29, param_30), denseStyle);
    s.rough = lerp(s.rough, clamp(rough + adjust.z, lerp(0.100000001490116119384765625f, 0.20000000298023223876953125f, denseStyle), 1.0f), alpha * cfg.z);
    float suppress = 1.0f - ((alpha * cfg.w) * (1.0f - keep));
    s.h *= suppress;
    s.coatH *= suppress;
    s.normalWeight *= suppress;
    s.detailGradient *= suppress;
    bool _3963 = _453_uPass == (-1);
    bool _3970;
    if (!_3963)
    {
        _3970 = _453_uPass == 1;
    }
    else
    {
        _3970 = _3963;
    }
    bool _3977;
    if (!_3970)
    {
        _3977 = _453_uPass == 10;
    }
    else
    {
        _3977 = _3970;
    }
    if (_3977)
    {
        float3 _3984;
        if (_453_uCoatEnabled != 0u)
        {
            float3 param_31 = p;
            float3 param_32 = n;
            float param_33 = width;
            float3 param_34 = phase;
            int param_35 = 5;
            _3984 = mossMapNormal(param_31, param_32, param_33, param_34, param_35) * ((params.x * 12.0f) / 0.5299999713897705078125f);
        }
        else
        {
            _3984 = 0.0f.xxx;
        }
        float3 gradient = _3984;
        float t = clamp((colony.w - 0.20000000298023223876953125f) / 0.540000021457672119140625f, 0.0f, 1.0f);
        float rounded = (t * t) * (3.0f - (2.0f * t));
        float derivative = ((((1.25f * pow(max(rounded, 9.9999999747524270787835121154785e-07f), 0.25f)) * 6.0f) * t) * (1.0f - t)) / 0.540000021457672119140625f;
        gradient -= (colony.xyz * (((params.y * 0.07999999821186065673828125f) * 0.85000002384185791015625f) * derivative));
        gradient -= (n * dot(gradient, n));
        s.detailGradient += (gradient * ((adjust.y * alpha) * cfg.w));
    }
    bool _4067 = _453_uPass == (-1);
    bool _4074;
    if (!_4067)
    {
        _4074 = _453_uPass == 2;
    }
    else
    {
        _4074 = _4067;
    }
    bool _4081;
    if (!_4074)
    {
        _4081 = _453_uPass == 5;
    }
    else
    {
        _4081 = _4074;
    }
    bool _4088;
    if (!_4081)
    {
        _4088 = _453_uPass == 10;
    }
    else
    {
        _4088 = _4081;
    }
    if (_4088)
    {
        float _4095;
        if (_453_uCoatEnabled != 0u)
        {
            float3 param_36 = p;
            float3 param_37 = n;
            float param_38 = width;
            float3 param_39 = phase;
            int param_40 = 4;
            _4095 = paintMossMap(param_36, param_37, param_38, param_39, param_40).x;
        }
        else
        {
            _4095 = 0.839999973773956298828125f + (colony.w * 0.1599999964237213134765625f);
        }
        float sourceAO = _4095;
        float param_41 = sourceAO;
        float param_42 = data.x * adjust.w;
        s.localAO = lerp(s.localAO, mossSurfaceAO(param_41, param_42), alpha * _453_uEffectMeta[slot].z);
    }
    s.coatH += (((denseStyle * alpha) * 0.00015000000712461769580841064453125f) / _453_uTreeHeight);
    s.layerCoverage = coverage;
    if (slot == _453_uEffectSelected)
    {
        s.selectedCoverage = alpha;
    }
    return s;
}

float3 burlPanelBilinear(float2 uv, int panel, int level)
{
    uint _6178_dummy_parameter;
    int2 size = int2(spvTextureSize(uBakedORM, uint(level), _6178_dummy_parameter));
    uint _6182_dummy_parameter;
    bool grid = int2(spvTextureSize(uBakedORM, uint(0), _6182_dummy_parameter)).x >= 8192;
    int _6187;
    if (grid)
    {
        _6187 = max(1, (512 >> level));
    }
    else
    {
        _6187 = max(1, (size.x / 2));
    }
    int side = _6187;
    int param = 11;
    float param_1 = 0.0f;
    int style = int(effectParameter(param, param_1) + 0.5f);
    int cell = (style * 3) + ((panel == 3) ? 2 : panel);
    int2 _6216;
    if (grid)
    {
        _6216 = int2((cell % 16) * side, max(1, (1024 >> level)) + ((cell / 16) * side));
    }
    else
    {
        _6216 = int2((panel % 2) * side, (7 * size.x) + ((panel / 2) * side));
    }
    int2 origin = _6216;
    float2 q = (clamp(uv, (0.5f / float(side)).xx, (1.0f - (0.5f / float(side))).xx) * float(side)) - 0.5f.xx;
    float2 f = frac(q);
    int2 a = clamp(int2(floor(q)), int2(0, 0), (side - 1).xx);
    int2 b = min((a + int2(1, 1)), (side - 1).xx);
    return lerp(lerp(uBakedORM.Load(int3(origin + a, level)).xyz, uBakedORM.Load(int3(origin + int2(b.x, a.y), level)).xyz, f.x.xxx), lerp(uBakedORM.Load(int3(origin + int2(a.x, b.y), level)).xyz, uBakedORM.Load(int3(origin + b, level)).xyz, f.x.xxx), f.y.xxx);
}

float3 burlPanel(float2 uv, int panel)
{
    uint _6341_dummy_parameter;
    float _6344;
    if (int2(spvTextureSize(uBakedORM, uint(0), _6341_dummy_parameter)).x >= 8192)
    {
        _6344 = 512.0f;
    }
    else
    {
        uint _6351_dummy_parameter;
        _6344 = float(int2(spvTextureSize(uBakedORM, uint(0), _6351_dummy_parameter)).x) / 2.0f;
    }
    float side = _6344;
    float lod = clamp(log2(max(max(length(ddx(uv) * side), length(ddy(uv) * side)), 1.0f)), 0.0f, log2(side));
    int lo = int(floor(lod));
    int hi = min((lo + 1), int(log2(side)));
    float2 param = uv;
    int param_1 = panel;
    int param_2 = lo;
    float2 param_3 = uv;
    int param_4 = panel;
    int param_5 = hi;
    return lerp(burlPanelBilinear(param, param_1, param_2), burlPanelBilinear(param_3, param_4, param_5), frac(lod).xxx);
}

float3 effectColor(float3 fallback)
{
    float3 _4181;
    if (surfaceEffectSlot < 0)
    {
        _4181 = fallback;
    }
    else
    {
        _4181 = _453_uEffectColor[surfaceEffectSlot];
    }
    return _4181;
}

Surface burlSurface(inout Surface s, float3 p, float3 n, float seed)
{
    s.layerCoverage = 0.0f;
    if (_453_uPatchBits == 0)
    {
        return s;
    }
    float _6900;
    float _6947;
    float _6980;
    float _7123;
    float _7133;
    float _7143;
    float _7152;
    [loop] for (int i = 0; i < 8; i++)
    {
        if (i >= _453_uPatchCount)
        {
            break;
        }
        bool _6432 = (_453_uPatchBits & (1u << i)) == 0;
        bool _6440;
        if (!_6432)
        {
            _6440 = _453_uPatchShape[i].x < 4.5f;
        }
        else
        {
            _6440 = _6432;
        }
        bool _6453;
        if (!_6440)
        {
            _6453 = abs(_453_uPatchChannels[i].w - float(surfaceEffectSlot + 1)) > 0.100000001490116119384765625f;
        }
        else
        {
            _6453 = _6440;
        }
        if (_6453)
        {
            continue;
        }
        float3 delta = p - _453_uPatchOrigin[i].xyz;
        float2 q = float2(dot(delta, _453_uPatchU[i].xyz), dot(delta, _453_uPatchV[i].xyz));
        float radius = length(q);
        if (radius >= 1.0f)
        {
            continue;
        }
        int param = 10;
        float param_1 = 0.550000011920928955078125f;
        float warp = effectParameter(param, param_1);
        float localSeed = _453_uPatchShape[i].w + (seed * 0.1369999945163726806640625f);
        float angle = atan2(q.y, q.x);
        float edgeWarp = (((sin((angle * 3.0f) + localSeed) * 0.04500000178813934326171875f) + (sin((angle * 5.0f) - (localSeed * 0.699999988079071044921875f)) * 0.02500000037252902984619140625f)) * warp) * (1.0f - (radius * radius));
        float r = radius + edgeWarp;
        float2 stampUV = (q * 0.5f) + 0.5f.xx;
        if (mod(localSeed, 2.0f) > 1.0f)
        {
            stampUV.x = 1.0f - stampUV.x;
        }
        bool _6548 = _453_uCoatEnabled != 0u;
        bool _6570;
        if (_6548)
        {
            uint _6553_dummy_parameter;
            bool _6555 = int2(spvTextureSize(uBakedORM, uint(0), _6553_dummy_parameter)).x >= 8192;
            bool _6569;
            if (!_6555)
            {
                uint _6561_dummy_parameter;
                uint _6565_dummy_parameter;
                _6569 = int2(spvTextureSize(uBakedORM, uint(0), _6561_dummy_parameter)).y >= (int2(spvTextureSize(uBakedORM, uint(0), _6565_dummy_parameter)).x * 8);
            }
            else
            {
                _6569 = _6555;
            }
            _6570 = _6569;
        }
        else
        {
            _6570 = _6548;
        }
        bool hasStamp = _6570;
        float3 stampData = float3(1.0f, 0.5f, 0.89999997615814208984375f);
        float3 stampColor = 0.0f.xxx;
        float stampAO = 1.0f;
        if (hasStamp)
        {
            float2 param_2 = stampUV;
            int param_3 = 1;
            stampData = burlPanel(param_2, param_3);
            float2 param_4 = stampUV;
            int param_5 = 0;
            stampColor = burlPanel(param_4, param_5) / max(stampData.x, 9.9999997473787516355514526367188e-05f).xxx;
            float2 param_6 = stampUV;
            int param_7 = 3;
            stampAO = burlPanel(param_6, param_7).x;
        }
        float alpha = ((1.0f - smoothstep(1.0f - _453_uPatchShape[i].y, 1.0f, r)) * (1.0f - smoothstep(0.75f, 1.0f, abs(dot(delta, _453_uPatchN[i].xyz)) / max(_453_uPatchOrigin[i].w, 1.0000000116860974230803549289703e-07f)))) * stampData.x;
        int param_8 = 0;
        float param_9 = 1.0f;
        float amount = effectParameter(param_8, param_9) * alpha;
        if (amount <= 0.0f)
        {
            continue;
        }
        int param_10 = 9;
        float param_11 = 18.0f;
        float rings = effectParameter(param_10, param_11);
        float phase = ((r * rings) + ((sin(((angle * 2.0f) + (r * 5.0f)) + localSeed) * warp) * 0.449999988079071044921875f)) * 6.283185482025146484375f;
        float band = 0.5f + ((0.5f * sin(phase)) * clamp(1.0f - (fwidth(phase) * 0.319999992847442626953125f), 0.0f, 1.0f));
        int param_12 = 4;
        float param_13 = 0.008000000379979610443115234375f;
        float3 param_14 = float3(((q * float2(1.0f / length(_453_uPatchU[i].xyz), 1.0f / length(_453_uPatchV[i].xyz))) * _453_uTreeHeight) / max(effectParameter(param_12, param_13), 0.001000000047497451305389404296875f).xx, localSeed);
        float fine = _noise(param_14);
        float3 param_15 = float3(q * 4.0f, localSeed + 11.0f);
        float broad = _noise(param_15);
        float dome = pow(max(0.0f, 1.0f - (r * r)), 1.7000000476837158203125f);
        float rim = exp(-pow((r - 0.7799999713897705078125f) / 0.12999999523162841796875f, 2.0f));
        int param_16 = 3;
        float param_17 = 0.01200000010430812835693359375f;
        float height = effectParameter(param_16, param_17) / _453_uTreeHeight;
        int param_18 = 2;
        float param_19 = 1.0f;
        float strength = effectParameter(param_18, param_19);
        int param_20 = 7;
        float param_21 = 0.449999988079071044921875f;
        float keep = lerp(1.0f, effectParameter(param_20, param_21), amount);
        int param_22 = 5;
        float param_23 = 0.449999988079071044921875f;
        float variation = effectParameter(param_22, param_23);
        float3 param_24 = float3(0.449999988079071044921875f, 0.3400000035762786865234375f, 0.25f);
        float3 tint = effectColor(param_24);
        float twist = warp * ((0.64999997615814208984375f * exp(((-r) * r) * 3.0f)) + (0.100000001490116119384765625f * sin((angle * 3.0f) + localSeed)));
        float ct = cos(twist);
        float sn = sin(twist);
        float2 turned = float2((q.x * ct) - (q.y * sn), (q.x * sn) + (q.y * ct));
        float2 offset = turned - q;
        float3 warpedP = (p + ((normalize(_453_uPatchU[i].xyz) * offset.x) / length(_453_uPatchU[i].xyz).xxx)) + ((normalize(_453_uPatchV[i].xyz) * offset.y) / length(_453_uPatchV[i].xyz).xxx);
        float3 param_25 = warpedP;
        float3 param_26 = n;
        float3 bark = barkMapSample(uBark, _uBark_sampler, param_25, param_26) * _453_uTint;
        float3 pigment = lerp(bark, tint, 0.14000000059604644775390625f.xxx) * (((0.939999997615814208984375f + (band * 0.0599999986588954925537109375f)) + (((fine - 0.5f) * variation) * 0.100000001490116119384765625f)) + (((broad - 0.5f) * variation) * 0.07999999821186065673828125f));
        if (hasStamp)
        {
            pigment = lerp(bark, stampColor * clamp(tint / float3(0.4550000131130218505859375f, 0.352999985218048095703125f, 0.250999987125396728515625f), 0.0f.xxx, 3.0f.xxx), 0.920000016689300537109375f.xxx);
        }
        float3 param_27 = warpedP;
        float3 param_28 = n;
        float barkRelief = ((barkHeight(param_27, param_28) - 0.5f) * _453_uBarkRelief) * 0.449999988079071044921875f;
        s.color = lerp(s.color, pigment, amount.xxx);
        int param_29 = 1;
        float param_30 = 0.89999997615814208984375f;
        if (hasStamp)
        {
            _6900 = stampData.z - 0.89999997615814208984375f;
        }
        else
        {
            _6900 = (fine - 0.5f) * 0.07999999821186065673828125f;
        }
        s.rough = lerp(s.rough, clamp(effectParameter(param_29, param_30) + _6900, 0.100000001490116119384765625f, 1.0f), amount);
        s.h *= keep;
        s.normalWeight *= keep;
        s.detailGradient *= keep;
        if (hasStamp)
        {
            _6947 = (stampData.y - 0.5f) * 0.100000001490116119384765625f;
        }
        else
        {
            _6947 = ((fine - 0.5f) * 0.01200000010430812835693359375f) * dome;
        }
        float relief = (((dome * (0.89999997615814208984375f + (broad * 0.20000000298023223876953125f))) + (rim * 0.180000007152557373046875f)) + (((band - 0.5f) * 0.0350000001490116119384765625f) * dome)) + _6947;
        int param_31 = 11;
        float param_32 = 0.0f;
        int style = int(effectParameter(param_31, param_32) + 0.5f);
        int param_33 = 12;
        float param_34 = 0.0f;
        int kind = int(effectParameter(param_33, param_34) + 0.5f);
        if (style > 0)
        {
            if (hasStamp)
            {
                _6980 = stampData.y - 0.5f;
            }
            else
            {
                _6980 = (fine - 0.5f) * 0.20000000298023223876953125f;
            }
            float imageH = _6980;
            float envelope = pow(max(0.0f, 1.0f - (r * r)), 1.2000000476837158203125f);
            if (kind == 0)
            {
                relief = (dome * 0.699999988079071044921875f) + (imageH * 0.300000011920928955078125f);
            }
            else
            {
                if (kind == 1)
                {
                    relief = (imageH * 0.699999988079071044921875f) - (0.119999997317790985107421875f * envelope);
                }
                else
                {
                    if (kind == 2)
                    {
                        relief = (((exp(-pow((abs(q.x) - 0.2700000107288360595703125f) / 0.1500000059604644775390625f, 2.0f)) * 0.4000000059604644775390625f) - (exp(-pow(q.x / 0.1500000059604644775390625f, 2.0f)) * 0.2800000011920928955078125f)) * envelope) + (imageH * 0.25f);
                    }
                    else
                    {
                        if (kind == 3)
                        {
                            relief = imageH * 0.119999997317790985107421875f;
                        }
                        else
                        {
                            if (kind == 4)
                            {
                                relief = (max(0.0f, stampData.y) * 0.449999988079071044921875f) + (imageH * 0.300000011920928955078125f);
                            }
                            else
                            {
                                relief = (imageH * 0.5f) + (0.119999997317790985107421875f * envelope);
                            }
                        }
                    }
                }
            }
        }
        if (style > 0)
        {
            barkRelief = 0.0f;
        }
        s.coatH = (s.coatH * keep) + ((amount * strength) * ((height * relief) + barkRelief));
        bool _7092 = _453_uPass == (-1);
        bool _7099;
        if (!_7092)
        {
            _7099 = _453_uPass == 2;
        }
        else
        {
            _7099 = _7092;
        }
        bool _7106;
        if (!_7099)
        {
            _7106 = _453_uPass == 5;
        }
        else
        {
            _7106 = _7099;
        }
        bool _7113;
        if (!_7106)
        {
            _7113 = _453_uPass == 10;
        }
        else
        {
            _7113 = _7106;
        }
        if (_7113)
        {
            int param_35 = 6;
            float param_36 = 0.4000000059604644775390625f;
            if (style == 0)
            {
                if (hasStamp)
                {
                    _7133 = 1.0f - stampAO;
                }
                else
                {
                    _7133 = 0.0f;
                }
                _7123 = (((1.0f - band) * 0.180000007152557373046875f) + (rim * 0.1599999964237213134765625f)) + _7133;
            }
            else
            {
                if (hasStamp)
                {
                    _7143 = 1.0f - stampAO;
                }
                else
                {
                    _7143 = 0.0f;
                }
                if (kind == 1)
                {
                    _7152 = (1.0f - stampData.y) * 0.25f;
                }
                else
                {
                    _7152 = 0.0f;
                }
                _7123 = _7143 + _7152;
            }
            s.localAO *= (1.0f - ((amount * effectParameter(param_35, param_36)) * _7123));
        }
        s.layerCoverage = 1.0f - ((1.0f - s.layerCoverage) * (1.0f - amount));
    }
    return s;
}

float organicNoise(float3 p, float meters, float3 phase)
{
    float3 q = ((p * _453_uTreeHeight) / meters.xxx) + phase;
    float footprint = max(length(ddx(q)), length(ddy(q)));
    float3 param = q;
    return lerp(_noise(param), 0.5f, smoothstep(0.3499999940395355224609375f, 1.14999997615814208984375f, footprint));
}

Surface formSurface(int type, inout Surface s, float3 p, float3 n, float seed)
{
    int param = 0;
    float param_1 = 0.5f;
    float amount = effectParameter(param, param_1);
    int param_2 = 1;
    float param_3 = 0.89999997615814208984375f;
    float rough = effectParameter(param_2, param_3);
    int param_4 = 2;
    float param_5 = 1.0f;
    float normal = effectParameter(param_4, param_5);
    int param_6 = 3;
    float param_7 = 0.0f;
    float height = effectParameter(param_6, param_7);
    int param_8 = 4;
    float param_9 = 0.006000000052154064178466796875f;
    float grain = max(effectParameter(param_8, param_9), 0.001000000047497451305389404296875f);
    int param_10 = 5;
    float param_11 = 0.4000000059604644775390625f;
    float variation = effectParameter(param_10, param_11);
    int param_12 = 6;
    float param_13 = 0.1500000059604644775390625f;
    float ao = effectParameter(param_12, param_13);
    int param_14 = 7;
    float param_15 = 1.0f;
    float keep = effectParameter(param_14, param_15);
    s.layerCoverage = amount;
    if (type == 13)
    {
        bool _5963 = _453_uPass == (-1);
        bool _5970;
        if (!_5963)
        {
            _5970 = _453_uPass == 2;
        }
        else
        {
            _5970 = _5963;
        }
        bool _5977;
        if (!_5970)
        {
            _5977 = _453_uPass == 5;
        }
        else
        {
            _5977 = _5970;
        }
        bool _5984;
        if (!_5977)
        {
            _5984 = _453_uPass == 10;
        }
        else
        {
            _5984 = _5977;
        }
        if (_5984)
        {
            s.localAO *= max(0.449999988079071044921875f, 1.0f - (amount * ao));
        }
        return s;
    }
    float3 param_16 = 0.5f.xxx;
    float3 tint = effectColor(param_16);
    float3 param_17 = p;
    float param_18 = grain;
    float3 param_19 = float3(17.0f + (seed * 0.37000000476837158203125f), 9.0f + (seed * 0.189999997615814208984375f), 31.0f + (seed * 0.5299999713897705078125f));
    float fine = organicNoise(param_17, param_18, param_19);
    if (type == 11)
    {
        s.color = lerp(s.color, (s.color * (0.62000000476837158203125f + ((fine * variation) * 0.07999999821186065673828125f))) + (tint * 0.0900000035762786865234375f), amount.xxx);
    }
    if (type == 12)
    {
        s.color = lerp(s.color, (s.color * (1.2000000476837158203125f + ((fine * variation) * 0.0500000007450580596923828125f))) + (tint * 0.02500000037252902984619140625f), amount.xxx);
    }
    if (type == 14)
    {
        s.color *= (1.0f - (amount * (0.300000011920928955078125f + (((1.0f - fine) * variation) * 0.07999999821186065673828125f))));
    }
    s.rough = lerp(s.rough, clamp(rough + (((fine - 0.5f) * variation) * 0.039999999105930328369140625f), 0.0500000007450580596923828125f, 1.0f), amount);
    float retained = lerp(1.0f, keep, amount);
    s.h *= retained;
    s.normalWeight *= retained;
    s.detailGradient *= retained;
    s.coatH = (s.coatH * retained) + ((((amount * normal) * height) * (0.20000000298023223876953125f + (fine * 0.800000011920928955078125f))) / _453_uTreeHeight);
    bool _6135 = _453_uPass == (-1);
    bool _6142;
    if (!_6135)
    {
        _6142 = _453_uPass == 2;
    }
    else
    {
        _6142 = _6135;
    }
    bool _6149;
    if (!_6142)
    {
        _6149 = _453_uPass == 5;
    }
    else
    {
        _6149 = _6142;
    }
    bool _6156;
    if (!_6149)
    {
        _6156 = _453_uPass == 10;
    }
    else
    {
        _6156 = _6149;
    }
    if (_6156)
    {
        s.localAO *= (1.0f - (((amount * ao) * (1.0f - fine)) * 0.300000011920928955078125f));
    }
    return s;
}

Surface extraSurface(int type, inout Surface s, float3 p, float3 n, float seed)
{
    if (type == 15)
    {
        Surface param = s;
        float3 param_1 = p;
        float3 param_2 = n;
        float param_3 = seed;
        Surface _7194 = burlSurface(param, param_1, param_2, param_3);
        return _7194;
    }
    if (type >= 11)
    {
        int param_4 = type;
        Surface param_5 = s;
        float3 param_6 = p;
        float3 param_7 = n;
        float param_8 = seed;
        Surface _7210 = formSurface(param_4, param_5, param_6, param_7, param_8);
        return _7210;
    }
    int param_9 = 0;
    float param_10 = 1.0f;
    float amount = effectParameter(param_9, param_10);
    int param_11 = 1;
    float param_12 = 0.89999997615814208984375f;
    float rough = effectParameter(param_11, param_12);
    int param_13 = 2;
    float param_14 = 1.0f;
    float normal = effectParameter(param_13, param_14);
    int param_15 = 3;
    float param_16 = 0.0f;
    float height = effectParameter(param_15, param_16);
    int param_17 = 4;
    float param_18 = 0.00999999977648258209228515625f;
    float grain = max(effectParameter(param_17, param_18), 0.0005000000237487256526947021484375f);
    int param_19 = 5;
    float param_20 = 0.4000000059604644775390625f;
    float variation = effectParameter(param_19, param_20);
    int param_21 = 6;
    float param_22 = 0.3499999940395355224609375f;
    float ao = effectParameter(param_21, param_22);
    int param_23 = 7;
    float param_24 = 1.0f;
    float keep = effectParameter(param_23, param_24);
    float3 param_25 = 0.5f.xxx;
    float3 tint = effectColor(param_25);
    float3 phase = float3((seed * 0.37000000476837158203125f) + 9.0f, (seed * 0.17000000178813934326171875f) + 21.0f, (seed * 0.5299999713897705078125f) + 4.0f);
    float3 param_26 = p;
    float param_27 = grain;
    float3 param_28 = phase;
    float fine = organicNoise(param_26, param_27, param_28);
    float3 param_29 = p;
    float param_30 = grain * 4.0f;
    float3 param_31 = phase + 13.0f.xxx;
    float broad = organicNoise(param_29, param_30, param_31);
    float relief = fine;
    s.layerCoverage = amount;
    if (type == 8)
    {
        s.color *= lerp(1.0f.xxx, tint * (0.800000011920928955078125f + ((variation * broad) * 0.4000000059604644775390625f)), amount.xxx);
        s.rough = lerp(s.rough, rough, amount);
        return s;
    }
    if (type == 9)
    {
        float lum = dot(s.color, float3(0.2125999927520751953125f, 0.715200006961822509765625f, 0.072200000286102294921875f));
        int param_32 = 8;
        float param_33 = 0.4000000059604644775390625f;
        float3 faded = (lerp(s.color, lum.xxx, effectParameter(param_32, param_33).xxx) * 1.12000000476837158203125f) + (tint * 0.0900000035762786865234375f);
        s.color = lerp(s.color, faded, amount.xxx);
        s.rough = lerp(s.rough, rough, amount);
        return s;
    }
    if (type == 6)
    {
        relief = (fine * 0.25f) + (broad * 0.75f);
    }
    if (type == 10)
    {
        float plates = smoothstep(0.300000011920928955078125f, 0.699999988079071044921875f, broad);
        float ridges = 1.0f - abs((fine * 2.0f) - 1.0f);
        relief = (plates * 0.75f) + (ridges * 0.25f);
    }
    float3 pigment = tint * ((0.86000001430511474609375f + (((fine - 0.5f) * variation) * 0.37999999523162841796875f)) + (((broad - 0.5f) * variation) * 0.2199999988079071044921875f));
    s.color = lerp(s.color, pigment, amount.xxx);
    s.rough = lerp(s.rough, clamp(rough + (((fine - 0.5f) * variation) * 0.07999999821186065673828125f), 0.0500000007450580596923828125f, 1.0f), amount);
    float retained = lerp(1.0f, keep, amount);
    s.h *= retained;
    s.normalWeight *= retained;
    s.detailGradient *= retained;
    s.coatH = (s.coatH * retained) + ((((amount * normal) * height) * (0.1500000059604644775390625f + (relief * 0.85000002384185791015625f))) / _453_uTreeHeight);
    bool _7450 = _453_uPass == (-1);
    bool _7457;
    if (!_7450)
    {
        _7457 = _453_uPass == 2;
    }
    else
    {
        _7457 = _7450;
    }
    bool _7464;
    if (!_7457)
    {
        _7464 = _453_uPass == 5;
    }
    else
    {
        _7464 = _7457;
    }
    bool _7471;
    if (!_7464)
    {
        _7471 = _453_uPass == 10;
    }
    else
    {
        _7471 = _7464;
    }
    if (_7471)
    {
        s.localAO *= (1.0f - (((amount * ao) * (1.0f - relief)) * 0.3499999940395355224609375f));
    }
    return s;
}

float3 coatMap(float3 p, float3 n, int tile)
{
    float3 param = p;
    float3 param_1 = n;
    float param_2 = _453_uCoatWidth;
    float3 param_3 = float3(_453_uSeed * 0.17000000178813934326171875f, _453_uSeed * 0.23000000417232513427734375f, _453_uSeed * 0.310000002384185791015625f);
    int param_4 = tile;
    return paintMossMap(param, param_1, param_2, param_3, param_4);
}

bool genericDistribution()
{
    bool _4194 = surfaceEffectSlot >= 0;
    bool _4201;
    if (_4194)
    {
        _4201 = _453_uEffectMeta[surfaceEffectSlot].w > 0.5f;
    }
    else
    {
        _4201 = _4194;
    }
    return _4201;
}

float3 coatNormalGradient(float3 p, float3 n, int tile)
{
    float3 param = p;
    float3 param_1 = n;
    float param_2 = _453_uCoatWidth;
    float3 param_3 = float3(_453_uSeed * 0.17000000178813934326171875f, _453_uSeed * 0.23000000417232513427734375f, _453_uSeed * 0.310000002384185791015625f);
    int param_4 = tile;
    return mossMapNormal(param, param_1, param_2, param_3, param_4);
}

Surface mossCoating(inout Surface s, float3 p, float3 n, float seed, float barkLum)
{
    float3 phase = float3((seed * 0.37000000476837158203125f) + 17.0f, (seed * 0.61000001430511474609375f) + 3.0f, (seed * 0.430000007152557373046875f) + 7.0f);
    float3 param = p;
    float param_1 = 0.07500000298023223876953125f;
    float3 param_2 = phase;
    float colony = organicNoise(param, param_1, param_2);
    float3 param_3 = p;
    float param_4 = 0.0089999996125698089599609375f;
    float3 param_5 = phase + 19.0f.xxx;
    float tuft = organicNoise(param_3, param_4, param_5);
    float3 param_6 = p;
    float param_7 = 0.0035000001080334186553955078125f;
    float3 param_8 = phase + 37.0f.xxx;
    float tip = organicNoise(param_6, param_7, param_8);
    float3 param_9 = (p * float3(13.0f, 6.0f, 13.0f)) + float3(seed, 3.0f, 7.0f);
    float3 param_10 = ((p * 39.0f) + 11.0f.xxx) + seed.xxx;
    float field = (((_noise(param_9) * 0.7200000286102294921875f) + (_noise(param_10) * 0.2800000011920928955078125f)) + ((1.0f - p.y) * 0.14000000059604644775390625f)) + (n.y * 0.07999999821186065673828125f);
    field += ((((colony - 0.5f) * 0.12999999523162841796875f) + ((tuft - 0.5f) * 0.0599999986588954925537109375f)) + ((1.0f - barkLum) * 0.02500000037252902984619140625f));
    float3 data = 0.0f.xxx;
    float3 coverage = 1.0f.xxx;
    if (_453_uCoatEnabled != 0u)
    {
        float3 param_11 = p;
        float3 param_12 = n;
        int param_13 = 2;
        data = coatMap(param_11, param_12, param_13);
        float3 param_14 = p;
        float3 param_15 = n;
        int param_16 = 3;
        coverage = coatMap(param_14, param_15, param_16);
        field += ((data.x - 0.5f) * 0.07999999821186065673828125f);
    }
    float aa = max(0.01200000010430812835693359375f, fwidth(field) * 0.75f);
    int param_17 = 2;
    float param_18 = _453_uMossEnabled;
    float _4619;
    if (genericDistribution())
    {
        _4619 = 1.0f;
    }
    else
    {
        int param_19 = 0;
        float param_20 = _453_uMoss;
        int param_21 = 0;
        float param_22 = _453_uMoss;
        int param_23 = 0;
        float param_24 = _453_uMoss;
        _4619 = step(9.9999997473787516355514526367188e-05f, effectParameter(param_19, param_20)) * smoothstep((1.0f - effectParameter(param_21, param_22)) - aa, (1.0f - effectParameter(param_23, param_24)) + aa, field);
    }
    float m = effectParameter(param_17, param_18) * _4619;
    float cushion = smoothstep(0.2199999988079071044921875f, 0.800000011920928955078125f, tuft);
    float tips = pow(smoothstep(0.23999999463558197021484375f, 0.7799999713897705078125f, tip), 1.5f);
    float3 param_25 = _453_uMossColor;
    float3 green = effectColor(param_25) * (((0.790000021457672119140625f + (colony * 0.14000000059604644775390625f)) + (cushion * 0.100000001490116119384765625f)) + (tips * 0.1599999964237213134765625f));
    green *= lerp(float3(0.939999997615814208984375f, 1.0f, 0.88999998569488525390625f), float3(1.0299999713897705078125f, 1.0099999904632568359375f, 0.910000026226043701171875f), cushion.xxx);
    if (_453_uCoatEnabled != 0u)
    {
        cushion = data.x;
        tips = data.x;
        float3 param_26 = p;
        float3 param_27 = n;
        int param_28 = 0;
        float3 param_29 = _453_uMossColor;
        float3 param_30 = coatMap(param_26, param_27, param_28);
        float3 param_31 = effectColor(param_29);
        green = mossSurfaceColor(param_30, param_31);
    }
    float3 param_32 = p;
    float param_33 = 0.0199999995529651641845703125f;
    float3 param_34 = phase + 83.0f.xxx;
    float pocket = organicNoise(param_32, param_33, param_34);
    if (_453_uCoatEnabled != 0u)
    {
        int param_35 = 6;
        float param_36 = _453_uMossPorosity;
        float param_37 = m;
        float param_38 = coverage.x;
        float param_39 = pocket;
        float param_40 = effectParameter(param_35, param_36);
        m = mossSurfaceCoverage(param_37, param_38, param_39, param_40);
    }
    else
    {
        int param_41 = 6;
        float param_42 = _453_uMossPorosity;
        if (effectParameter(param_41, param_42) > 0.0f)
        {
            int param_43 = 6;
            float param_44 = _453_uMossPorosity;
            int param_45 = 6;
            float param_46 = _453_uMossPorosity;
            m *= smoothstep(effectParameter(param_43, param_44) * 0.4000000059604644775390625f, (effectParameter(param_45, param_46) * 0.4000000059604644775390625f) + 0.180000007152557373046875f, ((tuft * 0.699999988079071044921875f) + (tip * 0.300000011920928955078125f)) + ((pocket - 0.5f) * 0.100000001490116119384765625f));
        }
    }
    s.layerCoverage = m;
    s.color = lerp(s.color, green, m.xxx);
    float _4788;
    if (_453_uCoatEnabled != 0u)
    {
        int param_47 = 1;
        float param_48 = _453_uMossRough;
        float param_49 = coverage.y;
        float param_50 = effectParameter(param_47, param_48);
        _4788 = mossSurfaceRoughness(param_49, param_50);
    }
    else
    {
        int param_51 = 1;
        float param_52 = _453_uMossRough;
        _4788 = (effectParameter(param_51, param_52) + ((colony - 0.5f) * 0.07999999821186065673828125f)) - (tips * 0.0350000001490116119384765625f);
    }
    s.rough = lerp(s.rough, clamp(_4788, 0.20000000298023223876953125f, 1.0f), m);
    s.h *= lerp(1.0f, 0.07999999821186065673828125f, m);
    s.normalWeight *= lerp(1.0f, 0.07999999821186065673828125f, m);
    s.detailGradient *= lerp(1.0f, 0.07999999821186065673828125f, m);
    bool _4841 = _453_uCoatEnabled != 0u;
    bool _4861;
    if (_4841)
    {
        bool _4846 = _453_uPass == (-1);
        bool _4853;
        if (!_4846)
        {
            _4853 = _453_uPass == 1;
        }
        else
        {
            _4853 = _4846;
        }
        bool _4860;
        if (!_4853)
        {
            _4860 = _453_uPass == 10;
        }
        else
        {
            _4860 = _4853;
        }
        _4861 = _4860;
    }
    else
    {
        _4861 = _4841;
    }
    if (_4861)
    {
        float3 param_53 = p;
        float3 param_54 = n;
        int param_55 = 5;
        int param_56 = 3;
        float param_57 = _453_uMossNormalStrength;
        int param_58 = 7;
        float param_59 = _453_uMossFiberMm;
        s.detailGradient += (((coatNormalGradient(param_53, param_54, param_55) * m) * effectParameter(param_56, param_57)) * (effectParameter(param_58, param_59) / 0.5299999713897705078125f));
    }
    bool _4893 = _453_uPass == (-1);
    bool _4900;
    if (!_4893)
    {
        _4900 = _453_uPass == 2;
    }
    else
    {
        _4900 = _4893;
    }
    bool _4907;
    if (!_4900)
    {
        _4907 = _453_uPass == 5;
    }
    else
    {
        _4907 = _4900;
    }
    bool _4914;
    if (!_4907)
    {
        _4914 = _453_uPass == 10;
    }
    else
    {
        _4914 = _4907;
    }
    if (_4914)
    {
        float _4921;
        if (_453_uCoatEnabled != 0u)
        {
            float3 param_60 = p;
            float3 param_61 = n;
            int param_62 = 4;
            _4921 = coatMap(param_60, param_61, param_62).x;
        }
        else
        {
            _4921 = clamp(0.839999973773956298828125f + (cushion * 0.1599999964237213134765625f), 0.0f, 1.0f);
        }
        float localAO = _4921;
        int param_63 = 8;
        float param_64 = _453_uMossAO;
        float param_65 = localAO;
        float param_66 = effectParameter(param_63, param_64);
        s.localAO = lerp(s.localAO, mossSurfaceAO(param_65, param_66), m);
    }
    int param_67 = 5;
    float param_68 = _453_uMossClump;
    float3 param_69 = p;
    float param_70 = effectParameter(param_67, param_68);
    float3 param_71 = phase + 67.0f.xxx;
    float mound = pow(smoothstep(0.20000000298023223876953125f, 0.7400000095367431640625f, organicNoise(param_69, param_70, param_71)), 1.25f);
    int param_72 = 4;
    float param_73 = _453_uMossThickness;
    float thickness = effectParameter(param_72, param_73) * (0.1500000059604644775390625f + (0.85000002384185791015625f * mound));
    bool _4983 = _453_uPass == (-1);
    bool _4990;
    if (!_4983)
    {
        _4990 = _453_uPass == 1;
    }
    else
    {
        _4990 = _4983;
    }
    bool _4997;
    if (!_4990)
    {
        _4997 = _453_uPass == 10;
    }
    else
    {
        _4997 = _4990;
    }
    if (_4997)
    {
        float3 a = ddx(p) * _453_uTreeHeight;
        float3 b = ddy(p) * _453_uTreeHeight;
        float aa_1 = dot(a, a);
        float bb = dot(b, b);
        float ab = dot(a, b);
        float det = (aa_1 * bb) - (ab * ab);
        float ha = ddx(thickness);
        float hb = ddy(thickness);
        if (det > 1.0000000195414813782625560981111e-25f)
        {
            int param_74 = 3;
            float param_75 = _453_uMossNormalStrength;
            s.detailGradient -= (((a * (((ha * bb) - (hb * ab)) / det)) + (b * (((hb * aa_1) - (ha * ab)) / det))) * (m * effectParameter(param_74, param_75)));
        }
    }
    float _5082;
    if (_453_uCoatEnabled != 0u)
    {
        _5082 = 0.0f;
    }
    else
    {
        _5082 = (0.0004499999922700226306915283203125f * cushion) + (7.999999797903001308441162109375e-05f * tips);
    }
    int param_76 = 3;
    float param_77 = _453_uMossNormalStrength;
    s.coatH += (((m * (0.00015000000712461769580841064453125f + _5082)) * effectParameter(param_76, param_77)) / _453_uTreeHeight);
    return s;
}

float paintSubstrateWear(float3 p, float3 n)
{
    float3 param = p;
    float3 param_1 = n;
    float3 cached = barkMapSample(uRoughMap, _uRoughMap_sampler, param, param_1);
    float _5123;
    if (_453_uNormalY < 0.0f)
    {
        _5123 = cached.z;
    }
    else
    {
        _5123 = cached.y;
    }
    float wear = _5123;
    int param_2 = 18;
    float param_3 = _453_uPaintDepthContrast;
    return pow(clamp(wear, 0.0f, 1.0f), effectParameter(param_2, param_3));
}

float paintMacroIntact(float3 p, float3 phase, float flake, float grain, float sourceIntact)
{
    int param = 19;
    float param_1 = _453_uPaintPeel;
    if (effectParameter(param, param_1) <= 0.0f)
    {
        return 1.0f;
    }
    int param_2 = 19;
    float param_3 = _453_uPaintPeel;
    if (effectParameter(param_2, param_3) >= 1.0f)
    {
        return 0.0f;
    }
    int param_4 = 22;
    float param_5 = _453_uPaintPeelDetail;
    float detail = effectParameter(param_4, param_5);
    int param_6 = 20;
    float param_7 = _453_uPaintPeelSize;
    float3 param_8 = p;
    float param_9 = effectParameter(param_6, param_7) * 1.7000000476837158203125f;
    float3 param_10 = phase + 211.0f.xxx;
    float warp = organicNoise(param_8, param_9, param_10) - 0.5f;
    int param_11 = 20;
    float param_12 = _453_uPaintPeelSize;
    float3 warped = p + (float3(0.579999983310699462890625f, 0.180000007152557373046875f, 0.4099999964237213134765625f) * (((warp * detail) * effectParameter(param_11, param_12)) / _453_uTreeHeight));
    int param_13 = 20;
    float param_14 = _453_uPaintPeelSize;
    float3 param_15 = warped;
    float param_16 = effectParameter(param_13, param_14);
    float3 param_17 = phase + 101.0f.xxx;
    float broad = organicNoise(param_15, param_16, param_17);
    int param_18 = 20;
    float param_19 = _453_uPaintPeelSize;
    float3 param_20 = warped * lerp(1.0f.xxx, float3(1.0f, 1.4500000476837158203125f, 1.0f), detail.xxx);
    float param_21 = effectParameter(param_18, param_19) * 0.430000007152557373046875f;
    float3 param_22 = phase + 137.0f.xxx;
    float lobes = organicNoise(param_20, param_21, param_22);
    int param_23 = 20;
    float param_24 = _453_uPaintPeelSize;
    float3 param_25 = p;
    float param_26 = effectParameter(param_23, param_24) * 0.10999999940395355224609375f;
    float3 param_27 = phase + 173.0f.xxx;
    float chips = organicNoise(param_25, param_26, param_27);
    float field = ((broad * (0.7200000286102294921875f - (0.180000007152557373046875f * detail))) + (lobes * (0.20000000298023223876953125f + (0.14000000059604644775390625f * detail)))) + (chips * (0.07999999821186065673828125f + (0.039999999105930328369140625f * detail)));
    field = smoothstep(0.2199999988079071044921875f, 0.7799999713897705078125f, field);
    field += (detail * (((((chips - 0.5f) * 0.180000007152557373046875f) + ((flake - 0.5f) * 0.0599999986588954925537109375f)) + ((grain - 0.5f) * 0.02500000037252902984619140625f)) - ((1.0f - sourceIntact) * 0.180000007152557373046875f)));
    int param_28 = 21;
    float param_29 = _453_uPaintPeelEdge;
    float edge = max(0.0030000000260770320892333984375f + (effectParameter(param_28, param_29) * 0.1599999964237213134765625f), fwidth(field) * 0.75f);
    int param_30 = 19;
    float param_31 = _453_uPaintPeel;
    int param_32 = 19;
    float param_33 = _453_uPaintPeel;
    float intact = smoothstep(effectParameter(param_30, param_31) - edge, effectParameter(param_32, param_33) + edge, field);
    int param_34 = 23;
    float param_35 = _453_uPaintPeelChips;
    if (effectParameter(param_34, param_35) > 0.0f)
    {
        int param_36 = 19;
        float param_37 = _453_uPaintPeel;
        float edgeZone = 1.0f - smoothstep(0.0f, 0.2199999988079071044921875f, field - effectParameter(param_36, param_37));
        int param_38 = 23;
        float param_39 = _453_uPaintPeelChips;
        int param_40 = 19;
        float param_41 = _453_uPaintPeel;
        float cut = effectParameter(param_38, param_39) * ((effectParameter(param_40, param_41) * 0.699999988079071044921875f) + (edgeZone * 0.300000011920928955078125f));
        float flecks = min((chips * 0.64999997615814208984375f) + (grain * 0.3499999940395355224609375f), sourceIntact);
        float aa = max(0.008000000379979610443115234375f, fwidth(flecks) * 0.64999997615814208984375f);
        intact *= smoothstep(cut - aa, cut + aa, flecks);
    }
    return intact;
}

Surface paintCoating(inout Surface s, float3 p, float3 n, float seed, float barkLum)
{
    float3 phase = float3((seed * 0.4099999964237213134765625f) + 9.0f, (seed * 0.2899999916553497314453125f) + 13.0f, (seed * 0.670000016689300537109375f) + 5.0f);
    float3 param = p;
    float param_1 = 0.064999997615814208984375f;
    float3 param_2 = phase;
    float paintPatch = organicNoise(param, param_1, param_2);
    float3 param_3 = p;
    float param_4 = 0.02099999971687793731689453125f;
    float3 param_5 = phase + 23.0f.xxx;
    float flake = organicNoise(param_3, param_4, param_5);
    float3 param_6 = p;
    float param_7 = 0.006000000052154064178466796875f;
    float3 param_8 = phase + 41.0f.xxx;
    float grain = organicNoise(param_6, param_7, param_8);
    int param_9 = 10;
    float param_10 = _453_uPaintHeight;
    int param_11 = 11;
    float param_12 = _453_uPaintWear;
    float edge = effectParameter(param_9, param_10) + ((((paintPatch - 0.5f) * effectParameter(param_11, param_12)) * 0.0599999986588954925537109375f) / _453_uTreeHeight);
    float aa = max(0.00069999997504055500030517578125f / _453_uTreeHeight, fwidth(p.y) * 0.75f);
    int param_13 = 9;
    float param_14 = _453_uPaintEnabled;
    float _5478;
    if (genericDistribution())
    {
        _5478 = 1.0f;
    }
    else
    {
        int param_15 = 10;
        float param_16 = _453_uPaintHeight;
        _5478 = step(9.9999997473787516355514526367188e-05f, effectParameter(param_15, param_16)) * (1.0f - smoothstep(edge - aa, edge + aa, p.y));
    }
    float m = effectParameter(param_13, param_14) * _5478;
    float cavity = 1.0f - smoothstep(0.1599999964237213134765625f, 0.4799999892711639404296875f, barkLum);
    int param_17 = 11;
    float param_18 = _453_uPaintWear;
    float damage = ((flake * 0.7200000286102294921875f) + (grain * 0.2800000011920928955078125f)) - ((cavity * effectParameter(param_17, param_18)) * 0.2199999988079071044921875f);
    int param_19 = 11;
    float param_20 = _453_uPaintWear;
    float cut = effectParameter(param_19, param_20) * 0.37999999523162841796875f;
    float cutAA = max(0.01200000010430812835693359375f, fwidth(damage) * 0.60000002384185791015625f);
    float3 data = 0.0f.xxx;
    float3 coverage = 1.0f.xxx;
    if (_453_uCoatEnabled != 0u)
    {
        float3 param_21 = p;
        float3 param_22 = n;
        int param_23 = 2;
        data = coatMap(param_21, param_22, param_23);
        float3 param_24 = p;
        float3 param_25 = n;
        int param_26 = 3;
        coverage = coatMap(param_24, param_25, param_26);
        damage = data.y;
        int param_27 = 11;
        float param_28 = _453_uPaintWear;
        cut = effectParameter(param_27, param_28) * 0.75f;
        cutAA = max(0.00999999977648258209228515625f, fwidth(damage) * 0.60000002384185791015625f);
    }
    float intact = smoothstep(cut - cutAA, cut + cutAA, damage);
    int param_29 = 11;
    float param_30 = _453_uPaintWear;
    m *= lerp(1.0f, intact, step(9.9999997473787516355514526367188e-05f, effectParameter(param_29, param_30)));
    bool _5584 = !genericDistribution();
    bool _5593;
    if (_5584)
    {
        int param_31 = 9;
        float param_32 = _453_uPaintEnabled;
        _5593 = effectParameter(param_31, param_32) > 0.5f;
    }
    else
    {
        _5593 = _5584;
    }
    bool _5597 = _5593 && (_453_uHasMaskHeight != 0u);
    bool _5607;
    if (_5597)
    {
        int param_33 = 17;
        float param_34 = _453_uPaintDepthAmount;
        _5607 = effectParameter(param_33, param_34) > 0.0f;
    }
    else
    {
        _5607 = _5597;
    }
    if (_5607)
    {
        int param_35 = 17;
        float param_36 = _453_uPaintDepthAmount;
        float3 param_37 = p;
        float3 param_38 = n;
        m *= (1.0f - ((effectParameter(param_35, param_36) * (0.550000011920928955078125f + (0.449999988079071044921875f * paintPatch))) * paintSubstrateWear(param_37, param_38)));
    }
    if (!genericDistribution())
    {
        int param_39 = 16;
        float param_40 = _453_uPaintCoverage;
        float _5643;
        if (_453_uCoatEnabled != 0u)
        {
            _5643 = data.y;
        }
        else
        {
            _5643 = 1.0f;
        }
        float3 param_41 = p;
        float3 param_42 = phase;
        float param_43 = flake;
        float param_44 = grain;
        float param_45 = _5643;
        m *= (effectParameter(param_39, param_40) * paintMacroIntact(param_41, param_42, param_43, param_44, param_45));
    }
    s.paintMask = m;
    s.layerCoverage = m;
    float3 param_46 = _453_uPaintColor;
    float3 pigment = effectColor(param_46) * ((0.954999983310699462890625f + (paintPatch * 0.0350000001490116119384765625f)) + (grain * 0.00999999977648258209228515625f));
    if (_453_uCoatEnabled != 0u)
    {
        float3 param_47 = _453_uPaintColor;
        float3 param_48 = p;
        float3 param_49 = n;
        int param_50 = 1;
        pigment = effectColor(param_47) * clamp(coatMap(param_48, param_49, param_50) / max(_453_uCoatPaintMean, 0.00999999977648258209228515625f.xxx), 0.87999999523162841796875f.xxx, 1.03999996185302734375f.xxx);
        grain = data.z;
    }
    s.color = lerp(s.color, pigment, m.xxx);
    float _5721;
    if (_453_uCoatEnabled != 0u)
    {
        int param_51 = 12;
        float param_52 = _453_uPaintRough;
        _5721 = (coverage.z * effectParameter(param_51, param_52)) / 0.920000016689300537109375f;
    }
    else
    {
        int param_53 = 12;
        float param_54 = _453_uPaintRough;
        _5721 = effectParameter(param_53, param_54) + ((paintPatch - 0.5f) * 0.02500000037252902984619140625f);
    }
    s.rough = lerp(s.rough, clamp(_5721, 0.20000000298023223876953125f, 1.0f), m);
    int param_55 = 14;
    float param_56 = _453_uPaintBarkKeep;
    s.h *= lerp(1.0f, effectParameter(param_55, param_56), m);
    int param_57 = 14;
    float param_58 = _453_uPaintBarkKeep;
    s.normalWeight *= lerp(1.0f, effectParameter(param_57, param_58), m);
    int param_59 = 14;
    float param_60 = _453_uPaintBarkKeep;
    s.detailGradient *= lerp(1.0f, effectParameter(param_59, param_60), m);
    bool _5785 = _453_uCoatEnabled != 0u;
    bool _5805;
    if (_5785)
    {
        bool _5790 = _453_uPass == (-1);
        bool _5797;
        if (!_5790)
        {
            _5797 = _453_uPass == 1;
        }
        else
        {
            _5797 = _5790;
        }
        bool _5804;
        if (!_5797)
        {
            _5804 = _453_uPass == 10;
        }
        else
        {
            _5804 = _5797;
        }
        _5805 = _5804;
    }
    else
    {
        _5805 = _5785;
    }
    if (_5805)
    {
        float3 param_61 = p;
        float3 param_62 = n;
        int param_63 = 6;
        int param_64 = 13;
        float param_65 = _453_uPaintNormalStrength;
        s.detailGradient += ((coatNormalGradient(param_61, param_62, param_63) * m) * effectParameter(param_64, param_65));
    }
    bool _5829 = _453_uPass == (-1);
    bool _5836;
    if (!_5829)
    {
        _5836 = _453_uPass == 2;
    }
    else
    {
        _5836 = _5829;
    }
    bool _5843;
    if (!_5836)
    {
        _5843 = _453_uPass == 5;
    }
    else
    {
        _5843 = _5836;
    }
    bool _5850;
    if (!_5843)
    {
        _5850 = _453_uPass == 10;
    }
    else
    {
        _5850 = _5843;
    }
    if (_5850)
    {
        float _5857;
        if (_453_uCoatEnabled != 0u)
        {
            float3 param_66 = p;
            float3 param_67 = n;
            int param_68 = 4;
            _5857 = coatMap(param_66, param_67, param_68).y;
        }
        else
        {
            _5857 = clamp(0.9700000286102294921875f + (grain * 0.02999999932944774627685546875f), 0.0f, 1.0f);
        }
        float localAO = _5857;
        int param_69 = 15;
        float param_70 = _453_uPaintAO;
        s.localAO *= lerp(1.0f, localAO, m * effectParameter(param_69, param_70));
    }
    float _5894;
    if (_453_uCoatEnabled != 0u)
    {
        _5894 = 0.0f;
    }
    else
    {
        _5894 = (grain - 0.5f) * 3.5000000934815034270286560058594e-05f;
    }
    int param_71 = 13;
    float param_72 = _453_uPaintNormalStrength;
    s.coatH += (((m * (0.00011999999696854501962661743164062f + _5894)) * effectParameter(param_71, param_72)) / _453_uTreeHeight);
    return s;
}

float blendCondition(Surface s, float3 p, float3 n, int slot, float substrateWear)
{
    float4 h = _453_uBlendHeight[slot];
    float4 hs = _453_uBlendHeightSource[slot];
    float4 limits = _453_uBlendLimits[slot];
    float4 target = _453_uBlendTarget[slot];
    float m = 1.0f;
    if (h.x > 0.5f)
    {
        float _7904;
        if (_453_uHasHeightMap != 0u)
        {
            float3 param = p;
            float3 param_1 = n;
            _7904 = barkHeight(param, param_1);
        }
        else
        {
            _7904 = (_453_uHasMaskHeight != 0u) ? substrateWear : 0.5f;
        }
        float height = _7904;
        if (hs.x > 0.5f)
        {
            float _7928;
            if (hs.x > 1.5f)
            {
                _7928 = materialHeights[clamp(int(hs.y), 0, 15)];
            }
            else
            {
                _7928 = ((s.h * _453_uNormalStrength) * _453_uRelief) + s.coatH;
            }
            float physical = _7928;
            height = clamp(0.5f + (((physical * _453_uTreeHeight) * 1000.0f) / max(hs.z, 0.100000001490116119384765625f)), 0.0f, 1.0f);
        }
        float selected = smoothstep(h.z - h.w, h.z + h.w, height);
        if (h.x < 1.5f)
        {
            selected = 1.0f - selected;
        }
        m *= lerp(1.0f, selected, h.y);
    }
    float3 param_2 = clamp(s.color, 0.0f.xxx, 1.0f.xxx);
    float lum = dot(fromSRGB(param_2), float3(0.2125999927520751953125f, 0.715200006961822509765625f, 0.072200000286102294921875f));
    if (limits.x > 0.0f)
    {
        m *= smoothstep(limits.x - limits.z, limits.x + limits.z, lum);
    }
    if (limits.y < 1.0f)
    {
        m *= (1.0f - smoothstep(limits.y - limits.z, limits.y + limits.z, lum));
    }
    bool _8042 = limits.w > 0.5f;
    bool _8048;
    if (_8042)
    {
        _8048 = limits.w < 1.5f;
    }
    else
    {
        _8048 = _8042;
    }
    if (_8048)
    {
        m *= materialBarkWeight;
    }
    else
    {
        if (limits.w > 1.5f)
        {
            m *= materialWeights[clamp(int(target.x), 0, 15)];
        }
    }
    if (target.y > 0.5f)
    {
        m *= (1.0f - materialPaintWeight);
    }
    if (target.z > 0.5f)
    {
        m *= (1.0f - materialMossWeight);
    }
    return clamp(m, 0.0f, 1.0f);
}

float3 blendRGB(float3 b, float3 f, int mode)
{
    if (mode == 1)
    {
        return b * f;
    }
    if (mode == 2)
    {
        return 1.0f.xxx - ((1.0f.xxx - b) * (1.0f.xxx - f));
    }
    if (mode == 3)
    {
        return lerp((b * 2.0f) * f, 1.0f.xxx - (((1.0f.xxx - b) * 2.0f) * (1.0f.xxx - f)), step(0.5f.xxx, b));
    }
    if (mode == 4)
    {
        float3 d = lerp(((((b * 16.0f) - 12.0f.xxx) * b) + 4.0f.xxx) * b, sqrt(max(b, 0.0f.xxx)), step(0.25f.xxx, b));
        return lerp(b - (((1.0f.xxx - (f * 2.0f)) * b) * (1.0f.xxx - b)), b + (((f * 2.0f) - 1.0f.xxx) * (d - b)), step(0.5f.xxx, f));
    }
    if (mode == 5)
    {
        return min(b, f);
    }
    if (mode == 6)
    {
        return max(b, f);
    }
    if (mode == 7)
    {
        float v = max(f.x, max(f.y, f.z));
        float bv = max(b.x, max(b.y, b.z));
        float3 _7858;
        if (v > 1.0000000116860974230803549289703e-07f)
        {
            _7858 = f * (bv / v);
        }
        else
        {
            _7858 = bv.xxx;
        }
        return _7858;
    }
    return f;
}

Surface blendedLayer(int id, inout Surface s, Surface f, float3 p, float3 n, float fine, int slot, float amount, float seed, float substrateWear)
{
    float4 bc = _453_uBlendColor[slot];
    float4 modes = _453_uBlendChannels[slot];
    float4 extra = _453_uBlendExtra[slot];
    float4 cfg = _453_uEffectConfig[slot];
    float coverage = clamp(f.layerCoverage, 0.0f, 1.0f);
    float denom = max(coverage, 9.9999999747524270787835121154785e-07f);
    if (coverage <= 9.9999999747524270787835121154785e-07f)
    {
        lastMaterialCoverage = 0.0f;
        return s;
    }
    float3 source = f.color / denom.xxx;
    if (id == 4)
    {
        int param = 36;
        float param_1 = 0.4199999868869781494140625f;
        source = (1.0f - effectParameter(param, param_1)).xxx;
    }
    if (id == 5)
    {
        float3 param_2 = (p * float3(7.0f, 5.0f, 7.0f)) + seed.xxx;
        int param_3 = 30;
        float param_4 = _453_uVariation;
        float3 param_5 = (0.5f + ((_noise(param_2) - 0.5f) * effectParameter(param_3, param_4))).xxx;
        source = toSRGB(param_5);
    }
    if (((((id == 8) || (id == 9)) || (id == 11)) || (id == 12)) || (id == 14))
    {
        float3 param_6 = 0.5f.xxx;
        int param_7 = 5;
        float param_8 = 0.4000000059604644775390625f;
        source = effectColor(param_6) * (0.89999997615814208984375f + ((fine * effectParameter(param_7, param_8)) * 0.20000000298023223876953125f));
    }
    Surface param_9 = s;
    float3 param_10 = p;
    float3 param_11 = n;
    int param_12 = slot;
    float param_13 = substrateWear;
    float condition = blendCondition(param_9, param_10, param_11, param_12, param_13);
    float alpha = clamp((amount * coverage) * condition, 0.0f, 1.0f);
    lastMaterialCoverage = alpha;
    float3 param_14 = clamp(s.color, 0.0f.xxx, 1.0f.xxx);
    float3 b = fromSRGB(param_14);
    float3 param_15 = clamp(source, 0.0f.xxx, 1.0f.xxx);
    float3 fg = fromSRGB(param_15);
    if (((alpha * cfg.y) * bc.y) > 0.0f)
    {
        float3 param_16 = b;
        float3 param_17 = fg;
        int param_18 = int(bc.x);
        float3 param_19 = clamp(lerp(b, blendRGB(param_16, param_17, param_18), ((alpha * cfg.y) * bc.y).xxx), 0.0f.xxx, 1.0f.xxx);
        s.color = toSRGB(param_19);
    }
    float ar = (alpha * cfg.z) * bc.z;
    float rough = f.rough / denom;
    float targetR = rough;
    bool _8277 = modes.x > 0.5f;
    bool _8283;
    if (_8277)
    {
        _8283 = modes.x < 1.5f;
    }
    else
    {
        _8283 = _8277;
    }
    if (_8283)
    {
        targetR = max(s.rough, rough);
    }
    else
    {
        bool _8293 = modes.x > 1.5f;
        bool _8299;
        if (_8293)
        {
            _8299 = modes.x < 2.5f;
        }
        else
        {
            _8299 = _8293;
        }
        if (_8299)
        {
            targetR = min(s.rough, rough);
        }
        else
        {
            if (modes.x > 2.5f)
            {
                targetR = s.rough + extra.z;
            }
        }
    }
    s.rough = clamp(lerp(s.rough, targetR, ar), 0.0199999995529651641845703125f, 1.0f);
    float keep = clamp(((f.normalWeight - 1.0f) + coverage) / denom, 0.0f, 1.0f);
    float an = (alpha * cfg.w) * bc.w;
    float ah = (alpha * cfg.w) * extra.x;
    if (modes.w > 2.5f)
    {
        an = 0.0f;
    }
    else
    {
        bool _8357 = modes.w > 0.5f;
        bool _8363;
        if (_8357)
        {
            _8363 = modes.w < 1.5f;
        }
        else
        {
            _8363 = _8357;
        }
        if (_8363)
        {
            keep = 1.0f;
        }
        else
        {
            if (modes.w > 1.5f)
            {
                keep = 0.0f;
            }
        }
    }
    float ownH = f.h / denom;
    float ownCoat = f.coatH / denom;
    s.normalWeight *= (1.0f - (an * (1.0f - keep)));
    s.detailGradient = (s.detailGradient * (1.0f - (an * (1.0f - keep)))) + ((f.detailGradient / denom.xxx) * an);
    if (modes.y > 1.5f)
    {
        ah = 0.0f;
    }
    bool _8416 = modes.y > 0.5f;
    bool _8422;
    if (_8416)
    {
        _8422 = modes.y < 1.5f;
    }
    else
    {
        _8422 = _8416;
    }
    float hk = _8422 ? 0.0f : keep;
    s.h = (s.h * (1.0f - (ah * (1.0f - hk)))) + (ownH * ah);
    s.coatH = (s.coatH * (1.0f - (ah * (1.0f - hk)))) + (ownCoat * ah);
    float ownAO = clamp(1.0f + ((f.localAO - 1.0f) / denom), 0.0f, 1.0f);
    float aa = (alpha * _453_uEffectMeta[slot].z) * extra.y;
    float targetAO = ownAO;
    bool _8472 = modes.z > 0.5f;
    bool _8478;
    if (_8472)
    {
        _8478 = modes.z < 1.5f;
    }
    else
    {
        _8478 = _8472;
    }
    if (_8478)
    {
        targetAO = min(s.localAO, ownAO);
    }
    else
    {
        bool _8488 = modes.z > 1.5f;
        bool _8494;
        if (_8488)
        {
            _8494 = modes.z < 2.5f;
        }
        else
        {
            _8494 = _8488;
        }
        if (_8494)
        {
            targetAO = s.localAO * ownAO;
        }
        else
        {
            if (modes.z > 2.5f)
            {
                aa = 0.0f;
            }
        }
    }
    s.localAO = lerp(s.localAO, targetAO, aa);
    if (id == 1)
    {
        s.paintMask = 1.0f - ((1.0f - s.paintMask) * (1.0f - alpha));
    }
    s.layerCoverage = coverage;
    if (slot == _453_uEffectSelected)
    {
        s.selectedCoverage = alpha;
    }
    return s;
}

Surface layer(int id, Surface s, float3 p, float3 n, float fine, float barkLum, float4 masks0, float2 masks1, int slot, float substrateWear)
{
    surfaceEffectSlot = slot;
    float4 _8703;
    if (slot < 0)
    {
        _8703 = _453_uLayerParams[id];
    }
    else
    {
        _8703 = _453_uEffectConfig[slot];
    }
    float4 cfg = _8703;
    float _8720;
    if (slot < 0)
    {
        int param = id;
        float4 param_1 = masks0;
        float2 param_2 = masks1;
        _8720 = layerMask(param, param_1, param_2);
    }
    else
    {
        float3 param_3 = p - vP;
        int param_4 = slot;
        float2 param_5 = shiftedUV(param_3);
        _8720 = effectMask(param_4, param_5);
    }
    float amount = cfg.x * _8720;
    float _8747;
    if (slot < 0)
    {
        _8747 = _453_uLayerSeed[id];
    }
    else
    {
        _8747 = _453_uEffectMeta[slot].y;
    }
    float seed = _453_uSeed + _8747;
    bool _8762 = slot >= 0;
    bool _8769;
    if (_8762)
    {
        _8769 = _453_uBlendColor[slot].x >= 0.0f;
    }
    else
    {
        _8769 = _8762;
    }
    bool blended = _8769;
    Surface inputSurface = s;
    if (blended)
    {
        inputSurface = _8775;
    }
    Surface next = inputSurface;
    next.layerCoverage = 1.0f;
    lastMaterialCoverage = 0.0f;
    if ((slot >= 0) && (!blended))
    {
        int param_6 = 39;
        float param_7 = 0.0f;
        float role = effectParameter(param_6, param_7);
        if ((role > 0.5f) && (role < 1.5f))
        {
            amount *= (0.63999998569488525390625f + (0.36000001430511474609375f * substrateWear));
        }
        else
        {
            if ((role > 1.5f) && (role < 2.5f))
            {
                amount *= (0.699999988079071044921875f + (0.300000011920928955078125f * (1.0f - substrateWear)));
            }
            else
            {
                if ((role > 3.5f) && (role < 4.5f))
                {
                    amount *= (0.800000011920928955078125f + (0.20000000298023223876953125f * (1.0f - substrateWear)));
                }
            }
        }
    }
    bool _8834 = slot >= 0;
    bool _8841;
    if (_8834)
    {
        _8841 = _453_uPaintAdjust[slot].x > 0.5f;
    }
    else
    {
        _8841 = _8834;
    }
    bool painted = _8841 && (_453_uPaintPacked != 0u);
    if (painted)
    {
        float3 param_8 = p - vP;
        float2 _8853 = shiftedUV(param_8);
        bool4 _8858 = blended.xxxx;
        Surface param_9 = inputSurface;
        float3 param_10 = p;
        float3 param_11 = n;
        float2 param_12 = _8853;
        int param_13 = slot;
        float4 param_14 = float4(_8858.x ? 1.0f.xxxx.x : cfg.x, _8858.y ? 1.0f.xxxx.y : cfg.y, _8858.z ? 1.0f.xxxx.z : cfg.z, _8858.w ? 1.0f.xxxx.w : cfg.w);
        float param_15 = blended ? 1.0f : amount;
        Surface _8874 = paintedLayer(param_9, param_10, param_11, param_12, param_13, param_14, param_15);
        next = _8874;
        if (!blended)
        {
            lastMaterialCoverage = amount * next.layerCoverage;
            return next;
        }
    }
    else
    {
        if (id >= 6)
        {
            int param_16 = id;
            Surface param_17 = inputSurface;
            float3 param_18 = p;
            float3 param_19 = n;
            float param_20 = seed;
            Surface _8900 = extraSurface(param_16, param_17, param_18, param_19, param_20);
            next = _8900;
        }
        if (id == 5)
        {
            float3 param_21 = (p * float3(7.0f, 5.0f, 7.0f)) + seed.xxx;
            float macro = _noise(param_21);
            int param_22 = 30;
            float param_23 = _453_uVariation;
            next.color *= (1.0f + ((macro - 0.5f) * effectParameter(param_22, param_23)));
        }
        if (id == 0)
        {
            Surface param_24 = inputSurface;
            float3 param_25 = p;
            float3 param_26 = n;
            float param_27 = seed;
            float param_28 = barkLum;
            Surface _8940 = mossCoating(param_24, param_25, param_26, param_27, param_28);
            next = _8940;
        }
        if (id == 1)
        {
            Surface param_29 = inputSurface;
            float3 param_30 = p;
            float3 param_31 = n;
            float param_32 = seed;
            float param_33 = barkLum;
            Surface _8955 = paintCoating(param_29, param_30, param_31, param_32, param_33);
            next = _8955;
        }
        if (id == 2)
        {
            int param_34 = 25;
            float param_35 = _453_uLichenEnabled;
            float _8968;
            if (genericDistribution())
            {
                _8968 = 1.0f;
            }
            else
            {
                int param_36 = 24;
                float param_37 = _453_uLichen;
                int param_38 = 24;
                float param_39 = _453_uLichen;
                int param_40 = 24;
                float param_41 = _453_uLichen;
                int param_42 = 31;
                float param_43 = _453_uScale;
                float3 param_44 = (((p * effectParameter(param_42, param_43)) * 6.0f) + 23.0f.xxx) + seed.xxx;
                int param_45 = 31;
                float param_46 = _453_uScale;
                float3 param_47 = (((p * effectParameter(param_45, param_46)) * 21.0f) + 31.0f.xxx) + seed.xxx;
                _8968 = step(9.9999997473787516355514526367188e-05f, effectParameter(param_36, param_37)) * smoothstep((1.0f - effectParameter(param_38, param_39)) - 0.04500000178813934326171875f, (1.0f - effectParameter(param_40, param_41)) + 0.04500000178813934326171875f, (_noise(param_44) * 0.75f) + (_noise(param_47) * 0.25f));
            }
            float m = effectParameter(param_34, param_35) * _8968;
            next.layerCoverage = m;
            float3 param_48 = float3(0.589999973773956298828125f, 0.62999999523162841796875f, 0.449999988079071044921875f);
            next.color = lerp(inputSurface.color, effectColor(param_48) * (0.85000002384185791015625f + (fine * 0.25f)), m.xxx);
            int param_49 = 32;
            float param_50 = 0.949999988079071044921875f;
            next.rough = lerp(inputSurface.rough, effectParameter(param_49, param_50), m);
            int param_51 = 33;
            float param_52 = 1.0f;
            next.h += ((m * 0.07999999821186065673828125f) * effectParameter(param_51, param_52));
        }
        if (id == 3)
        {
            int param_53 = 27;
            float param_54 = _453_uDirtEnabled;
            int param_55 = 26;
            float param_56 = _453_uDirt;
            float _9088;
            if (genericDistribution())
            {
                _9088 = 1.0f;
            }
            else
            {
                float3 param_57 = ((p * 27.0f) + 5.0f.xxx) + seed.xxx;
                _9088 = (1.0f - smoothstep(0.014999999664723873138427734375f, 0.23999999463558197021484375f, p.y)) * (0.550000011920928955078125f + (_noise(param_57) * 0.449999988079071044921875f));
            }
            float m_1 = (effectParameter(param_53, param_54) * effectParameter(param_55, param_56)) * _9088;
            next.layerCoverage = m_1;
            float3 param_58 = float3(0.1599999964237213134765625f, 0.115000002086162567138671875f, 0.064999997615814208984375f);
            next.color = lerp(inputSurface.color, effectColor(param_58), m_1.xxx);
            int param_59 = 34;
            float param_60 = 0.939999997615814208984375f;
            next.rough = lerp(inputSurface.rough, effectParameter(param_59, param_60), m_1);
            int param_61 = 35;
            float param_62 = 1.0f;
            next.h += ((m_1 * 0.0599999986588954925537109375f) * effectParameter(param_61, param_62));
        }
        if (id == 4)
        {
            int param_63 = 29;
            float param_64 = _453_uWetEnabled;
            int param_65 = 28;
            float param_66 = _453_uWet;
            float _9162;
            if (genericDistribution())
            {
                _9162 = 1.0f;
            }
            else
            {
                int param_67 = 31;
                float param_68 = _453_uScale;
                int param_69 = 31;
                float param_70 = _453_uScale;
                int param_71 = 31;
                float param_72 = _453_uScale;
                float3 param_73 = ((p * float3(effectParameter(param_67, param_68) * 9.0f, effectParameter(param_69, param_70) * 0.25f, effectParameter(param_71, param_72) * 9.0f)) + 77.0f.xxx) + seed.xxx;
                _9162 = smoothstep(0.4000000059604644775390625f, 0.680000007152557373046875f, _noise(param_73)) * (0.449999988079071044921875f + ((1.0f - p.y) * 0.550000011920928955078125f));
            }
            float m_2 = (effectParameter(param_63, param_64) * effectParameter(param_65, param_66)) * _9162;
            next.layerCoverage = m_2;
            int param_74 = 36;
            float param_75 = 0.4199999868869781494140625f;
            next.color *= (1.0f - (m_2 * effectParameter(param_74, param_75)));
            int param_76 = 37;
            float param_77 = 0.2800000011920928955078125f;
            next.rough = lerp(inputSurface.rough, effectParameter(param_76, param_77), m_2);
        }
    }
    if (blended)
    {
        int param_78 = id;
        Surface param_79 = s;
        Surface param_80 = next;
        float3 param_81 = p;
        float3 param_82 = n;
        float param_83 = fine;
        int param_84 = slot;
        float param_85 = amount;
        float param_86 = seed;
        float param_87 = substrateWear;
        Surface _9248 = blendedLayer(param_78, param_79, param_80, param_81, param_82, param_83, param_84, param_85, param_86, param_87);
        return _9248;
    }
    float _9253;
    if (slot < 0)
    {
        _9253 = _453_uLayerAO[id];
    }
    else
    {
        _9253 = _453_uEffectMeta[slot].z;
    }
    float aoChannel = _9253;
    bool _9267 = slot >= 0;
    bool _9274;
    if (_9267)
    {
        _9274 = slot == _453_uEffectSelected;
    }
    else
    {
        _9274 = _9267;
    }
    float _9275;
    if (_9274)
    {
        _9275 = amount * next.layerCoverage;
    }
    else
    {
        _9275 = s.selectedCoverage;
    }
    float selected = _9275;
    lastMaterialCoverage = amount * next.layerCoverage;
    float _9356;
    if (id == 1)
    {
        _9356 = 1.0f - ((1.0f - s.paintMask) * (1.0f - ((amount * cfg.y) * next.paintMask)));
    }
    else
    {
        _9356 = s.paintMask;
    }
    Surface _9379 = { lerp(s.color, next.color, (amount * cfg.y).xxx), lerp(s.h, next.h, amount * cfg.w), lerp(s.rough, next.rough, amount * cfg.z), lerp(s.normalWeight, next.normalWeight, amount * cfg.w), lerp(s.coatH, next.coatH, amount * cfg.w), lerp(s.localAO, next.localAO, amount * aoChannel), lerp(s.detailGradient, next.detailGradient, (amount * cfg.w).xxx), _9356, next.layerCoverage, selected };
    return _9379;
}

bool physicalMaterial(int id)
{
    return (((((((id == 0) || (id == 1)) || (id == 2)) || (id == 3)) || (id == 6)) || (id == 7)) || (id == 10)) || (id == 15);
}

void rememberMaterial(int slot, int type, Surface s)
{
    int param = type;
    float a = physicalMaterial(param) ? lastMaterialCoverage : 0.0f;
    for (int j = 0; j < 16; j++)
    {
        if (j >= slot)
        {
            break;
        }
        materialWeights[j] *= (1.0f - a);
    }
    materialBarkWeight *= (1.0f - a);
    materialPaintWeight = (materialPaintWeight * (1.0f - a)) + ((type == 1) ? a : 0.0f);
    materialMossWeight = (materialMossWeight * (1.0f - a)) + ((type == 0) ? a : 0.0f);
    materialWeights[slot] = a;
    materialHeights[slot] = ((s.h * _453_uNormalStrength) * _453_uRelief) + s.coatH;
}

void accumulateEmission(int slot, int type, float3 p, float3 n)
{
    bool _8540 = _453_uPass != (-1);
    bool _8546;
    if (_8540)
    {
        _8546 = _453_uPass != 14;
    }
    else
    {
        _8546 = _8540;
    }
    bool _8554;
    if (!_8546)
    {
        _8554 = _453_uEmissionMaximum <= 0.0f;
    }
    else
    {
        _8554 = _8546;
    }
    if (_8554)
    {
        return;
    }
    float a = clamp(lastMaterialCoverage * _453_uEffectConfig[slot].y, 0.0f, 1.0f);
    int param = type;
    if (physicalMaterial(param))
    {
        surfaceEmission *= (1.0f - a);
    }
    float4 em = _453_uEffectEmission[slot];
    float4 shape = _453_uEffectEmissionShape[slot];
    if ((em.w <= 0.0f) || (a <= 0.0f))
    {
        return;
    }
    float _8597;
    if (shape.x > 0.5f)
    {
        float3 param_1 = p;
        float3 param_2 = n;
        _8597 = 1.0f - smoothstep(shape.y - shape.z, shape.y + shape.z, barkHeight(param_1, param_2));
    }
    else
    {
        _8597 = 1.0f;
    }
    float pattern = _8597;
    float3 param_3 = em.xyz;
    surfaceEmission += (((fromSRGB(param_3) * em.w) * a) * pattern);
}

Surface surface(float3 p, float3 n, float2 uv)
{
    float3 param = p;
    float3 param_1 = n;
    float3 bark = barkMapSample(uBark, _uBark_sampler, param, param_1);
    float lum = dot(bark, float3(0.2125999927520751953125f, 0.715200006961822509765625f, 0.072200000286102294921875f));
    float3 param_2 = (p * float3(7.0f, 5.0f, 7.0f)) + _453_uSeed.xxx;
    float macro = _noise(param_2);
    float3 param_3 = (p * (_453_uBarkScale * 180.0f)) + _453_uSeed.xxx;
    float fine = _noise(param_3);
    float3 color = bark * _453_uTint;
    float3 param_4 = uOriginal.Sample(_uOriginal_sampler, vSourceUV).xyz;
    float3 param_5 = fromSRGB(param_4) * _453_uOriginalFactor;
    color = lerp(color, toSRGB(param_5) * _453_uTint, _453_uOriginalMix.xxx);
    float3 _9445;
    if (_453_uHasRoughMap != 0u)
    {
        float3 param_6 = p;
        float3 param_7 = n;
        _9445 = barkMapSample(uRoughMap, _uRoughMap_sampler, param_6, param_7);
    }
    else
    {
        _9445 = 0.839999973773956298828125f.xxx;
    }
    float3 roughData = _9445;
    float _9460;
    if (_453_uHasMaskHeight != 0u)
    {
        float _9466;
        if (_453_uNormalY < 0.0f)
        {
            _9466 = roughData.z;
        }
        else
        {
            _9466 = roughData.y;
        }
        _9460 = clamp(_9466, 0.0f, 1.0f);
    }
    else
    {
        _9460 = 0.5f;
    }
    float substrateWear = _9460;
    float _9482;
    if (_453_uHasRoughMap != 0u)
    {
        _9482 = clamp(roughData.x * _453_uRough, 0.100000001490116119384765625f, 1.0f);
    }
    else
    {
        _9482 = clamp((_453_uRough + ((lum - 0.449999988079071044921875f) * 0.119999997317790985107421875f)) + ((macro - 0.5f) * 0.07999999821186065673828125f), 0.119999997317790985107421875f, 1.0f);
    }
    float rough = _9482;
    float _9509;
    if (_453_uHasNormalMap != 0u)
    {
        float _9519;
        if ((_453_uHeightWithNormal != 0u) && (_453_uHasHeightMap != 0u))
        {
            float3 param_8 = p;
            float3 param_9 = n;
            _9519 = barkHeight(param_8, param_9);
        }
        else
        {
            _9519 = 0.0f;
        }
        _9509 = _9519;
    }
    else
    {
        float _9533;
        if (_453_uHasHeightMap != 0u)
        {
            float3 param_10 = p;
            float3 param_11 = n;
            _9533 = barkHeight(param_10, param_11);
        }
        else
        {
            _9533 = lum * 0.85000002384185791015625f;
        }
        _9509 = _9533;
    }
    float h = _9509 + (((fine - 0.5f) * _453_uDetail) * 0.07999999821186065673828125f);
    float3 param_12 = p;
    float3 q = barkCoordinates(param_12) * _453_uBarkScale;
    float3 param_13 = (q * float3(7.0f, 0.550000011920928955078125f, 7.0f)) + _453_uSeed.xxx;
    float cracks = pow(1.0f - abs((_noise(param_13) * 2.0f) - 1.0f), 7.0f);
    if (_453_uBarkStyle == 1)
    {
        h = (h * 0.2800000011920928955078125f) + (((fine - 0.5f) * _453_uDetail) * 0.039999999105930328369140625f);
        color = lerp(color, lum.xxx * _453_uTint, 0.20000000298023223876953125f.xxx);
    }
    if (_453_uBarkStyle == 2)
    {
        h -= (cracks * 0.5f);
        color *= (1.0f - (cracks * 0.319999992847442626953125f));
        rough += (cracks * 0.0599999986588954925537109375f);
    }
    if (_453_uBarkStyle == 3)
    {
        float3 param_14 = (q * 3.0f) + _453_uSeed.xxx;
        float plates = smoothstep(0.37999999523162841796875f, 0.62000000476837158203125f, _noise(param_14));
        h += (plates * 0.25f);
        color *= (0.800000011920928955078125f + (plates * 0.2800000011920928955078125f));
    }
    bool _9647 = _453_uPass == (-1);
    bool _9654;
    if (!_9647)
    {
        _9654 = _453_uPass == 2;
    }
    else
    {
        _9654 = _9647;
    }
    bool _9661;
    if (!_9654)
    {
        _9661 = _453_uPass == 5;
    }
    else
    {
        _9661 = _9654;
    }
    bool _9668;
    if (!_9661)
    {
        _9668 = _453_uPass == 10;
    }
    else
    {
        _9668 = _9661;
    }
    float _9669;
    if (_9668)
    {
        float3 param_15 = p;
        float3 param_16 = n;
        _9669 = barkCavityAO(param_15, param_16);
    }
    else
    {
        _9669 = 1.0f;
    }
    Surface _9679 = { color, h, rough, 1.0f, 0.0f, _9669, 0.0f.xxx, 0.0f, 0.0f, 0.0f };
    Surface s = _9679;
    float2 param_17 = uv;
    float4 a = mask0(param_17);
    float2 param_18 = uv;
    float2 b = mask1(param_18);
    surfaceEmission = 0.0f.xxx;
    materialBarkWeight = 1.0f;
    materialPaintWeight = 0.0f;
    materialMossWeight = 0.0f;
    for (int j = 0; j < 16; j++)
    {
        materialWeights[j] = 0.0f;
        materialHeights[j] = 0.0f;
    }
    if (false)
    {
        [loop] for (int i = 0; i < 16; i++)
        {
            if (i >= _453_uEffectCount)
            {
                break;
            }
            int param_19 = int(_453_uEffectMeta[i].x);
            Surface param_20 = s;
            float3 param_21 = p;
            float3 param_22 = n;
            float param_23 = fine;
            float param_24 = lum;
            float4 param_25 = a;
            float2 param_26 = b;
            int param_27 = i;
            float param_28 = substrateWear;
            Surface _9743 = layer(param_19, param_20, param_21, param_22, param_23, param_24, param_25, param_26, param_27, param_28);
            s = _9743;
            int param_29 = i;
            int param_30 = int(_453_uEffectMeta[i].x);
            Surface param_31 = s;
            rememberMaterial(param_29, param_30, param_31);
            int param_32 = i;
            int param_33 = int(_453_uEffectMeta[i].x);
            float3 param_34 = p;
            float3 param_35 = n;
            accumulateEmission(param_32, param_33, param_34, param_35);
        }
    }
    else
    {
        [loop] for (int i_1 = 0; i_1 < 6; i_1++)
        {
            int param_36 = _453_uLayerOrder[i_1];
            Surface param_37 = s;
            float3 param_38 = p;
            float3 param_39 = n;
            float param_40 = fine;
            float param_41 = lum;
            float4 param_42 = a;
            float2 param_43 = b;
            int param_44 = -1;
            float param_45 = substrateWear;
            Surface _9799 = layer(param_36, param_37, param_38, param_39, param_40, param_41, param_42, param_43, param_44, param_45);
            s = _9799;
        }
    }
    surfaceEffectSlot = -1;
    Surface _9826 = { clamp(s.color, 0.0f.xxx, 1.0f.xxx), s.h, clamp(s.rough, 0.100000001490116119384765625f, 1.0f), s.normalWeight, s.coatH, s.localAO, s.detailGradient, s.paintMask, s.layerCoverage, s.selectedCoverage };
    return _9826;
}

PatchSurface patchSurface(float3 p)
{
    PatchSurface outPatch = _888;
    if (_453_uPatchBits == 0)
    {
        return outPatch;
    }
    [loop] for (int i = 0; i < 8; i++)
    {
        if (i >= _453_uPatchCount)
        {
            break;
        }
        bool _919 = (_453_uPatchBits & (1u << i)) == 0;
        bool _929;
        if (!_919)
        {
            _929 = _453_uPatchShape[i].x > 4.5f;
        }
        else
        {
            _929 = _919;
        }
        if (_929)
        {
            continue;
        }
        float3 delta = p - _453_uPatchOrigin[i].xyz;
        float2 q = float2(dot(delta, _453_uPatchU[i].xyz), dot(delta, _453_uPatchV[i].xyz));
        float kind = _453_uPatchShape[i].x;
        float feather = _453_uPatchShape[i].y;
        float seed = _453_uPatchShape[i].w;
        float3 param = float3(q * float2(9.0f, 2.0f), seed);
        float grain = _noise(param);
        float3 param_1 = float3(q * 3.0f, seed + 23.0f);
        float warp = (_noise(param_1) - 0.5f) * 0.100000001490116119384765625f;
        float r = length(q);
        float shape = r + warp;
        if ((kind > 2.5f) && (kind < 3.5f))
        {
            float3 param_2 = float3(q.y * 5.0f, seed, 7.0f);
            float center = (_noise(param_2) - 0.5f) * 0.5f;
            shape = max(abs(q.x - center) * (1.0f + (0.2199999988079071044921875f * sin((q.y * 17.0f) + seed))), abs(q.y));
        }
        float alpha = (1.0f - smoothstep(1.0f - feather, 1.0f, shape)) * _453_uPatchColor[i].w;
        float depth = abs(dot(delta, _453_uPatchN[i].xyz)) / max(_453_uPatchOrigin[i].w, 1.0000000116860974230803549289703e-07f);
        alpha *= (1.0f - smoothstep(0.75f, 1.0f, depth));
        float interior = 1.0f - smoothstep(0.7200000286102294921875f, 0.89999997615814208984375f, shape);
        float rim = exp(-pow((shape - 0.839999973773956298828125f) / 0.10999999940395355224609375f, 2.0f));
        float3 param_3 = float3(q * 2.0f, seed);
        float phase = ((r * _453_uPatchShape[i].z) + (_noise(param_3) * 0.449999988079071044921875f)) * 6.283185482025146484375f;
        float ring = 0.5f + ((0.5f * sin(phase)) * clamp(1.0f - (fwidth(phase) * 0.319999992847442626953125f), 0.0f, 1.0f));
        if (alpha <= 0.0f)
        {
            continue;
        }
        float3 wood = _453_uPatchColor[i].xyz * (0.87999999523162841796875f + (grain * 0.1500000059604644775390625f));
        float targetH = ((-_453_uPatchV[i].w) * interior) + (_453_uPatchN[i].w * rim);
        float keep = lerp(1.0f, 0.1500000059604644775390625f, interior);
        float targetRough = _453_uPatchU[i].w;
        if (kind < 0.5f)
        {
            wood *= (0.910000026226043701171875f + (ring * 0.12999999523162841796875f));
            targetH += ((((ring - 0.5f) * _453_uPatchV[i].w) * 0.02500000037252902984619140625f) * interior);
            targetRough += ((ring - 0.5f) * 0.02999999932944774627685546875f);
        }
        if ((kind > 0.5f) && (kind < 1.5f))
        {
            wood *= (0.920000016689300537109375f + (0.07999999821186065673828125f * sin((q.y * 70.0f) + (grain * 4.0f))));
            targetH += ((((grain - 0.5f) * _453_uPatchV[i].w) * 0.02500000037252902984619140625f) * interior);
        }
        if ((kind > 1.5f) && (kind < 2.5f))
        {
            wood *= (0.579999983310699462890625f + (ring * 0.4199999868869781494140625f));
            targetH = ((-_453_uPatchV[i].w) * (1.0f - smoothstep(0.0f, 0.449999988079071044921875f, r))) + (_453_uPatchN[i].w * rim);
            keep = 0.60000002384185791015625f;
        }
        if ((kind > 2.5f) && (kind < 3.5f))
        {
            wood = _453_uPatchColor[i].xyz * (0.64999997615814208984375f + (grain * 0.20000000298023223876953125f));
            targetH = (-_453_uPatchV[i].w) * (1.0f - smoothstep(0.0199999995529651641845703125f, 0.85000002384185791015625f, shape));
            keep = 0.800000011920928955078125f;
        }
        if (kind > 3.5f)
        {
            wood *= (0.920000016689300537109375f + (grain * 0.07999999821186065673828125f));
            targetH = ((-_453_uPatchV[i].w) * interior) + ((_453_uPatchN[i].w * rim) * (0.3499999940395355224609375f + (grain * 0.64999997615814208984375f)));
        }
        if ((kind < 1.5f) || (kind > 3.5f))
        {
            wood = lerp(_453_uPatchColor[i].xyz * float3(0.519999980926513671875f, 0.4799999892711639404296875f, 0.430000007152557373046875f), wood, interior.xxx);
        }
        float a = alpha * _453_uPatchChannels[i].x;
        outPatch.color = (outPatch.color * (1.0f - a)) + (wood * a);
        outPatch.colorAlpha = (outPatch.colorAlpha * (1.0f - a)) + a;
        a = alpha * _453_uPatchChannels[i].y;
        outPatch.rough = (outPatch.rough * (1.0f - a)) + (clamp(targetRough, 0.100000001490116119384765625f, 1.0f) * a);
        outPatch.roughAlpha = (outPatch.roughAlpha * (1.0f - a)) + a;
        a = alpha * _453_uPatchChannels[i].z;
        outPatch.h = lerp(outPatch.h, targetH, a);
        outPatch.normalKeep = lerp(outPatch.normalKeep, keep, a);
    }
    return outPatch;
}

float4 microBilinear(float2 uv, int level)
{
    uint _516_dummy_parameter;
    int2 size = int2(spvTextureSize(uMicroMap, uint(level), _516_dummy_parameter));
    float2 q = (frac(uv) * float2(size)) - 0.5f.xx;
    float2 f = frac(q);
    int2 i = int2(floor(q));
    int2 a = int2(((i.x % size.x) + size.x) % size.x, ((i.y % size.y) + size.y) % size.y);
    int2 b = (a + int2(1, 1)) % size;
    return lerp(lerp(uMicroMap.Load(int3(a, level)), uMicroMap.Load(int3(int2(b.x, a.y), level)), f.x.xxxx), lerp(uMicroMap.Load(int3(int2(a.x, b.y), level)), uMicroMap.Load(int3(b, level)), f.x.xxxx), f.y.xxxx);
}

float4 microSample(float2 uv)
{
    uint _609_dummy_parameter;
    float2 size = float2(int2(spvTextureSize(uMicroMap, uint(0), _609_dummy_parameter)));
    float rho = max(length(ddx(uv) * size), length(ddy(uv) * size));
    float lod = clamp(log2(max(rho, 1.0f)), 0.0f, float(_453_uMicroLevels - 1));
    int lo = int(floor(lod));
    int hi = min((lo + 1), (_453_uMicroLevels - 1));
    float2 param = uv;
    int param_1 = lo;
    float2 param_2 = uv;
    int param_3 = hi;
    return lerp(microBilinear(param, param_1), microBilinear(param_2, param_3), frac(lod).xxxx);
}

float4 microField(float3 q, float3 n)
{
    float3 w = pow(abs(n), 4.0f.xxx);
    w /= max(dot(w, 1.0f.xxx), 9.9999997473787516355514526367188e-05f).xxx;
    float2 param = q.zy;
    float3 a = microSample(param).xyz;
    float2 param_1 = q.xz;
    float3 b = microSample(param_1).xyz;
    float2 param_2 = q.xy;
    float3 c = microSample(param_2).xyz;
    return float4((w.y * b.x) + (w.z * c.x), (w.x * a.y) + (w.z * c.y), (w.x * a.x) + (w.y * b.y), ((w.x * a.z) + (w.y * b.z)) + (w.z * c.z));
}

float2 normalSlopes(float2 uv)
{
    float2 param = uv;
    float3 _2714 = tileMap(uNormalMap, _uNormalMap_sampler, param);
    float3 n = normalize((_2714 * 2.0f) - 1.0f.xxx);
    return float2(n.x, n.y * _453_uNormalY) / max(n.z, 0.0500000007450580596923828125f).xx;
}

float3 referenceNormalGradient(float3 N, float3 T, float3 B)
{
    float3 param = vP;
    float3 q = barkCoordinates(param);
    float3 param_1 = vP + T;
    float3 qt = barkCoordinates(param_1) - q;
    float3 param_2 = vP + B;
    float3 qb = barkCoordinates(param_2) - q;
    float3 gx = (T * qt.x) + (B * qb.x);
    float3 gy = (T * qt.y) + (B * qb.y);
    float3 gz = (T * qt.z) + (B * qb.z);
    float3 param_3 = N;
    float3 nn = barkProjectionNormal(param_3);
    float3 param_4 = nn;
    float3 w = barkProjectionWeights(param_4);
    q = (q * _453_uBarkScale) + float3(_453_uSeed * 0.731000006198883056640625f, _453_uSeed * 0.310000002384185791015625f, _453_uSeed * 0.517000019550323486328125f);
    float2 param_5 = q.zy;
    float2 x = normalSlopes(param_5);
    float2 param_6 = q.xz;
    float2 y = normalSlopes(param_6);
    float2 param_7 = q.xy;
    float2 z = normalSlopes(param_7);
    return (((((gz * x.x) + (gy * x.y)) * w.x) + (((gx * y.x) + (gz * y.y)) * w.y)) + (((gx * z.x) + (gy * z.y)) * w.z)) * _453_uNormalStrength;
}

float sculptMediumFactor()
{
    float _489;
    if (_453_uSculptResponse.x > 0.5f)
    {
        _489 = (1.0f - ((_453_uSculptResponse.y * clamp(vSculpt, 0.0f, 1.0f)) * 0.5f)) / max(0.5f, 1.0f - (_453_uSculptResponse.y * 0.5f));
    }
    else
    {
        _489 = 1.0f;
    }
    return _489;
}

float sculptBroadFactor()
{
    float _461;
    if (_453_uSculptResponse.x > 0.5f)
    {
        _461 = (1.0f - ((_453_uSculptResponse.y * clamp(vSculpt, 0.0f, 1.0f)) * 0.89999997615814208984375f)) / max(0.100000001490116119384765625f, 1.0f - (_453_uSculptResponse.y * 0.89999997615814208984375f));
    }
    else
    {
        _461 = 1.0f;
    }
    return _461;
}

float3 studioDirect(float3 albedo, float3 N, float3 V, float3 L, float rough, float3 radiance)
{
    float nl = max(dot(N, L), 0.0f);
    float nv = max(dot(N, V), 9.9999997473787516355514526367188e-05f);
    float3 H = normalize(V + L);
    float nh = max(dot(N, H), 0.0f);
    float vh = max(dot(V, H), 0.0f);
    float alpha = max(0.0350000001490116119384765625f, rough * rough);
    float a2 = alpha * alpha;
    float d = ((nh * nh) * (a2 - 1.0f)) + 1.0f;
    float D = a2 / max((3.1415927410125732421875f * d) * d, 9.9999999747524270787835121154785e-07f);
    float k = ((rough + 1.0f) * (rough + 1.0f)) * 0.125f;
    float G = ((nl / ((nl * (1.0f - k)) + k)) * nv) / ((nv * (1.0f - k)) + k);
    float F = 0.039999999105930328369140625f + (0.959999978542327880859375f * pow(1.0f - vh, 5.0f));
    return ((((albedo * (1.0f - F)) / 3.1415927410125732421875f.xxx) + (((D * G) * F) / max((4.0f * nl) * nv, 9.9999997473787516355514526367188e-05f)).xxx) * nl) * radiance;
}

float3 studioLighting(float3 albedo, float3 N, float3 V, float3 L, float3 fill, float rough, float ao)
{
    float3 ambient = (lerp(float3(0.026000000536441802978515625f, 0.0309999994933605194091796875f, 0.039999999105930328369140625f), float3(0.104999996721744537353515625f, 0.11200000345706939697265625f, 0.119999997317790985107421875f), ((N.y * 0.5f) + 0.5f).xxx) * albedo) * ao;
    float3 param = albedo;
    float3 param_1 = N;
    float3 param_2 = V;
    float3 param_3 = L;
    float param_4 = rough;
    float3 param_5 = float3(2.7999999523162841796875f, 2.6879999637603759765625f, 2.519999980926513671875f);
    float3 param_6 = albedo;
    float3 param_7 = N;
    float3 param_8 = V;
    float3 param_9 = fill;
    float param_10 = rough;
    float3 param_11 = float3(0.3192000091075897216796875f, 0.35699999332427978515625f, 0.4199999868869781494140625f);
    return (studioDirect(param, param_1, param_2, param_3, param_4, param_5) + studioDirect(param_6, param_7, param_8, param_9, param_10, param_11)) + ambient;
}

void frag_main()
{
    surfaceEffectSlot = -1;
    surfaceEmission = 0.0f.xxx;
    materialBarkWeight = 1.0f;
    materialPaintWeight = 0.0f;
    materialMossWeight = 0.0f;
    lastMaterialCoverage = 0.0f;
    prepareBarkProjection();
    if (_453_uPass == 15)
    {
        outColor = float4(lerp(0.119999997317790985107421875f.xxx, float3(0.939999997615814208984375f, 0.699999988079071044921875f, 0.20000000298023223876953125f), clamp(vSculpt, 0.0f, 1.0f).xxx), 1.0f);
        return;
    }
    if (_453_uPass == 13)
    {
        float3 param = normalize(vN);
        float3 param_1 = barkProjectionNormal(param);
        outColor = float4(barkProjectionWeights(param_1), 1.0f);
        return;
    }
    if ((_453_uPass == 12) && (_453_uSurfacePreview != 0u))
    {
        outColor = float4(uBakedORM.Sample(_uBakedORM_sampler, vUV).x.xxx, 1.0f);
        return;
    }
    if (_453_uPass == 7)
    {
        outColor = float4(0.0039215688593685626983642578125f, 0.0f, 0.0f, 1.0f);
        return;
    }
    if (_453_uPass == 8)
    {
        float2 param_2 = vUV;
        float4 a = mask0(param_2);
        float2 param_3 = vUV;
        float2 b = mask1(param_3);
        float _9980;
        if (_453_uEffectCount > 0)
        {
            int param_4 = clamp(_453_uMaskChannel, 0, _453_uEffectCount - 1);
            float2 param_5 = vUV;
            _9980 = effectMask(param_4, param_5);
        }
        else
        {
            float _9998;
            if (_453_uMaskChannel < 4)
            {
                _9998 = a[_453_uMaskChannel];
            }
            else
            {
                _9998 = b[_453_uMaskChannel - 4];
            }
            _9980 = _9998;
        }
        float value = _9980;
        outColor = float4(lerp(0.119999997317790985107421875f.xxx, float3(0.75f, 0.89999997615814208984375f, 0.3499999940395355224609375f), value.xxx), 1.0f);
        return;
    }
    if (_453_uPass == 9)
    {
        bool _10029 = _453_uDirectional > 0.5f;
        bool _10035;
        if (_10029)
        {
            _10035 = _453_uDirectionMode > 2.5f;
        }
        else
        {
            _10035 = _10029;
        }
        bool3 _10042 = (_10035 && (_453_uHasBarkFlow != 0u)).xxx;
        outColor = float4(abs(normalize(float3(_10042.x ? vFlowAxis.x : vGrowth.x, _10042.y ? vFlowAxis.y : vGrowth.y, _10042.z ? vFlowAxis.z : vGrowth.z))), 1.0f);
        return;
    }
    bool _10054 = _453_uBakedPreview != 0u;
    bool _10061;
    if (_10054)
    {
        _10061 = !(_453_uBake != 0u);
    }
    else
    {
        _10061 = _10054;
    }
    bool _10067;
    if (_10061)
    {
        _10067 = _453_uPass != 3;
    }
    else
    {
        _10067 = _10061;
    }
    bool _10073;
    if (_10067)
    {
        _10073 = _453_uPass != 11;
    }
    else
    {
        _10073 = _10067;
    }
    bool _10079;
    if (_10073)
    {
        _10079 = _453_uPass != 12;
    }
    else
    {
        _10079 = _10073;
    }
    bool baked = _10079;
    float3 _10082;
    if (baked)
    {
        _10082 = uBakedORM.Sample(_uBakedORM_sampler, vUV).xyz;
    }
    else
    {
        _10082 = 1.0f.xxx;
    }
    float3 bakedORM = _10082;
    float _10093;
    if (baked)
    {
        _10093 = bakedORM.x;
    }
    else
    {
        _10093 = lerp(1.0f, vAO, _453_uAOAmount);
    }
    float ao = _10093;
    if ((_453_uPass == 5) && baked)
    {
        outColor = float4(ao.xxx, 1.0f);
        return;
    }
    if (_453_uPass == 6)
    {
        float2 g = abs(frac(vUV * 16.0f) - 0.5f.xx);
        outColor = float4(lerp(0.1599999964237213134765625f.xxx, float3(0.449999988079071044921875f, 0.62000000476837158203125f, 0.3499999940395355224609375f), step(0.070000000298023223876953125f, min(g.x, g.y)).xxx), 1.0f);
        return;
    }
    float3 N = normalize(vN);
    float3 T = normalize(vT.xyz - (N * dot(N, vT.xyz)));
    float3 B = normalize(cross(N, T)) * vT.w;
    PatchSurface localFx = _888;
    Surface s;
    if (baked)
    {
        Surface _10183 = { uBakedColor.Sample(_uBakedColor_sampler, vUV).xyz, 0.0f, bakedORM.y, 1.0f, 0.0f, 1.0f, 0.0f.xxx, 0.0f, 0.0f, 0.0f };
        s = _10183;
    }
    else
    {
        float3 param_6 = vP;
        float3 param_7 = N;
        float2 param_8 = vUV;
        Surface _10191 = surface(param_6, param_7, param_8);
        s = _10191;
        float3 param_9 = vP;
        localFx = patchSurface(param_9);
        if (_453_uPass != 3)
        {
            s.color = clamp((s.color * (1.0f - localFx.colorAlpha)) + localFx.color, 0.0f.xxx, 1.0f.xxx);
            s.rough = clamp((s.rough * (1.0f - localFx.roughAlpha)) + localFx.rough, 0.100000001490116119384765625f, 1.0f);
        }
    }
    float3 _10231;
    if (baked && (_453_uHasBakedEmission != 0u))
    {
        float3 param_10 = uOriginal.Sample(_uOriginal_sampler, vUV).xyz;
        _10231 = fromSRGB(param_10) * _453_uBakedEmissionStrength;
    }
    else
    {
        _10231 = surfaceEmission * (1.0f - localFx.colorAlpha);
    }
    float3 emitted = _10231;
    if (_453_uPass == 14)
    {
        float3 param_11 = clamp(emitted / max(_453_uEmissionMaximum, 9.9999999747524270787835121154785e-07f).xxx, 0.0f.xxx, 1.0f.xxx);
        outColor = float4(toSRGB(param_11), 1.0f);
        return;
    }
    if (_453_uPass == 12)
    {
        outColor = float4(s.selectedCoverage.xxx, 1.0f);
        return;
    }
    if (_453_uPass == 11)
    {
        outColor = float4(s.paintMask.xxx, 1.0f);
        return;
    }
    if (!baked)
    {
        ao *= lerp(1.0f, s.localAO, _453_uAOAmount);
    }
    if (_453_uPass == 5)
    {
        outColor = float4(ao.xxx, 1.0f);
        return;
    }
    bool _10329 = (!(_453_uBake != 0u)) && (_453_uMicroEnabled != 0u);
    bool _10335;
    if (_10329)
    {
        _10335 = _453_uPass != 3;
    }
    else
    {
        _10335 = _10329;
    }
    bool _10344;
    if (_10335)
    {
        _10344 = (!baked) || (_453_uBakedShared != 0u);
    }
    else
    {
        _10344 = _10335;
    }
    bool showMicro = _10344;
    float4 micro = 0.0f.xxxx;
    if (showMicro)
    {
        float3 param_12 = (vP * _453_uMicroParams.z) + _453_uMicroPhase;
        float3 param_13 = N;
        micro = microField(param_12, param_13);
        s.rough = clamp(s.rough + (micro.w * _453_uMicroParams.y), 0.0199999995529651641845703125f, 1.0f);
    }
    if (_453_uPass == 0)
    {
        outColor = float4(s.color, 1.0f);
        return;
    }
    if (_453_uPass == 2)
    {
        outColor = float4(ao, s.rough, 0.0f, 1.0f);
        return;
    }
    if (_453_uPass == 4)
    {
        outColor = float4(s.rough.xxx, 1.0f);
        return;
    }
    float3 bumped;
    if (baked)
    {
        float3 normal = normalize((uBakedNormal.Sample(_uBakedNormal_sampler, vUV).xyz * 2.0f) - 1.0f.xxx);
        bumped = normalize(((T * normal.x) + (B * normal.y)) + (N * normal.z));
    }
    else
    {
        float footprint = max(length(ddx(vP)), length(ddy(vP)));
        int _10453;
        if (_453_uHasHeightMap != 0u)
        {
            uint _10458_dummy_parameter;
            _10453 = int2(spvTextureSize(uHeightMap, uint(0), _10458_dummy_parameter)).x;
        }
        else
        {
            uint _10463_dummy_parameter;
            _10453 = int2(spvTextureSize(uBark, uint(0), _10463_dummy_parameter)).x;
        }
        float eps = max(footprint * 0.5f, 0.5f / (max(_453_uBarkScale, 0.00999999977648258209228515625f) * float(_10453)));
        float3 param_14 = T * eps;
        float3 param_15 = vP + (T * eps);
        float3 param_16 = N;
        float2 param_17 = shiftedUV(param_14);
        Surface _10485 = surface(param_15, param_16, param_17);
        Surface st = _10485;
        float3 param_18 = B * eps;
        float3 param_19 = vP + (B * eps);
        float3 param_20 = N;
        float2 param_21 = shiftedUV(param_18);
        Surface _10501 = surface(param_19, param_20, param_21);
        Surface sb = _10501;
        float3 _10506;
        if (_453_uHasNormalMap != 0u)
        {
            float3 param_22 = N;
            float3 param_23 = T;
            float3 param_24 = B;
            _10506 = referenceNormalGradient(param_22, param_23, param_24) * s.normalWeight;
        }
        else
        {
            _10506 = 0.0f.xxx;
        }
        float3 reference = _10506;
        float3 gradient = (T * ((((((_453_uNormalStrength * _453_uRelief) * sculptMediumFactor()) * (st.h - s.h)) + st.coatH) - s.coatH) / eps)) + (B * ((((((_453_uNormalStrength * _453_uRelief) * sculptMediumFactor()) * (sb.h - s.h)) + sb.coatH) - s.coatH) / eps));
        bool _10575 = (_453_uHasHeightMap != 0u) && (_453_uHasNormalMap != 0u);
        bool _10582;
        if (_10575)
        {
            _10582 = !(_453_uHeightWithNormal != 0u);
        }
        else
        {
            _10582 = _10575;
        }
        bool _10588;
        if (_10582)
        {
            _10588 = _453_uBarkRelief > 0.0f;
        }
        else
        {
            _10588 = _10582;
        }
        if (_10588)
        {
            float3 param_25 = vP;
            float3 param_26 = N;
            float param_27 = 3.0f;
            float hc = coarseBarkHeight(param_25, param_26, param_27);
            float3 param_28 = vP + (T * eps);
            float3 param_29 = N;
            float param_30 = 3.0f;
            float3 param_31 = vP + (B * eps);
            float3 param_32 = N;
            float param_33 = 3.0f;
            gradient += (((T * (coarseBarkHeight(param_28, param_29, param_30) - hc)) + (B * (coarseBarkHeight(param_31, param_32, param_33) - hc))) * ((((s.normalWeight * _453_uNormalStrength) * _453_uBarkRelief) * sculptBroadFactor()) / eps));
        }
        bumped = normalize(N + (((reference + s.detailGradient) - gradient) * _453_uBump));
        bool _10660 = (_453_uPatchBits & _453_uPatchHeightBits) != 0;
        bool _10666;
        if (_10660)
        {
            _10666 = _453_uPass != 3;
        }
        else
        {
            _10666 = _10660;
        }
        if (_10666)
        {
            float patchEps = max(_453_uPatchEpsilon, footprint * 0.25f);
            float3 param_34 = vP + (T * patchEps);
            float3 param_35 = vP - (T * patchEps);
            float patchHT = patchSurface(param_34).h - patchSurface(param_35).h;
            float3 param_36 = vP + (B * patchEps);
            float3 param_37 = vP - (B * patchEps);
            float patchHB = patchSurface(param_36).h - patchSurface(param_37).h;
            float3 slope = (bumped / max(dot(bumped, N), 9.9999997473787516355514526367188e-05f).xxx) - N;
            bumped = normalize((N + (slope * localFx.normalKeep)) - ((T * (patchHT / (2.0f * patchEps))) + (B * (patchHB / (2.0f * patchEps)))));
        }
    }
    bool _10748;
    if (showMicro)
    {
        _10748 = _453_uMicroParams.x > 0.0f;
    }
    else
    {
        _10748 = showMicro;
    }
    if (_10748)
    {
        float3 gradient_1 = (micro.xyz - (N * dot(micro.xyz, N))) * _453_uMicroParams.x;
        bumped = normalize((bumped / max(dot(bumped, N), 9.9999997473787516355514526367188e-05f).xxx) - gradient_1);
    }
    if (_453_uPass == 1)
    {
        float3 tangentNormal = normalize(float3(dot(bumped, T), dot(bumped, B), dot(bumped, N)));
        outColor = float4((tangentNormal * 0.5f) + 0.5f.xxx, 1.0f);
        return;
    }
    bool _10803 = _453_uPass == 3;
    bool _10810;
    if (!_10803)
    {
        _10810 = _453_uPass == 10;
    }
    else
    {
        _10810 = _10803;
    }
    float3 _10811;
    if (_10810)
    {
        _10811 = 0.4199999868869781494140625f.xxx;
    }
    else
    {
        _10811 = pow(s.color, 2.2000000476837158203125f.xxx);
    }
    float3 albedo = _10811;
    if (_453_uPass == 3)
    {
        bumped = N;
    }
    float3 V = normalize(_453_uEye - vP);
    float3 side = cross(float3(0.0f, 1.0f, 0.0f), V);
    float3 _10841;
    if (length(side) > 9.9999997473787516355514526367188e-05f)
    {
        _10841 = normalize(side);
    }
    else
    {
        _10841 = float3(1.0f, 0.0f, 0.0f);
    }
    side = _10841;
    float3 _10852;
    if (_453_uLightMode > 0.5f)
    {
        _10852 = ((side * 0.980000019073486328125f) + (V * 0.119999997317790985107421875f)) + float3(0.0f, 0.07999999821186065673828125f, 0.0f);
    }
    else
    {
        _10852 = float3(0.60000002384185791015625f, 0.800000011920928955078125f, 0.699999988079071044921875f);
    }
    float3 L = normalize(_10852);
    float3 L2 = float3(-0.616315662860870361328125f, 0.35218036174774169921875f, -0.7043607234954833984375f);
    float3 H = normalize(L + V);
    float diffuse = max(dot(bumped, L), 0.0f);
    float fill = max(dot(bumped, L2), 0.0f);
    float hemi = (bumped.y * 0.5f) + 0.5f;
    float shininess = lerp(110.0f, 4.0f, s.rough);
    float spec = pow(max(dot(bumped, H), 0.0f), shininess) * ((0.100000001490116119384765625f * (1.0f - s.rough)) + 0.017999999225139617919921875f);
    bool3 _10937 = (_453_uPass == (-1)).xxx;
    float3 lit = (((albedo * (((float3(0.20000000298023223876953125f, 0.2199999988079071044921875f, 0.23999999463558197021484375f) + (float3(0.699999988079071044921875f, 0.680000007152557373046875f, 0.62999999523162841796875f) * diffuse)) + (float3(0.180000007152557373046875f, 0.2199999988079071044921875f, 0.25f) * fill)) + (hemi * 0.100000001490116119384765625f).xxx)) * lerp(0.5f, 1.0f, ao)) + spec.xxx) + float3(_10937.x ? emitted.x : 0.0f.xxx.x, _10937.y ? emitted.y : 0.0f.xxx.y, _10937.z ? emitted.z : 0.0f.xxx.z);
    if (_453_uLightStyle > 0.5f)
    {
        bool _10947 = _453_uPass == 3;
        bool _10954;
        if (!_10947)
        {
            _10954 = _453_uPass == 10;
        }
        else
        {
            _10954 = _10947;
        }
        float3 _10955;
        if (_10954)
        {
            _10955 = 0.4199999868869781494140625f.xxx;
        }
        else
        {
            float3 param_38 = s.color;
            _10955 = fromSRGB(param_38);
        }
        float3 param_39 = _10955;
        float3 param_40 = bumped;
        float3 param_41 = V;
        float3 param_42 = L;
        float3 param_43 = L2;
        float param_44 = s.rough;
        float param_45 = ao;
        bool3 _10983 = (_453_uPass == (-1)).xxx;
        lit = studioLighting(param_39, param_40, param_41, param_42, param_43, param_44, param_45) + float3(_10983.x ? emitted.x : 0.0f.xxx.x, _10983.y ? emitted.y : 0.0f.xxx.y, _10983.z ? emitted.z : 0.0f.xxx.z);
        float3 param_46 = clamp(lit, 0.0f.xxx, 1.0f.xxx);
        outColor = float4(toSRGB(param_46), 1.0f);
    }
    else
    {
        outColor = float4(pow(clamp(lit, 0.0f.xxx, 1.0f.xxx), 0.4545454680919647216796875f.xxx), 1.0f);
    }
}

SPIRV_Cross_Output main(SPIRV_Cross_Input stage_input)
{
    vSculpt = stage_input.vSculpt;
    vFlowPosition = stage_input.vFlowPosition;
    vFlowAcross = stage_input.vFlowAcross;
    vGrowth = stage_input.vGrowth;
    vFlowAxis = stage_input.vFlowAxis;
    vP = stage_input.vP;
    vMask0 = stage_input.vMask0;
    vMask1 = stage_input.vMask1;
    vSourceUV = stage_input.vSourceUV;
    vUV = stage_input.vUV;
    vN = stage_input.vN;
    vAO = stage_input.vAO;
    vT = stage_input.vT;
    frag_main();
    SPIRV_Cross_Output stage_output;
    stage_output.outColor = outColor;
    return stage_output;
}
