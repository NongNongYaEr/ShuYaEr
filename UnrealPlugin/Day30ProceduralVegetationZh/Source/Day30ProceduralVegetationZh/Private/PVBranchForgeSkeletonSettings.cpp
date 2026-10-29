#include "PVBranchForgeSkeletonSettings.h"

#include "DataTypes/PVGrowthData.h"
#include "Facades/PVAttributesNames.h"
#include "Facades/PVBranchFacade.h"
#include "Facades/PVFoliageFacade.h"
#include "Facades/PVPointFacade.h"
#include "GeometryCollection/ManagedArrayCollection.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Misc/Parse.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

namespace
{
struct FBridgePoint
{
	float T = 0;
	FVector3f PositionCm = FVector3f::ZeroVector;
	float RadiusCm = 0;
	int32 CollectionIndex = INDEX_NONE;
};

struct FBridgeBranch
{
	FString Id;
	FString ParentId;
	int32 ParentIndex = INDEX_NONE;
	float ParentT = 0;
	int32 Depth = INDEX_NONE;
	int32 PlantNumber = INDEX_NONE;
	TArray<FBridgePoint> Points;
};

struct FBridgeFoliage
{
	FString Id;
	int32 BranchIndex = INDEX_NONE;
	int32 SourceIndex = INDEX_NONE;
	float BranchT = 0;
	FVector3f PositionCm = FVector3f::ZeroVector;
	FVector3f Up = FVector3f::UpVector;
	FVector3f Face = FVector3f::ForwardVector;
	float Scale = 1;
};

bool ReadVector(const TArray<TSharedPtr<FJsonValue>>& Values, FVector3f& Out)
{
	if (Values.Num() != 3 || !Values[0].IsValid() || !Values[1].IsValid() || !Values[2].IsValid()) return false;
	const double X = Values[0]->AsNumber();
	const double Y = Values[1]->AsNumber();
	const double Z = Values[2]->AsNumber();
	if (!FMath::IsFinite(X) || !FMath::IsFinite(Y) || !FMath::IsFinite(Z)) return false;
	// BranchForge uses right-handed Z-up metres; its GLB path reaches UE as (X,-Y,Z).
	Out = FVector3f(X * 100.0, -Y * 100.0, Z * 100.0);
	return true;
}

bool ReadDirection(const TArray<TSharedPtr<FJsonValue>>& Values, FVector3f& Out)
{
	if (!ReadVector(Values, Out)) return false;
	Out *= 0.01f;
	const float Length = Out.Length();
	if (!FMath::IsNearlyEqual(Length, 1.f, 1e-3f)) return false;
	Out /= Length;
	return true;
}

bool ParseFile(const FString& FilePath, TArray<FBridgeBranch>& Branches, TArray<FBridgeFoliage>& Foliage, int32& SourceCount, FString& Error)
{
	FString Text;
	if (!FFileHelper::LoadFileToString(Text, *FilePath)) { Error = TEXT("无法打开骨架 JSON"); return false; }
	TSharedPtr<FJsonObject> Root;
	if (!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Text), Root) || !Root.IsValid()) { Error = TEXT("JSON 解析失败"); return false; }
	const int32 Version = Root->GetIntegerField(TEXT("version"));
	if (Root->GetStringField(TEXT("format")) != TEXT("BranchForgePVESkeleton") || (Version != 1 && Version != 2 && Version != 3))
	{
		Error = TEXT("骨架格式或版本不匹配"); return false;
	}
	if (Version == 3)
	{
		const TArray<TSharedPtr<FJsonValue>>* Capabilities = nullptr;
		if (!Root->TryGetArrayField(TEXT("required_capabilities"), Capabilities) || !Capabilities || Capabilities->IsEmpty())
		{ Error = TEXT("外部树干包缺少能力声明，请重新导出"); return false; }
		for (const auto& Capability : *Capabilities)
		{
			FString Name;
			if (!Capability->TryGetString(Name) || (Name != TEXT("imported_trunk_materials_v1") && Name != TEXT("imported_trunk_skin_v1")))
			{ Error = TEXT("资源包需要更新的树鸭儿 PVE 桥接版本"); return false; }
		}
	}
	const TSharedPtr<FJsonObject>* Coordinates = nullptr;
	if (!Root->TryGetObjectField(TEXT("coordinate_system"), Coordinates) || !Coordinates ||
		(*Coordinates)->GetStringField(TEXT("up")) != TEXT("Z") || (*Coordinates)->GetStringField(TEXT("unit")) != TEXT("meter"))
	{
		Error = TEXT("仅支持 Z 向上、米制的 BranchForge 骨架"); return false;
	}
	const TArray<TSharedPtr<FJsonValue>>* InputBranches = nullptr;
	if (!Root->TryGetArrayField(TEXT("branches"), InputBranches) || !InputBranches || InputBranches->IsEmpty())
	{
		Error = TEXT("骨架没有枝条"); return false;
	}
	TMap<FString, int32> IdToIndex;
	for (const TSharedPtr<FJsonValue>& Value : *InputBranches)
	{
		const TSharedPtr<FJsonObject> Entry = Value.IsValid() ? Value->AsObject() : nullptr;
		if (!Entry.IsValid()) { Error = TEXT("枝条结构无效"); return false; }
		FBridgeBranch& Branch = Branches.AddDefaulted_GetRef();
		if (!Entry->TryGetStringField(TEXT("id"), Branch.Id) || Branch.Id.IsEmpty() || IdToIndex.Contains(Branch.Id))
		{
			Error = TEXT("枝条 ID 缺失或重复"); return false;
		}
		IdToIndex.Add(Branch.Id, Branches.Num() - 1);
		Entry->TryGetStringField(TEXT("parent_id"), Branch.ParentId);
		double ParentT = 0;
		if (!Branch.ParentId.IsEmpty() && (!Entry->TryGetNumberField(TEXT("parent_t"), ParentT) || ParentT < 0 || ParentT > 1))
		{
			Error = FString::Printf(TEXT("%s 的连接位置无效"), *Branch.Id); return false;
		}
		Branch.ParentT = ParentT;
		const TArray<TSharedPtr<FJsonValue>>* InputPoints = nullptr;
		if (!Entry->TryGetArrayField(TEXT("points"), InputPoints) || !InputPoints || InputPoints->Num() < 2)
		{
			Error = FString::Printf(TEXT("%s 的曲线点不足"), *Branch.Id); return false;
		}
		for (const TSharedPtr<FJsonValue>& PointValue : *InputPoints)
		{
			const TSharedPtr<FJsonObject> Point = PointValue.IsValid() ? PointValue->AsObject() : nullptr;
			const TArray<TSharedPtr<FJsonValue>>* Position = nullptr;
			double T = 0, RadiusM = 0;
			if (!Point.IsValid() || !Point->TryGetNumberField(TEXT("t"), T) ||
				!Point->TryGetNumberField(TEXT("radius_m"), RadiusM) ||
				!Point->TryGetArrayField(TEXT("position_m"), Position) || !Position ||
				!FMath::IsFinite(T) || T < 0 || T > 1 || !FMath::IsFinite(RadiusM) || RadiusM <= 0)
			{
				Error = FString::Printf(TEXT("%s 有无效曲线点"), *Branch.Id); return false;
			}
			FBridgePoint& NewPoint = Branch.Points.AddDefaulted_GetRef();
			NewPoint.T = T;
			NewPoint.RadiusCm = RadiusM * 100.0;
			if (!ReadVector(*Position, NewPoint.PositionCm) ||
				(Branch.Points.Num() > 1 && Branch.Points[Branch.Points.Num() - 2].T >= T))
			{
				Error = FString::Printf(TEXT("%s 的位置或采样顺序无效"), *Branch.Id); return false;
			}
		}
	}
	for (int32 Index = 0; Index < Branches.Num(); ++Index)
	{
		FBridgeBranch& Branch = Branches[Index];
		if (!Branch.ParentId.IsEmpty())
		{
			const int32* Parent = IdToIndex.Find(Branch.ParentId);
			if (!Parent) { Error = FString::Printf(TEXT("%s 的父枝不存在"), *Branch.Id); return false; }
			Branch.ParentIndex = *Parent;
		}
		TSet<int32> Seen;
		int32 Cursor = Index;
		while (Cursor != INDEX_NONE)
		{
			if (Seen.Contains(Cursor)) { Error = TEXT("枝条父子关系成环"); return false; }
			Seen.Add(Cursor);
			Cursor = Branches[Cursor].ParentIndex;
		}
		Branch.Depth = Seen.Num() - 1;
	}
	int32 PlantCount = 0;
	for (FBridgeBranch& Branch : Branches) if (Branch.ParentIndex == INDEX_NONE) Branch.PlantNumber = PlantCount++;
	for (FBridgeBranch& Branch : Branches)
	{
		int32 RootIndex = Branch.ParentIndex;
		if (RootIndex == INDEX_NONE) continue;
		while (Branches[RootIndex].ParentIndex != INDEX_NONE) RootIndex = Branches[RootIndex].ParentIndex;
		Branch.PlantNumber = Branches[RootIndex].PlantNumber;
	}
	if (Version >= 2)
	{
		const TArray<TSharedPtr<FJsonValue>>* Sources = nullptr;
		const TArray<TSharedPtr<FJsonValue>>* Leaves = nullptr;
		if (!Root->TryGetArrayField(TEXT("foliage_sources"), Sources) || !Sources ||
			!Root->TryGetArrayField(TEXT("foliage"), Leaves) || !Leaves)
		{
			Error = TEXT("V2 叶片源或实例列表缺失"); return false;
		}
		if (Sources->IsEmpty())
		{
			const TSharedPtr<FJsonObject>* Trunks = nullptr;
			const TArray<TSharedPtr<FJsonValue>>* Mounts = nullptr;
			if (Version != 3 || !Leaves->IsEmpty() || !Root->TryGetObjectField(TEXT("imported_trunks"), Trunks) ||
				!(*Trunks)->TryGetArrayField(TEXT("mounts"), Mounts) || Mounts->IsEmpty())
			{ Error = TEXT("仅完整外部树干包可不含单元枝"); return false; }
		}
		SourceCount = Sources->Num();
		TSet<FString> LeafIds;
		for (const TSharedPtr<FJsonValue>& Value : *Leaves)
		{
			const TSharedPtr<FJsonObject> Entry = Value.IsValid() ? Value->AsObject() : nullptr;
			if (!Entry.IsValid()) { Error = TEXT("叶片实例结构无效"); return false; }
			FBridgeFoliage& Leaf = Foliage.AddDefaulted_GetRef();
			FString BranchId;
			double BranchT = 0, Scale = 0;
			int32 SourceIndex = INDEX_NONE;
			const TArray<TSharedPtr<FJsonValue>> *Position = nullptr, *Up = nullptr, *Face = nullptr;
			if (!Entry->TryGetStringField(TEXT("id"), Leaf.Id) || Leaf.Id.IsEmpty() || LeafIds.Contains(Leaf.Id) ||
				!Entry->TryGetStringField(TEXT("branch_id"), BranchId) || !IdToIndex.Contains(BranchId) ||
				!Entry->TryGetNumberField(TEXT("branch_t"), BranchT) || !FMath::IsFinite(BranchT) || BranchT < 0 || BranchT > 1 ||
				!Entry->TryGetNumberField(TEXT("source_index"), SourceIndex) || SourceIndex < 0 || SourceIndex >= SourceCount ||
				!Entry->TryGetNumberField(TEXT("scale_m"), Scale) || !FMath::IsFinite(Scale) || Scale <= 0 ||
				!Entry->TryGetArrayField(TEXT("position_m"), Position) || !Position || !ReadVector(*Position, Leaf.PositionCm) ||
				!Entry->TryGetArrayField(TEXT("up"), Up) || !Up || !ReadDirection(*Up, Leaf.Up) ||
				!Entry->TryGetArrayField(TEXT("face"), Face) || !Face || !ReadDirection(*Face, Leaf.Face) ||
				FMath::Abs(FVector3f::DotProduct(Leaf.Up, Leaf.Face)) > 1e-3f)
			{
				Error = TEXT("叶片实例 ID、附着、坐标或姿态无效"); return false;
			}
			LeafIds.Add(Leaf.Id);
			Leaf.BranchIndex = IdToIndex[BranchId];
			Leaf.BranchT = BranchT;
			Leaf.SourceIndex = SourceIndex;
			Leaf.Scale = Scale;
		}
	}
	// Insert an exact attachment sample on each parent. The child's first PVE point
	// then shares its parent's point index, matching PVE's native branch hierarchy.
	for (const FBridgeBranch& Child : Branches)
	{
		if (Child.ParentIndex == INDEX_NONE) continue;
		TArray<FBridgePoint>& ParentPoints = Branches[Child.ParentIndex].Points;
		const float Target = Child.ParentT;
		bool bExisting = false;
		for (const FBridgePoint& Point : ParentPoints) if (FMath::IsNearlyEqual(Point.T, Target, 1e-5f)) { bExisting = true; break; }
		if (bExisting) continue;
		int32 InsertAt = 1;
		while (InsertAt < ParentPoints.Num() && ParentPoints[InsertAt].T < Target) ++InsertAt;
		const FBridgePoint& A = ParentPoints[InsertAt - 1];
		const FBridgePoint& B = ParentPoints[InsertAt];
		const float Blend = (Target - A.T) / (B.T - A.T);
		FBridgePoint NewPoint;
		NewPoint.T = Target;
		NewPoint.PositionCm = FMath::Lerp(A.PositionCm, B.PositionCm, Blend);
		NewPoint.RadiusCm = FMath::Lerp(A.RadiusCm, B.RadiusCm, Blend);
		ParentPoints.Insert(NewPoint, InsertAt);
	}
	return true;
}

