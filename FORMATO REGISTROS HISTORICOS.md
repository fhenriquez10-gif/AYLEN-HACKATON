# Importar registros históricos del equipo
El visor no contiene incendios históricos ni atribuye detecciones a un incendio.

Tu compañero puede preparar una FeatureCollection GeoJSON con geometrías Point, Polygon o MultiPolygon en longitud/latitud WGS84 (EPSG:4326). Propiedades recomendadas:
- nombre: denominación del registro.
- fecha_inicio y fecha_fin: YYYY-MM-DD.
- fuente: institución, documento o enlace que respalda el registro.
- identificador: código estable, si existe.
- observaciones: límites o incertidumbre del dato.

Si solo hay punto de inicio, se dibuja como referencia y no como superficie quemada. Si hay perímetro, debe corresponder a la fecha y fuente que se declaran. No dibujar como perímetro una celda del análisis.
La plantilla incluida tiene features vacío: no representa un incendio.
La capa se carga con Importar capa preparada por el equipo, se valida y se mantiene en memoria. Quitar capa la elimina de la vista; no borra el archivo original.
El filtro temporal usa los meses seleccionados y, si se elige un día del mes, ese día en cada mes seleccionado. Un registro sin fechas se muestra como no fechado. La capa conserva su geografía al cambiar comuna: el encuadre cambia, pero no se reasignan detecciones.
El nombre de la fuente no se verifica automáticamente; el equipo debe conservar el documento de respaldo. Los detalles de cada registro se pueden consultar en el listado que acompaña la capa.
