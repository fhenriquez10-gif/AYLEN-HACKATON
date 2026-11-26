"""Integra el CSV aportado, conserva vacíos y no genera ubicaciones ni perímetros."""
import csv,json,hashlib,unicodedata,math
from pathlib import Path
from collections import Counter
BASE=Path(__file__).resolve().parent.parent
src=BASE/'datos/incendios_magnitud_la_araucania_2000_2025.csv'
raw=src.read_bytes();reader=csv.DictReader(raw.decode('utf-8-sig').splitlines());columns=reader.fieldnames;rows=list(reader)
def plain(s):return ''.join(c for c in unicodedata.normalize('NFD',s.lower()) if unicodedata.category(c)!='Mn').replace(' ','')
area=json.loads((BASE/'datos/la-araucania.geojson').read_text(encoding='utf-8-sig'))
zones={plain(f['properties']['nomcom']):f['properties']['codcom'] for f in area['features']}
records=[];seen=set()
for i,row in enumerate(rows,2):
 assert row['id'] not in seen;seen.add(row['id'])
 r=dict(row,original=dict(row),source_row=i)
 for k in ['lat','lon','duracion_dias','superficie_total_ha','plantaciones_ha','vegetacion_natural_ha','agricola_ha','desechos_ha']:
  r[k]=float(row[k]) if row[k] else None
  assert r[k] is None or math.isfinite(r[k])
 if r['lat'] is not None or r['lon'] is not None:
  assert r['lat'] is not None and r['lon'] is not None and -90<=r['lat']<=90 and -180<=r['lon']<=180
 r.update(fecha_inicio=row['fecha_inicio'].split(' ')[0],fecha_fin=row['fecha_termino'].split(' ')[0],comuna_principal=row['comuna'],comunas_afectadas=row['comuna'],comuna_codes=[zones[plain(row['comuna'])]],principal_code=zones[plain(row['comuna'])],categoria=row['tipo_cifra'],id_evento_dato_c=row['id'],advertencias=[],lat_min=None,lat_max=None,lon_min=None,lon_max=None)
 if r['lat'] is None:r['advertencias'].append('Sin latitud/longitud: no se dibuja un punto ni se asigna una celda al incendio.')
 if not r['fecha_fin']:r['advertencias'].append('Término sin dato: no se supone que el incendio continúe activo.')
 if not r['fecha_inicio']:r['advertencias'].append('Inicio sin dato: excluido de la reproducción temporal y de filtros por fecha exacta.')
 elif len(r['fecha_inicio'])==7:r['advertencias'].append('Inicio conocido solo por mes: la consulta temporal abarca ese mes, sin inventar el día.')
 records.append(r)
meta=dict(archivo=src.name,columnas=columns,sha256=hashlib.sha256(raw).hexdigest(),fecha_integracion='2026-11-15',registros=len(records),con_coordenadas=sum(r['lat'] is not None for r in records),sin_coordenadas=sum(r['lat'] is None for r in records),tipos_cifra=dict(Counter(r['tipo_cifra'] for r in records)),url='https://www.conaf.cl/centro-documental/ocurrencia-y-dano-de-incendios-de-magnitud-1985-2023/',alcance='CSV aportado por el equipo: 371 registros citan el archivo de CONAF; 7 registros de 2025 citan otras fuentes. Se conserva la procedencia y el tipo de cifra por fila. No se inventan datos ausentes ni se certifica la transcripción del CSV contra todas las hojas originales.')
(BASE/'datos/eventos.js').write_text('window.NASA_EVENTS='+json.dumps(dict(meta=meta,records=records),ensure_ascii=False,separators=(',',':'))+';',encoding='utf-8')
(BASE/'datos/auditoria-eventos.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf-8')
features=[dict(type='Feature',geometry=dict(type='Point',coordinates=[r['lon'],r['lat']]) if r['lat'] is not None else None,properties=r['original']) for r in records]
(BASE/'datos/catalogo-conaf.geojson').write_text(json.dumps(dict(type='FeatureCollection',features=features),ensure_ascii=False),encoding='utf-8')
print(json.dumps(meta,ensure_ascii=False))