bool BuildCollection(TArray<FBridgeBranch>& Branches, const TArray<FBridgeFoliage>& Foliage, int32 SourceCount,
	const TArray<TSoftObjectPtr<UObject>>& LeafMeshes, FManagedArrayCollection& Collection, FString& Error)
{
	TArray<FVector3f> Positions;
	TArray<float> Radii;
	for (FBridgeBranch& Branch : Branches)
	{
		for (int32 PointIndex = 0; PointIndex < Branch.Points.Num(); ++PointIndex)
		{
			if (PointIndex == 0 && Branch.ParentIndex != INDEX_NONE) continue;
			FBridgePoint& Point = Branch.Points[PointIndex];
			Point.CollectionIndex = Positions.Add(Point.PositionCm);
			Radii.Add(Point.RadiusCm);
		}
	}
	for (FBridgeBranch& Branch : Branches)
	{
		if (Branch.ParentIndex == INDEX_NONE) continue;
		const TArray<FBridgePoint>& ParentPoints = Branches[Branch.ParentIndex].Points;
		for (const FBridgePoint& ParentPoint : ParentPoints)
		{
			if (FMath::IsNearlyEqual(ParentPoint.T, Branch.ParentT, 1e-5f))
			{
				Branch.Points[0].CollectionIndex = ParentPoint.CollectionIndex;
				break;
			}
		}
		if (Branch.Points[0].CollectionIndex == INDEX_NONE)
		{
			Error = TEXT("无法解析枝条连接点"); return false;
		}
	}
	const int32 PointCount = Positions.Num();
	const int32 BranchCount = Branches.Num();
	Collection.AddGroup(PV::GroupNames::PointGroup);
	Collection.AddElements(PointCount, PV::GroupNames::PointGroup);
	Collection.AddGroup(PV::GroupNames::BranchGroup);
	Collection.AddElements(BranchCount, PV::GroupNames::BranchGroup);
	Collection.AddGroup(PV::GroupNames::DetailsGroup);
	Collection.AddElements(1, PV::GroupNames::DetailsGroup);

	auto& PointPosition = Collection.AddAttribute<FVector3f>(PV::AttributeNames::PointPosition, PV::GroupNames::PointGroup);
	auto& PointScale = Collection.AddAttribute<float>(PV::AttributeNames::PointScale, PV::GroupNames::PointGroup);
	auto& LengthFromRoot = Collection.AddAttribute<float>(PV::AttributeNames::LengthFromRoot, PV::GroupNames::PointGroup);
	auto& LengthFromSeed = Collection.AddAttribute<float>(PV::AttributeNames::LengthFromSeed, PV::GroupNames::PointGroup);
	Collection.AddAttribute<float>(PV::AttributeNames::HullGradient, PV::GroupNames::PointGroup);
	Collection.AddAttribute<float>(PV::AttributeNames::MainTrunkGradient, PV::GroupNames::PointGroup);
	Collection.AddAttribute<float>(PV::AttributeNames::PlantGradient, PV::GroupNames::PointGroup);
	Collection.AddAttribute<float>(PV::AttributeNames::GroundGradient, PV::GroupNames::PointGroup);
	auto& BudDirections = Collection.AddAttribute<TArray<FVector3f>>(PV::AttributeNames::BudDirection, PV::GroupNames::PointGroup);
	auto& BudMeristem = Collection.AddAttribute<TArray<float>>(PV::AttributeNames::BudLateralMeristem, PV::GroupNames::PointGroup);
	auto& BudStatus = Collection.AddAttribute<TArray<int32>>(PV::AttributeNames::BudStatus, PV::GroupNames::PointGroup);
	auto& BudHormones = Collection.AddAttribute<TArray<float>>(PV::AttributeNames::BudHormoneLevels, PV::GroupNames::PointGroup);
	auto& BudLight = Collection.AddAttribute<TArray<float>>(PV::AttributeNames::BudLightDetected, PV::GroupNames::PointGroup);
	auto& BudDevelopment = Collection.AddAttribute<TArray<int32>>(PV::AttributeNames::BudDevelopment, PV::GroupNames::PointGroup);
	auto& BudNumber = Collection.AddAttribute<int32>(PV::AttributeNames::BudNumber, PV::GroupNames::PointGroup);
	auto& SeedPScale = Collection.AddAttribute<float>(PV::AttributeNames::SeedPScale, PV::GroupNames::PointGroup);
	auto& SeedPScaleRatio = Collection.AddAttribute<float>(PV::AttributeNames::SeedPScaleRatio, PV::GroupNames::PointGroup);

	for (int32 Index = 0; Index < PointCount; ++Index)
	{
		PointPosition[Index] = Positions[Index];
		PointScale[Index] = Radii[Index];
		SeedPScale[Index] = 1;
		SeedPScaleRatio[Index] = 1;
		BudNumber[Index] = 0;
		BudStatus[Index] = { 0, 0, 1, 0, 0, 1, 1, 0, 0, 0 };
		BudHormones[Index] = { 0.f, 0.f, 0.f, 0.f, 0.f, 0.f };
		BudLight[Index] = { 0.f, 0.f, 0.f, 0.f };
		BudDevelopment[Index] = { 0, 0, 0, 0, 0, 0 };
	}
	TArray<int32> ByDepth;
	for (int32 Index = 0; Index < BranchCount; ++Index) ByDepth.Add(Index);
	ByDepth.Sort([&](int32 A, int32 B) { return Branches[A].Depth < Branches[B].Depth; });
	for (int32 BranchIndex : ByDepth)
	{
		const FBridgeBranch& Branch = Branches[BranchIndex];
		for (int32 PointIndex = 0; PointIndex < Branch.Points.Num(); ++PointIndex)
		{
			const int32 CollectionIndex = Branch.Points[PointIndex].CollectionIndex;
			// A child shares its first point with the parent. Keep that point's generation
			// and assign the child's generation only to points owned by this branch.
			if (Branch.ParentIndex == INDEX_NONE || PointIndex > 0)
			{
				BudDevelopment[CollectionIndex][0] = Branch.Depth + 1;
			}
			if (PointIndex > 0)
			{
				const int32 Previous = Branch.Points[PointIndex - 1].CollectionIndex;
				LengthFromRoot[CollectionIndex] = LengthFromRoot[Previous] + FVector3f::Distance(Positions[Previous], Positions[CollectionIndex]) * 0.01f;
				LengthFromSeed[CollectionIndex] = LengthFromRoot[CollectionIndex];
			}
			if (BudDirections[CollectionIndex].IsEmpty())
			{
				const int32 Next = Branch.Points[FMath::Min(PointIndex + 1, Branch.Points.Num() - 1)].CollectionIndex;
				const int32 Prev = Branch.Points[FMath::Max(PointIndex - 1, 0)].CollectionIndex;
				const FVector3f Direction = (Positions[Next] - Positions[Prev]).GetSafeNormal();
				BudDirections[CollectionIndex] = { Direction, Direction, Direction, Direction, Direction, FVector3f::UpVector };
			}
			BudMeristem[CollectionIndex] = { Radii[CollectionIndex] * 0.01f, 1.f, 0.f, 0.f, 0.f, LengthFromRoot[CollectionIndex], 0.f };
		}
	}

	auto& ParentNumbers = Collection.AddAttribute<int32>(PV::AttributeNames::BranchParentNumber, PV::GroupNames::BranchGroup);
	auto& Numbers = Collection.AddAttribute<int32>(PV::AttributeNames::BranchNumber, PV::GroupNames::BranchGroup);
	auto& Hierarchy = Collection.AddAttribute<int32>(PV::AttributeNames::BranchHierarchyNumber, PV::GroupNames::BranchGroup);
	auto& PlantNumbers = Collection.AddAttribute<int32>(PV::AttributeNames::PlantNumber, PV::GroupNames::BranchGroup);
	Collection.AddAttribute<int32>(PV::AttributeNames::BranchSourceBudNumber, PV::GroupNames::BranchGroup);
	Collection.AddAttribute<TArray<int32>>(PV::AttributeNames::BranchFoliageIDs, PV::GroupNames::BranchGroup);
	auto& ParentChains = Collection.AddAttribute<TArray<int32>>(PV::AttributeNames::BranchParents, PV::GroupNames::BranchGroup);
	auto& Children = Collection.AddAttribute<TArray<int32>>(PV::AttributeNames::BranchChildren, PV::GroupNames::BranchGroup);
	auto& BranchPoints = Collection.AddAttribute<TArray<int32>>(PV::AttributeNames::BranchPoints, PV::GroupNames::BranchGroup);
	auto& StableIds = Collection.AddAttribute<FString>(TEXT("BranchForgeStableId"), PV::GroupNames::BranchGroup);
	// Mesh Builder may fuse/trim the branch's point range. Preserve the authored
	// attachment interval for the post-build export adapter.
	auto& HostStartLengths = Collection.AddAttribute<float>(TEXT("BranchForgeHostStartLength"), PV::GroupNames::BranchGroup);
	auto& HostEndLengths = Collection.AddAttribute<float>(TEXT("BranchForgeHostEndLength"), PV::GroupNames::BranchGroup);
	for (int32 Index = 0; Index < BranchCount; ++Index)
	{
		const FBridgeBranch& Branch = Branches[Index];
		Numbers[Index] = Index + 1;
		StableIds[Index] = Branch.Id;
		HostStartLengths[Index] = LengthFromRoot[Branch.Points[0].CollectionIndex];
		HostEndLengths[Index] = LengthFromRoot[Branch.Points.Last().CollectionIndex];
		ParentNumbers[Index] = Branch.ParentIndex + 1;
		Hierarchy[Index] = Branch.Depth;
		PlantNumbers[Index] = Branch.PlantNumber;
		TArray<int32> Chain = { 0 };
		TArray<int32> Ancestors;
		int32 Cursor = Branch.ParentIndex;
		while (Cursor != INDEX_NONE) { Ancestors.Add(Cursor + 1); Cursor = Branches[Cursor].ParentIndex; }
		for (int32 I = Ancestors.Num() - 1; I >= 0; --I) Chain.Add(Ancestors[I]);
		ParentChains[Index] = MoveTemp(Chain);
		for (const FBridgePoint& Point : Branch.Points) BranchPoints[Index].Add(Point.CollectionIndex);
	}
	for (int32 Index : ByDepth)
	{
		int32 Cursor = Branches[Index].ParentIndex;
		while (Cursor != INDEX_NONE)
		{
			Children[Cursor].Add(Index + 1);
			Cursor = Branches[Cursor].ParentIndex;
		}
	}
	Collection.AddAttribute<FString>(PV::AttributeNames::FoliagePath, PV::GroupNames::DetailsGroup)[0] = TEXT("");
	Collection.AddAttribute<FString>(PV::AttributeNames::TrunkMaterialPath, PV::GroupNames::DetailsGroup)[0] = TEXT("");
	Collection.AddAttribute<TArray<FVector2f>>(PV::AttributeNames::TrunkURange, PV::GroupNames::DetailsGroup);
	Collection.AddAttribute<TArray<float>>(PV::AttributeNames::LeafPhyllotaxy, PV::GroupNames::DetailsGroup)[0] = { 0, 200, 50, 1, 1, 0, 0, 0 };
	// Keep the native foliage schema valid even for a bare imported trunk.
	{
		PV::Facades::FFoliageFacade FoliageFacade(Collection);
		TArray<FPVFoliageInfo> Infos;
		Infos.SetNum(SourceCount);
		for (int32 Index = 0; Index < SourceCount; ++Index)
		{
			if (LeafMeshes.IsValidIndex(Index)) Infos[Index].Mesh = LeafMeshes[Index];
		}
		FoliageFacade.SetFoliageInfos(Infos);
		TArray<TArray<int32>> ByBranch;
		ByBranch.SetNum(BranchCount);
		for (const FBridgeFoliage& Leaf : Foliage)
		{
			const TArray<FBridgePoint>& Host = Branches[Leaf.BranchIndex].Points;
			if (Leaf.BranchT < Host[0].T || Leaf.BranchT > Host.Last().T)
			{
				Error = FString::Printf(TEXT("%s 的挂接位置超出承重枝采样范围"), *Leaf.Id); return false;
			}
			int32 Upper = 1;
			while (Upper < Host.Num() - 1 && Host[Upper].T < Leaf.BranchT) ++Upper;
			const FBridgePoint& A = Host[Upper - 1];
			const FBridgePoint& B = Host[Upper];
			// PVE matches attachment bones by cumulative metres, not normalized t or
			// distance to the leaf pivot (which can be offset from the host curve).
			const float AttachmentLength = FMath::Lerp(LengthFromRoot[A.CollectionIndex], LengthFromRoot[B.CollectionIndex],
				(Leaf.BranchT - A.T) / (B.T - A.T));
			if (!FMath::IsFinite(AttachmentLength)) { Error = TEXT("枝叶挂接长度无效"); return false; }
			PV::Facades::FFoliageEntryData Entry = {};
			Entry.NameId = Leaf.SourceIndex;
			Entry.BranchId = Leaf.BranchIndex;
			Entry.PivotPoint = Leaf.PositionCm;
			Entry.UpVector = Leaf.Up;
			Entry.NormalVector = Leaf.Face;
			Entry.Scale = Leaf.Scale;
			Entry.LengthFromRoot = AttachmentLength;
			const int32 LeafIndex = FoliageFacade.AddFoliageEntry(Entry);
			if (LeafIndex == INDEX_NONE) { Error = TEXT("PVE 叶片实例写入失败"); return false; }
			ByBranch[Leaf.BranchIndex].Add(LeafIndex);
		}
		for (int32 Index = 0; Index < BranchCount; ++Index) FoliageFacade.SetFoliageIdsArray(Index, MoveTemp(ByBranch[Index]));
		if (!FoliageFacade.IsValid()) { Error = TEXT("PVE 叶片属性不完整"); return false; }
	}
	if (!PV::Facades::FPointFacade(Collection).IsValid() || !PV::Facades::FBranchFacade(Collection).IsValid())
	{
		Error = TEXT("PVE 骨架属性不完整"); return false;
	}
	return true;
}
}

