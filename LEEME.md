# AYLEN v9 · Fondo satelital sin cuenta

Abre AYLEN-v9.html. Es autónomo: incluye el código, las bibliotecas y los datos. Para modificarlo, usa index.html y codigo/; reconstruye con python codigo/construir_html.py. Comparte el ZIP completo para entregar también el código fuente.

El fondo principal es EOxCloudless 2016 (Sentinel-2), de 10 m, con imágenes de 2016 y 2017. No representa la fecha de las detecciones. No iguala el detalle de Esri y no se usa para calcular focos o resultados. No requiere cuenta, tarjeta ni clave. Requiere internet; el servicio público está sujeto a uso razonable, límites de tráfico y disponibilidad del proveedor. No se descargan ni incluyen mosaicos en el paquete.

Licencia del mosaico 2016: CC BY 4.0. Mantener visibles los créditos del mapa y en capturas/presentaciones:
EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016 & 2017).

Fuentes oficiales:
- https://cloudless.eox.at/license-non-commercial
- https://cloudless.eox.at/documentation/faq
- https://cloudless.eox.at/documentation/usage
- https://tiles.maps.eox.at/wmts/1.0.0/WMTSCapabilities.xml
- https://creativecommons.org/licenses/by/4.0/

Tipo de mapa permite EOX satélite, EOX con referencia OSM servida por NASA, relieve NASA y vista local. Si falla internet, los límites, puntos y celdas incorporados siguen disponibles: selecciona Local sin conexión. Los créditos de Leaflet, ECharts, NASA y OSM se conservan.

No cambian el motor científico, los filtros, las celdas, la evaluación, los datos, la línea temporal ni las exportaciones. Los CSV/GeoJSON exportan datos de AYLEN, no imágenes EOX. Las versiones anteriores se conservan por separado.

---

# AYLEN v9 · UFRO Makers
Versión de entrega: 15 de noviembre de 2026.

## Abrir y compartir
1. Extrae el ZIP completo antes de abrir la aplicación.
2. Abre index.html para la presentación general. Conserva las carpetas codigo/, datos/ y vendor/ junto al archivo.
3. Para usar CSV propios o evaluar escalas, abre index.html?interno=1: añade ?interno=1 al final de la dirección del navegador y presiona Enter.
4. AYLEN-v9.html es ahora una copia autónoma ACTUALIZADA de esta misma v6. Incluye los datos, bibliotecas, idioma, ayudas y adaptación a celulares. Puedes compartir únicamente ese HTML para ejecutar la aplicación. También admite ?interno=1.
5. Para modificar el proyecto, comparte el ZIP completo; el HTML autónomo por sí solo no sustituye las fuentes editables.

El fondo satelital, el relieve y la cartografía de referencia necesitan internet; los datos están incluidos. Sin conexión se puede elegir el mapa local. Las imágenes de fondo son mosaicos de distintas fechas y no necesariamente corresponden a la fecha de las detecciones.

Si el navegador impide alguna función al abrir archivos locales, puedes usar el servidor opcional: con Node.js instalado, ejecuta INICIAR_SERVIDOR.cmd y abre http://127.0.0.1:4180/index.html. La entrada interna es http://127.0.0.1:4180/index.html?interno=1. Mantén abierta la ventana del servidor mientras lo uses. No necesitas servidor para la presentación habitual si tu navegador permite abrir los archivos locales.

## Uso del mapa
- Filtros: elige año, mes, día, comuna, tamaño de celda, sensores, confianza y tipo.
- Un punto rojo es una detección térmica satelital, no un incendio confirmado. Al seleccionarlo se muestra su sensor y coordenadas; su celda se resalta y su información aparece al costado. En celular la información se presenta como ficha.
- Las celdas integran las detecciones de las plataformas habilitadas. Su color puede representar FRP máximo observado, días-celda o cantidad de detecciones. Ninguna de esas medidas equivale a superficie quemada.
- La barra temporal permite recorrer registros por día, mes o año, y reproducir o pausar. No simula propagación del fuego.
- El logo vuelve al mapa principal con Filtros activo.
- Español/English está a la derecha de Descargas en escritorio. En celular está dentro de Más.
- Cómo leer el mapa explica puntos, celdas y días-celda.
- En teléfonos los paneles, la leyenda y la barra temporal pueden desplegarse; para estudiar gráficos detallados se recomienda una pantalla más grande.

## Avanzado y elección de escala
Avanzado utiliza una cuadrícula fija de 2 km y sus propios filtros: MODIS y VIIRS S-NPP, vegetación y calidad nominal/alta. NOAA-20 / JPSS-1 se conserva en el mapa, pero no se añade a esa referencia histórica. Sus valores pueden diferir de los conteos del mapa.

Los períodos anteriores y posteriores a VIIRS se comparan con sus propias referencias; no se presentan como una sola serie calibrada entre ambas épocas. La vista permite explorar anomalías, fichas mensuales, temporada/período crítico y patrones del territorio.

Los 2 km son una escala de análisis, no un óptimo universal. Para justificar una escala, utiliza la entrada interna y conserva el resultado de Evaluación, indicando zona, período, plataformas, filtros, tamaños, posiciones Monte Carlo, semilla y criterios. Una configuración que aprobó con un sensor o período no queda validada automáticamente para otros.

Como antecedente, en la revisión de v5 una prueba exploratoria de 2 km para enero de 2019–noviembre de 2025, tres plataformas y 10 posiciones dio 28 % de error MODIS, mayor que el umbral de 25 %. Esto no define una nueva escala óptima. v6 conserva las fórmulas, los umbrales configurables y los datos; no altera resultados para forzar una aprobación.

