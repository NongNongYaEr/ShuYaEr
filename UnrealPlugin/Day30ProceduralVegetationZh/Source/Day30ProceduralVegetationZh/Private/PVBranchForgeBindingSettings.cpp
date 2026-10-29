#include "PVBranchForgeBindingSettings.h"

#include "DataTypes/PVMeshData.h"
#include "Facades/PVBoneFacade.h"
#include "Facades/PVBranchFacade.h"
#include "Facades/PVAttributesNames.h"
#include "Facades/PVFoliageFacade.h"
#include "Facades/PVPointFacade.h"
#include "Utils/PCGLogErrors.h"

bool BindBranchForgeFoliage(FManagedArrayCollection& Collection, FString& Error, int32* OutJunctionAdjustments)
{
	if (OutJunctionAdjustments) *OutJunctionAdjustments = 0;
	PV::Facades::FFoliageFacade Foliage(Collection);
	if (!Foliage.IsValid()) { Error = TEXT("枝叶挂接数据不完整"); return false; }
	if (Foliage.NumFoliageEntries() == 0) return true;
	const TArray<PV::Facades::FBoneNode> Bones = PV::Facades::FBoneFacade(Collection).GetBoneDataFromCollection();
	PV::Facades::FPointFacade Points(Collection);
	PV::Facades::FBranchFacade Branches(Collection);
	const int32 BranchCount = Collection.NumElements(PV::GroupNames::BranchGroup);
	const auto* AuthoredStarts = Collection.FindAttribute<float>(TEXT("BranchForgeHostStartLength"), PV::GroupNames::BranchGroup);
	const auto* AuthoredEnds = Collection.FindAttribute<float>(TEXT("BranchForgeHostEndLength"), PV::GroupNames::BranchGroup);
	// Keep the authored path length separate from the value consumed by the
	// native export matcher. Neither value changes the foliage pivot or pose.
	const FName SourceLengthName(TEXT("BranchForgeSourceAttachmentLength"));
	const bool bHasSourceLengths = Collection.HasAttribute(SourceLengthName, PV::GroupNames::FoliageGroup);
	auto& SourceLengths = Collection.AddAttribute<float>(SourceLengthName, PV::GroupNames::FoliageGroup);
	if (!bHasSourceLengths)
		for (int32 I = 0; I < Foliage.NumFoliageEntries(); ++I) SourceLengths[I] = Foliage.GetLengthFromRoot(I);
	TMap<int32, int32> BoneById;
	TMultiMap<int32, int32> BonesByBranch;
	for (int32 I = 0; I < Bones.Num(); ++I)
	{
		BoneById.Add(Bones[I].BoneIndex, I);
		BonesByBranch.Add(Bones[I].BranchIndex, I);
	}
	for (int32 I = 0; I < Foliage.NumFoliageEntries(); ++I)
	{
		const auto Entry = Foliage.GetFoliageEntry(I);
		if (Entry.BranchId < 0 || Entry.BranchId >= BranchCount || Branches.GetPoints(Entry.BranchId).IsEmpty())
		{ Error = FString::Printf(TEXT("枝叶实例 %d 的承重枝无效。"), I); return false; }
		const auto& HostPoints = Branches.GetPoints(Entry.BranchId);
		const float HostStart = AuthoredStarts ? (*AuthoredStarts)[Entry.BranchId] : Points.GetLengthFromRoot(HostPoints[0]);
		const float HostEnd = AuthoredEnds ? (*AuthoredEnds)[Entry.BranchId] : Points.GetLengthFromRoot(HostPoints.Last());
		const float SourceLength = SourceLengths[I];
		if (!FMath::IsFinite(SourceLength) || SourceLength < HostStart || SourceLength > HostEnd
			|| !FMath::IsFinite(Entry.LengthFromRoot) || Entry.LengthFromRoot < HostStart || Entry.LengthFromRoot > HostEnd)
		{ Error = FString::Printf(TEXT("枝叶实例 %d 的挂接长度 %.6f 米超出原始承重枝范围 [%.6f, %.6f]。"), I, Entry.LengthFromRoot, HostStart, HostEnd); return false; }
		TArray<int32> Candidates;
		BonesByBranch.MultiFind(Entry.BranchId, Candidates);
		// Native export takes the first matching bone in collection order.
		Candidates.Sort();
		int32 ParentBone = INDEX_NONE;
		float ExportLength = Entry.LengthFromRoot;
		for (int32 Candidate : Candidates)
		{
			const auto& Bone = Bones[Candidate];
			const int32* Parent = BoneById.Find(Bone.ParentBoneIndex);
			const float Start = Points.GetLengthFromRoot(Parent ? Bones[*Parent].PointIndex : INDEX_NONE);
			const float End = Points.GetLengthFromRoot(Bone.PointIndex);
			if (FMath::IsFinite(Entry.LengthFromRoot) && Entry.LengthFromRoot >= Start && Entry.LengthFromRoot <= End)
			{ ParentBone = Bone.BoneIndex; break; }
		}
		if (ParentBone == INDEX_NONE)
		{
			// PVE can select a parent-branch bone beyond the true junction. Its
			// length interval then misses the child's first segment. Adapt only
			// this cross-branch gap to the same child bone's native lower bound.
			for (int32 Candidate : Candidates)
			{
				const auto& Bone = Bones[Candidate];
				const int32* Parent = BoneById.Find(Bone.ParentBoneIndex);
				if (!Parent || Bones[*Parent].BranchIndex != Branches.GetParentIndex(Entry.BranchId)) continue;
				const float Start = Points.GetLengthFromRoot(Bones[*Parent].PointIndex);
				const float End = Points.GetLengthFromRoot(Bone.PointIndex);
				if (SourceLength < Start && SourceLength <= End && Start <= End && Start <= HostEnd)
				{ ParentBone = Bone.BoneIndex; ExportLength = Start; break; }
			}
		}
		if (ParentBone < 0 || ParentBone >= Bones.Num())
		{
			Error = FString::Printf(TEXT("枝叶实例 %d（承重枝 %d，累计长度 %.6f 米）没有有效父骨骼；请检查骨架导入与骨骼精简。"),
				I, Entry.BranchId, Entry.LengthFromRoot);
			return false;
		}
		if (ExportLength != SourceLength && OutJunctionAdjustments) ++*OutJunctionAdjustments;
		Foliage.SetLengthFromRoot(I, ExportLength);
		Foliage.SetParentBoneID(I, ParentBone);
	}
	return true;
}

