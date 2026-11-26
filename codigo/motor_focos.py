"""Motor UFROMAKERS portado de model.mjs. Sin interfaz ni servidor.
Los resultados describen detecciones/celdas-día, no incendios ni área quemada.
Se conserva el método original y sus límites; véase LEEME.md.
"""
import csv
import io
import json
import math
import re
from calendar import monthrange
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

R = 6371007
def quantile(values, p):
    if not values:
        return None
    values = sorted(values)
    ix = (len(values)-1)*p
    lo = math.floor(ix)
    return values[lo]+(values[math.ceil(ix)]-values[lo])*(ix-lo)

def clamp(x, lo, hi): return max(lo, min(hi, x))
def mean(xs): return sum(xs)/len(xs) if xs else None
def month_index(key): return int(key[:4])*12+int(key[5:7])-1
def month_key(index): return f"{index//12:04d}-{index%12+1:02d}"
def season(key): return int(key[:4])-(int(key[5:7])<7)

def parse_firms(text, sensor):
    """Lee texto CSV FIRMS. No filtra confidence/type/FRP automáticamente."""
    rows = csv.reader(io.StringIO(text.lstrip("\ufeff")), strict=True)
    header = [s.strip().lower() for s in next(rows, [])]
    required = ("longitude", "latitude", "acq_date", "acq_time")
    if any(k not in header for k in required):
        raise ValueError("El CSV debe incluir longitude, latitude, acq_date y acq_time.")
    points = []
    for n, values in enumerate(rows, 2):
        if not any(s.strip() for s in values):
            continue
        row = dict(zip(header, (s.strip() for s in values)))
        instrument = row.get("instrument", "").upper()
        if instrument and instrument != sensor:
            raise ValueError(f"Fila {n}: instrumento {instrument}, se esperaba {sensor}.")
        try:
            lon, lat = float(row["longitude"]), float(row["latitude"])
            date, time = row["acq_date"], row["acq_time"]
            if not (math.isfinite(lon) and math.isfinite(lat) and abs(lon)<=180 and abs(lat)<=90):
                raise ValueError()
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date) or not re.fullmatch(r"\d{1,4}", time):
                raise ValueError()
            hhmm = time.zfill(4)
            stamp = datetime.strptime(date+" "+hhmm, "%Y-%m-%d %H%M").replace(tzinfo=timezone.utc)
            # strptime puede aceptar horas de longitud variable; comprobar HH y MM.
            if int(hhmm[:2])>=24 or int(hhmm[2:])>=60:
                raise ValueError()
        except (ValueError, KeyError) as exc:
            raise ValueError(f"Fila {n} inválida: revisa coordenadas, fecha y hora UTC.") from exc
        points.append(dict(lon=lon, lat=lat, timestamp=int(stamp.timestamp()*1000),
                           sensor=sensor, satellite=row.get("satellite",""), version=row.get("version","")))
    return points

def load_firms(paths, sensor):
    """Carga uno o varios archivos sin combinar plataformas silenciosamente."""
    if isinstance(paths, (str, Path)):
        paths = [paths]
    return [p for path in paths for p in parse_firms(Path(path).read_text(encoding="utf-8-sig"), sensor)]

def parse_area(geojson):
    polygons = []
    def collect(node):
        kind = node.get("type")
        if kind == "FeatureCollection":
            for feature in node["features"]: collect(feature)
        elif kind == "Feature": collect(node["geometry"])
        elif kind == "Polygon": polygons.append(node["coordinates"])
        elif kind == "MultiPolygon": polygons.extend(node["coordinates"])
        else: raise ValueError("El GeoJSON debe contener solo polígonos o multipolígonos.")
    collect(geojson)
    if not polygons or any(not p for p in polygons):
        raise ValueError("El GeoJSON no contiene un área.")
    coords = []
    for poly in polygons:
        for ring in poly:
            if len(ring)<4: raise ValueError("Anillo con menos de cuatro coordenadas.")
            for c in ring:
                lon, lat = c[:2]
                if not (math.isfinite(lon) and math.isfinite(lat) and abs(lon)<=180 and abs(lat)<=90):
                    raise ValueError("Usa longitud y latitud WGS 84, EPSG:4326.")
                coords.append((lon,lat))
            if ring[0][:2] != ring[-1][:2]: raise ValueError("Los anillos deben estar cerrados.")
    west, south = min(x for x,y in coords), min(y for x,y in coords)
    east, north = max(x for x,y in coords), max(y for x,y in coords)
    if east-west>90 or north-south>90 or east==west or north==south:
        raise ValueError("Zona regional inválida o cruce del antimeridiano.")
    return dict(polygons=polygons, bounds=[west,south,east,north])