TArray<FPCGPinProperties> UPVBranchForgeSkeletonSettings::OutputPinProperties() const
{
	TArray<FPCGPinProperties> Pins;
	FPCGPinProperties& Output = Pins.Emplace_GetRef(PCGPinConstants::DefaultOutputLabel,
		FPCGDataTypeIdentifier{ FPVDataTypeInfoGrowth::AsId() });
	Output.SetAllowMultipleConnections(true);
	Output.bAllowMultipleData = false;
	return Pins;
}

FPCGElementPtr UPVBranchForgeSkeletonSettings::CreateElement() const
{
	return MakeShared<FPVBranchForgeSkeletonElement>();
}

bool FPVBranchForgeSkeletonElement::ExecuteInternal(FPCGContext* Context) const
{
	const UPVBranchForgeSkeletonSettings* Settings = Context->GetInputSettings<UPVBranchForgeSkeletonSettings>();
	if (!Settings || Settings->SkeletonFile.FilePath.IsEmpty())
	{
		UE_LOG(LogTemp, Error, TEXT("BranchForge PVE: 未设置骨架 JSON 路径")); return true;
	}
	const FString Path = FPaths::IsRelative(Settings->SkeletonFile.FilePath)
		? FPaths::ConvertRelativePathToFull(FPaths::ProjectDir(), Settings->SkeletonFile.FilePath)
		: Settings->SkeletonFile.FilePath;
	TArray<FBridgeBranch> Branches;
	TArray<FBridgeFoliage> Foliage;
	int32 SourceCount = 0;
	FString Error;
	FManagedArrayCollection Collection;
	if (!ParseFile(Path, Branches, Foliage, SourceCount, Error) ||
		!BuildCollection(Branches, Foliage, SourceCount, Settings->LeafMeshes, Collection, Error))
	{
		UE_LOG(LogTemp, Error, TEXT("BranchForge PVE: %s (%s)"), *Error, *Path); return true;
	}
	if (SourceCount > Settings->LeafMeshes.Num())
	{
		UE_LOG(LogTemp, Warning, TEXT("BranchForge PVE: JSON 有 %d 种叶片源，但节点只设置了 %d 个 UE 网格；缺失的叶片不可见"),
			SourceCount, Settings->LeafMeshes.Num());
	}
	FString SourceText;
	TSharedPtr<FJsonObject> SourceRoot;
	const TSharedPtr<FJsonObject>* Resolved = nullptr;
	if (FFileHelper::LoadFileToString(SourceText, *Path) &&
		FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(SourceText), SourceRoot) && SourceRoot.IsValid() &&
		SourceRoot->TryGetObjectField(TEXT("resolved_assembly"), Resolved))
	{
		const FString Manifest = (*Resolved)->GetStringField(TEXT("manifest"));
		if (Manifest != FPaths::GetCleanFilename(Manifest))
		{
			UE_LOG(LogTemp, Error, TEXT("BranchForge PVE: 装配数据必须位于 JSON 同目录")); return true;
		}
		Collection.AddAttribute<FString>(TEXT("BranchForgeResolvedAssembly"), PV::GroupNames::DetailsGroup)[0] = FPaths::GetPath(Path) / Manifest;
	}
	UPVGrowthData* Output = FPCGContext::NewObject_AnyThread<UPVGrowthData>(Context);
	Output->Initialize(MoveTemp(Collection));
	FPCGTaggedData& Tagged = Context->OutputData.TaggedData.Emplace_GetRef();
	Tagged.Data = Output;
	Tagged.Pin = PCGPinConstants::DefaultOutputLabel;
	UE_LOG(LogTemp, Display, TEXT("BranchForge PVE: 载入 %d 根枝、%d 个挂接实例，%s"), Branches.Num(), Foliage.Num(), *Path);
	return true;
}

