/* Responsive interface layer; no filtering, data or scientific calculations. */
(()=>{
'use strict';
const $=id=>document.getElementById(id),mobile=matchMedia('(max-width:600px)'),body=document.body,nav=document.querySelector('.topbar');
body.classList.toggle('internal-tools',new URLSearchParams(location.search).get('interno')==='1');
const menu=document.createElement('div');menu.id='mobile-actions';menu.hidden=true;
const toggle=document.createElement('button');toggle.id='mobile-menu-toggle';toggle.type='button';toggle.textContent='Más';toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls',menu.id);nav.append(toggle,menu);
const actions=[$('ver-avanzado'),nav.querySelector('[data-tool="history"]'),$('right-toggle'),$('open-downloads'),$('aylen-language-control'),...nav.querySelectorAll('[data-tool="data"],[data-tool="science"]')];
const homes=actions.map(el=>{const mark=document.createComment('desktop action');el.before(mark);return mark;});
let timeWasClosed=false,closing=false;
function resize(){window.HL_MAP?.invalidateSize();}
function closeMenu(focus=false){menu.hidden=true;toggle.setAttribute('aria-expanded','false');if(focus)toggle.focus();}
toggle.onclick=()=>{const open=menu.hidden;menu.hidden=!open;toggle.setAttribute('aria-expanded',String(open));};
menu.addEventListener('click',e=>{if(e.target.closest('button'))closeMenu(true);});
menu.addEventListener('change',()=>closeMenu(true));
nav.addEventListener('keydown',e=>{if(e.key==='Escape'&&!menu.hidden){e.preventDefault();closeMenu(true);}});
new ResizeObserver(()=>{body.style.setProperty('--nav-height',nav.getBoundingClientRect().height+'px');resize();}).observe(nav);
function closePanels(except){
 if(closing)return;closing=true;
 if(except!=='history'&&body.classList.contains('history-open')){
  // Preserve the newly selected record's sheet; ordinary panel switches use
  // the existing close action to restore the prior map state.
  if(except!=='selection')$('close-history').click();
  body.classList.remove('history-open');
 }
 if(except!=='filters')body.classList.add('left-closed');
 if(except!=='summary'&&except!=='selection')body.classList.add('right-closed');
 if(except!=='downloads'&&$('download-dialog').open)$('download-dialog').close();
 closing=false;resize();
}
function closeButton(panel,id,fn){const b=document.createElement('button');b.id=id;b.type='button';b.className='mobile-panel-close';b.textContent='Cerrar ✕';b.onclick=fn;panel.prepend(b);}
closeButton($('left-panel'),'close-mobile-filters',()=>{body.classList.add('left-closed');$('left-toggle').focus();resize();});
closeButton($('right-panel'),'close-mobile-summary',()=>{body.classList.add('right-closed');resize();});
// Run before existing interface handlers; retain their toggle and restoration behavior.
document.addEventListener('click',e=>{
 if(!mobile.matches||closing)return;
 const target=e.target.closest('button');if(!target)return;
 if(target===$('left-toggle'))closePanels('filters');
 else if(target===$('right-toggle')){closePanels('summary');$('selection-card').hidden=true;$('right-panel').classList.remove('mobile-selection');}
 else if(target.dataset.tool==='history')closePanels('history');
 else if(target===$('open-downloads')||target===$('export-points')||target===$('export-cells'))closePanels('downloads');
 else if(target===$('ver-avanzado')||target===$('ver-mapa')||['data','science'].includes(target.dataset.tool))closePanels();
 if(target.id==='close-selection'){body.classList.add('right-closed');resize();}
},true);
const card=$('selection-card');
// Present the existing point popup in the mobile sheet, alongside its cell.
// Clone presentation only; the existing controller remains the data source.
function syncPointDetails(){
 if(!mobile.matches||card.hidden)return;
 const content=document.querySelector('.point-popup .leaflet-popup-content');
 let details=$('mobile-point-details');
 if(content){if(!details){details=document.createElement('div');details.id='mobile-point-details';card.querySelector('.selection-heading').after(details);}details.innerHTML=content.innerHTML;}
}
window.HL_MAP?.on('popupopen',syncPointDetails);
window.HL_MAP?.on('popupclose',()=>{$('mobile-point-details')?.remove();});
new MutationObserver(()=>{
 const selected=!card.hidden;
 $('right-panel').classList.toggle('mobile-selection',mobile.matches&&selected);
 if(mobile.matches&&selected&&!body.classList.contains('right-closed'))closePanels('selection');
}).observe(card,{attributes:true,attributeFilter:['hidden'],childList:true});
const dialog=$('download-dialog');
new MutationObserver(()=>{
 if(mobile.matches&&dialog.open){closePanels('downloads');if(dialog.matches(':modal')){dialog.close();dialog.show();}}
}).observe(dialog,{attributes:true,attributeFilter:['open']});
const legend=document.querySelector('.legend'),legendToggle=document.createElement('button');legendToggle.id='legend-toggle';legendToggle.type='button';legendToggle.textContent='Leyenda';legendToggle.setAttribute('aria-expanded','false');legend.prepend(legendToggle);legend.classList.add('mobile-folded');
legendToggle.onclick=()=>{const folded=legend.classList.toggle('mobile-folded');legendToggle.setAttribute('aria-expanded',String(!folded));};
// Keep color swatches and their label together as the legend wraps.
function wrapLegend(){const el=$('cell-legend');if(!el||el.querySelector('.legend-category'))return;for(const swatch of [...el.querySelectorAll('i')]){const span=document.createElement('span');span.className='legend-category';swatch.before(span);const label=swatch.nextSibling;span.append(swatch);if(label?.nodeType===Node.TEXT_NODE)span.append(label);}}
new MutationObserver(wrapLegend).observe($('cell-legend'),{childList:true});wrapLegend();
function adapt(){
 closeMenu();
 if(mobile.matches){actions.forEach(el=>menu.append(el));timeWasClosed=body.classList.contains('time-closed');body.classList.add('time-closed');closePanels(card.hidden?undefined:'selection');}
 else{actions.forEach((el,i)=>homes[i].after(el));body.classList.toggle('time-closed',timeWasClosed);if(dialog.open&&!dialog.matches(':modal')){dialog.close();dialog.showModal();}}
 $('right-panel').classList.toggle('mobile-selection',mobile.matches&&!card.hidden);syncPointDetails();resize();
}
mobile.addEventListener('change',adapt);adapt();
})();