def inside_area(lon, lat, area):
    west,south,east,north = area["bounds"]
    if not(west<=lon<=east and south<=lat<=north): return False
    for poly in area["polygons"]:
        inside = False
        for ring in poly:
            for a,b in zip(ring,ring[1:]):
                ax,ay = a[:2]; bx,by = b[:2]
                cross = (lon-ax)*(by-ay)-(lat-ay)*(bx-ax)
                if abs(cross)<1e-12 and min(ax,bx)<=lon<=max(ax,bx) and min(ay,by)<=lat<=max(ay,by):
                    return True
                if (ay>lat)!=(by>lat) and lon<ax+(bx-ax)*(lat-ay)/(by-ay):
                    inside = not inside
        if inside: return True
    return False

def project(lon,lat):
    """Lambert azimutal equivalente esférica, centro -72,-38, metros."""
    lon0,lat0 = math.radians(-72),math.radians(-38)
    phi,delta = math.radians(lat),math.radians(lon)-lon0
    sin0,cos0 = math.sin(lat0),math.cos(lat0)
    s,c = math.sin(phi),math.cos(phi)
    k = R*math.sqrt(2/(1+sin0*s+cos0*c*math.cos(delta)))
    return k*c*math.sin(delta), k*(cos0*s-sin0*c*math.cos(delta))

def project_area(area):
    result = []
    for poly in area["polygons"]:
        rings = []
        for ring in poly:
            points = []
            for a,b in zip(ring,ring[1:]):
                x0,y0 = a[:2]; x1,y1 = b[:2]
                steps = max(1,math.ceil(math.hypot(x1-x0,y1-y0)/.01))
                for step in range(steps):
                    t = step/steps
                    points.append(project(x0+t*(x1-x0),y0+t*(y1-y0)))
            points.append(project(*ring[-1][:2]))
            rings.append(points)
        result.append(rings)
    return result

def grid_capacity(polygons,size):
    """Número de celdas tocadas por el polígono, mismo barrido que JS."""
    rows = defaultdict(list)
    for poly in polygons:
        crossings = defaultdict(list)
        for ring in poly:
            for (x0,y0),(x1,y1) in zip(ring,ring[1:]):
                lower,upper = min(y0,y1),max(y0,y1)
                if (upper-lower)/size>100000: raise ValueError("Usa celdas mayores.")
                for j in range(math.floor(lower/size),math.floor(upper/size)+1):
                    left = x0 if y0==y1 else x0+(x1-x0)*(max(lower,j*size)-y0)/(y1-y0)
                    right = x1 if y0==y1 else x0+(x1-x0)*(min(upper,(j+1)*size)-y0)/(y1-y0)
                    rows[j].append((math.floor(min(left,right)/size),math.floor(max(left,right)/size)))
                    mid = (j+.5)*size
                    if lower<=mid<upper:
                        crossings[j].append(x0+(x1-x0)*(mid-y0)/(y1-y0))
        for j,xs in crossings.items():
            xs.sort()
            for i in range(1,len(xs),2):
                rows[j].append((math.floor(xs[i-1]/size),math.floor(xs[i]/size)))
    count = 0
    for spans in rows.values():
        end = -math.inf
        for lo,hi in sorted(spans, key=lambda x:x[0]):
            start = max(end+1,lo)
            if start<=hi: count += hi-start+1
            end = max(end,hi)
    return count

def random_generator(seed):
    """Mulberry32: conserva exactamente la secuencia del original JS."""
    mask = 0xffffffff
    while True:
        seed = (seed+0x6D2B79F5)&mask
        t = ((seed^(seed>>15))*(seed|1))&mask
        t = (t^((t+(((t^(t>>7))*(t|61))&mask))&mask))&mask
        yield ((t^(t>>14))&mask)/4294967296

def range_for(records,supplied,local_day,label):
    stamps = [p["timestamp"] for p in records]
    start = supplied.get("start") or (month_key(month_index(local_day(min(stamps)))+1) if stamps else "")
    end = supplied.get("end") or (month_key(month_index(local_day(max(stamps)))-1) if stamps else "")
    if not all(re.fullmatch(r"\d{4}-(0[1-9]|1[012])", s) for s in (start,end)) or start>end:
        raise ValueError(f"Indica primer y último mes completo de {label}.")
    return dict(start=start,end=end,inferred=not supplied.get("start") or not supplied.get("end"))

