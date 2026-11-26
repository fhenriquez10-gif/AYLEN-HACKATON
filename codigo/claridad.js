/* Explanatory text only; no data or calculation changes. */
(()=>{
'use strict';
const help=document.createElement('dialog');help.id='map-reading-dialog';help.setAttribute('aria-labelledby','map-reading-title');
help.innerHTML='<div class="dialog-head"><h2 id="map-reading-title">Cómo leer el mapa</h2><button id="map-reading-close" type="button">Cerrar ✕</button></div><p class="reading-content">Un punto representa una detección térmica satelital, no un incendio confirmado. Una celda agrupa detecciones dentro de una cuadrícula. Un día-celda cuenta una celda con al menos una detección en una fecha local; varias detecciones en esa misma celda y día cuentan una sola vez. Estos datos no representan superficie quemada.</p><p class="reading-content">En Avanzado se utiliza una cuadrícula fija de 2 km. Es una escala de análisis, no un tamaño óptimo universal. La evaluación de escalas depende del período, la zona, los sensores, los filtros y los criterios elegidos.</p>';
document.body.append(help);
const button=document.createElement('button');button.id='map-reading-open';button.type='button';button.textContent='Cómo leer el mapa';button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls',help.id);document.querySelector('.map-label').append(button);
button.onclick=()=>help.showModal();document.getElementById('map-reading-close').onclick=()=>help.close();
const warning=document.createElement('p');warning.id='date-warning';warning.textContent='El fondo satelital es un mosaico de imágenes de distintas fechas. No corresponde necesariamente al día seleccionado.';document.getElementById('timeline').append(warning);
const catalog=document.createElement('p');catalog.id='catalog-public-notice';catalog.className='notice';catalog.textContent="Catálogo del CSV aportado con fuentes por registro: 371 entradas citan CONAF y 7 citan otras fuentes. Sin coordenadas se encuadra solo la comuna; no se inventan puntos, celdas ni perímetros. Las cifras preliminares se identifican como tales.";document.querySelector('#history-explorer>.selection-heading').after(catalog);
})();
