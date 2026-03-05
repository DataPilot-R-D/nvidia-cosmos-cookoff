import omni.usd
import carb

# Settings BEFORE stage load
carb.settings.get_settings().set("/exts/omni.anim.people/settings/character_prim_path", "/World/Characters")
carb.settings.get_settings().set("/exts/omni.anim.people/command_settings/command_file_path", "/home/ubuntu/go2_omniverse/scenes/luvr_commands.txt")
carb.settings.get_settings().set("/exts/omni.anim.people/navigation_settings/navmesh_enabled", False)
carb.settings.get_settings().set("/persistent/exts/omni.kit.scripting/allowScripts", True)
carb.settings.get_settings().set("/exts/omni.kit.scripting/autoRun", True)
carb.log_warn("[load_luvr] Settings applied")

omni.usd.get_context().open_stage("/home/ubuntu/go2_omniverse/scenes/Luvr_full.usda")
carb.log_warn("[load_luvr] Opening Luvr_full.usda (Z-up)")

# Auto-allow scripts after stage loads
import asyncio
async def _allow_scripts():
    await asyncio.sleep(5)
    try:
        from omni.kit.scripting import ScriptManager
        sm = ScriptManager.get_instance()
        if not sm._allow_scripts_to_execute:
            sm._allow_scripts_to_execute = True
            sm._load_all_scripts()
            carb.log_warn("[load_luvr] Scripts force-allowed and loaded")
    except Exception as e:
        carb.log_warn(f"[load_luvr] Script allow failed: {e}")

asyncio.ensure_future(_allow_scripts())
