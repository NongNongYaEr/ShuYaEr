cbuffer PixelUniforms : register(b12, space0)
{
    float4 _12_uGuideColor : packoffset(c0);
};


static float4 outColor;

struct SPIRV_Cross_Output
{
    float4 outColor : SV_Target0;
};

void frag_main()
{
    outColor = _12_uGuideColor;
}

SPIRV_Cross_Output main()
{
    frag_main();
    SPIRV_Cross_Output stage_output;
    stage_output.outColor = outColor;
    return stage_output;
}
