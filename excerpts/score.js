// Excerpt from Pesca Garraf (not the complete source).
// Scoring core (data.js): per-hour factors -> weighted 0-100 score -> safety caps -> daily best window.
// Helpers (clamp, lin, angd, median) are defined elsewhere; data loading and calibration files are omitted.

const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
const lin=(x,a,b)=>clamp((x-a)/(b-a));
const angd=(a,b)=>{let d=Math.abs(a-b)%360;return d>180?360-d:d};

// --- water clarity (satellite-calibrated; TURB/SATU are loaded elsewhere) ---
// 1 = clara (p10 de la muestra de satélite), 0 = turbia (p90)
const turbQ=t=>{if(t==null)return null;const tp=TURB&&TURB.tur_percentiles,lo=tp?tp[1]:1.15,hi=tp?tp[5]:3.6;return clamp(1-(Math.log(t)-Math.log(lo))/(Math.log(hi)-Math.log(lo)))};
// última imagen de satélite útil para ese spot y fecha: la turbidez tiene memoria (autocorrelación ~0,55 a 1-3 días, ~0,4 a 7)
function satAnchor(spId,date){const L=SATU&&SATU.spots&&SATU.spots[spId];if(!L||!L.length)return null;let b=null;for(const o of L)if(o.fecha<=date&&(!b||o.fecha>b.fecha))b=o;if(!b)return null;const age=Math.round((new Date(date+"T12:00")-new Date(b.fecha+"T12:00"))/864e5);if(age>10)return null;return {q:turbQ(b.tur),tur:b.tur,fecha:b.fecha,age,w:age<=3?.5:age<=7?.35:.2}}

// --- exposure, wind, waves, clarity -> factors (inside build(), per hour) ---
  const a=angd(wvd,s.seaward),exp=a<60?1:clamp(1-(a-60)/90,.25,1);
  const hEff=wvh*exp;
  const on=dir!=null&&angd(dir,s.seaward)<75?1:0,off=dir!=null&&angd(dir,s.seaward)>115;
  const qSoc=clamp((1-pt-.5)/.46); // socorristas: 0 = muy probable turbia, 1 = clara
  const tur=turbPred(s.coefId||s.id,hEff,per,wspd,r24,r72,r168,hmax48,+date.slice(5,7));let qSat=turbQ(tur);
  const anc=satAnchor(s.id,date);if(anc&&qSat!=null)qSat=anc.w*anc.q+(1-anc.w)*qSat;   // persistencia desde la última imagen de satélite
  let clearQ=qSat==null?qSoc:.6*qSat+.4*qSoc;
  const hssv=[cmv&&cmv.hss,spv&&spv.hss].filter(x=>x!=null),hswv=[cmv&&cmv.hsw,spv&&spv.hsw].filter(x=>x!=null),hSwell=hssv.length?median(hssv):null,hWind=hswv.length?median(hswv):null;
  if(hSwell!=null)clearQ*=1-.15*lin(hSwell*exp,.3,1.1);                       // el mar de fondo largo remueve el fondo (parte ya va en hEff)
  clearQ=clamp(clearQ);
  const f={
   olas:(1-lin(hEff,.12,1.1))*(per<4.5&&hEff>.4?.9:1),
   viento:1-lin(wspd*(on?1.3:off?.9:1),8,32),
   rachas:1-lin(gust,18,45),
   agua:clearQ*(1-rivEff*.6),
   corriente:1-lin(cv,.8,2.5),
   rio:1-rivEff,   // solo informativo: el río ya entra en "agua"
  };
  const W={olas:.30,viento:.15,rachas:.07,agua:.40,corriente:.08,rio:0};
  let sc=0;for(const q in f)sc+=f[q]*W[q];sc*=100;
  // topes: solo se etiqueta el que de verdad recorta
  let cap=null;const capTo=(lim,label)=>{if(sc>lim){sc=lim;cap=label}};
  const aeh=ae[t],avs=avisosAt(s.id,t),nSt=stormN.v[i]??0,ptA=aeh&&aeh.pt!=null?aeh.pt:0;
  if(nSt>=2||ptA>=50)capTo(10,nSt>=2?`Tormenta eléctrica (${nSt} modelos)`:`Tormenta probable (AEMET ${ptA} %)`);
  else if(nSt===1||ptA>=30)capTo(50,nSt===1?"Riesgo de tormenta (un modelo)":`Riesgo de tormenta (AEMET ${ptA} %)`);
  if(off&&gust>28)capTo(35,"Terral fuerte: deriva mar adentro");
  if(gust>45)capTo(20,"Rachas peligrosas");
  if(hEff>1.5)capTo(15,"Mar de fondo fuerte");
  avs.forEach(a=>{const L=AV_CAP[a.fenomeno];if(!L)return;capTo(L[AV_NIV[a.nivel]??0],`Aviso ${a.nivel} por ${a.fenomeno.toLowerCase()} (AEMET)`)});

// --- best 3-hour daylight window and forecast confidence ---
function dayStats(hours){ // ventana de 3 h con mejor media en horas de luz
 const dl=hours.filter(x=>x.light);if(dl.length<3)return null;
 let best=null;for(let i=0;i+2<dl.length;i++){const a=(dl[i].sc+dl[i+1].sc+dl[i+2].sc)/3;if(!best||a>best.a)best={a,i}}
 const w=dl.slice(best.i,best.i+3);
 const spread=mean(w.map(x=>(x.hs>0?x.wSpread/Math.max(.2,x.hs):0)))*.5+mean(w.map(x=>x.wiSpread/(x.ws+8)))*.5;
 return {dl,best,w,avg:mean(dl.map(x=>x.sc)),spread,conf:spread<.35?"alta":spread<.7?"media":"baja"};
}
const label=s=>s>=80?"Excelente":s>=65?"Bueno":s>=50?"Aceptable":s>=35?"Flojo":"No ir";