## Datos y evaluación internos
La entrada ?interno=1 muestra Datos y Evaluación; en celular están dentro de Más.
- Datos permite importar CSV FIRMS seleccionando la plataforma correcta. Al empezar una sesión propia se sustituye temporalmente el conjunto incorporado; se pueden añadir archivos de otras plataformas.
- CSV vacíos o lotes sin registros regionales válidos se rechazan conservando la sesión anterior.
- Evaluación permite elegir fechas, tamaños, posiciones, semilla y umbrales, ejecutar, cancelar y descargar el análisis JSON.
- Los meses completos declarados deben ser revisados por el equipo. La presencia de un archivo no demuestra cobertura útil ni integridad mensual.
- Las importaciones se mantienen solo durante la sesión; al recargar vuelven los datos incorporados. Descarga lo que necesites conservar.
El parámetro interno solo cambia la interfaz; no es una contraseña ni un sistema de control de acceso.

## Grandes Incendios y GeoJSON
Grandes Incendios usa el CSV aportado con referencias CONAF y otras fuentes identificadas por fila. Consulte CAMBIOS-v9.md para el tratamiento de los datos faltantes.

Puedes filtrar por comuna/año/tipo, seleccionar un registro para centrarlo y consultar su ficha, y volver con el logo. Sus puntos son ubicaciones representativas y las cajas son límites de coordenadas: no son perímetros ni área quemada. El recorrido de catálogo se activa en Contenido de la barra temporal.

Catálogo completo e importación permite superponer GeoJSON adicional. Se admiten FeatureCollection con Point, Polygon o MultiPolygon en WGS84. Consulta FORMATO REGISTROS HISTORICOS.md. La importación no atribuye automáticamente las detecciones a un incendio.

## Descargas
1. Abre Descargas y elige focos CSV, celdas GeoJSON o Grandes Incendios CSV.
2. Elige fechas inclusivas y comuna. Estos filtros de descarga no cambian el mapa.
3. Para focos/celdas se aplican los sensores, confianza y tipo seleccionados. Si consultas un incendio puedes conservar su caja, pero los puntos son candidatos, no una atribución confirmada.
4. Revisa el conteo y la muestra antes de descargar. El CSV recomendado conserva las 29 columnas del formato focos-firms del atlas del equipo; también se conserva el CSV técnico de 19 columnas.
5. Descarga la explicación de columnas si vas a compartir el CSV.

fecha_local y hora_local son America/Santiago; adquisicion_utc y acq_date/acq_time son UTC. Coordenadas: WGS84; FRP: MW; temperaturas de brillo: kelvin; scan/track: km. pasada e id_pasada quedan vacías sin cruce CMR. No se inventan URLs de origen; fuente conserva el archivo conocido. Las versiones son las declaradas por archivo, no una certificación por fila. Nombres de campos, identificadores y datos originales no se traducen.

## Editar y reconstruir
Modifica index.html y codigo/. Los datos preparados están en datos/ y las bibliotecas con sus licencias en vendor/. Tras editar, ejecuta desde la carpeta del proyecto:

python codigo/construir_html.py

El constructor recorre los scripts y estilos referenciados por index.html en su orden e incorpora todos los meses, generando AYLEN-v9.html. Usa Python 3.10 o posterior. La ejecución web no necesita Python. Los otros scripts Python de preparación requieren los CSV de origen y su configuración; no es necesario ejecutarlos para abrir esta entrega.

## Fondos gratuitos y créditos de v8
- Satélite · EOX 2016: Sentinel-2 Cloudless de 10 m, sin cuenta ni clave, CC BY 4.0.
- Relieve · NASA: BlueMarble_ShadedRelief_Bathymetry, servido por NASA GIBS.
- Referencia · EOX/OSM: EOX 2016 más Reference_Features de GIBS, con datos OpenStreetMap. Los nombres comunales propios de AYLEN se conservan.
- Local sin conexión: límites y detecciones incorporados, sin fondo remoto.

No se consulta ningún fondo Esri. Estas capas públicas no requieren una cuenta ArcGIS ni clave de pago. EOX 2016 contiene imágenes de 2016–2017 y no alcanza el detalle de Esri. El relieve NASA conserva Blue Marble. Esto no altera las coordenadas, la cuadrícula o la precisión de las detecciones.

No se descargan mosaicos para redistribuirlos ni se hacen descargas masivas: el navegador solicita las imágenes que muestra. Los CSV y GeoJSON exportan datos y celdas, no imágenes del fondo. Los créditos visibles deben conservarse en presentaciones y capturas. Las licencias completas de Leaflet y ECharts están incorporadas en Créditos y licencias, incluso al compartir solo el HTML.

Consulta LICENCIAS-Y-FUENTES.md para las condiciones y referencias oficiales.

## Qué cambió en v8
- Fondo principal EOX 2016 sin cuenta, referencia EOX/OSM y relieve alternativo NASA GIBS.
- Créditos visibles y diálogo bilingüe con licencias completas, incorporado al HTML autónomo.
- Zoom limitado a la disponibilidad nativa del fondo al pedir mosaicos; el acercamiento adicional amplía las imágenes sin pedir niveles inexistentes.
- Título, documentación y archivo principal identificados como AYLEN v9.
- Datos, motor científico, tamaños, filtros y fórmulas conservados respecto de v6. La copia anterior permanece intacta.
