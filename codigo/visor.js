/* Aplicación NASA histórica. Carga mensual local, mapa y evaluación del motor original. */
(function(){
'use strict';
const C=window.NASA_CATALOG,M=C.manifest,$=id=>document.getElementById(id),fmt=new Intl.NumberFormat('es-CL');
const project=NASA_MODEL.projector(),platforms=['MODIS','SNPP','JPSS1'],colors={MODIS:'#ff9c56',SNPP:'#5ecdf4',JPSS1:'#df96fc'};
const sourceMonths=Object.fromEntries(platforms.map(p=>[p,new Set(M.archivos.filter(f=>f.plataforma===p).flatMap(f=>Object.keys(f.meses_archivo)))]));
const names=Object.fromEntries(C.shapes.map(s=>[s.code,s.name]));
const monthCache=new Map(),projectCache=new WeakMap();
let analysisSerial=0;
let chosen=[],cells=new Map(),loadToken=0,busy=false,worker=null,analysisResult=null,historical=[],periodMonths=[],view={cx:0,cy:0,w:1,h:1},drawTransform=null;
const canvas=$('map'),ctx=canvas.getContext('2d');
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function selectedPlatforms(){return platforms.filter(p=>$(p).checked);}
function qualityFilter(){
 const confidence=$('confidence').value,type=$('type').value;
 return r=>{
 if(confidence!=='all'){
 const accepted=r[3]==='MODIS'?(Number(r[5])>=(confidence==='high'?80:30)&&r[5]!==''):(confidence==='high'?r[5]==='h':['n','h'].includes(r[5]));
 if(!accepted)return false;
 }
 if(type!=='all'&&(type==='unknown'?r[6]!=='':String(r[6])!==type))return false;
 return true;
 };
}
function quality(r){return qualityFilter()(r);}
function selectionMonths(){
 if(candidateMode)return rangeMonths(candidateMode.fecha_inicio.slice(0,7),candidateMode.fecha_fin.slice(0,7));
 const years=$('year').value==='all'?[...new Set(M.meses.map(m=>m.slice(0,4)))].sort():[$('year').value];
 const months=$('month').value==='all'?Array.from({length:12},(_,i)=>String(i+1).padStart(2,'0')):[$('month').value];
 return years.flatMap(y=>months.map(m=>y+'-'+m));
}
function loadMonth(month){
 if(!M.meses.includes(month))return Promise.resolve([]);
 if(monthCache.has(month))return monthCache.get(month);
 const promise=new Promise((resolve,reject)=>{
 if(Object.hasOwn(window.NASA_DATA,month)){resolve(window.NASA_DATA[month]);return;}
 const script=document.createElement('script');script.src='datos/'+month+'.js';
 script.onload=()=>{script.remove();if(Object.hasOwn(window.NASA_DATA,month))resolve(window.NASA_DATA[month]);else reject(Error('Archivo mensual sin datos legibles: '+month));};
 script.onerror=()=>{script.remove();reject(Error('No se pudo abrir datos/'+month+'.js. Extrae el ZIP completo y conserva sus carpetas.'));};
 document.head.append(script);
 });
 monthCache.set(month,promise);promise.catch(()=>monthCache.delete(month));return promise;
}
function xy(r){if(!projectCache.has(r))projectCache.set(r,project(r[0],r[1]));return projectCache.get(r);}
function currentShape(){return $('zone').value==='all'?C.shapes:C.shapes.filter(s=>s.code===$('zone').value);}
function fit(){
 if(geoMap){const coords=currentShape().flatMap(s=>s.polygons.flatMap(p=>p.flatMap(r=>r.map(c=>inverseProject(...c)))));geoMap.fitBounds(coords.map(c=>[c[1],c[0]]));return;}
 let w=Infinity,s=Infinity,e=-Infinity,n=-Infinity;
 for(const shape of currentShape())for(const poly of shape.polygons)for(const ring of poly)for(const [x,y]of ring){w=Math.min(w,x);s=Math.min(s,y);e=Math.max(e,x);n=Math.max(n,y);}
 view={cx:(w+e)/2,cy:(s+n)/2,w:(e-w)*1.14,h:(n-s)*1.14};draw();
}
function invalidateAnalysis(){
 analysisSerial++;
 if(worker){worker.terminate();worker=null;$('cancel').disabled=true;$('evaluate').disabled=false;}
 if(analysisResult){$('analysis-status').textContent='Cambiaste la selección o configuración. La evaluación anterior quedó desactualizada; vuelve a calcular.';}else{$('analysis-status').textContent='Configuración actualizada. Pulsa Evaluar escalas para comprobarla.';}
 analysisResult=null;$('evaluation').replaceChildren();$('export-analysis').disabled=true;
}
function reportAvailability(months,ps){
 if(!ps.length){$('availability').textContent='Selecciona al menos una plataforma.';return;}
 const descriptions=ps.map(p=>{const missing=months.filter(m=>!sourceMonths[p].has(m));return p+': archivo con registros en '+(months.length-missing.length)+' de '+months.length+' meses'+(missing.length?' · sin archivo para '+missing.slice(0,3).join(', ')+(missing.length>3?' y otros':''):'');});
 $('availability').textContent=descriptions.join(' | ')+'. Presencia de archivo no acredita integridad mensual ni observación útil.';
}
// Keep the date control valid, including Gregorian leap years. For aggregate
// years/months, offer days that exist in at least one selected period.
function updateDayOptions(){
 const previous=$('day').value||'all',month=$('month').value;
 const years=$('year').value==='all'?[...$('year').options].map(o=>o.value).filter(y=>y!=='all'):[$('year').value];
 const last=month==='all'?31:Math.max(...years.map(y=>new Date(Number(y),Number(month),0).getDate()));
 const all=$('day').querySelector('option[value="all"]').cloneNode(true);
 $('day').replaceChildren(all);
 for(let i=1;i<=last;i++){const o=document.createElement('option');o.value=String(i).padStart(2,'0');o.textContent=i;$('day').append(o);}
 $('day').value=previous==='all'?'all':String(Math.min(Number(previous),last)).padStart(2,'0');
}
async function refresh(){
 updateDayOptions();
 selectedSpatialKey=null;selectedDetection=null;selectedHistoricalCell=null;if($('selection-card')){$('selection-card').replaceChildren();$('selection-card').hidden=true;}if(geoMap)geoMap.closePopup();
 const token=++loadToken,months=selectionMonths(),ps=selectedPlatforms();periodMonths=months;busy=true;
 $('export-points').disabled=true;$('export-cells').disabled=true;
 $('status').textContent='Cargando '+months.length+' períodos locales…';reportAvailability(months,ps);
 try{
 const records=(await Promise.all(months.map(loadMonth))).flat();if(token!==loadToken)return;
 const set=new Set(ps),zone=$('zone').value,day=$('day').value;
 let zoneBeforeQuality=0;const q=qualityFilter();
 chosen=records.filter(r=>{
 if(!set.has(r[3])||(zone!=='all'&&r[4]!==zone)||(day!=='all'&&r[14].slice(-2)!==day))return false;
 if(candidateMode&&(r[14]<candidateMode.fecha_inicio||r[14]>candidateMode.fecha_fin||r[0]<candidateMode.lon_min||r[0]>candidateMode.lon_max||r[1]<candidateMode.lat_min||r[1]>candidateMode.lat_max))return false;
 if(candidateMode?.cell_size){const [x,y]=xy(r);if(Math.floor(x/candidateMode.cell_size)!==candidateMode.cell_col||Math.floor(y/candidateMode.cell_size)!==candidateMode.cell_row)return false;}
 zoneBeforeQuality++;return q(r);
 });
 if(token!==loadToken)return;
 makeCells();
 $('status').textContent=fmt.format(chosen.length)+' detecciones después de filtros; '+fmt.format(zoneBeforeQuality-chosen.length)+' descartadas por confianza/tipo. '+(chosen.length===0?'No hay puntos en esta selección; revisa la disponibilidad de archivos.':'');
 $('export-points').disabled=false;$('export-cells').disabled=false;
 $('detail').textContent='Selección actual: '+months[0]+' a '+months.at(-1)+'. Haz clic en un punto o una celda.';
 const anyFile=months.some(m=>ps.some(p=>sourceMonths[p].has(m)));
 if(!ps.length){
 $('export-points').disabled=true;$('export-cells').disabled=true;
 $('n-detections').textContent='—';$('n-union').textContent='—';$('n-common').textContent='—';
 $('formula').textContent='No hay sensores seleccionados.';
 $('status').textContent='No hay sensores seleccionados. Selecciona al menos una plataforma.';
 }else if(!anyFile){
 $('export-points').disabled=true;$('export-cells').disabled=true;
 $('n-detections').textContent='Sin archivo';$('n-union').textContent='Sin datos';$('n-common').textContent='Sin datos';
 $('formula').textContent='No hay archivos de las plataformas elegidas para este período. No se interpreta como cero actividad.';
 $('status').textContent='Sin archivo disponible para esta selección; no se puede conocer la actividad.';
 }else{
 const unknown=months.filter(m=>!ps.some(p=>sourceMonths[p].has(m)));
 if(unknown.length)$('status').textContent+=' '+unknown.length+' meses sin archivo de ninguna plataforma seleccionada; los conteos cubren solo registros disponibles.';
 }
 summarize();updateCatalog();extraStats();draw();
 }catch(error){if(token!==loadToken)return;chosen=[];cells.clear();$('status').textContent=error.message;draw();}
 finally{if(token===loadToken)busy=false;}
}
function makeCells(){
 selectedSpatialKey=null;selectedDetection=null;if(geoMap)geoMap.closePopup();
 const size=Number($('size').value)*1000;cells=new Map();
 for(const r of chosen){const [x,y]=xy(r),col=Math.floor(x/size),row=Math.floor(y/size),key=col+'/'+row;
 if(!cells.has(key))cells.set(key,{col,row,recs:[],m:new Set(),v:new Set(),points:0,maxFRP:null,platformCounts:{MODIS:0,SNPP:0,JPSS1:0}});
 const c=cells.get(key);c.recs.push(r);c[r[3]==='MODIS'?'m':'v'].add(r[14]);c.points++;c.platformCounts[r[3]]++;if(r[7]!==null&&r[7]!==""&&Number.isFinite(Number(r[7])))c.maxFRP=Math.max(c.maxFRP??0,Number(r[7]));
 }
 let m=0,v=0,common=0;
 for(const c of cells.values()){c.common=[...c.m].filter(d=>c.v.has(d)).length;c.union=c.m.size+c.v.size-c.common;m+=c.m.size;v+=c.v.size;common+=c.common;}
 $('n-detections').textContent=fmt.format(chosen.length);$('n-union').textContent=fmt.format(m+v-common);$('n-common').textContent=fmt.format(common);
 $('formula').textContent='MODIS '+fmt.format(m)+' + VIIRS '+fmt.format(v)+' − coincidencias del mismo día '+fmt.format(common)+' = '+fmt.format(m+v-common)+' días-celda · lado '+$('size').value+' km. El día incluye la fecha completa para no mezclar meses o años.';
}
function summarize(){
 const groups=new Map();
 for(const r of chosen){const key=r[4]+'/'+r[14].slice(0,7);if(!groups.has(key))groups.set(key,{code:r[4],month:r[14].slice(0,7),MODIS:0,SNPP:0,JPSS1:0});groups.get(key)[r[3]]++;}
 const rows=[...groups.values()].sort((a,b)=>a.month.localeCompare(b.month)||names[a.code].localeCompare(names[b.code]));
 $('summary').innerHTML=rows.slice(0,1500).map(r=>'<tr><td>'+esc(names[r.code])+'</td><td>'+r.month+'</td><td>'+fmt.format(r.MODIS)+'</td><td>'+fmt.format(r.SNPP)+'</td><td>'+fmt.format(r.JPSS1)+'</td></tr>').join('');
 $('summary-note').textContent=rows.length>1500?'Se muestran 1.500 grupos de '+fmt.format(rows.length)+'. Descarga los puntos para obtener todos.':'Cada cifra es cantidad de detecciones, no incendios. '+rows.length+' grupos con registros.';
}
function draw(){
 if(geoMap){drawGeo();return;}
 const rect=canvas.getBoundingClientRect();if(!rect.width)return;
 const dpr=window.devicePixelRatio||1,w=rect.width,h=rect.height;canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
 const scale=Math.min(w/view.w,h/view.h),sx=x=>w/2+(x-view.cx)*scale,sy=y=>h/2-(y-view.cy)*scale;
 drawTransform={scale,w,h};
 function shapePath(polys){ctx.beginPath();for(const poly of polys)for(const ring of poly){ring.forEach(([x,y],i)=>i?ctx.lineTo(sx(x),sy(y)):ctx.moveTo(sx(x),sy(y)));ctx.closePath();}}
 for(const shape of C.shapes){shapePath(shape.polygons);ctx.fillStyle=shape.code===$('zone').value?'#25413e':'#172d30';ctx.fill('evenodd');ctx.strokeStyle='#507974';ctx.lineWidth=.8;ctx.stroke();}
 const size=Number($('size').value)*1000;
 if($('grid').checked){
 for(const c of cells.values()){const px=sx(c.col*size),py=sy((c.row+1)*size),side=size*scale;if(px>w||py>h||px+side<0||py+side<0)continue;
 ctx.fillStyle=cellColor(c);ctx.globalAlpha=.23;ctx.fillRect(px,py,side,side);ctx.globalAlpha=1;ctx.strokeStyle='#a6c5b0';ctx.lineWidth=.5;ctx.strokeRect(px,py,side,side);
 }
 const left=view.cx-w/(2*scale),right=view.cx+w/(2*scale),bottom=view.cy-h/(2*scale),top=view.cy+h/(2*scale);
 if((right-left+top-bottom)/size<700){ctx.beginPath();ctx.strokeStyle='#385354';ctx.lineWidth=.4;
 for(let col=Math.floor(left/size);col<=Math.ceil(right/size);col++){ctx.moveTo(sx(col*size),0);ctx.lineTo(sx(col*size),h);}
 for(let row=Math.floor(bottom/size);row<=Math.ceil(top/size);row++){ctx.moveTo(0,sy(row*size));ctx.lineTo(w,sy(row*size));}ctx.stroke();}
 }
 if($('points').checked)for(const platform of platforms){
 ctx.beginPath();for(const r of chosen){if(r[3]!==platform)continue;const [x,y]=xy(r),px=sx(x),py=sy(y);if(px<0||px>w||py<0||py>h)continue;const radius=platform==='MODIS'?2.8:1.9;ctx.moveTo(px+radius,py);ctx.arc(px,py,radius,0,Math.PI*2);}ctx.globalAlpha=.72;ctx.fillStyle='#ff3434';ctx.fill();ctx.globalAlpha=1;
 }
 drawHistorical(sx,sy);drawCatalog(sx,sy);
 if($('zone').value!=='all'){ctx.fillStyle='#f1f6ec';ctx.font='16px system-ui';ctx.fillText(names[$('zone').value],16,26);}
 const length=niceLength(w/5/scale);ctx.strokeStyle='white';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(20,h-28);ctx.lineTo(20+length*scale,h-28);ctx.stroke();ctx.fillStyle='white';ctx.font='12px system-ui';ctx.fillText(length/1000+' km · proyección del modelo',20,h-38);
 ctx.fillText('N ↑',w-43,26);
}
function niceLength(x){const base=10**Math.floor(Math.log10(x));return [1,2,5,10].map(v=>v*base).filter(v=>v<=x).at(-1)||base;}
function drawHistorical(sx,sy){
 const earliest=periodMonths[0]+'-01',latest=periodMonths.at(-1)+'-31';
 let visible=0,undated=0;
 for(const f of historical){
 const props=f.properties||{},start=props.fecha_inicio||null,end=props.fecha_fin||start;
 if(start&&end&&!periodMonths.some(m=>{
 const first=m+'-01',last=m+'-'+new Date(Number(m.slice(0,4)),Number(m.slice(5)),0).getDate();
 const wanted=$('day').value;
 if(wanted!=='all'){const date=m+'-'+wanted;return validDate(date)&&date>=start&&date<=end;}
 return end>=first&&start<=last;
 }))continue;
 if(!start)undated++;visible++;
 const g=f.geometry;
 ctx.strokeStyle='#fff0a1';ctx.fillStyle='#fff0a1';ctx.lineWidth=2;ctx.setLineDash([7,4]);
 if(g.type==='Point'){const [x,y]=project(...g.coordinates);ctx.beginPath();ctx.arc(sx(x),sy(y),7,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.fillText(props.nombre||'Registro importado',sx(x)+10,sy(y));}
 else {const ps=g.type==='Polygon'?[g.coordinates]:g.coordinates;ctx.beginPath();for(const p of ps)for(const ring of p){ring.forEach((c,i)=>{const [x,y]=project(c[0],c[1]);i?ctx.lineTo(sx(x),sy(y)):ctx.moveTo(sx(x),sy(y));});ctx.closePath();}ctx.stroke();}
 ctx.setLineDash([]);
 }
 if(historical.length)$('historical-status').textContent=historical.length+' registros importados; '+visible+' son compatibles con el período elegido, incluidos '+undated+' sin fecha. Son una capa separada, sin atribución automática de focos.';
}
function screenXY(event){
 const b=canvas.getBoundingClientRect(),{scale,w,h}=drawTransform;
 return [view.cx+(event.clientX-b.left-w/2)/scale,view.cy-(event.clientY-b.top-h/2)/scale];
}
canvas.addEventListener('click',event=>{
 if(canvas.dataset.moved==='true'){canvas.dataset.moved='false';return;}
 if(!drawTransform||busy)return;
 const [x,y]=screenXY(event);let best=null,min=(9/drawTransform.scale)**2;
 if($('points').checked)for(const r of chosen){const [px,py]=xy(r),d=(px-x)**2+(py-y)**2;if(d<min){min=d;best=r;}}
 if(best){const f=M.archivos[best[13]];
 $('detail').textContent=best[3]+' · satélite '+best[15]+' · '+names[best[4]]+' · día local '+best[14]+' · UTC '+new Date(best[2]).toISOString()+' · lat '+best[1]+' / lon '+best[0]+' · confianza '+best[5]+' · tipo '+(best[6]||'sin dato')+' · FRP '+(best[7]??'sin dato')+' MW · píxel scan/track '+best[8]+'/'+best[9]+' km · archivo '+f.nombre+' · versión '+f.versiones.join(', ');return;}
 const size=Number($('size').value)*1000,key=Math.floor(x/size)+'/'+Math.floor(y/size),c=cells.get(key);
 $('detail').textContent=c?'Celda '+key+' · '+c.points+' detecciones · MODIS '+c.m.size+' + VIIRS '+c.v.size+' − coincidencias '+c.common+' = '+c.union+' días-celda.':'No hay detecciones seleccionadas en esta celda; esto no confirma ausencia de fuego.';
});
let drag=null;
canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,cx:view.cx,cy:view.cy};canvas.dataset.moved='false';canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!drag)return;if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>4)canvas.dataset.moved='true';view.cx=drag.cx-(e.clientX-drag.x)/drawTransform.scale;view.cy=drag.cy+(e.clientY-drag.y)/drawTransform.scale;draw();});
canvas.addEventListener('pointerup',()=>{drag=null;});
canvas.addEventListener('wheel',e=>{e.preventDefault();const f=e.deltaY>0?1.2:1/1.2;view.w*=f;view.h*=f;draw();},{passive:false});
$('zoom-in').onclick=()=>{view.w*=.65;view.h*=.65;draw();};$('zoom-out').onclick=()=>{view.w/=.65;view.h/=.65;draw();};$('reset').onclick=fit;
window.addEventListener('resize',draw);
function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function csvValue(v){const s=String(v??'');return /[",\r\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s;}
function selectionLabel(){if(candidateMode)return 'candidatos-'+candidateMode.id;return ($('year').value+'-'+$('month').value+'-'+$('zone').value).replaceAll('all','todos');}
$('export-points').onclick=()=>{
 const header=['longitude','latitude','fecha_utc','fecha_local','plataforma','satellite','comuna_codigo','comuna','confidence','type','frp_MW','scan_km','track_km','brightness_4um_K','brightness_11um_K','daynight','archivo','version','consulta_candidatos_registro'];
 const rows=chosen.map(r=>[r[0],r[1],new Date(r[2]).toISOString(),r[14],r[3],r[15],r[4],names[r[4]],r[5],r[6],r[7],r[8],r[9],r[10],r[11],r[12],M.archivos[r[13]].nombre,M.archivos[r[13]].versiones.join(';'),candidateMode?.id||'']);
 download('focos-'+selectionLabel()+'.csv','\uFEFF'+[header,...rows].map(r=>r.map(csvValue).join(',')).join('\r\n'),'text/csv;charset=utf-8');
};
function inverseProject(x,y){
 const R=6371007,lat0=-38*Math.PI/180,lon0=-72*Math.PI/180,rho=Math.hypot(x,y);
 if(!rho)return [-72,-38];
 const c=2*Math.asin(Math.min(1,rho/(2*R))),s=Math.sin(c),co=Math.cos(c);
 return [(lon0+Math.atan2(x*s,rho*Math.cos(lat0)*co-y*Math.sin(lat0)*s))*180/Math.PI,Math.asin(co*Math.sin(lat0)+y*s*Math.cos(lat0)/rho)*180/Math.PI];
}
$('export-cells').onclick=()=>{
 const size=Number($('size').value)*1000;
 const features=[...cells.values()].map(c=>{const x=c.col*size,y=c.row*size;return {type:'Feature',properties:{celda:c.col+'/'+c.row,lado_km:size/1000,dias_celda:c.union,modis:c.m.size,viirs:c.v.size,coincidencias:c.common,frp_max_observado_MW:c.maxFRP,conteos_por_plataforma:c.platformCounts,color_por:$('cell-metric').value,consulta_candidatos_registro:candidateMode?.id||'',nota:'Celda completa; conteo de centros dentro del área consultada. No atribuye puntos a un incendio.'},geometry:{type:'Polygon',coordinates:[[[x,y],[x+size,y],[x+size,y+size],[x,y+size],[x,y]].map(p=>inverseProject(...p))]}};});
 download('celdas-'+selectionLabel()+'.geojson',JSON.stringify({type:'FeatureCollection',features}),'application/geo+json');
};
$('export-inventory').onclick=()=>download('inventario-nasa.json',JSON.stringify(M,null,2),'application/json');
function rangeMonths(start,end){const out=[];let y=Number(start.slice(0,4)),m=Number(start.slice(5));for(let i=0;i<1200;i++){const key=y+'-'+String(m).padStart(2,'0');if(key>end)break;out.push(key);if(++m>12){y++;m=1;}}return out;}
async function evaluate(){
 if(candidateMode)return;
 invalidateAnalysis();
 try{
 const ps=selectedPlatforms(),vps=ps.filter(p=>p!=='MODIS'),start=$('analysis-start').value,end=$('analysis-end').value;
 if(!ps.includes('MODIS')||!vps.length)throw Error('Para evaluar reconstrucción selecciona MODIS y al menos un VIIRS.');
 if(!/^\d{4}-(0[1-9]|1[012])$/.test(start)||!/^\d{4}-(0[1-9]|1[012])$/.test(end)||start>end)throw Error('Indica un intervalo mensual válido.');
 const months=rangeMonths(start,end);
 if(months.length<36)throw Error('Utiliza al menos 36 meses para poder reservar temporadas completas y entrenar con otros datos.');
 const missing=ps.flatMap(p=>months.filter(m=>!sourceMonths[p].has(m)).map(m=>p+' '+m));
 if(missing.length)throw Error('Faltan archivos con registros del período para: '+missing.slice(0,8).join(', ')+(missing.length>8?' y otros.':'.')+' Ajusta el intervalo o las plataformas.');
 const sizes=[...new Set($('sizes').value.split(',').map(s=>Number(s.trim())))].sort((a,b)=>a-b);
 if(!sizes.length||sizes.length>12||sizes.some(s=>!Number.isFinite(s)||s<.1||s>100))throw Error('Indica hasta 12 tamaños entre 0.1 y 100 km separados por comas.');
 const iterations=Number($('iterations').value),seed=Number($('seed').value);
 if(!Number.isInteger(iterations)||iterations<10||iterations>1000||!Number.isInteger(seed)||seed<0||seed>4294967295)throw Error('Revisa posiciones (10–1000) y semilla entera.');
 const thresholds=['max-spread','max-error','min-recall'].map(id=>Number($(id).value)/100);
 if(thresholds.some(v=>!Number.isFinite(v)||v<0||v>1))throw Error('Los porcentajes deben estar entre 0 y 100.');
 const token=loadToken,serial=analysisSerial,zone=$('zone').value;$('evaluate').disabled=true;$('analysis-status').textContent='Cargando el período histórico…';
 const records=(await Promise.all(months.map(loadMonth))).flat();if(token!==loadToken||serial!==analysisSerial)throw Error('La selección cambió durante la carga. Vuelve a evaluar.');
 const q=qualityFilter(),filtered=records.filter(r=>ps.includes(r[3])&&(zone==='all'||r[4]===zone)&&q(r));
 const toPoint=r=>({lon:r[0],lat:r[1],timestamp:r[2],sensor:r[3]==='MODIS'?'MODIS':'VIIRS',satellite:r[15]||r[3],version:M.archivos[r[13]].versiones.join(';')});
 const area=zone==='all'?C.area:{type:'FeatureCollection',features:C.area.features.filter(f=>f.properties.codcom===zone)};
 const config={sizes,iterations,seed,timezone:M.timezone,maxSpread:thresholds[0],maxError:thresholds[1],minRecall:thresholds[2],modis:{start,end},viirs:{start,end}};
 const input={area,config,modis:filtered.filter(r=>r[3]==='MODIS').map(toPoint),viirs:filtered.filter(r=>r[3]!=='MODIS').map(toPoint)};
 const engine=window.NASA_ENGINE+'\nself.onmessage=({data})=>{try{const result=analyze(data,v=>self.postMessage({progress:v}));self.postMessage({result});}catch(e){self.postMessage({error:e.message});}};';
 const url=URL.createObjectURL(new Blob([engine],{type:'text/javascript'}));worker=new Worker(url);URL.revokeObjectURL(url);$('cancel').disabled=false;
 const provenance={poligono_sha256:M.poligono_sha256,motor_original_sha256:'735751977bd2861e7df9aa62ebaf964fddc1fbf52a34897dfc86ab1a298d0d0e',zona:zone==='all'?'La Araucanía':names[zone],plataformas:ps,confianza:$('confidence').value,tipo:$('type').value,archivos:M.archivos.filter(f=>ps.includes(f.plataforma)&&Object.keys(f.meses_archivo).some(m=>months.includes(m))).map(f=>({nombre:f.nombre,sha256:f.sha256,versiones:f.versiones})),aviso:'Disponibilidad de archivos comprobada por mes; integridad y cobertura útil no acreditadas. Método experimental, no evaluación final independiente.'};
 worker.onmessage=({data})=>{
 if(data.progress!==undefined){$('analysis-status').textContent='Evaluación en curso: '+data.progress+' %';return;}
 worker.terminate();worker=null;$('cancel').disabled=true;$('evaluate').disabled=false;
 if(data.error){$('analysis-status').textContent=data.error;return;}
 analysisResult={...data.result,provenance,generatedAt:new Date().toISOString()};
 renderEvaluation();$('export-analysis').disabled=false;
 };
 worker.onerror=()=>{if(worker)worker.terminate();worker=null;$('cancel').disabled=true;$('evaluate').disabled=false;$('analysis-status').textContent='No se pudo iniciar el motor de evaluación. Prueba el servidor local incluido; el visor de puntos no necesita servidor.';};
 $('analysis-status').textContent='Motor iniciado · calculando geometría y reconstrucción…';worker.postMessage(input);
 }catch(error){$('evaluate').disabled=false;$('analysis-status').textContent=error.message;}
}
function pct(v){return v==null?'Sin evaluar':(v*100).toLocaleString('es-CL',{maximumFractionDigits:1})+' %';}
function renderEvaluation(){
 const r=analysisResult;
 $('analysis-status').textContent=(r.recommended===null?'Ningún tamaño cumple los criterios.':'Menor tamaño aprobado: '+r.recommended+' km.')+' '+r.overlapMonths+' meses compartidos · '+r.provenance.zona+'.';
 $('evaluation').innerHTML='<div class="scroll"><table><thead><tr><th>Lado</th><th>Bordes</th><th>Error MODIS</th><th>Error VIIRS</th><th>Recuperación mínima</th><th>Temporadas</th><th>Aprueba</th></tr></thead><tbody>'+r.scales.map(s=>'<tr><td>'+s.km+' km</td><td>'+pct(s.spread)+'</td><td>'+pct(s.m.error)+'</td><td>'+pct(s.v.error)+'</td><td>'+pct(s.recall)+'</td><td>'+s.m.seasons+'</td><td class="'+(s.passes?'pass':'warning')+'">'+(s.passes?'Sí':'No')+'</td></tr>').join('')+'</tbody></table></div><p class="muted">La referencia es la unión de detecciones; no existe verdad de terreno de incendios en este cálculo. La sensibilidad usa desplazamientos; la reconstrucción se evalúa en una cuadrícula fija. Los umbrales no son estándares oficiales.</p>';
}
$('evaluate').onclick=evaluate;$('cancel').onclick=()=>{if(worker)worker.terminate();worker=null;$('evaluate').disabled=false;$('cancel').disabled=true;$('analysis-status').textContent='Evaluación cancelada.';};
$('export-analysis').onclick=()=>{if(analysisResult)download('evaluacion-nasa.json',JSON.stringify(analysisResult,null,2),'application/json');};
function validDate(s){return /^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;}
$('historical').onchange=async()=>{
 const file=$('historical').files[0];if(!file)return;
 try{
 const text=(await file.text()).replace(/^\uFEFF/,'').trim();
 if(!text)throw Error('El archivo GeoJSON está vacío. Selecciona un archivo con contenido.');
 let geo;try{geo=JSON.parse(text);}catch{throw Error('El archivo GeoJSON está incompleto o no tiene un formato JSON válido. Revisa el archivo e inténtalo de nuevo.');}
 if(geo.type!=='FeatureCollection'||!Array.isArray(geo.features))throw Error('Usa un GeoJSON FeatureCollection.');
 for(const f of geo.features){
 if(!f.geometry)throw Error('Registro sin geometría.');
 if(f.geometry.type==='Point'){const [x,y]=f.geometry.coordinates;if(!Number.isFinite(x)||!Number.isFinite(y)||Math.abs(x)>180||Math.abs(y)>90)throw Error('Coordenadas inválidas.');}
 else NASA_MODEL.parseArea(f);
 const p=f.properties||{};
 for(const k of ['fecha_inicio','fecha_fin'])if(p[k]&&!validDate(p[k]))throw Error('Fecha inválida: '+k+'. Usa YYYY-MM-DD.');
 if(p.fecha_inicio&&p.fecha_fin&&p.fecha_fin<p.fecha_inicio)throw Error('Fecha final anterior al inicio.');
 }
 historical=geo.features;
 $('historical-list').innerHTML=historical.map(f=>{const p=f.properties||{};return '<p><strong>'+esc(p.nombre||'Sin nombre')+'</strong> · '+esc(p.fecha_inicio||'Sin fecha inicial')+' a '+esc(p.fecha_fin||p.fecha_inicio||'Sin fecha final')+'<br>Fuente declarada: '+esc(p.fuente||'No informada')+'<br>'+esc(p.observaciones||'')+'</p>';}).join('');
 $('remove-historical').disabled=false;$('historical-status').textContent=historical.length+' registros importados de '+file.name;draw();
 }catch(error){$('historical-status').textContent='No se importó el archivo: '+error.message;}
};
$('remove-historical').onclick=()=>{historical=[];$('historical-list').replaceChildren();$('historical').value='';$('remove-historical').disabled=true;$('historical-status').textContent='Sin registros históricos importados.';draw();};

const E=window.NASA_EVENTS;

function hasEventPoint(r){return Number.isFinite(r.lat)&&Number.isFinite(r.lon);}
function eventInterval(r){
 const a=r.fecha_inicio;if(!a)return null;
 const start=a.length===7?a+'-01':a;
 const last=m=>m+'-'+String(new Date(Number(m.slice(0,4)),Number(m.slice(5,7)),0).getDate()).padStart(2,'0');
 const end=r.fecha_fin?(r.fecha_fin.length===7?last(r.fecha_fin):r.fecha_fin):(a.length===7?last(a):a);
 return validDate(start)&&validDate(end)&&end>=start?{start,end}:null;
}
function eventOverlaps(r,start,end){const d=eventInterval(r);return !!d&&d.end>=start&&d.start<=end;}
function eventDates(r){return (r.original.fecha_inicio||'Sin fecha de inicio')+' → '+(r.original.fecha_termino||'Término sin dato');}
function eventYear(r){return r.fecha_inicio.slice(0,4)||r.temporada.slice(-4);}
function eventBounds(r){
 if(hasEventPoint(r))return [[r.lat-.025,r.lon-.025],[r.lat+.025,r.lon+.025]];
 const shape=C.shapes.find(z=>z.code===r.principal_code);
 const ps=shape?shape.polygons.flatMap(p=>p.flatMap(ring=>ring.map(c=>inverseProject(...c)))):[];
 return ps.length?[[Math.min(...ps.map(p=>p[1])),Math.min(...ps.map(p=>p[0]))],[Math.max(...ps.map(p=>p[1])),Math.max(...ps.map(p=>p[0]))]]:[[-40,-74],[-37,-70]];
}
function eventDetail(r){
 const fields={nombre_incendio:'Nombre del incendio',temporada:'Temporada',comuna:'Comuna',provincia:'Provincia',fecha_inicio:'Inicio',fecha_termino:'Término',duracion_dias:'Duración en días',superficie_total_ha:'Superficie total declarada (ha)',plantaciones_ha:'Plantaciones (ha)',vegetacion_natural_ha:'Vegetación natural (ha)',agricola_ha:'Agrícola (ha)',desechos_ha:'Desechos (ha)',georef_conaf:'Referencia geográfica CONAF',tipo_cifra:'Tipo de cifra',fuente:'Fuente'};
 return '<h3>'+esc(r.nombre_incendio)+' · '+esc(r.id)+'</h3><dl>'+Object.entries(fields).map(([k,label])=>'<dt>'+esc(label)+'</dt><dd>'+esc(r.original[k]||'Sin dato')+'</dd>').join('')+'</dl><p>'+(hasEventPoint(r)?'Coordenadas del CSV: '+r.lat+', '+r.lon+'. Sin perímetro.':'Sin coordenadas latitud/longitud. Se encuadra la comuna declarada; no se inventa la ubicación ni la celda del incendio.')+'</p><p><a href="'+esc(r.url_fuente)+'" target="_blank" rel="noopener">Consultar fuente</a> · fila '+r.source_row+' del CSV aportado.</p><p>'+esc(r.advertencias.join(' · '))+'</p>';
}
function eventCard(r){
 let cellInfo='';
 if(hasEventPoint(r)){
  const z=Number($('size').value)*1000,[x,y]=project(r.lon,r.lat),key=Math.floor(x/z)+'/'+Math.floor(y/z),cell=cells.get(key)||selectedHistoricalCell;
  cellInfo='<p><strong>Celda de consulta: '+esc(key)+' · '+$('size').value+' km</strong><br>'+(cell?esc(cellDetail(cell)):'Sin detecciones disponibles en esta celda y período.')+'</p>';
 }
 showSelectionCard(eventDetail(r)+cellInfo+'<p>Las detecciones satelitales consultadas son contexto espacial y temporal; no se atribuyen automáticamente a este incendio.</p><button id="history-ficha-download">Descargar ficha JSON</button><button id="history-exit-query">Volver a exploración general</button>');
 $('history-ficha-download').onclick=()=>download('ficha-'+r.id+'.json',JSON.stringify({registro:r.original,procedencia:E.meta},null,2),'application/json');
 $('history-exit-query').onclick=exitHistoricalView;
}

let selectedRecord=null,candidateMode=null,recordRestore=null,visibleRecords=[];
function catalogSelection(){
 return E.records.filter(r=>periodMonths.some(m=>eventOverlaps(r,m+'-01',m+'-31'))&&($('day').value==='all'||periodMonths.some(m=>eventOverlaps(r,m+'-'+$('day').value,m+'-'+$('day').value)))&&($('zone').value==='all'||r.comuna_codes.includes($('zone').value))&&($('catalog-category').value==='all'||r.categoria===$('catalog-category').value)&&plain([r.id,r.nombre_incendio,r.comuna_principal].join(' ')).includes(plain($('catalog-search').value)));
}
function updateCatalog(){
 visibleRecords=catalogSelection();
 $('catalog-count').textContent=visibleRecords.length+' registros visibles. Las fechas desconocidas no se incluyen en el filtro temporal.';
 $('catalog-rows').innerHTML=visibleRecords.map(r=>'<tr><td>'+esc(r.nombre_incendio)+' · '+esc(r.id)+'</td><td>'+esc(eventDates(r))+'</td><td>'+esc(r.comuna_principal)+'</td><td>'+esc(r.tipo_cifra)+'</td><td>'+esc(r.superficie_total_ha??'Sin dato')+'</td><td>'+esc(r.fuente)+'</td><td><button data-record="'+esc(r.id)+'">Ver ficha</button></td></tr>').join('');
}
function fitRecord(r){
 const bounds=eventBounds(r);if(geoMap)geoMap.fitBounds(bounds,{maxZoom:10.75});
 const a=project(bounds[0][1],bounds[0][0]),b=project(bounds[1][1],bounds[1][0]);
 view={cx:(a[0]+b[0])/2,cy:(a[1]+b[1])/2,w:Math.max(5000,Math.abs(a[0]-b[0])*1.35),h:Math.max(5000,Math.abs(a[1]-b[1])*1.35)};
}
function drawCatalog(sx,sy){
 if(!$('catalog-visible').checked)return;
 for(const r of visibleRecords){
 if(!hasEventPoint(r))continue;
 const [x,y]=project(r.lon,r.lat);ctx.fillStyle='#ffe080';ctx.fillRect(sx(x)-4,sy(y)-4,8,8);
 if(Number.isFinite(r.lon_min)&&($('catalog-boxes').checked||r===selectedRecord)){ctx.beginPath();[[r.lon_min,r.lat_min],[r.lon_max,r.lat_min],[r.lon_max,r.lat_max],[r.lon_min,r.lat_max],[r.lon_min,r.lat_min]].forEach((p,i)=>{const [a,b]=project(...p);i?ctx.lineTo(sx(a),sy(b)):ctx.moveTo(sx(a),sy(b));});ctx.strokeStyle='#ffe080';ctx.setLineDash([6,4]);ctx.stroke();ctx.setLineDash([]);}
 if(r===selectedRecord){ctx.strokeStyle='white';ctx.strokeRect(sx(x)-7,sy(y)-7,14,14);ctx.fillText(r.id,sx(x)+10,sy(y));}
 }
}
function selectRecord(r){
 if(!historyReturnState)historyReturnState={controls:Object.fromEntries(['year','month','day','zone'].map(id=>[id,$(id).value])),layers:Object.fromEntries(['points','grid','catalog-visible','catalog-boxes'].map(id=>[id,$(id).checked])),center:geoMap?geoMap.getCenter():null,zoom:geoMap?geoMap.getZoom():null,view:{...view},rightClosed:document.body.classList.contains('right-closed')};

 if(candidateMode)leaveRecord();
 selectedRecord=r;fitRecord(r);
 $('catalog-detail').innerHTML=eventDetail(r);
 $('catalog-query').disabled=false;$('catalog-selected-export').disabled=false;draw();focusHistoricalRecord(r);
}
function enterRecord(){
 const r=selectedRecord;if(!r)return;const d=eventInterval(r);
 if(!d){candidateMode=null;fitRecord(r);$('catalog-query').disabled=true;draw();return Promise.resolve();}
 invalidateAnalysis();recordRestore=Object.fromEntries(['year','month','day','zone'].map(id=>[id,$(id).value]));
 candidateMode={...r,fecha_inicio:d.start,fecha_fin:d.end,lon_min:-180,lon_max:180,lat_min:-90,lat_max:90};
 if(hasEventPoint(r)){
  const z=Number($('size').value)*1000,[x,y]=project(r.lon,r.lat),col=Math.floor(x/z),row=Math.floor(y/z);
  candidateMode.cell_col=col;candidateMode.cell_row=row;candidateMode.cell_size=z;
  const ps=[[col*z,row*z],[(col+1)*z,row*z],[(col+1)*z,(row+1)*z],[col*z,(row+1)*z]].map(p=>inverseProject(...p));
  candidateMode.lon_min=Math.min(...ps.map(p=>p[0]));candidateMode.lon_max=Math.max(...ps.map(p=>p[0]));candidateMode.lat_min=Math.min(...ps.map(p=>p[1]));candidateMode.lat_max=Math.max(...ps.map(p=>p[1]));
 }
 $('year').value=d.start.slice(0,4);$('month').value=d.start.slice(5,7);
 for(const id of ['year','month','day','zone'])$(id).disabled=true;
 $('zone').value=hasEventPoint(r)?'all':r.principal_code;$('day').value='all';$('record-mode').hidden=false;$('leave-record').hidden=false;$('evaluate').disabled=true;
 $('record-mode').textContent='Consulta '+r.id+': '+d.start+' a '+d.end+' · '+(hasEventPoint(r)?'celda de la coordenada declarada':'comuna declarada, sin punto del incendio')+'. Si falta el término, solo se consulta la fecha o el mes de inicio conocido. No atribuye detecciones al incendio.';
 fitRecord(r);return refresh();
}
function leaveRecord(reload=true){
 candidateMode=null;for(const id of ['year','month','day','zone']){$(id).disabled=false;if(recordRestore)$(id).value=recordRestore[id];}
 $('record-mode').hidden=true;$('leave-record').hidden=true;$('evaluate').disabled=false;invalidateAnalysis();if(reload){fit();refresh();}
}
function initCatalog(){
 $('catalog-provenance').textContent=E.records.length+' registros del CSV aportado · fuente y tipo de cifra por registro. Archivo original conservado.';
 for(const c of [...new Set(E.records.map(r=>r.categoria))]){const o=document.createElement('option');o.value=c;o.textContent=catLabel(c);$('catalog-category').append(o);}
 $('catalog-audit').textContent=E.meta.alcance+' '+E.meta.sin_coordenadas+' registros sin latitud/longitud; no se dibujan puntos ni celdas ficticios. Las fechas y superficies faltantes se conservan sin dato.';
 for(const id of ['catalog-category','catalog-search'])$(id).addEventListener('input',()=>{updateCatalog();draw();});
 for(const id of ['catalog-visible','catalog-boxes'])$(id).addEventListener('change',draw);
 $('catalog-rows').onclick=e=>{const b=e.target.closest('[data-record]');if(b)selectRecord(E.records.find(r=>r.id===b.dataset.record));};
 $('catalog-query').onclick=enterRecord;$('leave-record').onclick=()=>historyReturnState?exitHistoricalView():leaveRecord();
 $('catalog-selected-export').onclick=()=>download('ficha-'+selectedRecord.id+'.json',JSON.stringify({registro:selectedRecord,procedencia:E.meta,nota:'No atribuye automáticamente los puntos al incendio.'},null,2),'application/json');
 $('catalog-export').onclick=()=>{const keys=E.meta.columnas;download('catalogo-visible.csv',[keys,...visibleRecords.map(r=>keys.map(k=>r.original[k]??''))].map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\n'),'text/csv');};
 $('catalog-geojson').onclick=()=>download('catalogo-visible.geojson',JSON.stringify({type:'FeatureCollection',features:visibleRecords.map(r=>({type:'Feature',geometry:hasEventPoint(r)?{type:'Point',coordinates:[r.lon,r.lat]}:null,properties:{...r,nota:'Coordenada declarada en el CSV; geometría nula cuando no hay coordenadas. No es un perímetro.'}}))}),'application/geo+json');
}

function initialize(){
 const years=[...new Set(M.meses.map(m=>m.slice(0,4)))].sort().reverse();
 $('year').innerHTML='<option value="all">Todos los años</option>'+years.map(y=>'<option value="'+y+'">'+y+'</option>').join('');$('year').value=years.includes('2023')?'2023':years[0];
 updateDayOptions();
 $('zone').innerHTML='<option value="all">Toda La Araucanía</option>'+[...C.shapes].sort((a,b)=>a.name.localeCompare(b.name)).map(s=>'<option value="'+s.code+'">'+esc(s.name)+'</option>').join('');
 $('inventory').textContent=M.archivos.length+' archivos originales · '+fmt.format(M.total_regional)+' detecciones regionales · '+M.meses[0]+' a '+M.meses.at(-1)+' · 32 comunas.';
 $('provenance').textContent='Preparado el '+M.fecha_preparacion+'. Geometría comunal CIREN / IDE Minagri. Originales conservados; SHA256 de cada archivo en el inventario. '+M.nota_carpeta;
 $('files').innerHTML=M.archivos.map(f=>'<tr><td>'+esc(f.nombre)+'</td><td>'+f.plataforma+'</td><td>'+esc(f.versiones.join('; '))+'</td><td>'+fmt.format(f.filas)+'</td><td>'+fmt.format(f.retenidas)+'</td></tr>').join('');
 for(const id of ['year','month','day','MODIS','SNPP','JPSS1','confidence','type'])$(id).addEventListener('change',()=>{invalidateAnalysis();refresh();});
 $('zone').addEventListener('change',()=>{invalidateAnalysis();fit();refresh();});
 $('size').addEventListener('change',()=>{makeCells();draw();});
 for(const id of ['grid','points'])$(id).addEventListener('change',draw);
 for(const id of ['analysis-start','analysis-end','sizes','iterations','seed','max-spread','max-error','min-recall'])$(id).addEventListener('input',invalidateAnalysis);
 initCatalog();fit();refresh();
}


let ownCSV=false;
async function importCSV(){
 let accepted=0,rejected=0;
 try{
 const prepared=[];const areas=window.NASA_COMMUNES.features.map(f=>({f,area:NASA_MODEL.parseArea(f)}));
 for(const file of $('csv-upload').files){
 const text=(await file.text()).replace(/^\uFEFF/,'');if(!text.trim())throw Error('El archivo CSV está vacío. Selecciona un archivo con contenido.');const rows=[];let row=[],field='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(!quoted&&(c===','||c==='\n')){row.push(field.replace(/\r$/,''));field='';if(c==='\n'){rows.push(row);row=[];}}else field+=c;}if(field||row.length){row.push(field);rows.push(row);}if(quoted)throw Error('Comillas sin cerrar en '+file.name);
 const header=rows.shift().map(x=>x.trim().toLowerCase()),idx=k=>header.indexOf(k);
 for(const k of ['longitude','latitude','acq_date','acq_time'])if(idx(k)<0)throw Error('Falta '+k+' en '+file.name);
 const platform=$('csv-platform').value;
 const output=[];for(const a of rows){if(a.every(x=>!x.trim()))continue;const val=k=>a[idx(k)]??'',lon=Number(val('longitude')),lat=Number(val('latitude')),date=val('acq_date'),time=val('acq_time').padStart(4,'0'),ms=Date.parse(date+'T'+time.slice(0,2)+':'+time.slice(2)+':00Z');
 if(!val('longitude')||!val('latitude')||!validDate(date)||!Number.isFinite(ms)||!Number.isFinite(lon)||!Number.isFinite(lat)||Math.abs(lon)>180||Math.abs(lat)>90){rejected++;continue;}
 const shape=areas.find(a=>NASA_MODEL.insideArea(lon,lat,a.area))?.f;if(!shape){rejected++;continue;}
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(ms),get=k=>parts.find(x=>x.type===k).value,local=get('year')+'-'+get('month')+'-'+get('day');
 const num=k=>val(k)===''?null:Number.isFinite(Number(val(k)))?Number(val(k)):null;
 output.push([lon,lat,ms,platform,String(shape.properties.codcom),String(val('confidence')).toLowerCase(),val('type'),num('frp'),num('scan'),num('track'),num('brightness')??num('bright_ti4'),num('bright_t31')??num('bright_ti5'),val('daynight'),0,local,val('satellite')]);
 }prepared.push({file,platform,output});
 }
 if(!prepared.some(item=>item.output.length))throw Error('El CSV no contiene filas válidas dentro de La Araucanía. La sesión anterior se conserva.');
 stopTime();invalidateAnalysis();
 if(!ownCSV){for(const k of Object.keys(window.NASA_DATA))delete window.NASA_DATA[k];M.meses=[];M.archivos=[];monthCache.clear();for(const p of platforms)sourceMonths[p].clear();ownCSV=true;}
 for(const item of prepared){const id=M.archivos.length,by={};for(const r of item.output){r[13]=id;const m=r[14].slice(0,7);(window.NASA_DATA[m]??=[]).push(r);by[m]=(by[m]||0)+1;sourceMonths[item.platform].add(m);accepted++;}
 M.archivos.push({nombre:item.file.name,plataforma:item.platform,versiones:['CSV usuario'],meses_archivo:by,filas:item.output.length,retenidas:item.output.length});}
 M.meses=Object.keys(window.NASA_DATA).sort();M.total_regional=Object.values(window.NASA_DATA).reduce((n,a)=>n+a.length,0);M.nota_carpeta='Sesión de CSV propios; archivos incorporados temporalmente reemplazados. Sin garantía de integridad mensual.';M.poligono_sha256=null;
 $('inventory').textContent='Sesión CSV propia';$('files').innerHTML=M.archivos.map(f=>'<tr><td>'+esc(f.nombre)+'</td><td>'+f.plataforma+'</td><td>CSV usuario</td><td>'+f.filas+'</td><td>'+f.retenidas+'</td></tr>').join('');$('provenance').textContent=M.nota_carpeta;if(!M.meses.length)throw Error('Sin registros válidos regionales. Vuelve a los datos incorporados.');
 $('year').innerHTML='<option value="all">Todos los años</option>'+[...new Set(M.meses.map(m=>m.slice(0,4)))].map(y=>'<option>'+y+'</option>').join('');$('year').value=M.meses[0].slice(0,4);$('month').value=M.meses[0].slice(5);$('day').value='all';
 $('csv-status').textContent='Sesión CSV propia: '+accepted+' puntos añadidos; '+rejected+' filas inválidas o fuera de la región. No se comprueba integridad mensual. Archivos: '+M.archivos.map(f=>f.nombre).join(', ');
 if(window.HOTSPOT_AVANZADO)window.HOTSPOT_AVANZADO.estado.listo=false;buildTicks();await refresh();
 }catch(e){$('csv-status').textContent=e.message;}
}


let historyLayers=null;
function cellColor(c){
 const metric=$('cell-metric')?.value||'frp',n=metric==='frp'?c.maxFRP:metric==='days'?c.union:c.points;
 if(n===null)return '#8796a5';const cuts=metric==='frp'?[10,50,100,500]:metric==='days'?[1,3,7,15]:[1,5,20,100];
 return ['#fff1a8','#ffc15a','#f88c38','#e84c31','#a71f3d'][cuts.filter(x=>n>x).length];
}
function updateCellLegend(){
 if($('time-mode')?.value==='history'){ $('cell-legend').textContent='Catálogo histórico · cuadrados amarillos = ubicaciones representativas de registros vigentes en la fecha. Sin perímetros ni propagación inferida.';return;}
 const metric=$('cell-metric').value,labels=metric==='frp'?['≤10','10–50','50–100','100–500','>500 MW']:metric==='days'?['1','2–3','4–7','8–15','>15 días-celda']:['1','2–5','6–20','21–100','>100 puntos'];
 $('cell-legend').innerHTML='<b>'+(metric==='frp'?'FRP máximo observado':metric==='days'?'Actividad integrada':'Detecciones integradas')+'</b> '+labels.map((l,i)=>'<i style="background:'+['#fff1a8','#ffc15a','#f88c38','#e84c31','#a71f3d'][i]+'"></i>'+l).join('')+(metric==='frp'?' · gris: sin FRP':'');
}
function cellDetail(c){
 return 'Celda '+c.col+'/'+c.row+' · '+$('size').value+' km de lado · '+c.points+' detecciones · MODIS '+c.platformCounts.MODIS+' · VIIRS S-NPP '+c.platformCounts.SNPP+' · VIIRS NOAA-20 '+c.platformCounts.JPSS1+' · FRP máximo observado '+(c.maxFRP===null?'sin dato':c.maxFRP+' MW')+' · '+c.union+' días-celda integrados · '+c.common+' coincidencias del mismo día. Potencia observada, no severidad ni área quemada.';
}
function changeBase(){
 if(!geoMap)return;
 if(geoLayer){geoMap.removeLayer(geoLayer);geoLayer=null;}
 const style=$('map-style')?.value||'satellite',online=style!=='local'&&$('imagery').checked;
 const nasa='<a href="https://nasa-gibs.github.io/gibs-api-docs/" target="_blank" rel="noopener">NASA GIBS / ESDIS</a>';
 const osm='<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors · ODbL</a>';
 const eox='<a href="https://cloudless.eox.at" target="_blank" rel="noopener">EOxCloudless</a> by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016 &amp; 2017) · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>';
 const credits='<a id="open-map-credits" href="#creditos-del-mapa">Créditos y licencias</a>';
 document.querySelector('.basenote').innerHTML=online
  ?(style==='topo'?'Blue Marble: NASA Earth Observatory · '+nasa:eox)+(style==='streets'?' · '+osm:'')+' · '+credits
  :'Vista local · límites y detecciones incorporados · '+credits;
 if(!online){$('base-status').textContent='Vista local · sin fondo de internet';draw();return;}
 const origin='https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/';
 const descriptions={satellite:'Satélite · EOX 2016 (10 m)',topo:'Relieve · NASA Blue Marble',streets:'Referencia · EOX/OSM'};
 const specs=style==='topo'
  ?[['BlueMarble_ShadedRelief_Bathymetry',8,'jpeg']]
  :style==='streets'
   ?[['EOX',14,'jpg'],['Reference_Features',9,'png']]
   :[['EOX',14,'jpg']];
 const layers=specs.map(([name,native,format],i)=>L.tileLayer(
  name==='EOX'?'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg':origin+name+'/default/GoogleMapsCompatible_Level'+native+'/{z}/{y}/{x}.'+format,
  {minZoom:7,maxZoom:14,minNativeZoom:0,maxNativeZoom:native,noWrap:true,keepBuffer:2,
   updateWhenIdle:true,updateWhenZooming:false,
   attribution:name==='EOX'?eox:i===0?'Blue Marble: NASA Earth Observatory · '+nasa:osm}
 ));
 const group=L.layerGroup(layers);geoLayer=group;
 $('base-status').textContent='Cargando fondo de internet…';
 let errors=0,loaded=0;
 for(const layer of layers){
  layer.on('tileload',()=>{if(geoLayer!==group)return;loaded++;$('base-status').textContent=descriptions[style]+' · mosaico de referencia';});
  layer.on('tileerror',()=>{if(geoLayer!==group)return;errors++;if(!loaded)$('base-status').textContent='Fondo no disponible · datos locales activos';});
  layer.on('load',()=>{if(geoLayer===group&&errors&&!loaded)$('base-status').textContent='Fondo no disponible · datos locales activos';});
 }
 group.addTo(geoMap);
}
let labelAnchors=null;
function drawCommuneLabels(g,pt){
 if(!$('commune-labels').checked)return;
 labelAnchors??=C.shapes.map(s=>{const ring=[...s.polygons].sort((a,b)=>b[0].length-a[0].length)[0][0];const xs=ring.map(c=>c[0]),ys=ring.map(c=>c[1]);return {name:s.name,ll:inverseProject((Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2)};});
 const labelBoxes=[];
 g.font='600 11px system-ui';g.textAlign='center';g.lineWidth=3;g.strokeStyle='#0b1721';g.fillStyle='#f5fafc';
 for(const s of labelAnchors){
 const p=pt(...s.ll);
 const width=g.measureText(s.name).width+6,box={x:p.x-width/2,y:p.y-10,w:width,h:15};if(labelBoxes.some(b=>box.x<b.x+b.w&&box.x+box.w>b.x&&box.y<b.y+b.h&&box.y+box.h>b.y))continue;labelBoxes.push(box);g.strokeText(s.name,p.x,p.y);g.fillText(s.name,p.x,p.y);
 }g.textAlign='start';
}
function changeTimeMode(){
 stopTime();if(candidateMode)leaveRecord(false);
 const hist=$('time-mode').value==='history';
 $('time-unit').disabled=hist;
 updateCellLegend();if(hist){historyLayers={points:$('points').checked,grid:$('grid').checked};selectedRecord=null;historyIndex=-1;document.body.classList.add('history-open');renderHistoryExplorer();resizeLab();buildTicks();return;}
 if(historyLayers){$('points').checked=historyLayers.points;$('grid').checked=historyLayers.grid;}
 selectedRecord=null;zoomSerial++;document.body.classList.remove('history-open');resizeLab();buildTicks();refresh();
}
function setupNewControls(){
 $('left-panel').insertAdjacentHTML('beforeend','<h3>Mapa y actividad integrada</h3><label>Tipo de mapa<select id="map-style"><option value="satellite">Satélite · EOX 2016</option><option value="streets">Referencia · EOX/OSM</option><option value="topo">Relieve · NASA</option><option value="local">Local sin conexión</option></select></label><label>Color de las celdas<select id="cell-metric"><option value="frp">FRP máximo observado (MW)</option><option value="days">Actividad integrada (días-celda)</option><option value="count">Cantidad de detecciones</option></select></label><p class="muted">FRP representa potencia radiativa observada, no severidad ni área quemada. No sumamos FRP entre pasadas. Las clases de color son visuales, no umbrales oficiales.</p><p class="muted" id="background-detail-note">EOX 2016: mosaico de imágenes Sentinel-2 de 2016–2017, detalle de 10 m. No es una imagen de la fecha seleccionada ni alcanza el detalle de Esri. Requiere internet; sin cuenta ni clave. Los focos y las celdas conservan sus coordenadas.</p><label><input type="checkbox" id="commune-labels" checked>Nombres de comunas</label><label><input type="checkbox" id="outside-fade" checked>Atenuar fuera de la región</label>');
 $('time-unit').parentElement.insertAdjacentHTML('beforebegin','<label>Contenido<select id="time-mode"><option value="detections">Detecciones satelitales</option><option value="history">Grandes Incendios (Catálogo)</option></select></label>');
 $('time-mode').onchange=changeTimeMode;$('map-style').onchange=changeBase;
 for(const id of ['commune-labels','outside-fade'])$(id).onchange=draw;$('cell-metric').onchange=()=>{updateCellLegend();draw();};
 $('points').checked=true;
 document.querySelector('.legend').innerHTML='<span id="cell-legend"></span><br><span>Puntos rojos: detecciones de todos los sensores · celda seleccionada: borde blanco · cuadrados amarillos: catálogo</span>';
 $('timeline').querySelector('small').id='history-playing-status';
 
 $('imagery').onchange=changeBase;updateCellLegend();
}


let selectedHistoricalCell=null,historyFocusSerial=0,historyReturnState=null;
// --- Recorrido de Grandes Incendios: la barra de tiempo avanza de incendio en incendio, con acercamiento suave.
const CATEGORY_LABELS={catastrofico:'Catastrófico',muy_grande:'Muy Grande',grande:'Grande',significativo:'Significativo'};
const catLabel=c=>CATEGORY_LABELS[c]||titleCase(String(c??'').replace(/_/g,' '));
function titleCase(t){return String(t??'').toLowerCase().replace(/(^|[\s\-·(])(\p{L})/gu,(m,a,b)=>a+b.toUpperCase());}
const plain=t=>String(t??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
let historyTicks=[],historyIndex=-1,historyStatus='',zoomSerial=0;
const historyMode=()=>$('time-mode')?.value==='history';
function historyFiltered(){
 const search=plain($('history-search').value),year=$('history-year').value,commune=$('history-commune').value,category=$('history-category').value;
 return E.records.filter(r=>(year==='all'||eventYear(r)===year||eventOverlaps(r,year+'-01-01',year+'-12-31'))&&(commune==='all'||r.comuna_codes.includes(commune))&&(category==='all'||r.categoria===category)&&plain([r.id,r.nombre_incendio,r.comuna_principal].join(' ')).includes(search));
}
function easeMapTo(center,zoom,ms=1100){
 return new Promise(done=>{
  if(!geoMap)return done();
  const c0=geoMap.getCenter(),z0=geoMap.getZoom(),serial=++zoomSerial,start=performance.now();
  if(Math.abs(zoom-z0)<.13&&geoMap.distance(c0,center)<1500)return done();
  const frame=now=>{
   if(serial!==zoomSerial)return done();
   const k=Math.min(1,(now-start)/ms),e=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2;
   geoMap.setView([c0.lat+(center[0]-c0.lat)*e,c0.lng+(center[1]-c0.lng)*e],z0+(zoom-z0)*e,{animate:false});
   k<1?requestAnimationFrame(frame):done();
  };
  requestAnimationFrame(frame);
 });
}
function recordView(r){
 const b=eventBounds(r),bounds=L.latLngBounds(b);
 const center=bounds.getCenter();
 return {center:[center.lat,center.lng],zoom:Math.max(7,Math.min(10.75,geoMap.getBoundsZoom(bounds)))};
}
async function applyHistoryTick(i){
 const r=historyTicks[i];if(!r)return;const d=eventInterval(r);if(!d)return;
 historyIndex=i;selectedRecord=r;invalidateAnalysis();
 $('year').value=d.start.slice(0,4);$('month').value=d.start.slice(5,7);$('day').value='all';
 $('points').checked=true;$('grid').checked=true;$('catalog-visible').checked=true;
 historyStatus='Incendio '+(i+1)+' de '+historyTicks.length+' · '+r.nombre_incendio+' · '+r.tipo_cifra+' · '+eventDates(r)+'. '+(hasEventPoint(r)?'Ubicación del CSV, sin perímetro.':'Sin coordenadas: se encuadra la comuna, sin inventar un punto.')+' El mapa muestra detecciones del mes, sin atribución automática al incendio.';
 await refresh();if(historyTicks[historyIndex]!==r)return;
 eventCard(r);renderHistoryExplorer();
 document.querySelector('#history-results .history-event.active')?.scrollIntoView({block:'nearest'});
 if(geoMap){const v=recordView(r);await easeMapTo(v.center,v.zoom);}
}
function rebuildHistoryTicks(keep=true){
 const current=keep?historyTicks[historyIndex]:null;
 historyTicks=historyFiltered().filter(r=>eventInterval(r)).sort((a,b)=>a.fecha_inicio.localeCompare(b.fecha_inicio)||a.id.localeCompare(b.id));
 ticks=historyTicks.map(r=>r.id);$('time-slider').max=Math.max(0,ticks.length-1);
 if(!historyTicks.length){selectedRecord=null;visibleRecords=[];draw();historyIndex=-1;historyStatus='Ningún registro cumple los filtros de año, comuna y tipo.';$('history-playing-status').textContent=historyStatus;$('time-label').textContent='Sin registros';return;}
 const i=current?historyTicks.indexOf(current):-1;
 applyHistoryTick(i>=0?i:0);
}
function showSelectionCard(html){
 const el=$('selection-card');el.hidden=false;el.innerHTML='<div class="selection-heading"><strong>Información de la selección</strong><button id="close-selection" aria-label="Cerrar información">✕</button></div>'+html;
 document.body.classList.remove('right-closed');resizeLab();$('right-panel').scrollTop=0;
 $('close-selection').onclick=()=>{el.hidden=true;selectedSpatialKey=null;selectedDetection=null;selectedHistoricalCell=null;drawGeo();};
}

function exitHistoricalView(){
 historyFocusSerial++;stopTime();const saved=historyReturnState;
 leaveRecord(false);selectedRecord=null;selectedSpatialKey=null;selectedDetection=null;selectedHistoricalCell=null;recordRestore=null;
 if(saved){for(const [id,value]of Object.entries(saved.controls))$(id).value=value;for(const [id,value]of Object.entries(saved.layers))$(id).checked=value;view={...saved.view};document.body.classList.toggle('right-closed',saved.rightClosed);}
 historyReturnState=null;document.body.classList.remove('history-open');
 $('selection-card').replaceChildren();$('selection-card').hidden=true;$('catalog-detail').textContent='Selecciona un registro para ver sus datos y su relación con la selección del mapa.';
 $('catalog-query').disabled=true;$('catalog-selected-export').disabled=true;
 if(geoMap)geoMap.closePopup();resizeLab();
 if(saved?.center&&geoMap)geoMap.setView(saved.center,saved.zoom,{animate:false});else fit();
 renderHistoryExplorer();return refresh();
}

function toggleHistoryExplorer(){
 if(document.body.classList.contains('history-open')&&historyReturnState){exitHistoricalView();return;}
 document.body.classList.toggle('history-open');if(document.body.classList.contains('history-open'))renderHistoryExplorer();resizeLab();
}
function renderHistoryExplorer(){
 const records=historyFiltered().sort((a,b)=>b.fecha_inicio.localeCompare(a.fecha_inicio));
 $('history-results').innerHTML=records.map(r=>'<button class="history-event '+(r===selectedRecord?'active':'')+'" data-history-record="'+esc(r.id)+'"><b>'+esc(r.nombre_incendio)+'</b><span>'+esc(r.comuna_principal)+' · '+esc(r.id)+' · '+esc(catLabel(r.categoria))+'</span><time>'+esc(eventDates(r))+'</time></button>').join('');
 $('history-result-count').textContent=records.length+' Registros · '+new Set(records.map(r=>r.id_evento_dato_c)).size+' IDs de Origen';
}
async function focusHistoricalRecord(r){
 const serial=++historyFocusSerial;stopTime();if($('tool-dialog').open)$('tool-dialog').close();
 if(candidateMode)leaveRecord(false);
 selectedRecord=r;$('catalog-visible').checked=true;$('grid').checked=true;$('points').checked=true;
 await enterRecord();if(serial!==historyFocusSerial)return;
 if(hasEventPoint(r)){
  const z=Number($('size').value)*1000,[x,y]=project(r.lon,r.lat),col=Math.floor(x/z),row=Math.floor(y/z);
  selectedSpatialKey=col+'/'+row;selectedDetection=null;
  selectedHistoricalCell={col,row,points:0,m:new Set(),v:new Set(),common:0,union:0,maxFRP:null,platformCounts:{MODIS:0,SNPP:0,JPSS1:0}};
 }else{selectedSpatialKey=null;selectedHistoricalCell=null;selectedDetection=null;}
 eventCard(r);renderHistoryExplorer();drawGeo();
}
function setupExplorer(){
 $('workspace').insertAdjacentHTML('afterbegin','<aside id="history-explorer"><div class="selection-heading"><h2>Grandes Incendios</h2><button id="close-history">✕</button></div><p>Selecciona un incendio para ver su ficha y fuente. Sin coordenadas, se encuadra la comuna sin inventar un punto ni una celda.</p><label>Buscar Comuna o Registro<input type="search" id="history-search" placeholder="Purén, ARA-2023…"></label><div class="controls"><label>Año<select id="history-year"><option value="all">Todos</option></select></label><label>Comuna<select id="history-commune"><option value="all">Todas</option></select></label></div><label>Tipo<select id="history-category"><option value="all">Todos</option><option value="catastrofico">Catastrófico</option><option value="muy_grande">Muy Grande</option><option value="grande">Grande</option><option value="significativo">Significativo</option></select></label><p id="history-result-count"></p><div id="history-results"></div><details><summary>Catálogo completo e importación</summary><div id="history-extra"></div></details></aside>');
 const years=[...new Set(E.records.map(eventYear).filter(Boolean))].sort().reverse();
 $('history-category').innerHTML='<option value="all">Todos</option>'+[...new Set(E.records.map(r=>r.categoria))].map(c=>'<option value="'+esc(c)+'">'+esc(c)+'</option>').join('');
 $('history-year').insertAdjacentHTML('beforeend',years.map(y=>'<option>'+y+'</option>').join(''));
 $('history-commune').insertAdjacentHTML('beforeend',C.shapes.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(s=>'<option value="'+s.code+'">'+esc(titleCase(s.name))+'</option>').join(''));
 for(const id of ['history-year','history-commune','history-category','history-search'])$(id).oninput=()=>{renderHistoryExplorer();if(historyMode()){stopTime();rebuildHistoryTicks();}};
 $('close-history').onclick=toggleHistoryExplorer;
 $('history-results').onclick=e=>{const b=e.target.closest('[data-history-record]');if(!b)return;const r=E.records.find(r=>r.id===b.dataset.historyRecord);if(historyMode()){stopTime();const i=historyTicks.indexOf(r);if(i>=0)applyHistoryTick(i);}else selectRecord(r);};
 $('right-panel').insertAdjacentHTML('afterbegin','<section id="selection-card" hidden></section>');
 const historyPanel=$('catalog-panel'),importPanel=$('historical').closest('section');$('history-extra').append(historyPanel,importPanel);
 renderHistoryExplorer();
}

let selectedSpatialKey=null,selectedDetection=null,geoFrame=null;
const cellGeometryCache=new WeakMap();
const geographicShapes=C.shapes.map(s=>({...s,polygons:s.polygons.map(p=>p.map(r=>r.map(c=>inverseProject(...c))))}));
let geoMap=null,geoCanvas=null,geoCtx=null,geoLayer=null,timer=null,ticks=[];
function setupLab(){
 document.body.classList.add('right-closed');if(innerWidth<760)document.body.classList.add('left-closed');
 document.body.insertAdjacentHTML('afterbegin','<nav class="topbar"><div class="brand"><b>UFRO<span>MAKERS</span></b><strong>AYLEN</strong><small>Laboratorio de focos satelitales</small></div><div id="period-badge"></div><button id="left-toggle" aria-label="Mostrar u ocultar filtros">☰ Capas</button><button data-tool="science">Evaluación</button><button data-tool="history">Grandes Incendios</button><button data-tool="data">Datos</button><button id="right-toggle">Resumen ◧</button></nav><div id="workspace"><aside id="left-panel"><h2>Capas y filtros</h2></aside><section id="map-stage"><div id="geographic"></div><div class="map-label"><b>LA ARAUCANÍA</b><span id="base-status">Vista local · sin imágenes</span></div><div id="map-tools"></div><div class="legend"><i style="background:#ff9c56"></i> MODIS <i style="background:#5ecdf4"></i> S-NPP <i style="background:#df96fc"></i> NOAA-20 <i style="background:#ffe080"></i> Catálogo</div><div class="basenote">Blue Marble: NASA Earth Observatory · NASA GIBS / ESDIS</div></section><aside id="right-panel"><h2>Lectura del territorio</h2><div id="live-stats"></div><h3>Selección en el mapa</h3></aside></div><section id="timeline"><button id="time-toggle">⌄ Tiempo</button><button id="previous" aria-label="Período anterior">◀</button><button id="play">Reproducir</button><button id="pause">Pausa</button><button id="next" aria-label="Período siguiente">▶</button><label>Paso<select id="time-unit"><option value="month">Mes</option><option value="day">Día</option><option value="year">Año</option></select></label><label>Velocidad<select id="speed"><option>1</option><option>2</option><option>3</option><option>5</option></select></label><output id="time-label"></output><input id="time-slider" aria-label="Explorar fecha" type="range" min="0"><small>Fechas de detecciones · no representa propagación del fuego</small></section><dialog id="tool-dialog"><div class="dialog-head"><h2 id="tool-title"></h2><button id="close-tool">Cerrar ✕</button></div><div id="tool-body"></div></dialog>');
 const panels=[...document.querySelectorAll('main>section')],mapPanel=panels[1],left=$('left-panel'),right=$('right-panel'),stage=$('map-stage');
 left.append(panels[0]);
 right.append(mapPanel.querySelector('.metrics'),$('formula'),$('detail'),mapPanel.querySelector('details'));
 $('map-tools').append(mapPanel.querySelector('.actions'));
 stage.append(canvas);
 for(const p of mapPanel.querySelectorAll('p.muted'))right.append(p);
 for(const id of ['availability','status','record-mode','leave-record'])left.append($(id));
 left.insertAdjacentHTML('beforeend','<div class="checks"><label><input id="boundaries" type="checkbox" checked>Límites comunales</label><label><input id="imagery" type="checkbox" checked>Fondo de internet</label><label><input id="imported-visible" type="checkbox" checked>Capa histórica importada</label></div>');
 const holding=document.createElement('div');holding.hidden=true;document.body.append(holding);
 const tools={science:[panels[3]],history:[panels[2],panels[4]],data:[panels[5]]};
 tools.data[0].insertAdjacentHTML('beforeend','<h3>Importar CSV FIRMS</h3><p>Inicia una sesión con archivos propios. Se conservan los límites de La Araucanía. Los originales incorporados no se sobrescriben. El inventario de abajo identifica esta versión preparada.</p><label>Plataforma<select id="csv-platform"><option value="MODIS">MODIS</option><option value="SNPP">VIIRS S-NPP</option><option value="JPSS1">VIIRS NOAA-20 / JPSS-1</option></select></label><input id="csv-upload" type="file" accept=".csv" multiple><button id="csv-reset">Volver a datos incorporados (recarga)</button><p id="csv-status"></p>');
 for(const list of Object.values(tools))for(const p of list)holding.append(p);
 document.querySelector('header').hidden=true;document.querySelector('main').hidden=true;document.querySelector('footer').hidden=true;
 document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>{if(b.dataset.tool==='history'){toggleHistoryExplorer();return;}for(const p of [...$('tool-body').children])holding.append(p);$('tool-title').textContent=b.dataset.tool==='science'?'Evaluación':'Datos';for(const p of tools[b.dataset.tool])$('tool-body').append(p);$('tool-dialog').showModal();});
 $('close-tool').onclick=()=>$('tool-dialog').close();
 for(const side of ['left','right'])$(side+'-toggle').onclick=()=>{document.body.classList.toggle(side+'-closed');resizeLab();};
 $('time-toggle').onclick=()=>{document.body.classList.toggle('time-closed');resizeLab();};
 $('csv-upload').onchange=importCSV;$('csv-reset').onclick=()=>location.reload();
 $('boundaries').onchange=draw;$('imported-visible').onchange=draw;
 $('imagery').onchange=()=>{if(geoMap&&geoLayer){$('imagery').checked?geoLayer.addTo(geoMap):geoMap.removeLayer(geoLayer);$('base-status').textContent=$('imagery').checked?'Solicitando imágenes…':'Vista local · imágenes desactivadas';}};
 $('time-unit').onchange=()=>{stopTime();buildTicks();};$('time-slider').oninput=()=>applyTick(Number($('time-slider').value));
 $('previous').onclick=()=>stepTime(-1);$('next').onclick=()=>stepTime(1);
 $('pause').onclick=stopTime;$('play').onclick=()=>{stopTime();$('play').setAttribute('aria-pressed','true');timer=setInterval(()=>{if(!busy)stepTime(1);},(historyMode()?4200:1800)/Number($('speed').value));};
 $('speed').onchange=()=>{if(timer)$('play').click();};
 if(window.L){
 geoMap=L.map('geographic',{scrollWheelZoom:false,zoomControl:false,zoomSnap:.25,zoomDelta:.25,wheelPxPerZoomLevel:360,wheelDebounceTime:120,doubleClickZoom:false,zoomAnimation:false,fadeAnimation:false,markerZoomAnimation:false,preferCanvas:true,minZoom:7,maxZoom:14,maxBounds:[[-41,-76],[-35,-68]],maxBoundsViscosity:1}).setView([-38.7397,-72.5984],8.5);window.HL_MAP=geoMap;
 changeBase();
 geoCanvas=document.createElement('canvas');geoCanvas.className='geo-data';geoMap.getPanes().overlayPane.append(geoCanvas);geoCtx=geoCanvas.getContext('2d');canvas.hidden=true;
 let wheelPending=null,wheelDelta=0,wheelAnchor=null;
 $('geographic').addEventListener('wheel',event=>{event.preventDefault();wheelDelta+=event.deltaY;wheelAnchor=geoMap.mouseEventToContainerPoint(event);if(wheelPending!==null)return;wheelPending=setTimeout(()=>{wheelPending=null;const delta=wheelDelta;wheelDelta=0;if(Math.abs(delta)<8)return;const next=Math.max(7,Math.min(14,geoMap.getZoom()+(delta>0?-.5:.5)));geoMap.setZoomAround(wheelAnchor,next,{animate:false});},110);},{passive:false});
 geoMap.on('move zoom resize moveend zoomend',drawGeo);geoMap.on('click',selectGeo);
 $('zoom-in').onclick=()=>geoMap.zoomIn(.5);$('zoom-out').onclick=()=>geoMap.zoomOut(.5);$('reset').onclick=()=>historyReturnState?exitHistoricalView():geoMap.setView([-38.7397,-72.5984],8.5);
 }else $('base-status').textContent='Mapa local sin conexión · controles disponibles';
 window.addEventListener('resize',resizeLab);
}
function resizeLab(){if(geoMap)geoMap.invalidateSize();draw();}
function stopTime(){clearInterval(timer);timer=null;$('play').setAttribute('aria-pressed','false');}
function buildTicks(){
 const u=$('time-unit').value;
 if(historyMode()){rebuildHistoryTicks();return;}

 ticks=u==='month'?[...M.meses]:u==='year'?[...new Set(M.meses.map(m=>m.slice(0,4)))]:M.meses.flatMap(m=>Array.from({length:new Date(Number(m.slice(0,4)),Number(m.slice(5)),0).getDate()},(_,i)=>m+'-'+String(i+1).padStart(2,'0')));
 $('time-slider').max=ticks.length-1;syncTime();
}
function syncTime(){
 const y=$('year').value,m=$('month').value,d=$('day').value,txt=y+(m!=='all'?'-'+m:' · todos los meses')+(d!=='all'?'-'+d:'');
 $('period-badge').textContent=txt;$('time-label').textContent=candidateMode?candidateMode.fecha_inicio+' → '+candidateMode.fecha_fin:txt;
 if(historyMode()&&!candidateMode){const r=historyTicks[historyIndex];if(r){$('time-slider').value=historyIndex;$('time-label').textContent=r.fecha_inicio+' → '+r.fecha_fin;}return;}
 const key=$('time-unit').value==='year'?y:$('time-unit').value==='day'?y+'-'+m+'-'+d:y+'-'+m;const i=ticks.indexOf(key);if(i>=0)$('time-slider').value=i;
}
async function applyTick(i){
 if(candidateMode){stopTime();return;}
 if(historyMode())return applyHistoryTick(i);
 const t=ticks[i];if(!t)return;invalidateAnalysis();$('year').value=t.slice(0,4);$('month').value=t.length>=7?t.slice(5,7):'all';updateDayOptions();$('day').value=t.length===10?t.slice(8):'all';await refresh();
}
function stepTime(delta){let i=(historyMode()?Math.max(0,historyIndex):Number($('time-slider').value))+delta;if(i>=ticks.length){stopTime();return;}applyTick(Math.max(0,i));}
function extraStats(){
 syncTime();$('history-playing-status').textContent=$('time-mode').value==='history'?historyStatus:'Vista de detecciones satelitales';const n=Object.fromEntries(platforms.map(p=>[p,chosen.filter(r=>r[3]===p).length]));
 const communes=new Map();for(const r of chosen)communes.set(r[4],(communes.get(r[4])||0)+1);
 $('live-stats').innerHTML=platforms.map(p=>'<div class="sensor-stat"><i style="background:'+colors[p]+'"></i><span>'+p+'</span><b>'+fmt.format(n[p])+'</b><progress max="'+Math.max(1,chosen.length)+'" value="'+n[p]+'"></progress></div>').join('')+'<p>'+fmt.format(cells.size)+' celdas con detecciones</p><h3>Comunas · detecciones</h3>'+[...communes].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([c,n])=>'<div class="rank"><span>'+esc(names[c])+'</span><b>'+fmt.format(n)+'</b></div>').join('');
}
function drawGeo(){if(geoFrame!==null)return;geoFrame=requestAnimationFrame(()=>{geoFrame=null;drawGeoNow();});}
// Geometría en píxeles "mundo" de un zoom fijo (REF). Para cualquier zoom z:
//   pantalla = mundo·k + o,   k = 2^(z−REF),   o = desplazamiento del encuadre actual.
// Así, al arrastrar o hacer zoom solo cambian k y o: no se reproyectan 24 000 vértices ni miles de puntos por frame.
const REF_ZOOM=10;
let shapePath=null,cellPaths={key:null,ref:null,byColor:null,outline:null},pointCache={ref:null,xy:null};
function worldXY(lon,lat){const p=geoMap.project([lat,lon],REF_ZOOM);return [p.x,p.y];}
function geoTransform(){
 const k=2**(geoMap.getZoom()-REF_ZOOM),ll=geoMap.getCenter(),c=geoMap.latLngToContainerPoint(ll),[wx,wy]=worldXY(ll.lng,ll.lat);
 return {k,ox:c.x-wx*k,oy:c.y-wy*k};
}
function ringsToPath(path,rings){for(const ring of rings){ring.forEach((c,i)=>{const [x,y]=worldXY(c[0],c[1]);i?path.lineTo(x,y):path.moveTo(x,y);});path.closePath();}}
function getShapePath(){
 if(!shapePath){shapePath=new Path2D();for(const sh of geographicShapes)for(const poly of sh.polygons)ringsToPath(shapePath,poly);}
 return shapePath;
}
function getCellPaths(){
 const key=$('cell-metric').value+'/'+$('size').value;
 if(cellPaths.ref===cells&&cellPaths.key===key)return cellPaths;
 const z=Number($('size').value)*1000,byColor=new Map(),outline=new Path2D();
 for(const c of cells.values()){
  if(!cellGeometryCache.has(c)){const x=c.col*z,y=c.row*z;cellGeometryCache.set(c,[[x,y],[x+z,y],[x+z,y+z],[x,y+z]].map(p=>inverseProject(...p)));}
  const color=cellColor(c);if(!byColor.has(color))byColor.set(color,new Path2D());
  const ring=[cellGeometryCache.get(c)];ringsToPath(byColor.get(color),ring);ringsToPath(outline,ring);
 }
 return cellPaths={key,ref:cells,byColor,outline};
}
function getPointXY(){
 if(pointCache.ref!==chosen){const xy=new Float64Array(chosen.length*2);chosen.forEach((r,i)=>{const [x,y]=worldXY(r[0],r[1]);xy[2*i]=x;xy[2*i+1]=y;});pointCache={ref:chosen,xy};}
 return pointCache.xy;
}
function nearestDetection(cp,maxPx){
 const {k,ox,oy}=geoTransform(),xy=getPointXY();let best=null,min=maxPx*maxPx;
 for(let i=0;i<chosen.length;i++){const dx=xy[2*i]*k+ox-cp.x,dy=xy[2*i+1]*k+oy-cp.y,d=dx*dx+dy*dy;if(d<min){min=d;best=chosen[i];}}
 return best;
}
function drawGeoNow(){
 if(!geoMap||!geoCanvas)return;
 const s=geoMap.getSize(),ratio=Math.min(devicePixelRatio||1,2);L.DomUtil.setPosition(geoCanvas,geoMap.containerPointToLayerPoint([0,0]));if(geoCanvas.width!==Math.round(s.x*ratio)||geoCanvas.height!==Math.round(s.y*ratio)){geoCanvas.width=Math.round(s.x*ratio);geoCanvas.height=Math.round(s.y*ratio);geoCanvas.style.width=s.x+'px';geoCanvas.style.height=s.y+'px';}
 const g=geoCtx,pt=(lon,lat)=>geoMap.latLngToContainerPoint([lat,lon]),{k,ox,oy}=geoTransform();
 g.setTransform(ratio,0,0,ratio,0,0);g.clearRect(0,0,s.x,s.y);
 const world=()=>g.setTransform(ratio*k,0,0,ratio*k,ratio*ox,ratio*oy),screen=()=>g.setTransform(ratio,0,0,ratio,0,0);
 function path(ring,projected=false){g.beginPath();ring.forEach((c,i)=>{const p=pt(...(projected?inverseProject(...c):c));i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y);});g.closePath();}
 if($('outside-fade').checked){g.fillStyle='#07132299';g.fillRect(0,0,s.x,s.y);world();g.globalCompositeOperation='destination-out';g.fillStyle='#000';g.fill(getShapePath());g.globalCompositeOperation='source-over';screen();}   // velo fuera de la región: se pinta todo y se recorta la región, sin reproyectar
 if($('boundaries').checked){world();g.strokeStyle='#bfd9d8';g.lineWidth=.8/k;g.stroke(getShapePath());screen();}
 if($('grid').checked&&cells.size){const cp=getCellPaths();world();for(const [color,p] of cp.byColor){g.fillStyle=color+'b8';g.fill(p);}g.strokeStyle='#d1d57588';g.lineWidth=.6/k;g.stroke(cp.outline);screen();}
 const cellSize=Number($('size').value)*1000,selectedCell=cells.get(selectedSpatialKey)||selectedHistoricalCell;
 if(selectedCell){const x=selectedCell.col*cellSize,y=selectedCell.row*cellSize;path([[x,y],[x+cellSize,y],[x+cellSize,y+cellSize],[x,y+cellSize]],true);g.fillStyle='#fff7b533';g.fill();g.strokeStyle='#ffffff';g.lineWidth=3;g.stroke();}
 if($('points').checked){
  const xy=getPointXY(),r=3.5,many=chosen.length>20000;g.beginPath();
  for(let i=0;i<chosen.length;i++){const x=xy[2*i]*k+ox,y=xy[2*i+1]*k+oy;if(x<-r||y<-r||x>s.x+r||y>s.y+r)continue;
   if(many)g.rect(x-2.5,y-2.5,5,5);else{g.moveTo(x+r,y);g.arc(x,y,r,0,Math.PI*2);}}   // con miles de puntos, cuadrados de 5 px: se ven igual y se dibujan varias veces más rápido
  g.fillStyle='#ff3434';g.globalAlpha=.92;g.fill();g.globalAlpha=1;
 }
 if(selectedCell?.recs?.length){g.beginPath();for(const rec of selectedCell.recs){const q=pt(rec[0],rec[1]);g.moveTo(q.x+5,q.y);g.arc(q.x,q.y,5,0,Math.PI*2);}g.fillStyle='#ff3434';g.fill();g.strokeStyle='#fff';g.lineWidth=1.5;g.stroke();}
 if(selectedDetection){const q=pt(selectedDetection[0],selectedDetection[1]);g.beginPath();g.arc(q.x,q.y,8,0,Math.PI*2);g.strokeStyle='#fff';g.lineWidth=2;g.stroke();}
 if($('catalog-visible').checked)for(const r of visibleRecords){
 if(!hasEventPoint(r))continue;const p=pt(r.lon,r.lat);g.fillStyle='#ffe080';g.fillRect(p.x-4,p.y-4,8,8);if(Number.isFinite(r.lon_min)&&($('catalog-boxes').checked||r===selectedRecord)){path([[r.lon_min,r.lat_min],[r.lon_max,r.lat_min],[r.lon_max,r.lat_max],[r.lon_min,r.lat_max]]);g.strokeStyle='#ffe080';g.setLineDash([6,4]);g.stroke();g.setLineDash([]);}}
 drawCommuneLabels(g,pt);
 if($('imported-visible').checked)for(const f of historical){const p=f.properties||{};if(p.fecha_inicio&&!periodMonths.some(m=>{const d=$('day').value;return d==='all'?(p.fecha_fin||p.fecha_inicio)>=m+'-01'&&p.fecha_inicio<=m+'-31':validDate(m+'-'+d)&&m+'-'+d>=p.fecha_inicio&&m+'-'+d<=(p.fecha_fin||p.fecha_inicio);}))continue;g.strokeStyle='#fff0a1';g.lineWidth=2;const a=f.geometry;if(a.type==='Point'){const q=pt(...a.coordinates);g.strokeRect(q.x-6,q.y-6,12,12);}else for(const poly of a.type==='Polygon'?[a.coordinates]:a.coordinates)for(const ring of poly){path(ring);g.stroke();}}
}


function popupDetails(r,c,text){
 if(!r)return '<strong>Celda seleccionada</strong><p>'+esc(text)+'</p>';
 const sensor={MODIS:'MODIS',SNPP:'VIIRS S-NPP',JPSS1:'VIIRS NOAA-20 / JPSS-1'}[r[3]];
 const values=[['Sensor',sensor],['Satélite (archivo)',r[15]],['Comuna',names[r[4]]],['Latitud',r[1]],['Longitud',r[0]],['Fecha UTC',new Date(r[2]).toISOString()],['FRP',(r[7]??'Sin dato')+' MW']];
 return '<strong>Detección seleccionada</strong><dl class="point-attributes">'+values.map(([label,value])=>'<dt>'+esc(label)+'</dt><dd>'+esc(value)+'</dd>').join('')+'</dl>'+(c?'<hr><strong>Celda '+esc(c.col+'/'+c.row)+' · '+$('size').value+' km</strong><p>'+esc(cellDetail(c))+'</p>':'');
}

function selectGeo(e){
 if(busy)return;let best=null,dist=22;
 if($('points').checked||selectedSpatialKey)best=nearestDetection(e.containerPoint,dist);
 if(!best&&$('catalog-visible').checked){const record=visibleRecords.find(r=>hasEventPoint(r)&&geoMap.latLngToContainerPoint([r.lat,r.lon]).distanceTo(e.containerPoint)<10);if(record){selectRecord(record);return;}}
 const pos=best?project(best[0],best[1]):project(e.latlng.lng,e.latlng.lat),z=Number($('size').value)*1000,key=Math.floor(pos[0]/z)+'/'+Math.floor(pos[1]/z),cell=cells.get(key);
 selectedHistoricalCell=null;selectedSpatialKey=cell?key:null;selectedDetection=best;
 let text=cell?cellDetail(cell):'Sin detecciones seleccionadas aquí. No confirma ausencia de fuego.';
 if(best){const labels={MODIS:'MODIS',SNPP:'VIIRS S-NPP',JPSS1:'VIIRS NOAA-20 / JPSS-1'};text='Detección seleccionada: '+labels[best[3]]+' · satélite '+best[15]+' · comuna '+names[best[4]]+' · latitud '+best[1]+' · longitud '+best[0]+' · UTC '+new Date(best[2]).toISOString()+' · día local '+best[14]+' · FRP '+(best[7]??'sin dato')+' MW · confianza '+best[5]+' · tipo '+(best[6]??'sin dato')+'. '+text;}
 $('detail').textContent=text;drawGeo();
 if(best){if(cell)showSelectionCard(popupDetails(null,cell,cellDetail(cell)));geoMap.closePopup();L.popup({maxWidth:330,maxHeight:260,autoPan:true,autoPanPadding:[25,30],className:'point-popup'}).setLatLng([best[1],best[0]]).setContent(pointPopupOnly(best)).openOn(geoMap);}else{geoMap.closePopup();showSelectionCard(popupDetails(null,cell,text));geoMap.panTo(e.latlng,{animate:false});}
}


function pointPopupOnly(r){
 const labels={MODIS:'MODIS',SNPP:'VIIRS S-NPP',JPSS1:'VIIRS NOAA-20 / JPSS-1'};
 const values=[['Sensor',labels[r[3]]],['Satélite',r[15]],['Comuna',names[r[4]]],['Latitud',r[1]],['Longitud',r[0]],['Fecha UTC',new Date(r[2]).toISOString()],['FRP',(r[7]??'Sin dato')+' MW']];
 return '<strong>Punto seleccionado</strong><dl class="point-attributes">'+values.map(([k,v])=>'<dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd>').join('')+'</dl><small>El borde blanco identifica su celda y las detecciones que contiene.</small>';
}
const atlasColumns=['fecha_local','hora_local','satelite_id','sensor','pasada','id_pasada','estado_asignacion','adquisicion_utc','comuna','latitude','longitude','brightness','bright_t31','bright_ti4','bright_ti5','scan','track','acq_date','acq_time','satellite','instrument','confidence','version','frp','daynight','type','procesamiento','fuente','url_fuente'];
const localClock=new Intl.DateTimeFormat('es-CL',{timeZone:'America/Santiago',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
let exportRows=[],exportEvents=[],exportSerial=0;
function csvText(header,rows){return '\uFEFF'+[header,...rows].map(r=>r.map(csvValue).join(',')).join('\r\n');}
function exportSlug(){const code=$('download-commune').value,zone=code==='all'?'la-araucania':names[code];return zone.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-')+'_'+$('download-from').value+'_a_'+$('download-to').value+($('download-kind').value!=='history'&&$('download-box').checked&&candidateMode?'_candidatos-'+candidateMode.id:'');}
function atlasValues(r){
 const f=M.archivos[r[13]],utc=new Date(r[2]).toISOString(),modis=r[3]==='MODIS';
 const sat=r[3]==='SNPP'?'Suomi NPP':r[3]==='JPSS1'?'NOAA-20':r[15],sensor=modis?'MODIS':'VIIRS';
 return [r[14],localClock.format(new Date(r[2])),sat,sensor,'','','No asignada: sin cruce CMR',utc,names[r[4]],r[1],r[0],modis?r[10]:'',modis?r[11]:'',modis?'':r[10],modis?'':r[11],r[8],r[9],utc.slice(0,10),utc.slice(11,16).replace(':',''),r[15],sensor,r[5],f.versiones.join(';'),r[7],r[12],r[6],'Archivo local preparado',f.nombre,''];
}
function openDownloads(kind='points'){
 const first=periodMonths[0]||M.meses[0],last=periodMonths.at(-1)||M.meses.at(-1),day=$('day').value;
 $('download-kind').value=kind;
 $('download-from').value=candidateMode?candidateMode.fecha_inicio:day!=='all'&&periodMonths.length===1?first+'-'+day:first+'-01';
 $('download-to').value=candidateMode?candidateMode.fecha_fin:day!=='all'&&periodMonths.length===1?first+'-'+day:last+'-'+new Date(Number(last.slice(0,4)),Number(last.slice(5)),0).getDate();
 $('download-commune').value=$('zone').value;
 $('download-box-label').hidden=!candidateMode;$('download-box').checked=!!candidateMode;
 $('download-dialog').showModal();previewDownload();
}
async function previewDownload(){
 const serial=++exportSerial;exportRows=[];exportEvents=[];$('download-run').disabled=true;$('download-sample').textContent='';$('download-status').textContent='';
 const start=$('download-from').value,end=$('download-to').value,zone=$('download-commune').value,kind=$('download-kind').value;
 if(!validDate(start)||!validDate(end)||start>end){$('download-preview').textContent='Elige fechas válidas: inicio igual o anterior al fin.';return;}
 const months=rangeMonths(start.slice(0,7),end.slice(0,7));
 if(months.length>400){$('download-preview').textContent='Elige un intervalo de hasta 400 meses.';return;}
 const ps=selectedPlatforms(),sources=new Set(ps),box=$('download-box').checked?candidateMode:null;
 $('download-filters').textContent='Fechas locales (America/Santiago), ambos extremos incluidos. La comuna se elige aquí. Sensores: '+(ps.join(', ')||'ninguno')+' · confianza: '+$('confidence').selectedOptions[0].textContent+' · tipo: '+$('type').selectedOptions[0].textContent+'. Las fechas y comuna de esta descarga no cambian el mapa.';
 if(kind==='history'){
 $('download-filters').textContent='Fechas locales inclusivas y comuna afectada. Los filtros de sensores y confianza no se aplican al catálogo de Grandes Incendios.';
 exportEvents=E.records.filter(r=>eventOverlaps(r,start,end)&&(zone==='all'||r.comuna_codes.includes(zone)));
 $('download-preview').textContent=exportEvents.length+' registros con fecha conocida en el intervalo. Fechas incompletas se conservan como tales; los registros sin fecha de inicio se excluyen de esta descarga temporal.';
 }else{
 $('download-preview').textContent='Preparando vista previa…';
 try{
 const list=(await Promise.all(months.map(loadMonth))).flat();if(serial!==exportSerial)return;
 const q=qualityFilter();exportRows=list.filter(r=>r[14]>=start&&r[14]<=end&&(zone==='all'||r[4]===zone)&&sources.has(r[3])&&q(r)&&(!box||r[0]>=box.lon_min&&r[0]<=box.lon_max&&r[1]>=box.lat_min&&r[1]<=box.lat_max));
 const missing=months.filter(m=>!ps.some(p=>sourceMonths[p].has(m)));
 $('download-preview').textContent=fmt.format(exportRows.length)+' detecciones para descargar'+(kind==='cells'?' como celdas de '+$('size').value+' km':' en CSV')+'. '+(missing.length?missing.length+' meses sin archivo de ninguna plataforma seleccionada. ':'')+'No se comprueba cobertura útil ni integridad mensual.';
 }catch(e){$('download-preview').textContent=e.message;return;}
 }
 if(serial!==exportSerial)return;$('download-run').disabled=kind==='history'?!exportEvents.length:!exportRows.length;
 $('download-format-label').hidden=kind!=='points';
 $('download-warning').textContent=kind==='points'?'CSV del atlas: las columnas pasada e id_pasada quedan vacías porque no se ha hecho un cruce CMR. Tampoco se inventa una URL de origen; fuente identifica el archivo local. Versiones disponibles por archivo.':kind==='cells'?'Cada polígono es una celda completa de análisis. No representa área quemada.':'Se conserva el catálogo del equipo, su ID de origen y los datos faltantes. Una ubicación representativa no es un perímetro.';
 $('download-sample').textContent=kind==='history'?exportEvents.slice(0,3).map(r=>r.id+' · '+r.comuna_principal+' · '+r.fecha_inicio+' a '+r.fecha_fin).join('\n'):exportRows.slice(0,3).map(r=>r[14]+' · '+names[r[4]]+' · '+r[3]+' · '+r[1]+', '+r[0]).join('\n');
}
function runDownload(){
 const kind=$('download-kind').value,slug=exportSlug();
 if(kind==='history'){const keys=E.meta.columnas;download('grandes-incendios_'+slug+'.csv',csvText(keys,exportEvents.map(r=>keys.map(k=>r.original[k]??''))),'text/csv;charset=utf-8');}
 else if(kind==='cells'){
 const size=Number($('size').value)*1000,groups=new Map();for(const r of exportRows){const [x,y]=xy(r),col=Math.floor(x/size),row=Math.floor(y/size),key=col+'/'+row;if(!groups.has(key))groups.set(key,{col,row,m:new Set(),v:new Set(),points:0,counts:{MODIS:0,SNPP:0,JPSS1:0},max:null});const c=groups.get(key);c[r[3]==='MODIS'?'m':'v'].add(r[14]);c.points++;c.counts[r[3]]++;if(r[7]!==null&&Number.isFinite(Number(r[7])))c.max=Math.max(c.max??0,Number(r[7]));}
 const features=[...groups.values()].map(c=>{const x=c.col*size,y=c.row*size,common=[...c.m].filter(d=>c.v.has(d)).length;return {type:'Feature',properties:{celda:c.col+'/'+c.row,lado_km:size/1000,detecciones:c.points,dias_celda:c.m.size+c.v.size-common,coincidencias_diarias:common,frp_max_observado_MW:c.max,modis:c.m.size,viirs:c.v.size,coincidencias:common,conteos_por_plataforma:c.counts,detecciones_modis:c.counts.MODIS,detecciones_viirs_snpp:c.counts.SNPP,detecciones_viirs_noaa20:c.counts.JPSS1,desde:$('download-from').value,hasta:$('download-to').value,comuna:$('download-commune').selectedOptions[0].textContent,nota:'Celda completa; no área quemada.'},geometry:{type:'Polygon',coordinates:[[[x,y],[x+size,y],[x+size,y+size],[x,y+size],[x,y]].map(p=>inverseProject(...p))]}};});
 download('celdas-'+$('size').value+'km_'+slug+'.geojson',JSON.stringify({type:'FeatureCollection',features}),'application/geo+json');
 }else if($('download-format').value==='atlas')download('focos-firms_'+slug+'.csv',csvText(atlasColumns,exportRows.map(atlasValues)),'text/csv;charset=utf-8');
 else{
 const header=['longitude','latitude','fecha_utc','fecha_local','plataforma','satellite','comuna_codigo','comuna','confidence','type','frp_MW','scan_km','track_km','brightness_4um_K','brightness_11um_K','daynight','archivo','version','consulta_candidatos_registro'];
 download('focos-tecnico_'+slug+'.csv',csvText(header,exportRows.map(r=>[r[0],r[1],new Date(r[2]).toISOString(),r[14],r[3],r[15],r[4],names[r[4]],r[5],r[6],r[7],r[8],r[9],r[10],r[11],r[12],M.archivos[r[13]].nombre,M.archivos[r[13]].versiones.join(';'),$('download-box').checked?candidateMode?.id||'':''])),'text/csv;charset=utf-8');
 }
 $('download-status').textContent='Descarga preparada: '+(kind==='history'?'grandes-incendios':kind==='cells'?'celdas':'focos')+' · '+slug;
}
function setupDownloads(){
 document.body.insertAdjacentHTML('beforeend','<dialog id="download-dialog"><div class="dialog-head"><h2>Descargar datos</h2><button id="download-close">Cerrar ✕</button></div><div class="download-content"><p>Elige qué necesitas, las fechas y la comuna. Revisa la cantidad antes de descargar.</p><label>Contenido<select id="download-kind"><option value="points">Focos satelitales · tabla CSV</option><option value="cells">Celdas integradas · mapa GeoJSON</option><option value="history">Grandes Incendios · tabla CSV</option></select></label><div class="controls"><label>Desde (incluido)<input id="download-from" type="date"></label><label>Hasta (incluido)<input id="download-to" type="date"></label></div><label>Comuna<select id="download-commune"><option value="all">Toda La Araucanía</option></select></label><label id="download-format-label">Formato de tabla<select id="download-format"><option value="atlas">CSV como focos-firms del atlas (recomendado)</option><option value="technical">CSV técnico anterior</option></select></label><label id="download-box-label"><input id="download-box" type="checkbox">Mantener la caja del registro seleccionado</label><p id="download-filters" class="muted"></p><p id="download-preview" class="notice" aria-live="polite"></p><pre id="download-sample"></pre><p id="download-warning" class="muted"></p><button id="download-run" disabled>Descargar archivo</button><button id="download-help">Descargar explicación de columnas</button><p id="download-status" role="status"></p></div></dialog>');
 $('download-commune').insertAdjacentHTML('beforeend',C.shapes.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(s=>'<option value="'+s.code+'">'+esc(s.name)+'</option>').join(''));
 for(const id of ['download-from','download-to','download-commune','download-kind','download-box'])$(id).onchange=previewDownload;
 $('download-close').onclick=()=>$('download-dialog').close();$('download-run').onclick=runDownload;
 $('download-help').onclick=()=>download('guia-columnas-y-filtros.txt','Fechas locales America/Santiago; adquisición UTC en adquisicion_utc y acq_date/acq_time. latitude/longitude en grados WGS84; frp en MW, temperaturas de brillo en kelvin, scan/track en km. Una fila es una detección, no un incendio. Comuna asignada con límites comunales. pasada/id_pasada no disponibles sin cruce CMR; url_fuente no disponible si el origen solo es un archivo local. fuente identifica ese archivo. La columna version reúne versiones presentes en ese archivo y no acredita versión por fila. Datos ausentes quedan vacíos. No se añadieron detecciones NOAA-21 del atlas al conjunto de datos del visor.','text/plain;charset=utf-8');
 $('export-points').onclick=()=>openDownloads('points');$('export-cells').onclick=()=>openDownloads('cells');$('catalog-export').onclick=()=>openDownloads('history');
 $('export-points').textContent='Descargar focos…';$('export-cells').textContent='Descargar celdas…';
 document.querySelector('.topbar').insertAdjacentHTML('beforeend','<button id="open-downloads">Descargas</button>');$('open-downloads').onclick=()=>openDownloads('points');
}


window.addEventListener('aylen:home',async()=>{
 stopTime();
 if(historyReturnState)await exitHistoricalView();
 else if(candidateMode){leaveRecord(false);selectedRecord=null;await refresh();}
 selectedSpatialKey=null;selectedDetection=null;selectedHistoricalCell=null;selectedRecord=null;
 document.body.classList.remove('history-open','left-closed');
 document.body.classList.add('right-closed');
 $('selection-card').replaceChildren();$('selection-card').hidden=true;
 if(geoMap)geoMap.closePopup();
 resizeLab();
 if(geoMap)geoMap.setView([-38.7397,-72.5984],8.5,{animate:false});else fit();
 draw();
});

window.AYLEN_cargarMeses=meses=>Promise.all(meses.map(loadMonth));
setupLab();setupNewControls();setupExplorer();initialize();buildTicks();setupDownloads();
})();
