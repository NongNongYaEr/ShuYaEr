#include "Editor.h"
#include "EditorViewportClient.h"
#include "Engine/World.h"
#include "HAL/IConsoleManager.h"

// Callable through the local MCP console endpoint; no mouse/keyboard automation.
static FAutoConsoleCommand BranchForgePreviewCamera(
    TEXT("BranchForge.PreviewCamera"),
    TEXT("Set visible asset preview camera: X Y Z TargetX TargetY TargetZ [FOV]. Units: cm."),
    FConsoleCommandWithArgsDelegate::CreateLambda([](const TArray<FString>& Args)
    {
        if (!GEditor || (Args.Num() != 6 && Args.Num() != 7)) return;
        double V[7] = {0, 0, 0, 0, 0, 0, 50};
        for (int32 I = 0; I < Args.Num(); ++I)
            if (!LexTryParseString(V[I], *Args[I]) || !FMath::IsFinite(V[I])) return;
        const FVector Location(V[0], V[1], V[2]), Target(V[3], V[4], V[5]);
        for (FEditorViewportClient* Client : GEditor->GetAllViewportClients())
        {
            if (!Client || Client->IsLevelEditorClient() || !Client->IsVisible() ||
                !Client->GetWorld() || Client->GetWorld()->WorldType != EWorldType::EditorPreview) continue;
            Client->ToggleOrbitCamera(false);
            Client->SetViewLocation(Location);
            Client->SetViewRotation((Target - Location).Rotation());
            Client->ViewFOV = FMath::Clamp(float(V[6]), 5.f, 120.f);
            Client->Invalidate();
            UE_LOG(LogTemp, Display, TEXT("BRANCHFORGE_PREVIEW_CAMERA location=%s target=%s fov=%.1f"),
                *Location.ToString(), *Target.ToString(), Client->ViewFOV);
        }
    }));
