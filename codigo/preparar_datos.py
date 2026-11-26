"""Prepara todos los CSV locales sin modificar originales. Python 3.10+, sin bibliotecas GIS."""
import csv,json,math,hashlib,sys
from pathlib import Path
from datetime import datetime,timezone
from zoneinfo import ZoneInfo
from collections import defaultdict,Counter
from motor_focos import project
BASE=Path(__file__).resolve().parent.parent
ORIGEN=Path(sys.argv[1]) if len(sys.argv)>1 else Path("C:/Users/diego/Desktop/Hackaton NASA")
TZ=ZoneInfo("America/Santiago")
AREA=json.loads((BASE/"datos/la-araucania.geojson").read_text(encoding="utf-8-sig"))

class GeoIndex:
    """Ray casting exacto sobre segmentos; índice por franjas de latitud para acelerar."""
    def __init__(self,feature):
        geom=feature["geometry"]
        polys=[geom["coordinates"]] if geom["type"]=="Polygon" else geom["coordinates"]
        self.polys=[]
        for poly in polys:
            coords=[c for ring in poly for c in ring]
            bounds=(min(c[0] for c in coords),min(c[1] for c in coords),max(c[0] for c in coords),max(c[1] for c in coords))
            buckets=defaultdict(list)
            for ring in poly:
                for a,b in zip(ring,ring[1:]):
                    x0,y0=a[:2];x1,y1=b[:2]
                    edge=(x0,y0,x1,y1)
                    for j in range(math.floor(min(y0,y1)*100),math.floor(max(y0,y1)*100)+1):
                        buckets[j].append(edge)
            self.polys.append((bounds,buckets))
    def contains(self,x,y):
        for (w,s,e,n),buckets in self.polys:
            if not(w<=x<=e and s<=y<=n):continue
            inside=False
            for ax,ay,bx,by in buckets.get(math.floor(y*100),()):
                cross=(x-ax)*(by-ay)-(y-ay)*(bx-ax)
                if abs(cross)<1e-12 and min(ax,bx)<=x<=max(ax,bx) and min(ay,by)<=y<=max(ay,by):return True
                if (ay>y)!=(by>y) and x<ax+(bx-ax)*(y-ay)/(by-ay):inside=not inside
            if inside:return True
        return False

features=AREA["features"]
zones=[(f["properties"]["codcom"],f["properties"]["nomcom"],GeoIndex(f)) for f in features]
by_month=defaultdict(list); files=[];duplicates=0;invalid=0;seen=set();coord_cache={}
source_specs=[("MODIS","MODIS"),("SNPP","VIIRS S-NPP"),("JPSS1","VIIRS JPSS-1")]
columns=["lon","lat","utc_ms","plataforma","comuna","confianza","tipo","frp","scan","track","brillo_4um","brillo_11um","dia_noche","archivo_id","fecha_local","satellite"]
def optional_float(value):
    try:
        numeric=float(value) if value!="" else None
        return numeric if numeric is None or math.isfinite(numeric) else None
    except (ValueError,TypeError):return None