TArray<FPCGPinProperties> UPVBranchForgeBindingSettings::InputPinProperties() const
{
	TArray<FPCGPinProperties> Pins;
	auto& Pin = Pins.Emplace_GetRef(PCGPinConstants::DefaultInputLabel, FPCGDataTypeIdentifier{FPVDataTypeInfoMesh::AsId()});
	Pin.SetRequiredPin(); Pin.bAllowMultipleData = false;
	return Pins;
}

TArray<FPCGPinProperties> UPVBranchForgeBindingSettings::OutputPinProperties() const
{
	TArray<FPCGPinProperties> Pins;
	auto& Pin = Pins.Emplace_GetRef(PCGPinConstants::DefaultOutputLabel, FPCGDataTypeIdentifier{FPVDataTypeInfoMesh::AsId()});
	Pin.bAllowMultipleData = false;
	return Pins;
}

FPCGElementPtr UPVBranchForgeBindingSettings::CreateElement() const { return MakeShared<FPVBranchForgeBindingElement>(); }

bool FPVBranchForgeBindingElement::ExecuteInternal(FPCGContext* Context) const
{
	for (const FPCGTaggedData& Input : Context->InputData.GetInputsByPin(PCGPinConstants::DefaultInputLabel))
	{
		const auto* Mesh = Cast<UPVMeshData>(Input.Data);
		if (!Mesh) continue;
		FManagedArrayCollection Bound = Mesh->GetCollection();
		FString Error;
		int32 JunctionAdjustments = 0;
		if (!BindBranchForgeFoliage(Bound, Error, &JunctionAdjustments))
		{
			PCGLog::LogErrorOnGraph(FText::FromString(Error), Context);
			continue;
		}
		Bound.AddAttribute<int32>(TEXT("BranchForgeJunctionAttachmentAdjustments"), PV::GroupNames::DetailsGroup)[0] = JunctionAdjustments;
		auto* Data = FPCGContext::NewObject_AnyThread<UPVMeshData>(Context);
		Data->Initialize(MoveTemp(Bound));
		auto& Output = Context->OutputData.TaggedData.Emplace_GetRef();
		Output.Data = Data; Output.Pin = PCGPinConstants::DefaultOutputLabel;
	}
	return true;
}