def monthly_points(points,bounds,area,local_day):
    months,seen = defaultdict(list),set()
    for p in points:
        if not inside_area(p["lon"],p["lat"],area): continue
        day = local_day(p["timestamp"]); month = day[:7]
        if not(bounds["start"]<=month<=bounds["end"]): continue
        identity = (p["timestamp"],p["lon"],p["lat"],p.get("satellite",""))
        if identity in seen: continue
        seen.add(identity)
        x,y = project(p["lon"],p["lat"])
        months[month].append(dict(x=x,y=y,day=int(day[8:10]),satellite=p.get("satellite","")))
    return months

def count_days_cells(modis,viirs,size,dx=0,dy=0):
    def cells(points):
        return {(p["day"],math.floor((p["x"]-dx)/size),math.floor((p["y"]-dy)/size)) for p in points}
    m,v = cells(modis),cells(viirs)
    common = len(m&v)
    return dict(m=len(m),v=len(v),common=common,integrated=len(m)+len(v)-common)

def logistic(q): return 1/(1+math.exp(-clamp(q,-35,35)))
def dot(a,b): return sum(x*y for x,y in zip(a,b))
def solve(matrix,vector):
    rows = [list(row)+[val] for row,val in zip(matrix,vector)]
    n = len(vector)
    for i in range(n):
        pivot = max(range(i,n),key=lambda j:abs(rows[j][i]))
        rows[i],rows[pivot] = rows[pivot],rows[i]
        divisor = rows[i][i]
        for col in range(i,n+1): rows[i][col] /= divisor
        for j in range(n):
            if j==i: continue
            factor = rows[j][i]
            for col in range(i,n+1): rows[j][col] -= factor*rows[i][col]
    return [row[n] for row in rows]

def features(row,sensor):
    angle = (int(row["month"][5:7])-1)*2*math.pi/12
    return [1,math.log1p(1000*row[sensor]/row["capacity"]),math.sin(angle),math.cos(angle)]

def fit_missing(rows,sensor):
    """Regresión binomial regularizada para el aporte faltante."""
    extras = sum(r["integrated"]-r[sensor] for r in rows)
    if not extras: return lambda r:r[sensor]
    available = sum(r["capacity"]-r[sensor] for r in rows)
    x = [features(r,sensor) for r in rows]
    beta = [math.log((extras+.5)/(available-extras+.5)),0,0,0]
    penalty = [.02,1,1,1]
    def objective(coefs):
        value = -sum(.5*p*c*c for p,c in zip(penalty,coefs))
        for r,a in zip(rows,x):
            eta = dot(a,coefs)
            log_sum = max(0,eta)+math.log1p(math.exp(-abs(eta)))
            value += (r["integrated"]-r[sensor])*eta-(r["capacity"]-r[sensor])*log_sum
        return value
    for _ in range(40):
        score = [-b*p for b,p in zip(beta,penalty)]
        info = [[penalty[i] if i==j else 0 for j in range(4)] for i in range(4)]
        for r,a in zip(rows,x):
            probability = logistic(dot(a,beta))
            trials = r["capacity"]-r[sensor]
            residual = r["integrated"]-r[sensor]-trials*probability
            weight = trials*probability*(1-probability)
            for i in range(4):
                score[i] += residual*a[i]
                for j in range(4): info[i][j] += weight*a[i]*a[j]
        step = solve(info,score)
        if max(map(abs,step))<1e-7: break
        before = objective(beta); fraction = 1
        while fraction>=1/1024:
            candidate = [b+s*fraction for b,s in zip(beta,step)]
            if objective(candidate)>=before:
                beta = candidate
                break
            fraction /= 2
        if fraction<1/1024: break
    return lambda r:clamp(r[sensor]+(r["capacity"]-r[sensor])*logistic(dot(features(r,sensor),beta)),r[sensor],r["capacity"])

def seasonal_baseline(rows,sensor):
    rates = [(r["month"][5:7],(r["integrated"]-r[sensor])/max(1,r["capacity"]-r[sensor])) for r in rows]
    fallback = quantile([v for m,v in rates],.5)
    def predict(row):
        rate = quantile([v for m,v in rates if m==row["month"][5:7]],.5)
        if rate is None: rate = fallback
        return row[sensor]+(row["capacity"]-row[sensor])*rate
    return predict