for platform,folder in source_specs:
    paths=sorted((ORIGEN/folder).glob("*.csv"))
    for path in paths:
        file_id=len(files); raw=path.read_bytes()
        info=dict(id=file_id,nombre=path.name,plataforma=platform,sha256=hashlib.sha256(raw).hexdigest(),filas=0,invalidas=0,en_region=0,retenidas=0,duplicadas=0,versiones=[],satelites=[],meses_archivo={},meses_region={})
        versions=set();satellites=set();countrymonths=Counter();regionmonths=Counter();earliest=None;latest=None
        with path.open(encoding="utf-8-sig",newline="") as stream:
            reader=csv.DictReader(stream)
            required={"longitude","latitude","acq_date","acq_time"}
            if not required.issubset(reader.fieldnames or []):raise ValueError(f"Encabezados inválidos: {path}")
            for row in reader:
                info["filas"]+=1
                try:
                    lon,lat=float(row["longitude"]),float(row["latitude"])
                    if not(math.isfinite(lon) and math.isfinite(lat) and abs(lon)<=180 and abs(lat)<=90):raise ValueError()
                    hhmm=row["acq_time"].strip().zfill(4)
                    if len(hhmm)!=4 or not hhmm.isdigit() or int(hhmm[:2])>=24 or int(hhmm[2:])>=60:raise ValueError()
                    stamp=datetime.strptime(row["acq_date"]+" "+hhmm,"%Y-%m-%d %H%M").replace(tzinfo=timezone.utc)
                    date=stamp.astimezone(TZ).strftime("%Y-%m-%d");month=date[:7]
                except (ValueError,KeyError):
                    info["invalidas"]+=1;invalid+=1;continue
                countrymonths[month]+=1
                earliest=date if earliest is None else min(earliest,date)
                latest=date if latest is None else max(latest,date)
                versions.add(row.get("version",""));satellites.add(row.get("satellite",""))
                # Caja general antes de las pruebas de 32 comunas.
                if not(-73.53<=lon<=-70.82 and -39.65<=lat<=-37.57):continue
                key=(lon,lat)
                if key not in coord_cache:
                    coord_cache[key]=next((code for code,name,index in zones if index.contains(lon,lat)),None)
                code=coord_cache[key]
                if code is None:continue
                info["en_region"]+=1;regionmonths[month]+=1
                timestamp=int(stamp.timestamp()*1000)
                identity=(platform,row.get("satellite",""),timestamp,lon,lat)
                if identity in seen:duplicates+=1;info["duplicadas"]+=1;continue
                seen.add(identity);info["retenidas"]+=1
                by_month[month].append([lon,lat,timestamp,platform,code,row.get("confidence",""),row.get("type",""),optional_float(row.get("frp","")),optional_float(row.get("scan","")),optional_float(row.get("track","")),optional_float(row.get("brightness",row.get("bright_ti4",""))),optional_float(row.get("bright_t31",row.get("bright_ti5",""))),row.get("daynight",""),file_id,date,row.get("satellite","")])
        info.update(versiones=sorted(versions),satelites=sorted(satellites),meses_archivo=dict(sorted(countrymonths.items())),meses_region=dict(sorted(regionmonths.items())),primer_dia_archivo=earliest,ultimo_dia_archivo=latest)
        files.append(info)
        print(f"{platform} {path.name}: {info['retenidas']} retenidas, {info['invalidas']} inválidas",flush=True)
# Presencia mensual deducida de los archivos originales, nunca de puntos dentro de una comuna.
months=sorted(set(m for f in files for m in f["meses_archivo"]))
for month in months:
    points=by_month.get(month,[])
    (BASE/"datos"/(month+".js")).write_text("window.NASA_DATA["+json.dumps(month)+"]="+json.dumps(points,separators=(",",":"),ensure_ascii=False)+";",encoding="utf-8")
manifest=dict(fecha_preparacion="2026-11-14",poligono_sha256=hashlib.sha256((BASE/"datos/la-araucania.geojson").read_bytes()).hexdigest(),zona="La Araucanía",timezone="America/Santiago",columnas=columns,meses=months,archivos=files,duplicados_eliminados=duplicates,filas_invalidas=invalid,total_regional=sum(map(len,by_month.values())),registros_por_mes={m:len(by_month.get(m,[])) for m in months},nota_cobertura="Un archivo con registros del mes acredita presencia del archivo, no integridad mensual ni observación útil. Los meses sin archivo no se convierten a cero.",carpetas_fuente=[folder for p,folder in source_specs],nota_carpeta="Se usa VIIRS S-NPP y VIIRS JPSS-1 por separado. No se vuelve a cargar la carpeta genérica VIIRS ni archivos XLSX.")
# Coordenadas de dibujo simplificadas solo para pantalla. El GeoJSON completo se conserva para el motor.
shapes=[]
for f in features:
    geom=f["geometry"];polys=[geom["coordinates"]] if geom["type"]=="Polygon" else geom["coordinates"]
    outlines=[]
    for poly in polys:
        rings=[]
        for ring in poly:
            stride=max(1,len(ring)//650);small=ring[::stride]
            if small[-1]!=ring[-1]:small.append(ring[-1])
            rings.append([list(project(*c[:2])) for c in small])
        outlines.append(rings)
    shapes.append(dict(code=f["properties"]["codcom"],name=f["properties"]["nomcom"],polygons=outlines))
catalog=dict(manifest=manifest,area=AREA,shapes=shapes)
(BASE/"datos/catalogo.js").write_text("window.NASA_DATA={};window.NASA_CATALOG="+json.dumps(catalog,separators=(",",":"),ensure_ascii=False)+";",encoding="utf-8")
(BASE/"datos/inventario.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding="utf-8")
print(json.dumps(dict(archivos=len(files),meses=len(months),puntos=manifest["total_regional"],duplicados=duplicates,invalidas=invalid)))
