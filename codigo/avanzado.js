/* AYLEN · vista "Avanzado" y ajustes de la barra superior.
   Se carga después de visor.js. No modifica el motor ni los datos.
   Unidad de análisis: días-celda de 2 km (una celda con una o más detecciones en un día local cuenta una vez).
   Dos períodos que no se mezclan:
     - Antes de VIIRS: 2001-01 a 2011-12, solo MODIS.
     - Con VIIRS: 2012-01 a 2025-12, unión de MODIS y VIIRS S-NPP. Enero de 2012 se muestra, pero no entra en la mediana:
       VIIRS empezó el día 20 de ese mes.
   Filtro fijo: tipo 0 (o sin clasificar), MODIS confianza >= 30, VIIRS nominal o alta. NOAA-20 no entra, para que la referencia no cambie en 2018.
   Parte de este archivo fue escrito con asistencia de IA (Claude). */
(function(){
"use strict";
const LOGO="data:image/png;base64,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";
const $=id=>document.getElementById(id);
const KM=2,SIZE=KM*1000;
const MES=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const MESL=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const ERAS=[{id:"pre",tag:"ANTES DE VIIRS",titulo:"2001–2011 · solo MODIS",desde:"2001-01",hasta:"2011-12",cls:"e1"},
            {id:"post",tag:"CON VIIRS",titulo:"2012–2025 · MODIS + VIIRS",desde:"2012-01",hasta:"2025-12",base:"2012-02",cls:"e2"}];
const nf=(x,d=0)=>x==null||!isFinite(x)?"–":new Intl.NumberFormat("es-CL",{maximumFractionDigits:d,minimumFractionDigits:d}).format(x);
const cuantil=(l,p)=>{if(!l.length)return null;const s=[...l].sort((a,b)=>a-b),i=(s.length-1)*p,lo=Math.floor(i);return s[lo]+(s[Math.ceil(i)]-s[lo])*(i-lo)};
const SUAVE=5;   // suavizado del color: evita que 0 frente a 2 días-celda parezca una gran anomalía
const eraDe=mes=>ERAS.find(e=>mes>=e.desde&&mes<=e.hasta)||null;

/* ---------- 1. Barra superior ---------- */
function barra(){
  const top=document.querySelector(".topbar");if(!top)return;
  if(new URLSearchParams(location.search).get('interno')!=='1')top.querySelectorAll('[data-tool="science"],[data-tool="data"]').forEach(b=>b.remove());
  const filtros=$("left-toggle");if(filtros){filtros.textContent="☰ Filtros";}
  const h2=document.querySelector("#left-panel>h2");if(h2)h2.textContent="Filtros";
  const brand=top.querySelector(".brand");
  if(brand){
 brand.innerHTML='<button type="button" class="aylen-home-logo" aria-label="Volver al mapa principal con filtros" title="Volver al mapa principal con filtros"><img src="'+LOGO+'" alt="UFRO Makers"></button><div><strong>AYLEN</strong><small>Actividad de fuego en La Araucanía · MODIS + VIIRS</small></div>';
 const home=()=>{document.querySelectorAll('dialog[open]').forEach(d=>d.close());vista("mapa");window.dispatchEvent(new Event('aylen:home'));};
 brand.querySelector('.aylen-home-logo').onclick=home;
 // El mismo logo queda accesible dentro de los menús modales.
 document.querySelectorAll('dialog .dialog-head').forEach(header=>{const button=brand.querySelector('.aylen-home-logo').cloneNode(true);button.onclick=home;header.prepend(button);});
 const style=document.createElement('style');style.textContent='.aylen-home-logo{padding:0!important;border:0!important;background:transparent!important;display:inline-flex;align-items:center;flex-shrink:0;border-radius:8px;cursor:pointer}.aylen-home-logo img{width:44px;height:44px;display:block;border-radius:8px}.aylen-home-logo:focus-visible{outline:2px solid #83e5ce;outline-offset:4px}.dialog-head .aylen-home-logo{margin-right:10px}';document.head.append(style);
}
  const ref=$("period-badge")||top.children[1];
  ref.insertAdjacentHTML("beforebegin",'<button id="ver-mapa" class="vista on">Mapa</button><button id="ver-avanzado" class="vista">Avanzado</button>');
  $("ver-mapa").onclick=()=>vista("mapa");$("ver-avanzado").onclick=()=>vista("avanzado");
  // Los botones propios del mapa devuelven primero a la vista de mapa.
  top.querySelectorAll("button:not(.vista)").forEach(b=>b.addEventListener("click",()=>{if(document.body.classList.contains("modo-avanzado"))vista("mapa");},true));
}
async function vista(cual){
  const av=cual==="avanzado";
  document.body.classList.toggle("modo-avanzado",av);
  $("ver-mapa").classList.toggle("on",!av);$("ver-avanzado").classList.toggle("on",av);
  if(!av){window.dispatchEvent(new Event("resize"));return;}
  if(!S.listo){
    $("av-barra").innerHTML='<span class="muted">Cargando los 25 años de detecciones…</span>';$("av-eras").innerHTML="";
    try{await window.AYLEN_cargarMeses(window.NASA_CATALOG.manifest.meses);}
    catch(e){$("av-barra").innerHTML='<span class="notice">'+e.message+'</span>';return;}
    await new Promise(r=>setTimeout(r));   // deja pintar el mensaje antes del cálculo
    if(!S.listo)preparar();
  }
  if(document.body.classList.contains("modo-avanzado"))pintar();
}

/* ---------- 2. Datos: días-celda por zona, mes y período ---------- */
const S={listo:false,zona:"all",herramienta:"anomalias",mes:"2023-02",temporada:{pre:2008,post:2022},zonas:{},graficos:[]};
function zonaVacia(){return {M:new Map(),V:new Map(),noche:{pre:[0,0],post:[0,0]},anios:{pre:new Map(),post:new Map()}};}
function preparar(){
  const proyectar=window.NASA_MODEL.projector();
  const Z={all:zonaVacia()};
  for(const mes of Object.keys(window.NASA_DATA)){
    const era=eraDe(mes);if(!era)continue;
    for(const r of window.NASA_DATA[mes]){
      const plat=r[3];if(plat==="JPSS1")continue;
      if(plat==="SNPP"&&era.id==="pre")continue;
      if(!(r[6]==="0"||r[6]===""||r[6]==null))continue;
      if(plat==="MODIS"?!(+r[5]>=30):!(r[5]==="n"||r[5]==="h"))continue;
      const p=proyectar(r[0],r[1]),c=Math.floor(p[0]/SIZE)+","+Math.floor(p[1]/SIZE),k=r[14]+"/"+c,anio=+mes.slice(0,4);
      for(const zid of ["all",r[4]]){
        const z=Z[zid]||(Z[zid]=zonaVacia());
        const mapa=plat==="MODIS"?z.M:z.V;let set=mapa.get(mes);if(!set)mapa.set(mes,set=new Set());set.add(k);
        z.noche[era.id][r[12]==="N"?0:1]++;
        let ya=z.anios[era.id].get(c);if(!ya)z.anios[era.id].set(c,ya=new Set());ya.add(anio);
      }
    }
  }
  for(const zid in Z){
    const z=Z[zid];z.series={};
    for(const era of ERAS){
      const lista=[];
      for(let y=+era.desde.slice(0,4);y<=+era.hasta.slice(0,4);y++)for(let m=1;m<=12;m++){
        const mes=y+"-"+String(m).padStart(2,"0");if(mes<era.desde||mes>era.hasta)continue;
        const a=z.M.get(mes),b=z.V.get(mes);let v=a?a.size:0;
        if(era.id==="post"&&b){v=b.size;if(a)for(const k of a)if(!b.has(k))v++;}
        lista.push({mes,v});
      }
      const base=era.id==="pre"?"2003-01":(era.base||era.desde);   // 2001 y la primera mitad de 2002 solo tienen Terra
      const clima=Array.from({length:12},(_,i)=>{const l=lista.filter(x=>+x.mes.slice(5)-1===i&&x.mes>=base).map(x=>x.v);return {med:cuantil(l,.5),p10:cuantil(l,.1),p90:cuantil(l,.9),n:l.length};});
      z.series[era.id]={lista,clima};
    }
  }
  S.zonas=Z;S.listo=true;
}
const serie=era=>(S.zonas[S.zona]||S.zonas.all).series[era];
function nivel(v,med){
  if(med==null||med<5)return {txt:"Poca actividad habitual",cls:"gris",r:null};
  const r=v/med;
  return r>=3?{txt:"Muy por sobre lo habitual",cls:"rojo",r}:r>=1.5?{txt:"Sobre lo habitual",cls:"ambar",r}:r<=.67?{txt:"Bajo lo habitual",cls:"azul",r}:{txt:"Dentro de lo habitual",cls:"verde",r};
}

/* ---------- 3. Estructura de la vista ---------- */
const HERR=[["anomalias","Calendario de anomalías"],["ficha","Ficha del mes"],["temporada","Temporada y período crítico"],["territorio","Patrones del territorio"]];
function montar(){
  const css=document.createElement("style");css.textContent=`
  .brand{display:flex!important;align-items:center;gap:12px}.brand img{height:44px;border-radius:8px}.brand div{display:grid}.brand strong{font-size:17px;letter-spacing:1px}.brand small{color:#93abba;font-size:11px;letter-spacing:0}
  .topbar .vista.on{background:#5fd4b8;color:#0b1721;font-weight:700;border-color:#5fd4b8}
  #avanzado{display:none;height:calc(100dvh - 66px);background:#0f1f2b}
  .modo-avanzado #workspace,.modo-avanzado #timeline{display:none!important}.modo-avanzado #avanzado{display:flex}
  #av-menu{width:240px;flex-shrink:0;border-right:1px solid #30434e;padding:18px 14px;overflow:auto}
  #av-menu h3{margin:0 0 8px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#9db4bf}
  #av-menu button.h{display:block;width:100%;text-align:left;background:none;border:0;border-left:3px solid transparent;border-radius:8px;padding:11px 12px;margin-bottom:6px;font-size:14px;color:#dce8ec}
  #av-menu button.h:hover{background:#17303f}#av-menu button.h.on{background:#1c3a4b;border-left-color:#5fd4b8;font-weight:600}
  #av-menu .nota{font-size:11.5px;color:#9db4bf;line-height:1.5;margin-top:14px}
  #av-main{flex:1;min-width:0;padding:16px;overflow:auto;display:flex;flex-direction:column;gap:12px}
  #av-barra{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap}#av-barra label{margin:0;min-width:130px}#av-barra .sp{flex:1}
  #av-eras{flex:1;display:grid;grid-template-columns:11fr 14fr;gap:14px;min-height:600px}
  .av-card{background:#142a38;border:1px solid #244355;border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;min-width:0}
  .av-card h4{margin:6px 0 0;font-size:17px;color:#fff}.av-card .sub{font-size:12px;color:#9db4bf;margin-bottom:4px}
  .era{align-self:flex-start;font-size:11px;font-weight:700;padding:2px 9px;border-radius:10px;letter-spacing:.04em}.era.e1{background:#3b4f5c;color:#e6eef2}.era.e2{background:#1d4d3f;color:#c9f3e6}
  .av-ch{flex:1;min-height:300px}.av-big{font-size:34px;font-weight:700;color:#fff;line-height:1.1}
  .pill{display:inline-block;padding:2px 10px;border-radius:12px;font-weight:700;font-size:12.5px}
  .pill.rojo{background:#7a1f1f;color:#ffd9d2}.pill.ambar{background:#6b4d0d;color:#ffe9b0}.pill.verde{background:#1d4d3f;color:#c9f3e6}.pill.azul{background:#1f4a73;color:#d5e8fb}.pill.gris{background:#3b4f5c;color:#e6eef2}
  .av-card table{font-size:12.5px;font-variant-numeric:tabular-nums}.av-card td,.av-card th{padding:5px 5px;text-align:right;white-space:nowrap}.av-card td:first-child,.av-card th:first-child{text-align:left}
  .av-vacio{color:#9db4bf;padding:30px 6px;font-size:13px}
  @media(max-width:1000px){#av-eras{grid-template-columns:1fr}#av-menu{width:180px}}`;
  document.head.appendChild(css);
  const zonas=[...$("zone").options].map(o=>'<option value="'+o.value+'">'+o.textContent+"</option>").join("");
  const box=document.createElement("div");box.id="avanzado";
  box.innerHTML='<div id="av-menu"><h3>Herramientas</h3>'+HERR.map(h=>'<button class="h" data-h="'+h[0]+'">'+h[1]+"</button>").join("")+
    '<h3 style="margin-top:20px">Zona</h3><select id="av-zona">'+zonas+'</select>'+
    '<p class="nota">Unidad: días-celda de '+KM+' km. Una celda con una o más detecciones en un día cuenta una vez, sin importar cuántos focos ni qué sensor.</p>'+
    '<p class="nota">Los dos períodos no se comparan entre sí: cada mes se mide contra la mediana de ese mismo mes dentro de su período. Solo vegetación, confianza nominal o alta. VIIRS: S-NPP, que empezó el 20 de enero de 2012; ese mes se muestra pero no entra en la mediana.</p></div>'+
    '<div id="av-main"><div id="av-barra"></div><div id="av-eras"></div></div>';
  $("workspace").insertAdjacentElement("beforebegin",box);
  box.querySelectorAll("button.h").forEach(b=>b.onclick=()=>{S.herramienta=b.dataset.h;pintar();});
  $("av-zona").value=S.zona;$("av-zona").onchange=e=>{S.zona=e.target.value;pintar();};
  window.addEventListener("resize",()=>S.graficos.forEach(g=>g.resize()));
}
const EJE={axisLine:{lineStyle:{color:"#3a5a6c"}},axisLabel:{color:"#b9ccd4"},splitLine:{lineStyle:{color:"#1f3b4b"}}};
function grafico(el,op){const g=echarts.init(el);g.setOption(Object.assign({animation:false,textStyle:{fontFamily:"Inter,Segoe UI,system-ui,sans-serif"}},op));S.graficos.push(g);return g;}
function tarjetas(){
  $("av-eras").innerHTML=ERAS.map(e=>'<div class="av-card" id="card-'+e.id+'"><span class="era '+e.cls+'">'+e.tag+'</span><h4>'+e.titulo+'</h4><div class="sub" id="sub-'+e.id+'"></div><div class="cuerpo" id="cuerpo-'+e.id+'" style="flex:1;display:flex;flex-direction:column;min-height:0"></div></div>').join("");
}
function pintar(){
  if(!S.listo)return; // La selección de herramienta puede cambiar mientras se cargan los meses.
  S.graficos.forEach(g=>g.dispose());S.graficos=[];
  document.querySelectorAll("#av-menu button.h").forEach(b=>b.classList.toggle("on",b.dataset.h===S.herramienta));
  $("av-barra").innerHTML="";tarjetas();
  ({anomalias:pintarAnomalias,ficha:pintarFicha,temporada:pintarTemporada,territorio:pintarTerritorio})[S.herramienta]();
}
function irAlMapa(mes){
  const y=$("year"),m=$("month");y.value=mes.slice(0,4);y.dispatchEvent(new Event("change",{bubbles:true}));
  m.value=mes.slice(5);m.dispatchEvent(new Event("change",{bubbles:true}));
  if($("av-zona").value!==$("zone").value){$("zone").value=S.zona;$("zone").dispatchEvent(new Event("change",{bubbles:true}));}
  vista("mapa");
}

/* ---------- 4. Herramientas ---------- */
function pintarAnomalias(){
  $("av-barra").innerHTML='<span class="muted">Rojo: más actividad que la mediana de ese mes en su período; azul: menos. En los meses de poca actividad habitual, como junio y julio, las diferencias se muestran atenuadas. Haz clic en una casilla para abrir la ficha de ese mes.</span>';
  for(const era of ERAS){
    const s=serie(era.id),anios=[...new Set(s.lista.map(x=>x.mes.slice(0,4)))];
    $("sub-"+era.id).textContent="Cada mes frente a la mediana de ese mes en este mismo período";
    const el=document.createElement("div");el.className="av-ch";$("cuerpo-"+era.id).appendChild(el);
    const datos=s.lista.map(x=>{const i=+x.mes.slice(5)-1,med=s.clima[i].med||0;return {value:[i,anios.indexOf(x.mes.slice(0,4)),Math.log2((x.v+SUAVE)/(med+SUAVE))],x,med};});
    const g=grafico(el,{grid:{left:44,right:10,top:24,bottom:52},
      tooltip:{backgroundColor:"#10222c",borderColor:"#49616d",textStyle:{color:"#e4eef3"},formatter:p=>{const n=nivel(p.data.x.v,p.data.med);return "<b>"+MESL[+p.data.x.mes.slice(5)-1]+" "+p.data.x.mes.slice(0,4)+"</b><br>"+nf(p.data.x.v)+" días-celda<br>mediana del mes: "+nf(p.data.med)+(n.r==null?"<br>mes de poca actividad habitual":"<br>"+nf(n.r,1)+" veces lo habitual")+(p.data.x.mes==="2012-01"?"<br>VIIRS empezó el día 20 de este mes":"");}},
      xAxis:{type:"category",data:MES,position:"top",axisTick:{show:false},axisLine:{show:false},axisLabel:{color:"#b9ccd4"}},
      yAxis:{type:"category",data:anios,inverse:true,axisTick:{show:false},axisLine:{show:false},axisLabel:{color:"#b9ccd4"}},
      visualMap:{min:-2,max:2,dimension:2,orient:"horizontal",left:"center",bottom:0,itemWidth:11,itemHeight:200,text:["4× más","4× menos"],textStyle:{color:"#b9ccd4"},inRange:{color:["#2b6cb0","#6ea8d8","#c7dcec","#eef1f2","#f6c9b3","#e2745a","#b3261e"]}},
      series:[{type:"heatmap",data:datos,itemStyle:{borderColor:"#142a38",borderWidth:2,borderRadius:2},emphasis:{itemStyle:{borderColor:"#fff",borderWidth:2}}}]});
    g.on("click",p=>{if(p.data&&p.data.x){S.mes=p.data.x.mes;S.herramienta="ficha";pintar();}});
  }
}
function pintarFicha(){
  const era=eraDe(S.mes)||ERAS[1];if(!eraDe(S.mes))S.mes="2023-02";
  const anios=[];for(let y=2001;y<=2025;y++)anios.push(y);
  $("av-barra").innerHTML='<label>Mes<select id="f-mes">'+MESL.map((m,i)=>'<option value="'+String(i+1).padStart(2,"0")+'">'+m[0].toUpperCase()+m.slice(1)+"</option>").join("")+'</select></label><label>Año<select id="f-anio">'+anios.map(y=>"<option>"+y+"</option>").join("")+'</select></label><span class="sp"></span><button id="f-mapa">Ver este mes en el mapa</button>';
  $("f-mes").value=S.mes.slice(5);$("f-anio").value=S.mes.slice(0,4);
  const cambiar=()=>{const m=$("f-anio").value+"-"+$("f-mes").value;if(!eraDe(m)){$("f-anio").value=S.mes.slice(0,4);$("f-mes").value=S.mes.slice(5);return;}S.mes=m;pintar();};
  $("f-mes").onchange=cambiar;$("f-anio").onchange=cambiar;$("f-mapa").onclick=()=>irAlMapa(S.mes);
  const mi=+S.mes.slice(5)-1;
  for(const e of ERAS){
    const s=serie(e.id),lista=s.lista.filter(x=>+x.mes.slice(5)-1===mi),med=s.clima[mi].med,cuerpo=$("cuerpo-"+e.id),propia=e.id===eraDe(S.mes).id;
    $("sub-"+e.id).textContent="Todos los meses de "+MESL[mi]+" del período";
    if(propia){
      const sel=lista.find(x=>x.mes===S.mes),n=nivel(sel.v,med),pos=lista.filter(x=>x.v>sel.v).length+1;
      cuerpo.insertAdjacentHTML("beforeend",'<div style="display:flex;gap:18px;align-items:flex-end;flex-wrap:wrap;margin:8px 0 4px"><div><div class="av-big">'+nf(sel.v)+'</div><div class="sub">días-celda en '+MESL[mi]+" de "+S.mes.slice(0,4)+'</div></div><div style="padding-bottom:6px"><span class="pill '+n.cls+'">'+n.txt+'</span><div style="margin-top:6px;font-size:13px">'+
        (n.r==null?"La mediana de este mes es demasiado baja para comparar.":"<b>"+nf(n.r,1)+" veces</b> la mediana de "+MESL[mi]+" ("+nf(med)+"). ")+"Puesto <b>"+pos+"</b> de "+lista.length+" años.</div></div></div>");
    }else{
      const mx=lista.reduce((a,b)=>b.v>a.v?b:a,lista[0]);
      cuerpo.insertAdjacentHTML("beforeend",'<div style="margin:8px 0 4px;font-size:13px">Mediana de '+MESL[mi]+": <b>"+nf(med)+"</b> días-celda. Máximo: <b>"+nf(mx.v)+"</b> en "+mx.mes.slice(0,4)+'.<div class="sub">Referencia del otro período; sus valores no son comparables con los del mes elegido.</div></div>');
    }
    const el=document.createElement("div");el.className="av-ch";cuerpo.appendChild(el);
    grafico(el,{grid:{left:48,right:14,top:16,bottom:28},tooltip:{trigger:"axis",backgroundColor:"#10222c",borderColor:"#49616d",textStyle:{color:"#e4eef3"},valueFormatter:v=>nf(v)+" días-celda"},
      xAxis:{type:"category",data:lista.map(x=>x.mes.slice(0,4)),...EJE},yAxis:{type:"value",...EJE},
      series:[{type:"bar",data:lista.map(x=>({value:x.v,itemStyle:{color:x.mes===S.mes?"#e2553d":(e.id==="pre"?"#7f97a5":"#5fa8c4")}})),
        markLine:{silent:true,symbol:"none",lineStyle:{color:"#ffd166",type:"dashed"},label:{formatter:"mediana",color:"#ffd166"},data:[{yAxis:med}]}}]});
  }
}
const ORDEN=[6,7,8,9,10,11,0,1,2,3,4,5];
function periodoCritico(clima){
  const med=ORDEN.map(i=>clima[i].med||0),total=med.reduce((a,b)=>a+b,0);if(!total)return null;
  let mejor=null;
  for(let largo=1;largo<=12&&!mejor;largo++)for(let ini=0;ini+largo<=12;ini++){
    const suma=med.slice(ini,ini+largo).reduce((a,b)=>a+b,0);
    if(suma/total>=.75&&(!mejor||suma>mejor.suma))mejor={ini,largo,suma,pct:suma/total};
  }
  const pico=med.indexOf(Math.max(...med));
  return Object.assign(mejor,{total,pico:ORDEN[pico],desde:ORDEN[mejor.ini],hasta:ORDEN[mejor.ini+mejor.largo-1]});
}
function pintarTemporada(){
  $("av-barra").innerHTML='<span class="muted">Temporada de julio a junio. La franja es el rango habitual (percentil 10 a 90) y la línea punteada, la mediana. El período crítico es el tramo más corto de meses seguidos que reúne al menos el 75 % de la actividad de un año habitual.</span>';
  for(const e of ERAS){
    const s=serie(e.id),cuerpo=$("cuerpo-"+e.id),pc=periodoCritico(s.clima);
    const temps=[];for(let y=+e.desde.slice(0,4)-1;y<=+e.hasta.slice(0,4)-1;y++){const v=ORDEN.map((mi,k)=>{const x=s.lista.find(q=>q.mes===(k<6?y:y+1)+"-"+String(mi+1).padStart(2,"0"));return x?x.v:null;});if(v.filter(q=>q!=null).length===12)temps.push({y,v});}
    if(!pc||!temps.length){cuerpo.innerHTML='<div class="av-vacio">No hay actividad suficiente en esta zona y período.</div>';continue;}
    if(!temps.some(t=>t.y===S.temporada[e.id]))S.temporada[e.id]=temps.reduce((a,b)=>b.v.reduce((p,q)=>p+q,0)>a.v.reduce((p,q)=>p+q,0)?b:a).y;
    const t=temps.find(q=>q.y===S.temporada[e.id]),tot=t.v.reduce((a,b)=>a+b,0);
    $("sub-"+e.id).textContent="Curva habitual del período y una temporada encima";
    cuerpo.insertAdjacentHTML("beforeend",'<div style="display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap;margin:8px 0 2px"><div><div class="sub">Período crítico</div><div class="av-big" style="font-size:26px">'+(pc.largo===1?MESL[pc.desde]:MESL[pc.desde]+" a "+MESL[pc.hasta])+'</div><div class="sub">reúne el '+nf(100*pc.pct)+" % de un año habitual · máximo en "+MESL[pc.pico]+'</div></div><span style="flex:1"></span><label style="margin:0;width:150px">Temporada<select id="t-'+e.id+'">'+temps.map(q=>'<option value="'+q.y+'">'+q.y+"–"+String(q.y+1).slice(2)+"</option>").join("")+"</select></label></div>"+
      '<div style="font-size:13px;margin-bottom:2px">La temporada '+t.y+"–"+String(t.y+1).slice(2)+" sumó <b>"+nf(tot)+"</b> días-celda: <b>"+nf(tot/pc.total,1)+" veces</b> un año habitual del período.</div>");
    $("t-"+e.id).value=t.y;$("t-"+e.id).onchange=ev=>{S.temporada[e.id]=+ev.target.value;pintar();};
    const el=document.createElement("div");el.className="av-ch";cuerpo.appendChild(el);
    grafico(el,{grid:{left:48,right:14,top:34,bottom:28},legend:{top:0,textStyle:{color:"#dce8ec"},data:["Mediana del período","Temporada "+t.y+"–"+String(t.y+1).slice(2)]},
      tooltip:{trigger:"axis",backgroundColor:"#10222c",borderColor:"#49616d",textStyle:{color:"#e4eef3"}},
      xAxis:{type:"category",data:ORDEN.map(i=>MES[i]),...EJE},yAxis:{type:"value",...EJE},
      series:[{name:"p10",type:"line",stack:"b",symbol:"none",lineStyle:{opacity:0},tooltip:{show:false},data:ORDEN.map(i=>Math.round(s.clima[i].p10))},
        {name:"rango",type:"line",stack:"b",symbol:"none",lineStyle:{opacity:0},tooltip:{show:false},areaStyle:{color:"#2d5a70",opacity:.55},data:ORDEN.map(i=>Math.round(s.clima[i].p90-s.clima[i].p10))},
        {name:"Mediana del período",type:"line",symbol:"none",lineStyle:{color:"#ffd166",width:2,type:"dashed"},itemStyle:{color:"#ffd166"},data:ORDEN.map(i=>Math.round(s.clima[i].med)),
          markArea:{silent:true,itemStyle:{color:"#e2553d",opacity:.10},label:{color:"#ffb4a6",position:"insideTop"},data:[[{name:"período crítico",xAxis:MES[pc.desde]},{xAxis:MES[pc.hasta]}]]}},
        {name:"Temporada "+t.y+"–"+String(t.y+1).slice(2),type:"line",data:t.v,lineStyle:{color:"#e2553d",width:3},itemStyle:{color:"#e2553d"}}]});
  }
}
function pintarTerritorio(){
  $("av-barra").innerHTML='<span class="muted">Cada cuadro es una celda de '+KM+' km, coloreada según en cuántos años del período tuvo actividad. Las zonas agrícolas se repiten sobre todo por quemas, no por incendios forestales. En la tabla, «Por año» son días-celda promedio por año.</span>';
  const formas=window.NASA_CATALOG.shapes,sel=S.zona==="all"?formas:formas.filter(f=>f.code===S.zona);
  let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;sel.forEach(f=>f.polygons.forEach(p=>p.forEach(r=>r.forEach(c=>{x0=Math.min(x0,c[0]);x1=Math.max(x1,c[0]);y0=Math.min(y0,c[1]);y1=Math.max(y1,c[1]);}))));
  const lado=Math.max(x1-x0,y1-y0)*1.06,cx=(x0+x1)/2,cy=(y0+y1)/2;
  for(const e of ERAS){
    const z=S.zonas[S.zona]||zonaVacia(),cuerpo=$("cuerpo-"+e.id),n=e.id==="pre"?11:14;
    const cortes=e.id==="pre"?[[1,1,"1 año"],[2,3,"2–3"],[4,5,"4–5"],[6,7,"6–7"],[8,99,"8 o más"]]:[[1,1,"1 año"],[2,3,"2–3"],[4,6,"4–6"],[7,9,"7–9"],[10,99,"10 o más"]];
    const col=["#2f5466","#5fa8c4","#f2b36b","#e2745a","#b3261e"];
    const celdas=[...z.anios[e.id]].map(([k,s])=>{const [i,j]=k.split(",").map(Number);return [(i+.5)*SIZE,(j+.5)*SIZE,s.size];});
    const rec=celdas.filter(c=>c[2]>=cortes[4][0]).length,noc=z.noche[e.id],tn=noc[0]+noc[1];
    $("sub-"+e.id).textContent="Celdas según en cuántos de los "+n+" años tuvieron actividad";
    cuerpo.insertAdjacentHTML("beforeend",'<div style="font-size:13px;margin:6px 0 2px"><b>'+nf(celdas.length)+"</b> celdas con actividad alguna vez · <b>"+nf(rec)+"</b> en "+cortes[4][2]+" años · <b>"+(tn?nf(100*noc[0]/tn):"–")+" %</b> de los focos fue de noche.</div>");
    const fila=document.createElement("div");fila.style.cssText="flex:1;display:flex;flex-direction:column;gap:8px;min-height:0";cuerpo.appendChild(fila);
    const el=document.createElement("div");el.style.cssText="flex:1.7;min-height:330px;min-width:0";fila.appendChild(el);
    const tabla=document.createElement("div");tabla.style.cssText="flex:1;overflow:auto;min-width:0;min-height:170px";fila.appendChild(tabla);
    const W=Math.max(120,(el.clientWidth||380)-8),H=Math.max(120,(el.clientHeight||420)-38),esc=Math.min(W,H)/lado;   // píxeles por metro, misma escala en ambos ejes
    const rx=W/esc,ry=H/esc,px=Math.max(2.5,Math.min(16,esc*SIZE));
    grafico(el,{grid:{left:4,right:4,top:4,bottom:34},legend:{bottom:0,textStyle:{color:"#dce8ec",fontSize:11},itemWidth:12,itemHeight:10,data:cortes.map(c=>c[2])},
      xAxis:{type:"value",show:false,min:cx-rx/2,max:cx+rx/2},yAxis:{type:"value",show:false,min:cy-ry/2,max:cy+ry/2},
      series:[...sel.flatMap(f=>f.polygons.map(p=>({type:"line",data:p[0],symbol:"none",silent:true,lineStyle:{color:"#6f8f9f",width:1},z:1}))),
        ...cortes.map((c,i)=>({name:c[2],type:"scatter",symbol:"rect",symbolSize:px,z:5,itemStyle:{color:col[i]},data:celdas.filter(q=>q[2]>=c[0]&&q[2]<=c[1]).map(q=>[q[0],q[1]])}))]});
    if(S.zona==="all"){
      const filas=formas.map(f=>{const zz=S.zonas[f.code];if(!zz)return null;const l=zz.series[e.id].lista,t=l.reduce((a,b)=>a+b.v,0),k=zz.noche[e.id],cl=zz.series[e.id].clima.map(c=>c.med||0);return {n:f.name,pa:t/n,noche:k[0]+k[1]?100*k[0]/(k[0]+k[1]):null,pico:cl.indexOf(Math.max(...cl))};}).filter(Boolean).sort((a,b)=>b.pa-a.pa).slice(0,10);
      tabla.innerHTML="<table><tr><th>Comuna</th><th>Por año</th><th>De noche</th><th>Mes pico</th></tr>"+filas.map(f=>"<tr><td>"+f.n+"</td><td>"+nf(f.pa)+"</td><td>"+(f.noche==null?"–":nf(f.noche)+" %")+"</td><td>"+MES[f.pico]+"</td></tr>").join("")+"</table>";
    }else{
      const l=z.series?z.series[e.id].lista:[],porAnio={};l.forEach(x=>{const y=x.mes.slice(0,4);porAnio[y]=(porAnio[y]||0)+x.v;});
      const el2=document.createElement("div");el2.style.cssText="height:100%;min-height:170px";tabla.appendChild(el2);
      grafico(el2,{title:{text:"Días-celda por año",textStyle:{color:"#9db4bf",fontSize:12,fontWeight:600},left:0,top:0},grid:{left:44,right:8,top:30,bottom:26},tooltip:{trigger:"axis",backgroundColor:"#10222c",borderColor:"#49616d",textStyle:{color:"#e4eef3"}},
        xAxis:{type:"category",data:Object.keys(porAnio),...EJE},yAxis:{type:"value",...EJE},series:[{type:"bar",data:Object.values(porAnio),itemStyle:{color:e.id==="pre"?"#7f97a5":"#5fa8c4"}}]});
    }
  }
}
/* ---------- 5. Barra inferior ---------- */
function barraInferior(){
  const t=$("timeline"),boton=$("time-toggle");if(!t||!boton)return;
  const etiqueta=texto=>[...t.querySelectorAll("label")].find(l=>l.textContent.trim().startsWith(texto));
  const orden=[boton,etiqueta("Contenido"),$("previous"),$("play"),$("pause"),$("next"),$("time-label"),$("time-slider"),etiqueta("Paso"),etiqueta("Velocidad")].filter(Boolean);
  const resto=[...t.children].filter(n=>!orden.includes(n));          // notas y textos de estado quedan al final
  [...orden,...resto].forEach(n=>t.appendChild(n));
  const rotular=()=>{const cerrada=[document.body,document.documentElement,t.parentElement].some(n=>n&&n.classList.contains("time-closed"));
    boton.textContent=cerrada?"Mostrar":"Ocultar";boton.setAttribute("aria-label",cerrada?"Mostrar la barra de tiempo":"Ocultar la barra de tiempo");};
  rotular();
  [document.body,document.documentElement].forEach(n=>new MutationObserver(rotular).observe(n,{attributes:true,attributeFilter:["class"]}));
  boton.addEventListener("click",()=>setTimeout(rotular,0));
}
/* ---------- 6. Botones del mapa con símbolos y coordenadas del cursor ---------- */
function herramientasMapa(){
  const svg=d=>'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+d+"</svg>";
  const ICONOS={
    "zoom-in":["Acercar",svg('<path d="M12 5v14M5 12h14"/>')],
    "zoom-out":["Alejar",svg('<path d="M5 12h14"/>')],
    "reset":["Reencuadrar la región",svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>')],
    "export-points":["Descargar focos",svg('<path d="M12 3v10M8 9l4 4 4-4"/><circle cx="6" cy="19" r="1.3" fill="currentColor"/><circle cx="12" cy="19" r="1.3" fill="currentColor"/><circle cx="18" cy="19" r="1.3" fill="currentColor"/>')],
    "export-cells":["Descargar celdas",svg('<path d="M12 3v9M8 8l4 4 4-4"/><rect x="5" y="15" width="14" height="6"/><path d="M12 15v6"/>')]};
  for(const id in ICONOS){const b=$(id);if(!b)continue;b.innerHTML=ICONOS[id][1];b.title=ICONOS[id][0];b.setAttribute("aria-label",ICONOS[id][0]);b.classList.add("icono");}
  const css=document.createElement("style");css.textContent=`
  #map-tools .actions{max-width:none;gap:4px;flex-wrap:nowrap}
  #map-tools button.icono{width:30px;height:30px;padding:0;display:inline-flex;align-items:center;justify-content:center;border-radius:6px}
  #map-tools button.icono:nth-of-type(4){margin-left:8px}
  #coordenadas{position:absolute;top:18px;right:18px;z-index:500;background:#10222cdd;border:1px solid #49616d;border-radius:8px;padding:7px 12px;font-size:12px;font-variant-numeric:tabular-nums;color:#e4eef3;pointer-events:none;min-width:232px;text-align:center}
  #coordenadas[hidden]{display:none}
  #history-results{max-height:max(190px,calc(100dvh - 560px));overflow:auto;padding-right:4px}
  #timeline #time-mode{width:232px}`;
  document.head.appendChild(css);
  const etapa=$("map-stage"),mapa=window.HL_MAP;if(!etapa||!mapa)return;
  etapa.insertAdjacentHTML("beforeend",'<div id="coordenadas" hidden aria-live="off"></div>');
  const caja=$("coordenadas"),f=new Intl.NumberFormat("es-CL",{minimumFractionDigits:4,maximumFractionDigits:4});
  mapa.on("mousemove",e=>{caja.hidden=false;caja.textContent="Lat "+f.format(e.latlng.lat)+"°  ·  Lon "+f.format(e.latlng.lng)+"°";});
  mapa.on("mouseout",()=>{caja.hidden=true;});
}
barra();montar();barraInferior();herramientasMapa();
window.HOTSPOT_AVANZADO={estado:S,preparar,vista};
})();
