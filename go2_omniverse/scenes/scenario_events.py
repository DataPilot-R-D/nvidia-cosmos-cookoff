"""
Luvr Security Scenario Events
Uruchamiany przez Kit API execute_script po Play.

Timeline:
  t=0:   Guard zaczyna patrol, zlodzeje czekaja na platformie
  t=7:   Okno peka (glass opacity->0, GlassShards visible)
  t=8-10: Zlodzeje wchodza (command file handles movement)
  t=30:  Zlodzeje przy gablotach
"""
import asyncio
import omni.usd
import omni.kit.app
from pxr import Usd, UsdGeom, UsdShade, Sdf

async def run_scenario():
    """Main scenario coroutine."""
    stage = omni.usd.get_context().get_stage()
    if not stage:
        print("[scenario] ERROR: No stage loaded")
        return

    print("[scenario] Scenario started — waiting for t=7 (window break)")

    # Wait 7 seconds for window break
    await asyncio.sleep(7.0)

    print("[scenario] t=7: WINDOW BREAK")

    # 1. Make glass transparent (opacity -> 0)
    glass_prim = stage.GetPrimAtPath("/World/Luvr/Gallerie_Apollon_832820_skel/Gallerie_Apollon_832820/glass")
    if not glass_prim.IsValid():
        # Try alternate paths
        for path in ["/World/Luvr/Gallerie_Apollon_832820_skel/Gallerie_Apollon_832820/glass", "/World/Luvr/Looks/glass"]:
            glass_prim = stage.GetPrimAtPath(path)
            if glass_prim.IsValid():
                break

    if glass_prim.IsValid():
        # Find shader and set opacity to 0
        for prim in Usd.PrimRange(glass_prim):
            if prim.IsA(UsdShade.Shader):
                shader = UsdShade.Shader(prim)
                opacity_input = shader.GetInput("opacity_constant")
                if opacity_input:
                    opacity_input.Set(0.0)
                    print(f"[scenario] Glass opacity set to 0: {prim.GetPath()}")
    else:
        print("[scenario] WARNING: Glass prim not found, skipping opacity change")

    # 2. Make GlassShards visible
    shards_prim = stage.GetPrimAtPath("/World/GlassShards")
    if shards_prim.IsValid():
        imageable = UsdGeom.Imageable(shards_prim)
        imageable.MakeVisible()
        print("[scenario] GlassShards made visible")

        # Also make all children visible
        for child in Usd.PrimRange(shards_prim):
            child_img = UsdGeom.Imageable(child)
            vis_attr = child_img.GetVisibilityAttr()
            if vis_attr:
                vis_attr.Set(UsdGeom.Tokens.inherited)
    else:
        print("[scenario] WARNING: GlassShards not found")

    print("[scenario] Window break complete. Thieves entering via command file...")
    print("[scenario] Scenario events done. Character movement handled by BehaviorScript.")


def reset_scenario():
    """Reset scene state before Play — call this FIRST."""
    stage = omni.usd.get_context().get_stage()
    if not stage:
        return

    print("[scenario] Resetting scenario state...")

    # Hide GlassShards
    shards_prim = stage.GetPrimAtPath("/World/GlassShards")
    if shards_prim.IsValid():
        imageable = UsdGeom.Imageable(shards_prim)
        vis_attr = imageable.GetVisibilityAttr()
        vis_attr.Set(UsdGeom.Tokens.invisible)
        for child in Usd.PrimRange(shards_prim):
            child_img = UsdGeom.Imageable(child)
            child_vis = child_img.GetVisibilityAttr()
            if child_vis:
                child_vis.Set(UsdGeom.Tokens.invisible)
        print("[scenario] GlassShards hidden")

    # Restore glass opacity
    glass_prim = stage.GetPrimAtPath("/World/Luvr/Gallerie_Apollon_832820_skel/Gallerie_Apollon_832820/glass")
    if not glass_prim.IsValid():
        for path in ["/World/Luvr/Gallerie_Apollon_832820_skel/Gallerie_Apollon_832820/glass", "/World/Luvr/Looks/glass"]:
            glass_prim = stage.GetPrimAtPath(path)
            if glass_prim.IsValid():
                break
    if glass_prim.IsValid():
        for prim in Usd.PrimRange(glass_prim):
            if prim.IsA(UsdShade.Shader):
                shader = UsdShade.Shader(prim)
                opacity_input = shader.GetInput("opacity_constant")
                if opacity_input:
                    opacity_input.Set(0.05)
                    print(f"[scenario] Glass opacity restored: {prim.GetPath()}")

    print("[scenario] Reset complete")


# Auto-run: reset then schedule scenario
reset_scenario()
asyncio.ensure_future(run_scenario())
print("[scenario] Scenario scheduled — press Play to start timeline")
