#include "BranchForgeAssemblyLibrary.h"
#include "PVBranchForgePreviewSettings.h"
#include "Engine/StaticMesh.h"
#include "Materials/MaterialInterface.h"
#include "AssetRegistry/AssetRegistryModule.h"
#include "StaticMeshAttributes.h"
#include "StaticMeshCompiler.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Misc/PackageName.h"
#include "Misc/SecureHash.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "UObject/Package.h"

namespace
{
struct FPartVertex { FVector3f P,N,T; FVector2f UV; float W; FLinearColor Color; };
struct FPartData { TArray<FPartVertex> V; TArray<FIntVector> F; TArray<int32> M; };
// Compare the saved source description, never the reduced Nanite fallback mesh.
// A matching GLB alone does not prove that resolved tints/thickness are identical.
bool SamePart(UStaticMesh* Mesh,const FPartData& Part,UPVBranchForgePreviewSettings* Settings,double Scale,double RemainingError,double& Error)
{
	if (!Mesh || !Mesh->GetNaniteSettings().bEnabled || Mesh->GetStaticMaterials().Num()!=2 ||
		Mesh->GetMaterial(0)!=Settings->AssemblyBarkMaterial || Mesh->GetMaterial(1)!=Settings->AssemblyFoliageMaterial) return false;
	const FMeshDescription* D=Mesh->GetMeshDescription(0);
	if (!D || D->Vertices().Num()!=Part.V.Num() || D->VertexInstances().Num()!=Part.V.Num() || D->Triangles().Num()!=Part.F.Num()) return false;
	FStaticMeshConstAttributes A(*D);
	if (A.GetVertexInstanceUVs().GetNumChannels()!=1) return false;
	for (int32 K=0;K<Part.V.Num();++K)
	{
		const FVertexInstanceID VI(K); if (!D->IsVertexInstanceValid(VI)) return false;
		const auto& V=Part.V[K];
		const double E=FVector3f::Distance(A.GetVertexPositions()[D->GetVertexInstanceVertex(VI)],V.P)*Scale;
		Error=FMath::Max(Error,E);
		if (E>RemainingError || !A.GetVertexInstanceNormals()[VI].Equals(V.N,0.0001f) ||
			!A.GetVertexInstanceTangents()[VI].Equals(V.T,0.0001f) || A.GetVertexInstanceBinormalSigns()[VI]!=V.W ||
			!A.GetVertexInstanceUVs().Get(VI,0).Equals(V.UV,0.000001f) ||
			!A.GetVertexInstanceColors()[VI].Equals(FVector4f(V.Color.R,V.Color.G,V.Color.B,1),0.000001f)) return false;
	}
	for (int32 K=0;K<Part.F.Num();++K)
	{
		const FTriangleID T(K); if (!D->IsTriangleValid(T)) return false;
		const auto V=D->GetTriangleVertexInstances(T); const auto& F=Part.F[K];
		if (V[0].GetValue()!=F.X || V[1].GetValue()!=F.Y || V[2].GetValue()!=F.Z ||
			A.GetPolygonGroupMaterialSlotNames()[D->GetTrianglePolygonGroup(T)]!=(Part.M[K]==0?FName(TEXT("Bark")):FName(TEXT("Foliage")))) return false;
	}
	return true;
}
FTransform Frame(const TSharedPtr<FJsonObject>& J)
{
	const auto Read = [&](const TCHAR* K) { const auto& A=J->GetArrayField(K); return FVector(FVector3f(A[0]->AsNumber(),-A[1]->AsNumber(),A[2]->AsNumber())); };
	const auto& A=J->GetArrayField(TEXT("position_m"));
	const FVector P(FVector3f(A[0]->AsNumber()*100,-A[1]->AsNumber()*100,A[2]->AsNumber()*100));
	const FVector Z=Read(TEXT("up")).GetSafeNormal();
	FVector Y=Read(TEXT("face")).GetSafeNormal(); Y=(Y-FVector::DotProduct(Y,Z)*Z).GetSafeNormal();
	return FTransform(FQuat(FRotationMatrix::MakeFromYZ(Y,Z)),P,FVector(float(J->GetNumberField(TEXT("scale_m")))));
}
FString Failure(const FString& Message)
{
	UE_LOG(LogTemp,Error,TEXT("BranchForge shared assembly: %s"),*Message);
	TSharedRef<FJsonObject> J=MakeShared<FJsonObject>(); J->SetBoolField(TEXT("success"),false); J->SetStringField(TEXT("error"),Message);
	FString Text; FJsonSerializer::Serialize(J,TJsonWriterFactory<>::Create(&Text)); return Text;
}
}

