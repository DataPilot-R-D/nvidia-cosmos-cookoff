import omni.usd
from pxr import UsdLux, UsdGeom, Gf

stage = omni.usd.get_context().get_stage()

# 1. Dome Light - symulacja nieba/swiatla z okien
dome = UsdLux.DomeLight.Define(stage, "/World/AmbientSky")
dome.CreateIntensityAttr(30000)
dome.CreateColorAttr(Gf.Vec3f(0.95, 0.92, 0.88))

# 2. Rect Lights przy oknach - swiatlo dzienne wpadajace z bokow
# Galeria Y-up, okna po bokach (os X), galeria biegnie wzdluz Z
# Lewe okna (X ujemne)
for i in range(5):
    z = -8 + i * 4  # rozlozone wzdluz galerii
    light = UsdLux.RectLight.Define(stage, f"/World/WindowLight_L{i}")
    light.CreateIntensityAttr(60000)
    light.CreateWidthAttr(3.0)
    light.CreateHeightAttr(4.0)
    light.CreateColorAttr(Gf.Vec3f(1.0, 0.95, 0.85))
    xf = UsdGeom.Xformable(light)
    xf.AddTranslateOp().Set(Gf.Vec3d(-9, 4, z))
    xf.AddRotateXYZOp().Set(Gf.Vec3f(0, 0, -30))  # skierowane do wnetrza

# Prawe okna (X dodatnie)
for i in range(5):
    z = -8 + i * 4
    light = UsdLux.RectLight.Define(stage, f"/World/WindowLight_R{i}")
    light.CreateIntensityAttr(60000)
    light.CreateWidthAttr(3.0)
    light.CreateHeightAttr(4.0)
    light.CreateColorAttr(Gf.Vec3f(1.0, 0.95, 0.85))
    xf = UsdGeom.Xformable(light)
    xf.AddTranslateOp().Set(Gf.Vec3d(9, 4, z))
    xf.AddRotateXYZOp().Set(Gf.Vec3f(0, 0, 30))  # skierowane do wnetrza

# 3. Sphere Lights - zyrandole krysztalowe wzdluz osi
for i in range(4):
    z = -6 + i * 4
    light = UsdLux.SphereLight.Define(stage, f"/World/Chandelier_{i}")
    light.CreateIntensityAttr(40000)
    light.CreateRadiusAttr(0.3)
    light.CreateColorAttr(Gf.Vec3f(1.0, 0.88, 0.7))  # cieplo-zloty
    xf = UsdGeom.Xformable(light)
    xf.AddTranslateOp().Set(Gf.Vec3d(0, 6, z))  # pod sufitem, na osi

# 4. Rect Light w sklepieniu (skylight)
sky = UsdLux.RectLight.Define(stage, "/World/Skylight")
sky.CreateIntensityAttr(40000)
sky.CreateWidthAttr(4.0)
sky.CreateHeightAttr(16.0)
sky.CreateColorAttr(Gf.Vec3f(0.9, 0.95, 1.0))  # chlodniejsze swiatlo z gory
xf = UsdGeom.Xformable(sky)
xf.AddTranslateOp().Set(Gf.Vec3d(0, 8, 0))
xf.AddRotateXYZOp().Set(Gf.Vec3f(90, 0, 0))  # w dol

print("Realistyczne oswietlenie Galerii Apollon dodane!")
print("- Dome (niebo): 30k")
print("- 10x okna (5L + 5R): 60k each")
print("- 4x zyrandole: 40k each, zloty kolor")
print("- 1x skylight: 40k, chlodny")
print("Zapisz: File > Save")
