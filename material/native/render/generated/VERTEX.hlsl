cbuffer VertexUniforms : register(b11, space0)
{
    row_major float4x4 _70_uVP : packoffset(c0);
    uint _70_uBake : packoffset(c4);
    float4 _70_uBakeRegion : packoffset(c5);
};


static float4 gl_Position;
static float3 vP;
static float3 aPosition;
static float3 vN;
static float3 aNormal;
static float2 vUV;
static float2 aUV;
static float2 vSourceUV;
static float2 aSourceUV;
static float4 vT;
static float4 aTangent;
static float vAO;
static float aAO;
static float4 vMask0;
static float4 aMask0;
static float2 vMask1;
static float2 aMask1;
static float3 vGrowth;
static float4 aGrowth;
static float vSculpt;
static float3 vFlowPosition;
static float3 aFlowPosition;
static float3 vFlowAcross;
static float3 aFlowAcross;
static float3 vFlowAxis;
static float3 aFlowAxis;

struct SPIRV_Cross_Input
{
    float3 aPosition : TEXCOORD0;
    float3 aNormal : TEXCOORD1;
    float2 aUV : TEXCOORD2;
    float4 aTangent : TEXCOORD3;
    float aAO : TEXCOORD4;
    float2 aSourceUV : TEXCOORD5;
    float4 aMask0 : TEXCOORD6;
    float2 aMask1 : TEXCOORD7;
    float4 aGrowth : TEXCOORD8;
    float3 aFlowPosition : TEXCOORD9;
    float3 aFlowAcross : TEXCOORD10;
    float3 aFlowAxis : TEXCOORD11;
};

struct SPIRV_Cross_Output
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
    float4 gl_Position : SV_Position;
};

void vert_main()
{
    vP = aPosition;
    vN = aNormal;
    vUV = aUV;
    vSourceUV = aSourceUV;
    vT = aTangent;
    vAO = aAO;
    vMask0 = aMask0;
    vMask1 = aMask1;
    vGrowth = aGrowth.xyz;
    vSculpt = aGrowth.w;
    vFlowPosition = aFlowPosition;
    vFlowAcross = aFlowAcross;
    vFlowAxis = aFlowAxis;
    float4 _79;
    if (_70_uBake != 0u)
    {
        _79 = float4((((aUV - _70_uBakeRegion.xy) / _70_uBakeRegion.zw) * 2.0f) - 1.0f.xx, 0.0f, 1.0f);
    }
    else
    {
        _79 = mul(float4(aPosition, 1.0f), _70_uVP);
    }
    gl_Position = _79;
    gl_Position.z = (gl_Position.z + gl_Position.w) * 0.5;
}

SPIRV_Cross_Output main(SPIRV_Cross_Input stage_input)
{
    aPosition = stage_input.aPosition;
    aNormal = stage_input.aNormal;
    aUV = stage_input.aUV;
    aSourceUV = stage_input.aSourceUV;
    aTangent = stage_input.aTangent;
    aAO = stage_input.aAO;
    aMask0 = stage_input.aMask0;
    aMask1 = stage_input.aMask1;
    aGrowth = stage_input.aGrowth;
    aFlowPosition = stage_input.aFlowPosition;
    aFlowAcross = stage_input.aFlowAcross;
    aFlowAxis = stage_input.aFlowAxis;
    vert_main();
    SPIRV_Cross_Output stage_output;
    stage_output.gl_Position = gl_Position;
    stage_output.vP = vP;
    stage_output.vN = vN;
    stage_output.vUV = vUV;
    stage_output.vSourceUV = vSourceUV;
    stage_output.vT = vT;
    stage_output.vAO = vAO;
    stage_output.vMask0 = vMask0;
    stage_output.vMask1 = vMask1;
    stage_output.vGrowth = vGrowth;
    stage_output.vSculpt = vSculpt;
    stage_output.vFlowPosition = vFlowPosition;
    stage_output.vFlowAcross = vFlowAcross;
    stage_output.vFlowAxis = vFlowAxis;
    return stage_output;
}
