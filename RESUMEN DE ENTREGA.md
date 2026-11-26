# AYLEN v9

Abre AYLEN-v9.html. El título de la pestaña es AYLEN · UFRO Makers.

Cambios solicitados: reemplazo completo del catálogo generado por IA por el CSV incendios_magnitud_la_araucania_2000_2025.csv y cambio del título de la pestaña. Se conservan los nombres, fechas, superficies, fuentes y tipos de cifra del archivo aportado. No se cambiaron motor, datos MODIS/VIIRS, fondo, diseño ni controles ajenos al catálogo.

El archivo tiene 378 registros: 371 citan el archivo de CONAF y 7 fuentes complementarias de 2025. Cada ficha muestra su fuente. Hay 233 registros con coordenadas y 145 sin ellas. Sin coordenadas se muestra la comuna y la ficha, sin inventar un punto o celda. Se conserva la referencia geográfica CONAF como texto; no se decodifica suponiendo un sistema desconocido. Las fechas faltantes no se completan. Si solo se conoce el mes, la consulta temporal abarca ese mes; no implica duración. Los registros sin fecha inicial permanecen en el listado y ficha, pero se excluyen del recorrido temporal y descargas filtradas por fecha.

El contexto satelital de un registro geolocalizado se consulta en su celda; si no hay coordenadas, en su comuna. No es atribución confirmada de detecciones ni perímetro. La tabla histórica exporta las columnas originales del CSV; el GeoJSON conserva geometría nula si falta ubicación. El catálogo generado por IA y su ejemplo exportado se retiraron de esta versión, sin modificar versiones anteriores.

Fuente CONAF: https://www.conaf.cl/centro-documental/ocurrencia-y-dano-de-incendios-de-magnitud-1985-2023/
La página confirma la publicación de 1985–2024. Las filas de 2025 no se atribuyen a esa publicación: conservan sus fuentes propias. Esta integración no certifica cada transcripción contra el Excel original.