def validate(rows,sensor):
    grouped = defaultdict(list)
    for row in rows: grouped[season(row["month"])].append(row)
    residuals,base_residuals,cases = [],[],[]
    actual_sum = detected = intense = false_intense = 0
    for year,held in grouped.items():
        if len(held)!=12: continue
        train = [r for r in rows if season(r["month"])!=year]
        if not any(r["integrated"]>0 for r in train): continue
        predict,baseline = fit_missing(train,sensor),seasonal_baseline(train,sensor)
        threshold = quantile([r["integrated"] for r in train if r["integrated"]>0],.9)
        for row in held:
            fitted,expected = predict(row),row["integrated"]
            actual_sum += expected
            residuals.append(expected-fitted)
            base_residuals.append(expected-baseline(row))
            cases.append(dict(month=row["month"],observed=row[sensor],actual=expected,estimate=fitted))
            if expected>=threshold:
                intense += 1
                if fitted>=threshold: detected += 1
            elif fitted>=threshold: false_intense += 1
    predicted = detected+false_intense
    return dict(mae=mean(list(map(abs,residuals))),bias=-mean(residuals) if residuals else None,
                error=sum(map(abs,residuals))/actual_sum if actual_sum else None,
                baselineError=sum(map(abs,base_residuals))/actual_sum if actual_sum else None,
                rawError=(actual_sum-sum(c["observed"] for c in cases))/actual_sum if actual_sum else None,
                recall=detected/intense if intense else None,precision=detected/predicted if predicted else None,
                intense=intense,seasons=len({season(c["month"]) for c in cases}),cases=cases,residuals=residuals)

def calendar_rows(rows,overlap,modis,viirs):
    models = {s:(fit_missing(overlap,s),v["residuals"]) for s,v in (("m",modis),("v",viirs))}
    baselines = {m:quantile([r["integrated"] for r in overlap if int(r["month"][5:7])==m],.5) for m in range(1,13)}
    result = []
    for row in rows:
        out = dict(row)
        if row["hasM"] and row["hasV"]:
            out.update(value=row["integrated"],regime="MODIS + VIIRS",lo=None,hi=None)
        elif not row["hasM"] and not row["hasV"]:
            out.update(value=None,regime="Sin periodo de datos",lo=None,hi=None)
        else:
            sensor = "m" if row["hasM"] else "v"
            predict,residuals = models[sensor]; value = predict(row)
            lo,hi = quantile(residuals,.05),quantile(residuals,.95)
            out.update(value=value,regime="Estimado desde MODIS" if sensor=="m" else "Estimado desde VIIRS",
                       lo=None if lo is None else math.floor(clamp(value+min(lo,0),row[sensor],row["capacity"])),
                       hi=None if hi is None else math.ceil(clamp(value+max(hi,0),row[sensor],row["capacity"])))
        out["baseline"] = baselines[int(row["month"][5:7])]
        result.append(out)
    return result

