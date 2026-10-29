#include "BranchForgeResolvedAssembly.h"
#include "PVBranchForgePreviewSettings.h"
#include "Facades/PVAttributesNames.h"
#include "Facades/PVBranchFacade.h"
#include "Facades/PVBoneFacade.h"
#include "Facades/PVFoliageFacade.h"
#include "GeometryCollection/GeometryCollection.h"
#include "Materials/MaterialInterface.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Misc/SecureHash.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

namespace
{
struct FResolvedChunk
{
	int32 Instance = -1, Source = -1, Branch = -1, Material = 0;
	int32 VertexCount = 0, IndexCount = 0;
	int64 VertexOffset = 0, IndexOffset = 0;
	FLinearColor Color = FLinearColor::White;
	TArray<FLinearColor> VertexColors;
};

FVector ReadDirection(const TSharedPtr<FJsonObject>& Json, const TCHAR* Key)
{
	const auto& V = Json->GetArrayField(Key);
	return FVector(FVector3f(V[0]->AsNumber(), -V[1]->AsNumber(), V[2]->AsNumber()));
}

FTransform ReadBaseline(const TSharedPtr<FJsonObject>& Json)
{
	const auto& P = Json->GetArrayField(TEXT("position_m"));
	const FVector Position(FVector3f(P[0]->AsNumber() * 100, -P[1]->AsNumber() * 100, P[2]->AsNumber() * 100));
	const FVector Up = ReadDirection(Json, TEXT("up")).GetSafeNormal();
	FVector Face = ReadDirection(Json, TEXT("face")).GetSafeNormal();
	Face = (Face - FVector::DotProduct(Face, Up) * Up).GetSafeNormal();
	return FTransform(FQuat(FRotationMatrix::MakeFromYZ(Face, Up)), Position, FVector(float(Json->GetNumberField(TEXT("scale_m")))));
}
}

