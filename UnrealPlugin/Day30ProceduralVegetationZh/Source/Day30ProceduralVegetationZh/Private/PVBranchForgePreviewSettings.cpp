#include "PVBranchForgePreviewSettings.h"
#include "DataTypes/PVMeshData.h"
#include "BranchForgeResolvedAssembly.h"
#include "Facades/PVAttributesNames.h"

TArray<FPCGPinProperties> UPVBranchForgePreviewSettings::InputPinProperties() const
{
	TArray<FPCGPinProperties> Pins;
	FPCGPinProperties& Pin = Pins.Emplace_GetRef(PCGPinConstants::DefaultInputLabel,
		FPCGDataTypeIdentifier{ FPVDataTypeInfoMesh::AsId() });
	Pin.SetRequiredPin();
	Pin.bAllowMultipleData = false;
	return Pins;
}

TArray<FPCGPinProperties> UPVBranchForgePreviewSettings::OutputPinProperties() const
{
	TArray<FPCGPinProperties> Pins;
	FPCGPinProperties& Pin = Pins.Emplace_GetRef(PCGPinConstants::DefaultOutputLabel,
		FPCGDataTypeIdentifier{ FPVDataTypeInfoMesh::AsId() });
	Pin.bAllowMultipleData = false;
	return Pins;
}

FPCGElementPtr UPVBranchForgePreviewSettings::CreateElement() const
{
	return MakeShared<FPVBranchForgePreviewElement>();
}

bool FPVBranchForgePreviewElement::ExecuteInternal(FPCGContext* Context) const
{
	const auto* Settings = Context->GetInputSettings<UPVBranchForgePreviewSettings>();
	for (const FPCGTaggedData& Input : Context->InputData.GetInputsByPin(PCGPinConstants::DefaultInputLabel))
	{
		const auto* Mesh = Cast<UPVMeshData>(Input.Data);
		if (!Mesh) continue;
		if (Settings->bUseResolvedAssembly && Mesh->GetCollection().HasAttribute(TEXT("BranchForgeResolvedAssembly"), PV::GroupNames::DetailsGroup))
		{
			FManagedArrayCollection Resolved;
			FString Error;
			if (!BuildBranchForgeResolvedAssembly(Mesh->GetCollection(), *Settings, Resolved, Error))
			{
				UE_LOG(LogTemp, Error, TEXT("BranchForge 装配失败: %s"), *Error);
				continue;
			}
			UPVMeshData* Data = FPCGContext::NewObject_AnyThread<UPVMeshData>(Context);
			Data->Initialize(MoveTemp(Resolved));
			FPCGTaggedData& Tagged = Context->OutputData.TaggedData.Emplace_GetRef();
			Tagged.Data = Data;
			Tagged.Pin = PCGPinConstants::DefaultOutputLabel;
			continue;
		}
		FPCGTaggedData& Output = Context->OutputData.TaggedData.Emplace_GetRef(Input);
		Output.Pin = PCGPinConstants::DefaultOutputLabel;
	}
	return true;
}
