using UnrealBuildTool;

public class BranchForgeStaticWorkbench : ModuleRules
{
    public BranchForgeStaticWorkbench(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
        PublicDependencyModuleNames.AddRange(new[] { "Core", "CoreUObject", "Engine" });
        PrivateDependencyModuleNames.AddRange(new[] { "UnrealEd", "MeshDescription", "StaticMeshDescription" });
    }
}
