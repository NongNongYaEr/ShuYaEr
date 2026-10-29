using UnrealBuildTool;

public class Day30ProceduralVegetationZh : ModuleRules
{
	public Day30ProceduralVegetationZh(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		// UE 5.8's public DynamicWindSubsystem header includes its internal log declaration.
		PrivateIncludePaths.Add(System.IO.Path.Combine(EngineDirectory, "Plugins/Experimental/DynamicWind/Source/DynamicWind/Internal"));

		PublicDependencyModuleNames.AddRange(
			new[]
			{
				"Core"
			});

		PrivateDependencyModuleNames.AddRange(
			new[]
			{
				"CoreUObject",
				"Engine",
				"UnrealEd",
				"Slate",
				"SlateCore",
				"Chaos",
				"GeometryCollectionEngine",
				"MeshDescription",
				"StaticMeshDescription",
				"SkeletalMeshDescription",
				"AnimationCore",
				"DynamicWind",
				"DynamicWindEditor",
                "RenderCore",
                "Renderer",
                "RHI",
				"AssetRegistry",
				"AssetTools",
				"Json",
				"PCG",
				"ProceduralVegetation"
			});
	}
}
