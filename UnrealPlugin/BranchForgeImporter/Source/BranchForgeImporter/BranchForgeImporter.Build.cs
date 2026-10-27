using UnrealBuildTool;

public class BranchForgeImporter : ModuleRules
{
    public BranchForgeImporter(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

        PublicDependencyModuleNames.AddRange(new[]
        {
            "Core"
        });

        PrivateDependencyModuleNames.AddRange(new[]
        {
            "CoreUObject",
            "DesktopPlatform",
            "Engine",
            "PythonScriptPlugin",
            "Slate",
            "SlateCore",
            "ToolMenus",
            "UnrealEd"
        });
    }
}
