/* Additive AYLEN presentation layer: scientific data and original controllers are unchanged. */
(function(){
'use strict';
const dictionary=new Map(window.AYLEN_TRANSLATIONS.map(([s,t])=>[s.trim(),t.trim()]));
const escapeRE=s=>s.replace(/[.*+?^$()|[\]\\{}]/g,'\\$&');
const keys=[...dictionary.keys()].sort((a,b)=>b.length-a.length);
const expression=new RegExp('(?<![\\p{L}\\p{N}_])(?:'+keys.map(escapeRE).join('|')+')(?![\\p{L}\\p{N}_])','gu');
const textState=new WeakMap(),attributeState=new WeakMap(),optionSources=new Map(),charts=new Map();
let language='es';
function translate(s){
 if(language!=='en'||typeof s!=='string'||!s.trim())return s;
 const exact=dictionary.get(s.trim());if(exact)return s.slice(0,s.indexOf(s.trim()))+exact+s.slice(s.indexOf(s.trim())+s.trim().length);
 let out=s.replace(expression,k=>dictionary.get(k));
 out=out.replace(/(\d{4}-\d{2}(?:-\d{2})?) a (?=\d{4}-\d{2})/g,'$1 to ');
 out=out.replace(/\b(January|February|March|April|May|June|July|August|September|October|November|December) de (\d{4})/g,'$1 $2');
 out=out.replace(/\b(January|February|March|April|May|June|July|August|September|October|November|December) a (?=January|February|March|April|May|June|July|August|September|October|November|December)/g,'$1 to ');
 out=out.replace(/(\d+) de (\d+) years/g,'$1 of $2 years');out=out.replace(/(\d[\d.,]*) de (?=\d)/g,'$1 of ').replace(/(\d[\d.,]*) en (?=\d{4})/g,'$1 in ').replace(/cell-days de (?=\d)/g,'cell-days using ');out=out.replace(/\bde (\d[\d.,]*) (years|months)/g,'of $1 $2').replace(/\ben (?=\d)/g,'in ');return out;
}
function htmlText(s){return s.split(/(<[^>]*>)/g).map(x=>x.startsWith('<')?x:translate(x)).join('');}
function skip(el){return !el||el.closest('script,style,textarea,code,pre,#aylen-language-control');}
function normalizeOptionLabels(s){for(const [en,es]of optionSources)if(en!==es&&en.length>3)s=s.split(en).join(es);return s;}
function text(node){
 if(skip(node.parentElement))return;
 const current=node.nodeValue,old=textState.get(node);
 const source=old&&current===old.shown?old.source:(language==='en'?normalizeOptionLabels(current):current),shown=translate(source);
 textState.set(node,{source,shown});
 if(node.parentElement.tagName==='OPTION'&&shown!==source)optionSources.set(shown.trim(),source.trim());
 if(current!==shown)node.nodeValue=shown;
}
const attributes=['title','aria-label','placeholder','alt'];
function attrs(el){
 if(skip(el)||el.nodeType!==1)return;
 let record=attributeState.get(el);if(!record){record={};attributeState.set(el,record);}
 for(const key of attributes){if(!el.hasAttribute(key))continue;const current=el.getAttribute(key),old=record[key],source=old&&current===old.shown?old.source:current,shown=translate(source);record[key]={source,shown};if(current!==shown)el.setAttribute(key,shown);}
}
function scan(node){
 if(node.nodeType===3){text(node);return;}if(node.nodeType!==1||skip(node))return;attrs(node);
 const walk=document.createTreeWalker(node,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT,{acceptNode:n=>n.nodeType===1&&skip(n)?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});
 let n;while((n=walk.nextNode())){if(n.nodeType===3)text(n);else attrs(n);}
}
function chartOption(obj){
 if(typeof obj==='string')return htmlText(obj);
 if(typeof obj==='function')return function(){const out=obj.apply(this,arguments);return typeof out==='string'?htmlText(out):out;};
 if(Array.isArray(obj))return obj.map(chartOption);
 if(obj&&Object.getPrototypeOf(obj)===Object.prototype){const result={};for(const [k,v]of Object.entries(obj))result[k]=chartOption(v);return result;}return obj;
}
if(window.echarts){
 const init=echarts.init;
 echarts.init=function(){const g=init.apply(this,arguments),set=g.setOption.bind(g),entry={g,set,source:null,args:[]};charts.set(g,entry);
 g.setOption=function(option){entry.source=option;entry.args=[...arguments].slice(1);return set(chartOption(option),...entry.args);};return g;};
}
const select=document.createElement('select');select.id='aylen-language';select.setAttribute('aria-label','Idioma / Language');
select.innerHTML='<option value="es">Español</option><option value="en">English</option>';
const label=document.createElement('label');label.id='aylen-language-control';label.append(select);
document.getElementById('open-downloads').insertAdjacentElement('afterend',label);
const css=document.createElement('style');css.textContent='#aylen-language-control{display:inline-flex;align-items:center;margin:0 0 0 4px;flex-shrink:0}#aylen-language{width:90px;max-width:100%;padding:7px 6px;font-size:12px}html[lang=en] .topbar{gap:4px}html[lang=en] .topbar button{font-size:12px}html[lang=en] .topbar .brand small{font-size:10px}';document.head.append(css);
function setLanguage(lang){
 language=lang==='en'?'en':'es';select.value=language;document.documentElement.lang=language;scan(document.body);
 for(const [g,e]of charts){if(g.isDisposed()){charts.delete(g);continue;}if(e.source){g.clear();e.set(chartOption(e.source),true);}}
 try{localStorage.setItem('aylen-language',language);}catch{}
}
select.addEventListener('change',()=>setLanguage(select.value));
const observer=new MutationObserver(records=>{for(const r of records){if(r.type==='characterData')text(r.target);else if(r.type==='attributes')attrs(r.target);else for(const n of r.addedNodes)scan(n);}});
observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:attributes});
try{language=localStorage.getItem('aylen-language')==='en'?'en':'es';}catch{}
setLanguage(language);
// Only the explanatory guide is localized; CSV/JSON/GeoJSON schemas and values stay unchanged.
document.getElementById('download-help').addEventListener('click',event=>{
 if(language!=='en')return;event.preventDefault();event.stopImmediatePropagation();
 const url=URL.createObjectURL(new Blob(["Local dates use America/Santiago; UTC acquisition is recorded in adquisicion_utc and acq_date/acq_time. latitude/longitude are WGS84 degrees; frp is in MW, brightness temperatures in kelvin, and scan/track in km. Each row is a detection, not an individual fire. Municipalities are assigned using municipal boundaries. pasada/id_pasada are unavailable without CMR matching; url_fuente is unavailable when the source is only a local file. fuente identifies that file. The version column combines versions present in the file and does not establish a version for each row. Missing data remain blank. NOAA-21 detections from the atlas were not added to the viewer dataset. Exported column names and source data remain unchanged in both languages."],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='column-and-filter-guide.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
},true);
window.AYLEN_LANGUAGE={get current(){return language;},translate,set:setLanguage};
})();
