"""Verificaciones de inventario, geografía y conteo. Ejecutar desde la carpeta principal."""
import json,math,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from motor_focos import parse_area,inside_area,project,count_days_cells
base=Path(__file__).resolve().parent.parent
manifest=json.loads((base/"datos/inventario.json").read_text())
assert len(manifest["archivos"])==48
assert manifest["total_regional"]==175486
assert manifest["filas_invalidas"]==0
assert len(manifest["meses"])==302
area=json.loads((base/"datos/la-araucania.geojson").read_text(encoding="utf-8-sig"))
bound=parse_area(area)
zones={f["properties"]["codcom"]:parse_area(f) for f in area["features"]}
def load(month):
    text=(base/"datos"/(month+".js")).read_text()
    return json.loads(text[text.index("=")+1:].rstrip(";"))
feb=load("2023-02")
assert len(feb)==19422
counts={k:sum(r[3]==k for r in feb) for k in ["MODIS","SNPP","JPSS1"]}
assert counts==dict(MODIS=2776,SNPP=8358,JPSS1=8288)
# Muestra determinista: comprobar pertenencia en geometría original y comuna asignada.
sample=feb[::max(1,len(feb)//120)]
for r in sample:
    assert inside_area(r[0],r[1],bound)
    assert inside_area(r[0],r[1],zones[r[4]])
    assert len(r)==16 and r[15]
def count(km,platforms):
    ps=[]
    for r in feb:
        if r[3] not in platforms:continue
        x,y=project(r[0],r[1])
        ps.append(dict(x=x,y=y,day=r[14],sensor="MODIS" if r[3]=="MODIS" else "VIIRS"))
    return count_days_cells([p for p in ps if p["sensor"]=="MODIS"],[p for p in ps if p["sensor"]=="VIIRS"],km*1000)
assert count(1,["MODIS","SNPP","JPSS1"])["integrated"]==4211
assert count(1,["MODIS","JPSS1"])["integrated"]==3680
assert count(2,["MODIS","SNPP"])["integrated"]==1892
# Días idénticos de meses distintos no deben colapsar.
p=dict(x=1,y=1,day="2023-01-03")
assert count_days_cells([p,dict(p,day="2023-02-03")],[],1000)["integrated"]==2
assert any("2018-04" in f["meses_archivo"] for f in manifest["archivos"] if f["plataforma"]=="JPSS1")
assert not any("2017-01" in f["meses_archivo"] for f in manifest["archivos"] if f["plataforma"]=="JPSS1")
total=0
for month in manifest["meses"]:
    records=load(month)
    assert len(records)==manifest["registros_por_mes"][month]
    assert all(r[14].startswith(month) for r in records)
    total+=len(records)
assert total==manifest["total_regional"]
out=dict(estado="correcto",archivos=48,meses=302,detecciones=total,muestra_geografica=len(sample),febrero_2023=counts,conteos_reproducidos=[4211,3680,1892],nota="Comprobación de preparación y conteos; no valida científicamente el modelo ni la integridad mensual de las descargas.")
(base/"verificacion-datos.json").write_text(json.dumps(out,ensure_ascii=False,indent=2))
print(json.dumps(out,ensure_ascii=False))