def analyze(data,report=lambda value:None):
    """Entrada: dict(area=GeoJSON, modis=lista, viirs=lista, config=dict).
    Salida compatible con el motor JS: scales, months, errores y recommended.
    """
    config,modis,viirs = data["config"],data["modis"],data["viirs"]
    sizes = sorted(config["sizes"])
    if not sizes or any(not math.isfinite(k) or k<.1 or k>100 for k in sizes):
        raise ValueError("Tamaños permitidos: 0.1 a 100 km.")
    if not isinstance(config["iterations"],int) or not 10<=config["iterations"]<=1000:
        raise ValueError("Usa de 10 a 1000 iteraciones enteras.")
    for k in ("maxSpread","maxError","minRecall"):
        if not 0<=config[k]<=1: raise ValueError(f"{k} debe estar entre 0 y 1.")
    area = parse_area(data["area"]); polygons = project_area(area)
    tz = ZoneInfo(config["timezone"])
    cache = {}
    def local_day(stamp):
        if stamp not in cache:
            cache[stamp] = datetime.fromtimestamp(stamp/1000,timezone.utc).astimezone(tz).strftime("%Y-%m-%d")
        return cache[stamp]
    lm = range_for(modis,config.get("modis",{}),local_day,"MODIS")
    lv = range_for(viirs,config.get("viirs",{}),local_day,"VIIRS")
    mm = monthly_points(modis,lm,area,local_day); vm = monthly_points(viirs,lv,area,local_day)
    first,last = month_index(min(lm["start"],lv["start"])),month_index(max(lm["end"],lv["end"]))
    if last-first>1199: raise ValueError("Máximo 100 años.")
    locations = []
    for index in range(first,last+1):
        m = month_key(index)
        locations.append(dict(month=m,hasM=lm["start"]<=m<=lm["end"],hasV=lv["start"]<=m<=lv["end"],
                              modisPoints=mm.get(m,[]),viirsPoints=vm.get(m,[]),
                              days=monthrange(int(m[:4]),int(m[5:7]))[1]))
    overlap = [r for r in locations if r["hasM"] and r["hasV"]]
    if not any(r["modisPoints"] for r in overlap) or not any(r["viirsPoints"] for r in overlap):
        raise ValueError("Se requieren detecciones de ambos instrumentos en zona y meses compartidos.")
    scales = []
    for scale_index,km in enumerate(sizes):
        size = km*1000; cell_count = grid_capacity(polygons,size)
        rows = [dict(month=r["month"],hasM=r["hasM"],hasV=r["hasV"],capacity=r["days"]*cell_count,
                     **count_days_cells(r["modisPoints"],r["viirsPoints"],size)) for r in locations]
        both = [r for r in rows if r["hasM"] and r["hasV"]]
        if any(r["integrated"]>r["capacity"] for r in rows): raise ValueError("Capacidad de cuadrícula inconsistente.")
        active = [r for r in overlap if r["modisPoints"] or r["viirsPoints"]]
        runs = [[] for _ in active]
        random = random_generator(config["seed"])
        for i in range(config["iterations"]):
            dx,dy = next(random)*size,next(random)*size
            for values,row in zip(runs,active):
                values.append(count_days_cells(row["modisPoints"],row["viirsPoints"],size,dx,dy)["integrated"])
            if i%5==0: report(math.floor(100*(scale_index+i/config["iterations"])/len(sizes)))
        sensitivity = []
        for row,values in zip(active,runs):
            lo,hi,mid = quantile(values,.05),quantile(values,.95),quantile(values,.5)
            sensitivity.append(dict(month=row["month"],lo=lo,hi=hi,median=mid,spread=(hi-lo)/max(1,mid)))
        m,v = validate(both,"m"),validate(both,"v")
        spread = quantile([r["spread"] for r in sensitivity],.5)
        recall = min(m["recall"],v["recall"]) if m["recall"] is not None and v["recall"] is not None else None
        passes = (m["seasons"]>=2 and v["seasons"]>=2 and m["error"] is not None and v["error"] is not None
                  and recall is not None and spread is not None and spread<=config["maxSpread"]
                  and max(m["error"],v["error"])<=config["maxError"] and recall>=config["minRecall"]
                  and m["error"]<=min(m["baselineError"],m["rawError"])+1e-9
                  and v["error"]<=min(v["baselineError"],v["rawError"])+1e-9)
        by_month = {r["month"]:r for r in sensitivity}
        months = [dict(r,sensitivity=by_month.get(r["month"])) for r in calendar_rows(rows,both,m,v)]
        scales.append(dict(km=km,cellCount=cell_count,spread=spread,recall=recall,passes=passes,m=m,v=v,months=months))
    report(100)
    return dict(limitsM=lm,limitsV=lv,overlapMonths=len(overlap),inputCounts=[len(modis),len(viirs)],
                keptCounts=[sum(map(len,mm.values())),sum(map(len,vm.values()))],
                platforms=[sorted({p.get("satellite","") for p in ps if p.get("satellite")}) for ps in (modis,viirs)],
                config=config,scales=scales,recommended=next((s["km"] for s in scales if s["passes"]),None))

def export_calendar(result,path,km=None):
    """Exporta una escala como CSV; no redondea los valores calculados."""
    scale = next((s for s in result["scales"] if s["km"]==km),None) if km is not None else result["scales"][0]
    if scale is None: raise ValueError("Escala no encontrada.")
    fields = ["mes","lado_km","dias_celda","procedencia","modis","viirs","coincidencias","rango_lo","rango_hi"]
    with Path(path).open("w",newline="",encoding="utf-8-sig") as f:
        writer = csv.writer(f); writer.writerow(fields)
        for r in scale["months"]:
            writer.writerow([r["month"],scale["km"],r["value"],r["regime"],
                             r["m"] if r["hasM"] else None,r["v"] if r["hasV"] else None,
                             r["common"] if r["hasM"] and r["hasV"] else None,r["lo"],r["hi"]])