bool BuildBranchForgeResolvedAssembly(const FManagedArrayCollection& Input,
	const UPVBranchForgePreviewSettings& Settings, FManagedArrayCollection& Output, FString& Error)
{
	const double Start = FPlatformTime::Seconds();
	const auto* ManifestPath = Input.FindAttribute<FString>(TEXT("BranchForgeResolvedAssembly"), PV::GroupNames::DetailsGroup);
	if (!ManifestPath || ManifestPath->Num() != 1) { Error = TEXT("装配清单路径缺失"); return false; }
	FString Text;
	TSharedPtr<FJsonObject> Root;
	if (!FFileHelper::LoadFileToString(Text, *(*ManifestPath)[0]) ||
		!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Text), Root) || !Root.IsValid() ||
		Root->GetStringField(TEXT("format")) != TEXT("BranchForgeResolvedAssembly") || Root->GetIntegerField(TEXT("version")) != 1)
	{ Error = TEXT("软件装配清单无效"); return false; }
	if (!Settings.AssemblyBarkMaterial || !Settings.AssemblyFoliageMaterial)
	{ Error = TEXT("请在整树预览节点设置装配树皮和叶图集材质"); return false; }
	const FString BinaryName = Root->GetStringField(TEXT("binary"));
	if (FPaths::GetCleanFilename(BinaryName) != BinaryName) { Error = TEXT("装配二进制必须位于清单目录"); return false; }
	TArray<uint8> Binary;
	if (!FFileHelper::LoadFileToArray(Binary, *(FPaths::GetPath((*ManifestPath)[0]) / BinaryName)) ||
		Binary.Num() != Root->GetNumberField(TEXT("binary_bytes")) || Binary.Num() < 8 || FMemory::Memcmp(Binary.GetData(), "BFRA0001", 8) != 0)
	{ Error = TEXT("软件装配二进制缺失或长度不符"); return false; }
	FSHAHash Hash;
	FSHA1::HashBuffer(Binary.GetData(), Binary.Num(), Hash.Hash);
	if (!Hash.ToString().Equals(Root->GetStringField(TEXT("binary_sha1")), ESearchCase::IgnoreCase))
	{ Error = TEXT("软件装配二进制校验失败，请重新导出完整文件夹"); return false; }
	const auto& InstanceJson = Root->GetArrayField(TEXT("instances"));
	PV::Facades::FFoliageFacade InputFoliage(Input);
	const TArray<FString> Names = InputFoliage.GetFoliageNames();
	if (Input.NumElements(PV::GroupNames::FoliageGroup) != InstanceJson.Num() || Names.Num() != Root->GetArrayField(TEXT("sources")).Num())
	{ Error = TEXT("装配清单与 JSON 的枝类或实例数量不一致"); return false; }
	TArray<bool> Replaced;
	Replaced.Init(false, Names.Num());
	int32 ReplacedSources = 0;
	for (int32 I = 0; I < Names.Num(); ++I)
	{
		Replaced[I] = Settings.AuthoredSourceMeshes.IsValidIndex(I) &&
			Settings.AuthoredSourceMeshes[I].ToSoftObjectPath().ToString() != Names[I];
		if (Replaced[I]) ++ReplacedSources;
	}
	TArray<FTransform> Delta;
	TArray<bool> Moved;
	TArray<PV::Facades::FFoliageEntryData> ReplacementEntries;
	int32 MovedInstances = 0;
	for (int32 I = 0; I < InstanceJson.Num(); ++I)
	{
		const auto J = InstanceJson[I]->AsObject();
		const auto Entry = InputFoliage.GetFoliageEntry(I);
		if (Entry.NameId != J->GetIntegerField(TEXT("source_index"))) { Error = TEXT("次枝源索引发生变化，请重新导入 JSON"); return false; }
		const FTransform Base = ReadBaseline(J), Current = InputFoliage.GetFoliageTransform(I);
		const bool bMoved = !Base.Equals(Current, 1e-4);
		Moved.Add(bMoved); Delta.Add(bMoved ? Base.Inverse() * Current : FTransform::Identity);
		if (bMoved) ++MovedInstances;
		if (Replaced[Entry.NameId]) ReplacementEntries.Add(Entry);
	}
	const auto* StableIds = Input.FindAttribute<FString>(TEXT("BranchForgeStableId"), PV::GroupNames::BranchGroup);
	const auto* Points = Input.FindAttribute<FVector3f>(PV::AttributeNames::PointPosition, PV::GroupNames::PointGroup);
	if (!StableIds || !Points) { Error = TEXT("输入缺少 BranchForge 骨架关联"); return false; }
	TMap<FString, int32> BranchIndices;
	for (int32 I = 0; I < StableIds->Num(); ++I) BranchIndices.Add((*StableIds)[I], I);
	TArray<FResolvedChunk> Chunks;
	// Keep verified reusable geometry as native foliage entries so the official
	// exporter can build a Nanite Assembly. Stale/missing parts fall back losslessly.
	TArray<int32> SharedModes; SharedModes.Init(0, Names.Num());
	TArray<FPVFoliageInfo> SharedInfos = InputFoliage.GetFoliageInfos();
	int32 NumSharedParts = 0;
	if (Settings.bUseSharedAssembly && Settings.SharedBinaryHash.Equals(Hash.ToString(), ESearchCase::IgnoreCase))
	{
		for (int32 S = 0; S < Names.Num(); ++S)
		{
			if (Replaced[S] || !Settings.SharedPartModes.IsValidIndex(S) || !Settings.SharedPartMeshes.IsValidIndex(S) ||
				Settings.SharedPartModes[S] < 1 || Settings.SharedPartModes[S] > 2 || !Settings.SharedPartMeshes[S].LoadSynchronous()) continue;
			SharedModes[S] = Settings.SharedPartModes[S];
			SharedInfos[S].Mesh = Settings.SharedPartMeshes[S]; ++NumSharedParts;
		}
	}
	int32 SharedInstances = 0;
	for (int32 I = 0; I < InstanceJson.Num(); ++I)
	{
		auto Entry = InputFoliage.GetFoliageEntry(I);
		if (SharedModes[Entry.NameId])
		{
			ReplacementEntries.Add(Entry); ++SharedInstances;
		}
	}
	int64 VertexCount = 0, FaceCount = 0;
	TArray<FString> ResolvedMaterialPaths = {Settings.AssemblyBarkMaterial->GetPathName(), Settings.AssemblyFoliageMaterial->GetPathName()};
	TMap<FString, int32> ImportedMaterialSlots;
	for (const auto& Value : Root->GetArrayField(TEXT("chunks")))
	{
		const auto J = Value->AsObject();
		const int32 Source = J->GetIntegerField(TEXT("source_index"));
		if (Source < -1 || Source >= Names.Num()) { Error = TEXT("装配块枝类无效"); return false; }
		if (Source >= 0 && Replaced[Source]) continue;
		if (Source >= 0 && (SharedModes[Source] == 2 ||
			(SharedModes[Source] == 1 && J->GetStringField(TEXT("material_role")) == TEXT("foliage")))) continue;
		FResolvedChunk& C = Chunks.AddDefaulted_GetRef();
		C.Source = Source; C.Instance = J->GetIntegerField(TEXT("instance_index"));
		const int32* Branch = BranchIndices.Find(J->GetStringField(TEXT("host_branch_id")));
		if (!Branch || C.Instance < -1 || C.Instance >= InstanceJson.Num()) { Error = TEXT("装配块的挂点或实例无效"); return false; }
		C.Branch = *Branch; C.Material = J->GetStringField(TEXT("material_role")) == TEXT("bark") ? 0 : 1;
		if (J->HasField(TEXT("imported_trunk_material")))
		{
			const FString Id = J->GetObjectField(TEXT("imported_trunk_material"))->GetStringField(TEXT("material_id"));
			const auto* Material = Settings.AssemblyMaterialOverrides.Find(Id);
			if (!Material || !*Material) { Error = TEXT("导入树干材质未绑定，请运行随包材质设置脚本并使用新版桥接。"); return false; }
			if (const int32* Slot = ImportedMaterialSlots.Find(Id)) C.Material = *Slot;
			else { C.Material = ResolvedMaterialPaths.Add((*Material)->GetPathName()); ImportedMaterialSlots.Add(Id, C.Material); }
		}
		C.VertexOffset = J->GetNumberField(TEXT("vertex_offset")); C.IndexOffset = J->GetNumberField(TEXT("index_offset"));
		C.VertexCount = J->GetIntegerField(TEXT("vertex_count")); C.IndexCount = J->GetIntegerField(TEXT("index_count"));
		if (C.VertexOffset < 8 || C.IndexOffset < 8 || C.VertexCount <= 0 || C.IndexCount <= 0 || C.IndexCount % 3 ||
			C.VertexOffset + int64(C.VertexCount) * 48 > Binary.Num() || C.IndexOffset + int64(C.IndexCount) * 4 > Binary.Num())
		{ Error = TEXT("装配块长度越界"); return false; }
		const auto& Color = J->GetArrayField(TEXT("color_linear"));
		C.Color = FLinearColor(Color[0]->AsNumber(), Color[1]->AsNumber(), Color[2]->AsNumber(), 1);
		if (J->HasField(TEXT("vertex_colors")))
		{
			const auto Colors = J->GetObjectField(TEXT("vertex_colors"));
			const FString ColorFile = Colors->GetStringField(TEXT("file"));
			TArray<uint8> ColorBytes;
			if (FPaths::GetCleanFilename(ColorFile) != ColorFile || Colors->GetIntegerField(TEXT("count")) != C.VertexCount || Colors->GetIntegerField(TEXT("stride")) != 16 ||
				!FFileHelper::LoadFileToArray(ColorBytes, *(FPaths::GetPath((*ManifestPath)[0]) / ColorFile)) || ColorBytes.Num() != int64(C.VertexCount) * 16)
			{ Error = TEXT("树干顶点颜色缺失或长度不匹配"); return false; }
			FSHAHash ColorHash; FSHA1::HashBuffer(ColorBytes.GetData(), ColorBytes.Num(), ColorHash.Hash);
			if (!ColorHash.ToString().Equals(Colors->GetStringField(TEXT("sha1")), ESearchCase::IgnoreCase))
			{ Error = TEXT("树干顶点颜色校验失败"); return false; }
			C.VertexColors.Reserve(C.VertexCount);
			for (int32 I = 0; I < C.VertexCount; ++I) { float V[4]; FMemory::Memcpy(V, ColorBytes.GetData() + int64(I) * 16, sizeof(V));
				if (!FMath::IsFinite(V[0]) || !FMath::IsFinite(V[1]) || !FMath::IsFinite(V[2]) || !FMath::IsFinite(V[3])) { Error = TEXT("树干顶点颜色非有限"); return false; }
				C.VertexColors.Add(FLinearColor(V[0], V[1], V[2], V[3])); }
		}
		VertexCount += C.VertexCount; FaceCount += C.IndexCount / 3;
	}
	if (VertexCount > MAX_int32 || FaceCount > MAX_int32) { Error = TEXT("装配网格超过 PVE 支持范围"); return false; }
	Chunks.StableSort([](const FResolvedChunk& A, const FResolvedChunk& B) { return A.Material < B.Material; });
	FGeometryCollection Geometry;
	Input.CopyTo(&Geometry);
	Geometry.EmptyGroup(FGeometryCollection::FacesGroup);
	Geometry.EmptyGroup(FGeometryCollection::VerticesGroup);
	Geometry.EmptyGroup(FGeometryCollection::MaterialGroup);
	Geometry.AddElements(VertexCount, FGeometryCollection::VerticesGroup);
	Geometry.AddElements(FaceCount, FGeometryCollection::FacesGroup);
	Geometry.AddElements(ResolvedMaterialPaths.Num(), FGeometryCollection::MaterialGroup);
	Geometry.SetNumUVLayers(3);
	PV::Facades::FBoneFacade::DefineSchema(Geometry);
	PV::Facades::FBoneFacade Bones(Geometry);
	auto& VertexPointIds = Bones.ModifyVertexPointIds();
	auto& UV = *Geometry.FindUVLayer(0);
	auto& MaterialPaths = Geometry.ModifyAttribute<FString>(TEXT("MaterialPath"), FGeometryCollection::MaterialGroup);
	for (int32 I = 0; I < ResolvedMaterialPaths.Num(); ++I) MaterialPaths[I] = ResolvedMaterialPaths[I];
	PV::Facades::FBranchFacade Branches(Input);
	int32 VI = 0, FI = 0;
	TArray<int32> FirstFaces, SectionFaces, FirstVertices, LastVertices;
	FirstFaces.Init(0, ResolvedMaterialPaths.Num()); SectionFaces.Init(0, ResolvedMaterialPaths.Num());
	FirstVertices.Init(0, ResolvedMaterialPaths.Num()); LastVertices.Init(0, ResolvedMaterialPaths.Num());
	FBox Bounds(ForceInit);
	for (const FResolvedChunk& C : Chunks)
	{
		if (SectionFaces[C.Material] == 0) { FirstFaces[C.Material] = FI; FirstVertices[C.Material] = VI; }
		const auto& HostPoints = Branches.GetPoints(C.Branch);
		if (HostPoints.IsEmpty()) { Error = TEXT("承重枝缺少点"); return false; }
		for (int32 I = 0; I < C.VertexCount; ++I)
		{
			float V[12]; FMemory::Memcpy(V, Binary.GetData() + C.VertexOffset + int64(I) * 48, sizeof(V));
			FVector P(V[0], V[1], V[2]), N(V[3], V[4], V[5]), T(V[8], V[9], V[10]);
			if (C.Instance >= 0 && Moved[C.Instance])
			{ P = Delta[C.Instance].TransformPosition(P); N = Delta[C.Instance].TransformVectorNoScale(N); T = Delta[C.Instance].TransformVectorNoScale(T); }
			if (P.ContainsNaN() || N.ContainsNaN()) { Error = TEXT("装配顶点非有限"); return false; }
			const int32 Vertex = VI + I;
			Geometry.Vertex[Vertex] = FVector3f(P); Geometry.Normal[Vertex] = FVector3f(N);
			Geometry.TangentU[Vertex] = FVector3f(T);
			Geometry.TangentV[Vertex] = FVector3f(FVector::CrossProduct(N, T) * V[11]);
			UV[Vertex] = FVector2f(V[6], V[7]); Geometry.Color[Vertex] = C.VertexColors.IsEmpty() ? C.Color : C.Color * C.VertexColors[I];
			Geometry.BoneMap[Vertex] = 0; Bounds += P;
			float BestDistance = MAX_flt; int32 BestPoint = HostPoints[0];
			for (int32 Point : HostPoints)
			{
				const float D = FVector3f::DistSquared(Geometry.Vertex[Vertex], (*Points)[Point]);
				if (D < BestDistance) { BestDistance = D; BestPoint = Point; }
			}
			VertexPointIds[Vertex] = BestPoint;
		}
		for (int32 I = 0; I < C.IndexCount; I += 3)
		{
			uint32 Indices[3]; FMemory::Memcpy(Indices, Binary.GetData() + C.IndexOffset + int64(I) * 4, sizeof(Indices));
			if (Indices[0] >= uint32(C.VertexCount) || Indices[1] >= uint32(C.VertexCount) || Indices[2] >= uint32(C.VertexCount))
			{ Error = TEXT("装配三角面越界"); return false; }
			Geometry.Indices[FI] = FIntVector(VI + Indices[0], VI + Indices[1], VI + Indices[2]);
			Geometry.MaterialID[FI] = C.Material; Geometry.MaterialIndex[FI] = FI;
			Geometry.Visible[FI] = true; ++FI;
		}
		VI += C.VertexCount; SectionFaces[C.Material] += C.IndexCount / 3; LastVertices[C.Material] = VI - 1;
	}
	for (int32 I = 0; I < ResolvedMaterialPaths.Num(); ++I)
	{
		Geometry.Sections[I].MaterialID = I;
		Geometry.Sections[I].FirstIndex = FirstFaces[I] * 3;
		Geometry.Sections[I].NumTriangles = SectionFaces[I];
		Geometry.Sections[I].MinVertexIndex = FirstVertices[I];
		Geometry.Sections[I].MaxVertexIndex = LastVertices[I];
	}
	Geometry.FaceStart[0] = 0; Geometry.FaceCount[0] = FI;
	Geometry.VertexStart[0] = 0; Geometry.VertexCount[0] = VI;
	Geometry.UpdateBoundingBox();
	// The resolved complete branches already contain their leaves and fruit.
	// Only user-replaced sources remain as native PVE instances.
	Geometry.EmptyGroup(PV::GroupNames::FoliageGroup);
	PV::Facades::FFoliageFacade OutFoliage(Geometry);
	OutFoliage.SetFoliageInfos(SharedInfos);
	TArray<TArray<int32>> FoliageByBranch;
	FoliageByBranch.SetNum(StableIds->Num());
	for (const auto& Entry : ReplacementEntries)
	{
		const int32 Id = OutFoliage.AddFoliageEntry(Entry);
		FoliageByBranch[Entry.BranchId].Add(Id);
	}
	for (int32 I = 0; I < FoliageByBranch.Num(); ++I) OutFoliage.SetFoliageIdsArray(I, MoveTemp(FoliageByBranch[I]));
	const auto Summary = Root->GetObjectField(TEXT("summary"));
	Geometry.AddAttribute<int32>(TEXT("BranchForgeResolvedTriangles"), PV::GroupNames::DetailsGroup)[0] = FI;
	Geometry.AddAttribute<int32>(TEXT("BranchForgeResolvedInstances"), PV::GroupNames::DetailsGroup)[0] = InstanceJson.Num() - ReplacementEntries.Num() + SharedInstances;
	Geometry.AddAttribute<int32>(TEXT("BranchForgeResolvedSourceCount"), PV::GroupNames::DetailsGroup)[0] = Names.Num();
	Geometry.AddAttribute<int32>(TEXT("BranchForgeSharedInstances"), PV::GroupNames::DetailsGroup)[0] = SharedInstances;
	// Replacement StaticMeshes do not carry a botanical leaf/organ count.
	Geometry.AddAttribute<int32>(TEXT("BranchForgeResolvedLeaves"), PV::GroupNames::DetailsGroup)[0] = ReplacedSources ? -1 : Summary->GetIntegerField(TEXT("leaves"));
	Geometry.AddAttribute<int32>(TEXT("BranchForgeResolvedOrgans"), PV::GroupNames::DetailsGroup)[0] = ReplacedSources ? -1 : Summary->GetIntegerField(TEXT("organs"));
	Geometry.CopyTo(&Output);
	UE_LOG(LogTemp, Display, TEXT("BRANCHFORGE_NATIVE_ASSEMBLY parts=%d instances=%d unique_base_faces=%lld"), NumSharedParts, SharedInstances, FaceCount);
	UE_LOG(LogTemp, Display, TEXT("BRANCHFORGE_RESOLVED sources=%d instances=%d replacements=%d moved=%d vertices=%d faces=%d materials=2 bounds=[%s]-[%s] seconds=%.3f"),
		Names.Num(), InstanceJson.Num(), ReplacementEntries.Num(), MovedInstances, VI, FI,
		*Bounds.Min.ToString(), *Bounds.Max.ToString(), FPlatformTime::Seconds() - Start);
	return true;
}