UPVEBranchForgeValidationCommandlet::UPVEBranchForgeValidationCommandlet()
{
	IsClient = false;
	IsEditor = true;
	LogToConsole = true;
}

int32 UPVEBranchForgeValidationCommandlet::Main(const FString& Params)
{
	FString Path;
	FString ReportPath = FPaths::ProjectSavedDir() / TEXT("PVEWorkflow/BranchForgeBridge/ue_validation.json");
	FParse::Value(*Params, TEXT("Skeleton="), Path);
	FParse::Value(*Params, TEXT("Report="), ReportPath);
	TArray<FBridgeBranch> Branches;
	TArray<FBridgeFoliage> Foliage;
	int32 SourceCount = 0;
	FManagedArrayCollection Collection;
	FString Error;
	const TArray<TSoftObjectPtr<UObject>> EmptyMeshes;
	const bool bLoaded = !Path.IsEmpty() && ParseFile(Path, Branches, Foliage, SourceCount, Error) &&
		BuildCollection(Branches, Foliage, SourceCount, EmptyMeshes, Collection, Error);
	const int32 PointCount = Collection.NumElements(PV::GroupNames::PointGroup);
	const int32 BranchCount = Collection.NumElements(PV::GroupNames::BranchGroup);
	const int32 FoliageCount = Collection.NumElements(PV::GroupNames::FoliageGroup);
	const bool bValid = bLoaded && PV::Facades::FPointFacade(Collection).IsValid() && PV::Facades::FBranchFacade(Collection).IsValid();
	const FString Report = FString::Printf(
		TEXT("{\"valid\":%s,\"branches\":%d,\"points\":%d,\"foliage\":%d,\"sources\":%d,\"error\":\"%s\"}\n"),
		bValid ? TEXT("true") : TEXT("false"), BranchCount, PointCount, FoliageCount, SourceCount, *Error.ReplaceCharWithEscapedChar());
	IFileManager::Get().MakeDirectory(*FPaths::GetPath(ReportPath), true);
	FFileHelper::SaveStringToFile(Report, *ReportPath);
	UE_LOG(LogTemp, Display, TEXT("BRANCHFORGE_PVE %s"), *Report);
	return bValid ? 0 : 1;
}