bool UBranchForgeAssemblyLibrary::SetPreparedParts(UPVBranchForgePreviewSettings* Settings,const TArray<UObject*>& Meshes,const TArray<int32>& Modes,const FString& BinaryHash)
{
	if (!IsInGameThread() || !Settings || Meshes.Num()!=Modes.Num()) return false;
	for (int32 I=0;I<Meshes.Num();++I) if (Modes[I]<0 || Modes[I]>2 || (Meshes[I] && !Cast<UStaticMesh>(Meshes[I])) || (Modes[I]>0 && !Meshes[I])) return false;
	Settings->Modify(); Settings->SharedPartMeshes.Reset();
	for (UObject* Mesh:Meshes) Settings->SharedPartMeshes.Add(Mesh);
	Settings->SharedPartModes=Modes; Settings->SharedBinaryHash=BinaryHash;
	return true;
}

FString UBranchForgeAssemblyLibrary::PrepareSharedParts(UPVBranchForgePreviewSettings* Settings, const FString& ManifestPath, const FString& TargetFolder)
{
	if (!IsInGameThread() || !Settings || !Settings->AssemblyBarkMaterial || !Settings->AssemblyFoliageMaterial ||
		!TargetFolder.StartsWith(TEXT("/Game/")) || !FPackageName::IsValidLongPackageName(TargetFolder)) return Failure(TEXT("Invalid settings or target folder"));
	FString Text; TSharedPtr<FJsonObject> Root;
	if (!FFileHelper::LoadFileToString(Text,*ManifestPath) || !FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Text),Root) || !Root.IsValid() ||
		Root->GetStringField(TEXT("format"))!=TEXT("BranchForgeResolvedAssembly") || Root->GetIntegerField(TEXT("version"))!=1) return Failure(TEXT("Invalid manifest"));
	// Source ordering and per-chunk colors live in the manifest, not the binary.
	FTCHARToUTF8 ManifestBytes(*Text); FSHAHash ManifestDigest; FSHA1::HashBuffer(ManifestBytes.Get(),ManifestBytes.Length(),ManifestDigest.Hash);
	const FString Name=Root->GetStringField(TEXT("binary")); TArray<uint8> Binary;
	if (FPaths::GetCleanFilename(Name)!=Name || !FFileHelper::LoadFileToArray(Binary,*(FPaths::GetPath(ManifestPath)/Name)) || Binary.Num()<8 ||
		Binary.Num()!=Root->GetNumberField(TEXT("binary_bytes")) || FMemory::Memcmp(Binary.GetData(),"BFRA0001",8)) return Failure(TEXT("Invalid binary"));
	FSHAHash Digest; FSHA1::HashBuffer(Binary.GetData(),Binary.Num(),Digest.Hash);
	if (!Digest.ToString().Equals(Root->GetStringField(TEXT("binary_sha1")),ESearchCase::IgnoreCase)) return Failure(TEXT("Binary checksum mismatch"));
	const auto& Instances=Root->GetArrayField(TEXT("instances")); const auto& Sources=Root->GetArrayField(TEXT("sources"));
	TArray<TArray<TSharedPtr<FJsonObject>>> Chunks; Chunks.SetNum(Instances.Num());
	for (const auto& Value:Root->GetArrayField(TEXT("chunks")))
	{
		const auto C=Value->AsObject(); const int32 I=C->GetIntegerField(TEXT("instance_index"));
		if (I<0) continue;
		if (!Chunks.IsValidIndex(I) || C->GetIntegerField(TEXT("source_index"))!=Instances[I]->AsObject()->GetIntegerField(TEXT("source_index"))) return Failure(TEXT("Invalid chunk owner"));
		Chunks[I].Add(C);
	}
	const auto ReadPart=[&](int32 I,bool OnlyFoliage,FPartData& Out)->bool
	{
		const FTransform Base=Frame(Instances[I]->AsObject());
		for (const auto& C:Chunks[I])
		{
			const int32 Material=C->GetStringField(TEXT("material_role"))==TEXT("bark")?0:1;
			if (OnlyFoliage && Material==0) continue;
			const int64 VO=C->GetNumberField(TEXT("vertex_offset")),IO=C->GetNumberField(TEXT("index_offset"));
			const int32 VC=C->GetIntegerField(TEXT("vertex_count")),IC=C->GetIntegerField(TEXT("index_count"));
			if (VC<=0 || IC<=0 || IC%3 || VO<8 || IO<8 || VO+int64(VC)*48>Binary.Num() || IO+int64(IC)*4>Binary.Num()) return false;
			const auto& Color=C->GetArrayField(TEXT("color_linear")); const int32 Start=Out.V.Num();
			for (int32 K=0;K<VC;++K)
			{
				float V[12]; FMemory::Memcpy(V,Binary.GetData()+VO+int64(K)*48,48);
				FPartVertex& P=Out.V.AddDefaulted_GetRef();
				P.P=FVector3f(Base.InverseTransformPosition(FVector(V[0],V[1],V[2])));
				P.N=FVector3f(Base.InverseTransformVectorNoScale(FVector(V[3],V[4],V[5])));
				P.T=FVector3f(Base.InverseTransformVectorNoScale(FVector(V[8],V[9],V[10])));
				P.W=V[11]; P.UV=FVector2f(V[6],V[7]); P.Color=FLinearColor(Color[0]->AsNumber(),Color[1]->AsNumber(),Color[2]->AsNumber(),1);
				if (P.P.ContainsNaN() || P.N.ContainsNaN() || P.T.ContainsNaN() || P.UV.ContainsNaN()) return false;
			}
			for (int32 K=0;K<IC;K+=3)
			{
				uint32 V[3]; FMemory::Memcpy(V,Binary.GetData()+IO+int64(K)*4,12);
				if (V[0]>=uint32(VC) || V[1]>=uint32(VC) || V[2]>=uint32(VC)) return false;
				Out.F.Emplace(Start+V[0],Start+V[1],Start+V[2]); Out.M.Add(Material);
			}
		}
		return Out.V.Num()>0;
	};
	TArray<TSoftObjectPtr<UObject>> Meshes; Meshes.SetNum(Sources.Num()); TArray<int32> Modes; Modes.Init(0,Sources.Num());
	TArray<TSharedPtr<FJsonValue>> Reports; int64 SharedFaces=0; double MaxError=0;
	for (int32 S=0;S<Sources.Num();++S)
	{
		TArray<int32> Members;
		for (int32 I=0;I<Instances.Num();++I) if (Instances[I]->AsObject()->GetIntegerField(TEXT("source_index"))==S) Members.Add(I);
		// Trunk exports bind complete units to rigid assembly bones even when a
		// source has only one instance. Keep the legacy reuse threshold elsewhere.
		if (Members.IsEmpty() || (Members.Num()<2 && !Root->HasField(TEXT("imported_trunk_skin")))) continue;
		FPartData Canonical; int32 Mode=0; double AcceptedError=0;
		for (int32 Attempt=2;Attempt>=1;--Attempt)
		{
			Canonical=FPartData(); if (!ReadPart(Members[0],Attempt==1,Canonical)) continue;
			bool Matches=true; double Error=0;
			for (int32 I:Members)
			{
				FPartData Other; if (!ReadPart(I,Attempt==1,Other) || Other.F!=Canonical.F || Other.M!=Canonical.M || Other.V.Num()!=Canonical.V.Num()) { Matches=false; break; }
				const double Scale=Frame(Instances[I]->AsObject()).GetScale3D().GetAbsMax();
				for (int32 K=0;K<Other.V.Num();++K)
				{
					const auto& A=Canonical.V[K]; const auto& B=Other.V[K]; const double E=FVector3f::Distance(A.P,B.P)*Scale; Error=FMath::Max(Error,E);
					// Verify positions in world centimeters, directions, UVs, tints and topology. No visual approximation beyond float roundoff.
					if (E>0.005 || !A.N.Equals(B.N,0.0001f) || !A.T.Equals(B.T,0.0001f) || !A.UV.Equals(B.UV,0.000001f) || A.W!=B.W || !A.Color.Equals(B.Color,0.000001f)) { Matches=false; break; }
				}
				if (!Matches) break;
			}
			if (Matches) { Mode=Attempt; AcceptedError=Error; break; }
		}
		if (!Mode) continue;
		const FString PartName=FString::Printf(TEXT("SM_Shared_%02d_%s"),S,Mode==2?TEXT("Complete"):TEXT("Foliage"));
		const FString MaterialKey=Settings->AssemblyBarkMaterial->GetPathName()+TEXT("|")+Settings->AssemblyFoliageMaterial->GetPathName();
		FTCHARToUTF8 MaterialBytes(*MaterialKey); FSHAHash MaterialDigest; FSHA1::HashBuffer(MaterialBytes.Get(),MaterialBytes.Length(),MaterialDigest.Hash);
		const FString PackageName=TargetFolder/(TEXT("R_")+ManifestDigest.ToString().Left(12)+TEXT("_M_")+MaterialDigest.ToString().Left(12))/PartName;
		double Scale=0; for (int32 I:Members) Scale=FMath::Max(Scale,Frame(Instances[I]->AsObject()).GetScale3D().GetAbsMax());
		UStaticMesh* Mesh=nullptr; bool ReusedReference=false; double ReferenceError=0;
		if (Settings->SharedPartMeshes.IsValidIndex(S) && Settings->SharedPartModes.IsValidIndex(S) && Settings->SharedPartModes[S]==Mode)
		{
			auto* Candidate=Cast<UStaticMesh>(Settings->SharedPartMeshes[S].LoadSynchronous());
			if (SamePart(Candidate,Canonical,Settings,Scale,0.005-AcceptedError,ReferenceError)) { Mesh=Candidate; ReusedReference=true; }
		}
		if (!Mesh) Mesh=LoadObject<UStaticMesh>(nullptr,*(PackageName+TEXT(".")+PartName),nullptr,LOAD_NoWarn|LOAD_Quiet);
		if (!Mesh)
		{
			FMeshDescription Desc; FStaticMeshAttributes Attr(Desc); Attr.Register();
			auto Positions=Attr.GetVertexPositions(); auto Normals=Attr.GetVertexInstanceNormals(); auto Tangents=Attr.GetVertexInstanceTangents();
			auto Signs=Attr.GetVertexInstanceBinormalSigns(); auto Colors=Attr.GetVertexInstanceColors(); auto UV=Attr.GetVertexInstanceUVs(); UV.SetNumChannels(1);
			TArray<FVertexInstanceID> VIs; VIs.Reserve(Canonical.V.Num());
			const FPolygonGroupID Groups[2]={Desc.CreatePolygonGroup(),Desc.CreatePolygonGroup()};
			Attr.GetPolygonGroupMaterialSlotNames()[Groups[0]]=TEXT("Bark"); Attr.GetPolygonGroupMaterialSlotNames()[Groups[1]]=TEXT("Foliage");
			for (const auto& V:Canonical.V)
			{
				const FVertexID Id=Desc.CreateVertex(); Positions[Id]=V.P; const FVertexInstanceID VI=Desc.CreateVertexInstance(Id); VIs.Add(VI);
				Normals[VI]=V.N; Tangents[VI]=V.T; Signs[VI]=V.W; Colors[VI]=FVector4f(V.Color.R,V.Color.G,V.Color.B,1); UV.Set(VI,0,V.UV);
			}
			for (int32 F=0;F<Canonical.F.Num();++F)
			{
				const auto& Face=Canonical.F[F]; const FVertexInstanceID Triangle[3]={VIs[Face.X],VIs[Face.Y],VIs[Face.Z]};
				Desc.CreateTriangle(Groups[Canonical.M[F]],MakeArrayView(Triangle));
			}
			Mesh=NewObject<UStaticMesh>(CreatePackage(*PackageName),*PartName,RF_Public|RF_Standalone);
			Mesh->GetStaticMaterials().Add(FStaticMaterial(Settings->AssemblyBarkMaterial,TEXT("Bark")));
			Mesh->GetStaticMaterials().Add(FStaticMaterial(Settings->AssemblyFoliageMaterial,TEXT("Foliage")));
			Mesh->SetNumSourceModels(1); auto& Build=Mesh->GetSourceModel(0).BuildSettings;
			Build.bRecomputeNormals=false; Build.bRecomputeTangents=false; Build.bRemoveDegenerates=false; Build.bGenerateLightmapUVs=false; Build.bUseFullPrecisionUVs=true;
			Mesh->CreateMeshDescription(0,MoveTemp(Desc)); Mesh->CommitMeshDescription(0);
			auto& Nanite=Mesh->GetNaniteSettings(); Nanite.bEnabled=true; Nanite.ShapePreservation=ENaniteShapePreservation::Voxelize;
			Mesh->Build(false); FStaticMeshCompilingManager::Get().FinishCompilation({Mesh});
			FAssetRegistryModule::AssetCreated(Mesh); Mesh->MarkPackageDirty();
		}
		Meshes[S]=Mesh; Modes[S]=Mode; MaxError=FMath::Max(MaxError,AcceptedError); SharedFaces+=int64(Canonical.F.Num())*Members.Num();
		const auto R=MakeShared<FJsonObject>(); R->SetNumberField(TEXT("source_index"),S); R->SetNumberField(TEXT("mode"),Mode); R->SetStringField(TEXT("mesh"),Mesh->GetPathName());
		R->SetNumberField(TEXT("instances"),Members.Num()); R->SetNumberField(TEXT("part_triangles"),Canonical.F.Num()); R->SetNumberField(TEXT("max_position_error_cm"),AcceptedError); Reports.Add(MakeShared<FJsonValueObject>(R));
		R->SetBoolField(TEXT("reused_reference"),ReusedReference); R->SetNumberField(TEXT("reference_position_error_cm"),ReusedReference?ReferenceError:0);
	}
	Settings->Modify(); Settings->SharedPartMeshes=MoveTemp(Meshes); Settings->SharedPartModes=MoveTemp(Modes); Settings->SharedBinaryHash=Digest.ToString();
	const auto Result=MakeShared<FJsonObject>(); Result->SetBoolField(TEXT("success"),true); Result->SetArrayField(TEXT("parts"),Reports);
	Result->SetNumberField(TEXT("shared_triangles_with_instances"),SharedFaces); Result->SetNumberField(TEXT("max_position_error_cm"),MaxError); Result->SetStringField(TEXT("binary_sha1"),Digest.ToString());
	FString Json; FJsonSerializer::Serialize(Result,TJsonWriterFactory<>::Create(&Json)); UE_LOG(LogTemp,Display,TEXT("BRANCHFORGE_SHARED_PARTS %s"),*Json); return Json;
}
