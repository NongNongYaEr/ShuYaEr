#include "PVBranchForgeReferenceMeshSettings.h"
#include "Materials/MaterialInterface.h"

#include "DataTypes/PVMeshData.h"
#include "Engine/StaticMesh.h"
#include "GeometryCollection/GeometryCollection.h"
#include "GeometryCollection/GeometryCollectionEngineConversion.h"

TArray<FPCGPinProperties> UPVBranchForgeReferenceMeshSettings::OutputPinProperties() const
{
	TArray<FPCGPinProperties> Pins;
	FPCGPinProperties& Output = Pins.Emplace_GetRef(PCGPinConstants::DefaultOutputLabel,
		FPCGDataTypeIdentifier{ FPVDataTypeInfoMesh::AsId() });
	Output.bAllowMultipleData = false;
	return Pins;
}

FPCGElementPtr UPVBranchForgeReferenceMeshSettings::CreateElement() const
{
	return MakeShared<FPVBranchForgeReferenceMeshElement>();
}

bool FPVBranchForgeReferenceMeshElement::ExecuteInternal(FPCGContext* Context) const
{
	const UPVBranchForgeReferenceMeshSettings* Settings = Context->GetInputSettings<UPVBranchForgeReferenceMeshSettings>();
	UStaticMesh* Mesh = Settings ? Settings->SourceMesh.LoadSynchronous() : nullptr;
	if (!Mesh)
	{
		UE_LOG(LogTemp, Error, TEXT("BranchForge PVE: 软件整树对照网格缺失"));
		return true;
	}

	FManagedArrayCollection Collection;
	TArray<TObjectPtr<UMaterialInterface>> Materials;
	TArray<FGeometryCollectionAutoInstanceMesh> InstancedMeshes;
	FGeometryCollectionEngineConversion::ConvertStaticMeshToGeometryCollection(
		Mesh, Collection, Materials, InstancedMeshes, false, false);
	if (!Collection.HasGroup(FGeometryCollection::MaterialGroup))
	{
		Collection.AddGroup(FGeometryCollection::MaterialGroup);
	}
	if (Collection.NumElements(FGeometryCollection::MaterialGroup) < Materials.Num())
	{
		Collection.AddElements(Materials.Num() - Collection.NumElements(FGeometryCollection::MaterialGroup),
			FGeometryCollection::MaterialGroup);
	}
	auto& Paths = Collection.HasAttribute("MaterialPath", FGeometryCollection::MaterialGroup)
		? Collection.ModifyAttribute<FString>("MaterialPath", FGeometryCollection::MaterialGroup)
		: Collection.AddAttribute<FString>("MaterialPath", FGeometryCollection::MaterialGroup);
	for (int32 Index = 0; Index < Materials.Num(); ++Index)
	{
		Paths[Index] = Materials[Index] ? Materials[Index]->GetPathName() : FString();
	}
	UPVMeshData* Output = FPCGContext::NewObject_AnyThread<UPVMeshData>(Context);
	Output->Initialize(MoveTemp(Collection));
	FPCGTaggedData& Tagged = Context->OutputData.TaggedData.Emplace_GetRef();
	Tagged.Data = Output;
	Tagged.Pin = PCGPinConstants::DefaultOutputLabel;
	UE_LOG(LogTemp, Display, TEXT("BranchForge PVE: 软件整树对照网格已载入 %s"), *Mesh->GetPathName());
	return true;
}
