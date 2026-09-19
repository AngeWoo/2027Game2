'use strict';
/* =========================================================
   設定
   ========================================================= */
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSELNOgRozrKO1bscsHe6doF8rH9-wSPYgvkhR5xXGhHKYvKoiXnlEC8YR3G5pPwQ2YFOksnlxYAQx-/pub?gid=0&single=true&output=csv';
const STAGES = [
  { name:'草創之始', from:0,    to:1949, time:60, types:['year','event','blank'] },
  { name:'苑基開展', from:1950, to:1969, time:57, types:['year','event','blank'] },
  { name:'法流相承', from:1970, to:1989, time:55, types:['year','event','blank','date'] },
  { name:'繼往開來', from:1990, to:2009, time:52, types:['year','event','blank','date'] },
  { name:'永恆燈火', from:2010, to:9999, time:50, types:['year','event','blank','date'] },
];
const NUMS = ['一','二','三','四','五','六','七','八','九','十'];
const Q_PER_STAGE = 8, START_LIVES = 3, MAX_LIVES = 5, FULL_TIME = 60;
const TYPE_LABEL = { year:'年代推理', event:'時光定格', blank:'填空解謎', date:'精準日期' };

const $ = s => document.querySelector(s);
const store = {
  get(k){ try { return localStorage.getItem('yuanshi.'+k); } catch(e){ return null; } },
  set(k,v){ try { localStorage.setItem('yuanshi.'+k, v); } catch(e){} }
};
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const rand = n => Math.floor(Math.random()*n);
const pick = a => a[rand(a.length)];
const shuffle = a => { for (let i=a.length-1;i>0;i--){ const j=rand(i+1); [a[i],a[j]]=[a[j],a[i]]; } return a; };
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate = (y,m,d) => `${y}年${m}月${d}日`;

/* =========================================================
   資料讀取與整理
   ========================================================= */
function parseCSV(text){
  const rows=[]; let row=[], f='', q=false;
  for (let i=0;i<text.length;i++){
    const c=text[i];
    if (q){ if (c==='"'){ if (text[i+1]==='"'){ f+='"'; i++; } else q=false; } else f+=c; }
    else if (c==='"') q=true;
    else if (c===','){ row.push(f); f=''; }
    else if (c==='\n'||c==='\r'){ if (c==='\r'&&text[i+1]==='\n') i++; row.push(f); rows.push(row); row=[]; f=''; }
    else f+=c;
  }
  if (f||row.length){ row.push(f); rows.push(row); }
  return rows;
}
const toHalf = s => s.replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0)-0xFEE0)).replace(/　/g,' ');
const SRC_RE = /[（(][^（）()]*?(時報|歡喜世界|刊|史|期|參考|親報|P\s?\d|傘壽|節錄|頁)[^（）()]*?[）)]/g;
function cleanText(t){
  let s = t.replace(SRC_RE,'');
  s = s.replace(/\s*[～~][^～~]*(刊物|節錄|時報|史|傘壽|歡喜世界)[^～~]*$/,'');
  s = s.replace(/^[\s：:，,、。．.]+/,'').replace(/\s{2,}/g,' ').trim();
  // 「至3月5日：教主…」這類期間紀錄，把結束日移到句尾
  const r = s.match(/^至\s*((?:\d{1,2}月)?\d{1,2}日)\s*[：:，,]?\s*([\s\S]+)$/);
  if (r) s = `${r[2]}（至${r[1]}）`;
  return s || t.trim();
}
const norm = s => s.replace(/[^㐀-鿿A-Za-z0-9]/g,'');
function similar(a,b){
  const x=a.key, y=b.key; if (!x||!y) return false;
  const k=Math.min(10,x.length,y.length);
  return x.slice(0,k)===y.slice(0,k) || x.includes(y.slice(0,10)) || y.includes(x.slice(0,10));
}

let ENTRIES=[], YEARS=[], TERMS=[], DATA_SRC='cloud';
const TERM_RE = /[「『《]([^」』》]{2,12})[」』》]/g;

function buildEntries(text){
  const out=[];
  for (const row of parseCSV(text)){
    const line = toHalf(row.map(x=>x.trim()).filter(Boolean).join(' ')).trim();
    const m = line.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日\s*([\s\S]*)$/);
    if (!m || !m[4].trim()) continue;
    const e = { y:+m[1], m:+m[2], d:+m[3], raw:m[4].trim() };
    e.ds = fmtDate(e.y,e.m,e.d);
    e.clean = cleanText(e.raw);
    e.key = norm(e.clean);
    // 同一天、內容相近的重複紀錄合併（保留較完整的）
    const dup = out.find(o => o.ds===e.ds && similar(o,e));
    if (dup){ if (e.raw.length>dup.raw.length){ dup.raw=e.raw; dup.clean=e.clean; dup.key=e.key; } continue; }
    out.push(e);
  }
  return out;
}

async function loadData(){
  let text=null; DATA_SRC='cloud';
  try{
    const ctrl=new AbortController(); const t=setTimeout(()=>ctrl.abort(),9000);
    const r=await fetch(SHEET_URL,{signal:ctrl.signal,cache:'no-store'}); clearTimeout(t);
    if (!r.ok) throw new Error(r.status);
    text=await r.text();
    if (!/\d{4}年/.test(text)) throw new Error('bad data');
  }catch(err){
    console.warn('雲端資料讀取失敗，改用離線備份', err);
    text=window.FALLBACK_CSV||''; DATA_SRC='offline';
  }
  ENTRIES=buildEntries(text);
  ENTRIES.forEach(e=>e.similars=ENTRIES.filter(o=>o!==e&&similar(o,e)));
  YEARS=[...new Set(ENTRIES.map(e=>e.y))].sort((a,b)=>a-b);
  const ts=new Set();
  ENTRIES.forEach(e=>{ for (const m of e.clean.matchAll(TERM_RE)) ts.add(m[1]); });
  TERMS=[...ts];
}

/* =========================================================
   出題：依據每一條紀錄產生 3 選 1 題目
   ========================================================= */
// 題目文字是否已洩漏年份（含「一九九二年」這類中文數字）
const hintsYear = (e) => {
  const digits = e.clean.replace(/[〇零一二三四五六七八九]/g, c => c==='零' ? '0' : String('〇一二三四五六七八九'.indexOf(c)));
  return digits.includes(String(e.y));
};
const short = s => s.length>72 ? s.slice(0,70)+'…' : s;
const BUILDERS = {
  // 這件事發生在哪一年？
  year(e){
    if (hintsYear(e)) return null;
    const bad=new Set([e.y, ...e.similars.map(o=>o.y)]);
    const cands=YEARS.filter(y=>!bad.has(y)).sort((a,b)=>Math.abs(a-e.y)-Math.abs(b-e.y)).slice(0,8);
    if (cands.length<2) return null;
    const opts=[e.y, ...shuffle(cands).slice(0,2)].sort((a,b)=>a-b);
    return { type:'year', prompt:'這件事發生在哪一年？', date:'', body:esc(e.clean),
             options:opts.map(y=>({ text:`${y} 年`, correct:y===e.y })) };
  },
  // 這一天發生了什麼事？
  event(e){
    const pool=ENTRIES.filter(o=>o.y!==e.y && !similar(o,e) && !e.similars.includes(o));
    let near=pool.filter(o=>Math.abs(o.y-e.y)<=12); if (near.length<6) near=pool;
    if (near.length<2) return null;
    const ds=shuffle(near.slice()).slice(0,2);
    return { type:'event', prompt:'這一天，苑史上發生了什麼事？', date:e.ds, body:'',
             options:shuffle([{text:short(e.clean),correct:true}, ...ds.map(o=>({text:short(o.clean),correct:false}))]) };
  },
  // 關鍵詞填空
  blank(e){
    const terms=[...e.clean.matchAll(TERM_RE)].map(m=>m[1]);
    if (!terms.length) return null;
    const term=pick(terms);
    const others=TERMS.filter(t=>t!==term && !t.includes(term) && !term.includes(t) && !e.clean.includes(t))
                      .sort((a,b)=>Math.abs(a.length-term.length)-Math.abs(b.length-term.length)).slice(0,10);
    if (others.length<2) return null;
    const body=esc(e.clean).split(esc(term)).join('<span class="blank">？？？</span>');
    return { type:'blank', prompt:'空格中應填入什麼？', date:e.ds, body,
             options:shuffle([term, ...shuffle(others).slice(0,2)]).map(t=>({ text:t, correct:t===term })) };
  },
  // 精準日期
  date(e){
    const bad=new Set([e.ds, ...e.similars.map(o=>o.ds)]);
    const yearHinted=hintsYear(e);
    const out=new Map(); let tries=0;
    while (out.size<2 && tries++<80){
      let {y,m,d}=e; const r=Math.random();
      if (r<.4) m=Math.min(12,Math.max(1,m+pick([-3,-2,-1,1,2,3])));
      else if (r<.75 || yearHinted) d=Math.min(28,Math.max(1,d+pick([-9,-7,-5,-3,3,5,7,9])));
      else y+=pick([-2,-1,1,2]);
      const s=fmtDate(y,m,d);
      if (!bad.has(s)) out.set(s, y*10000+m*100+d);
    }
    if (out.size<2) return null;
    const opts=[[e.ds, e.y*10000+e.m*100+e.d], ...out].sort((a,b)=>a[1]-b[1]);
    return { type:'date', prompt:'這件事發生在哪一天？', date:'', body:esc(e.clean),
             options:opts.map(([s])=>({ text:s, correct:s===e.ds })) };
  },
};
function makeQuestion(e, types){
  for (const t of shuffle(types.slice())){ const q=BUILDERS[t](e); if (q){ q.entry=e; return q; } }
  const q=BUILDERS.event(e)||BUILDERS.year(e); if (q) q.entry=e; return q;
}

/* =========================================================
   音效（Web Audio 合成）
   ========================================================= */
let AC=null, muted=store.get('muted')==='1';
function tone(freq,dur,type='sine',vol=.12,when=0,slide){
  if (muted) return;
  try{
    AC=AC||new (window.AudioContext||window.webkitAudioContext)();
    const t=AC.currentTime+when, o=AC.createOscillator(), g=AC.createGain();
    o.type=type; o.frequency.setValueAtTime(freq,t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide,t+dur);
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(vol,t+.012); g.gain.exponentialRampToValueAtTime(.0001,t+dur);
    o.connect(g).connect(AC.destination); o.start(t); o.stop(t+dur+.03);
  }catch(e){}
}
const sfx={
  click(){ tone(700,.06,'triangle',.07); },
  correct(){ [523,659,784,1047].forEach((f,i)=>tone(f,.2,'triangle',.11,i*.07)); },
  wrong(){ tone(220,.35,'sawtooth',.08,0,80); tone(160,.4,'square',.04,.05,70); },
  tick(){ tone(1400,.035,'square',.035); },
  stage(){ [392,523,659,784,1047,1319].forEach((f,i)=>tone(f,.35,'sine',.1,i*.09)); tone(90,1.2,'sine',.12,0,400); },
  heart(){ tone(880,.12,'sine',.1); tone(1320,.2,'sine',.1,.1); },
  win(){ [523,659,784,1047,784,1047,1319].forEach((f,i)=>tone(f,.3,'triangle',.1,i*.12)); },
  lose(){ [440,392,330,262].forEach((f,i)=>tone(f,.35,'triangle',.09,i*.18)); },
};

/* =========================================================
   背景：飄雪
   ========================================================= */
const bg=$('#bg'), bctx=bg.getContext('2d');
const fx=$('#fx'), fctx=fx.getContext('2d');
let W=0,H=0,DPR=1, warp=1, warpTarget=1;
const BASE_WARP=1;
const COLORS=['#f5c86b','#fff1c1','#5ee7ff','#b58cff','#ffffff'];
const flakes=[]; const FLAKE_N=reduceMotion?60:(innerWidth<600?110:220);
function resize(){
  DPR=Math.min(devicePixelRatio||1, innerWidth<600?1.5:2); W=innerWidth; H=innerHeight;
  for (const c of [bg,fx]){ c.width=W*DPR; c.height=H*DPR; }
  bctx.setTransform(DPR,0,0,DPR,0,0); fctx.setTransform(DPR,0,0,DPR,0,0);
  bctx.clearRect(0,0,W,H); fctx.clearRect(0,0,W,H);
}
// 預先畫好雪花圖樣：柔光圓點與六角雪晶
function sprite(size,draw){ const c=document.createElement('canvas'); c.width=c.height=size; draw(c.getContext('2d'),size/2); return c; }
const SOFT=sprite(64,(g,r)=>{ const gr=g.createRadialGradient(r,r,0,r,r,r); gr.addColorStop(0,'rgba(255,255,255,1)'); gr.addColorStop(.35,'rgba(235,245,255,.8)'); gr.addColorStop(1,'rgba(200,225,255,0)'); g.fillStyle=gr; g.fillRect(0,0,r*2,r*2); });
const CRYSTAL=sprite(64,(g,r)=>{
  g.translate(r,r); g.strokeStyle='rgba(255,255,255,.95)'; g.lineCap='round'; g.shadowColor='rgba(180,220,255,.9)'; g.shadowBlur=6; g.lineWidth=2.4;
  for (let i=0;i<6;i++){ g.beginPath(); g.moveTo(0,0); g.lineTo(0,-r*.8); g.moveTo(0,-r*.45); g.lineTo(-r*.2,-r*.62); g.moveTo(0,-r*.45); g.lineTo(r*.2,-r*.62); g.stroke(); g.rotate(Math.PI/3); }
});
function newFlake(f={}, top=false){
  const depth=Math.random();                       // 0 遠 → 1 近
  f.depth=depth; f.x=Math.random()*W; f.y=top?-20-Math.random()*60:Math.random()*H;
  f.crystal=depth>.82&&Math.random()<.6;
  f.r=f.crystal?7+depth*9:1.2+depth*4.2;
  f.vy=.05+depth*.18; f.sway=.1+Math.random()*.25; f.phase=Math.random()*6.28; f.freq=.0006+Math.random()*.0015;
  f.rot=Math.random()*6.28; f.vr=(Math.random()-.5)*.003; f.a=.15+depth*.3;
  return f;
}
resize();
for (let i=0;i<FLAKE_N;i++) flakes.push(newFlake());
let wind=0;
function drawBG(){
  bctx.clearRect(0,0,W,H);
  warp+=(warpTarget-warp)*.04;
  const mul=1+(warp-BASE_WARP)*.03;                // 過場／答對時雪勢加快
  wind+=((warp-BASE_WARP)*.04-wind)*.02;           // 同時吹起一陣風
  const t=performance.now();
  for (const f of flakes){
    f.y+=f.vy*mul; f.x+=Math.sin(t*f.freq+f.phase)*f.sway*.5+wind*(.4+f.depth); f.rot+=f.vr*mul;
    if (f.y>H+20||f.x<-40||f.x>W+40){ newFlake(f,true); if (wind>1) f.x=Math.random()*W*.6-W*.1; }
    bctx.globalAlpha=f.a;
    const d=f.r*2;
    if (f.crystal){ bctx.save(); bctx.translate(f.x,f.y); bctx.rotate(f.rot); bctx.drawImage(CRYSTAL,-f.r,-f.r,d,d); bctx.restore(); }
    else bctx.drawImage(SOFT,f.x-f.r,f.y-f.r,d,d);
  }
  bctx.globalAlpha=1;
}
function boost(v=12,ms=700){ if (reduceMotion) return; warpTarget=v; clearTimeout(boost.t); boost.t=setTimeout(()=>warpTarget=BASE_WARP,ms); }

/* 粒子特效 */
const parts=[];
function burst(x,y,colors=['#39f0a2','#f5c86b','#fff1c1','#5ee7ff'],n=46,power=9){
  if (reduceMotion) n=Math.min(n,12);
  for (let i=0;i<n;i++){
    const a=Math.random()*Math.PI*2, v=power*(.3+Math.random());
    parts.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-2,g:.18,life:1,decay:.012+Math.random()*.02,size:2+Math.random()*4,c:pick(colors),rot:Math.random()*6,vr:(Math.random()-.5)*.3,shape:rand(3)});
  }
}
function confetti(n=160){
  for (let i=0;i<n;i++) parts.push({x:Math.random()*W,y:-20-Math.random()*H*.5,vx:(Math.random()-.5)*3,vy:2+Math.random()*3,g:.04,life:1,decay:.003+Math.random()*.004,size:4+Math.random()*6,c:pick(COLORS.concat(['#39f0a2','#ff7eb3'])),rot:Math.random()*6,vr:(Math.random()-.5)*.25,shape:1});
}
function drawFX(){
  fctx.clearRect(0,0,W,H);
  for (let i=parts.length-1;i>=0;i--){
    const p=parts[i];
    p.vx*=.985; p.vy=p.vy*.985+p.g; p.x+=p.vx; p.y+=p.vy; p.rot+=p.vr; p.life-=p.decay;
    if (p.life<=0||p.y>H+40){ parts.splice(i,1); continue; }
    fctx.globalAlpha=Math.min(1,p.life*1.5); fctx.fillStyle=p.c;
    fctx.save(); fctx.translate(p.x,p.y); fctx.rotate(p.rot);
    if (p.shape===0){ fctx.beginPath(); fctx.arc(0,0,p.size/2,0,7); fctx.fill(); }
    else if (p.shape===1){ fctx.fillRect(-p.size/2,-p.size/4,p.size,p.size/2); }
    else { fctx.beginPath(); for (let k=0;k<4;k++){ fctx.lineTo(0,-p.size); fctx.rotate(Math.PI/4); fctx.lineTo(0,-p.size/3); fctx.rotate(Math.PI/4); } fctx.fill(); }
    fctx.restore();
  }
  fctx.globalAlpha=1;
}
let drawn=false;
(function loop(){ drawBG(); drawFX();
  if (!drawn){ drawn=true; requestAnimationFrame(()=>{ bg.classList.add('ready'); fx.classList.add('ready'); }); }
  requestAnimationFrame(loop); })();
addEventListener('resize',resize); addEventListener('orientationchange',()=>setTimeout(resize,300));
if (window.visualViewport) visualViewport.addEventListener('resize',resize);
resize();

/* 全螢幕（手機點開始時自動進入；支援的瀏覽器才顯示按鈕） */
const docEl=document.documentElement;
const fsSupported=!!(docEl.requestFullscreen||docEl.webkitRequestFullscreen);
const isFS=()=>!!(document.fullscreenElement||document.webkitFullscreenElement);
const isTouch=matchMedia('(hover:none) and (pointer:coarse)').matches;
function enterFS(){
  if (!fsSupported||isFS()) return;
  try{
    const p=(docEl.requestFullscreen||docEl.webkitRequestFullscreen).call(docEl,{navigationUI:'hide'});
    if (p&&p.then) p.then(()=>{ try{ screen.orientation.lock('portrait').catch(()=>{}); }catch(e){} }).catch(()=>{});
  }catch(e){}
}
function toggleFS(){
  if (isFS()){ try{ (document.exitFullscreen||document.webkitExitFullscreen).call(document); }catch(e){} }
  else enterFS();
}

function flash(kind){ const f=$('#flash'); f.className=''; void f.offsetWidth; f.className=kind; }
function floater(text,x,y){ const el=document.createElement('div'); el.className='floater'; el.textContent=text; el.style.left=x+'px'; el.style.top=y+'px'; document.body.appendChild(el); setTimeout(()=>el.remove(),1300); }
function comboPop(text){ const c=$('#combo'); c.textContent=text; c.classList.remove('go'); void c.offsetWidth; c.classList.add('go'); }
document.querySelectorAll('[data-wheel]').forEach(w=>w.appendChild($('#wheel-tpl').content.cloneNode(true)));

/* =========================================================
   畫面切換 & 橫幅
   ========================================================= */
function show(id){ document.querySelectorAll('.screen').forEach(s=>s.classList.toggle('active',s.id===id)); scrollTo(0,0); }
function banner(html,ms=2300){
  return new Promise(res=>{
    const b=$('#banner'); $('#banner-inner').innerHTML=html+'<div class="b-sweep"></div>';
    b.className='show'; boost(26,ms-400);
    setTimeout(()=>{ b.className='show hide'; setTimeout(()=>{ b.className=''; res(); },480); }, ms);
  });
}
const slamLetters = s => [...s].map((c,i)=>`<span style="animation-delay:${i*.09}s">${c}</span>`).join('');

/* =========================================================
   遊戲狀態
   ========================================================= */
const G={ mode:'stage', stage:0, queue:[], qi:0, lives:START_LIVES, score:0, combo:0, maxCombo:0, correct:0, answered:0, wrong:[], q:null, locked:true, timeLeft:0, total:0, over:false };
let timerRAF=0, timerEnd=0, lastTick=0;

function stageEntries(i){ const s=STAGES[i]; return ENTRIES.filter(e=>e.y>=s.from&&e.y<=s.to); }

function startGame(mode, fromStage=0){
  sfx.click(); if (isTouch) enterFS();
  Object.assign(G,{ mode, startStage:fromStage, stage:fromStage, qi:0, lives:START_LIVES, score:0, combo:0, maxCombo:0, correct:0, answered:0, wrong:[], over:false });
  $('#hud-score').textContent='0';
  if (mode==='full'){
    G.queue=shuffle(ENTRIES.slice()); G.total=G.queue.length;
    show('scr-game'); renderHUD();
    banner(`<div class="b-kicker">ALL RECORDS</div><div class="b-title">${slamLetters('題庫')}</div><div class="b-sub">大 挑 戰</div><div class="b-years">共 ${G.total} 題　隨時可結束</div>`).then(nextQuestion);
    sfx.stage();
  } else {
    show('scr-game'); enterStage(fromStage);
  }
}
function enterStage(i){
  G.stage=i; G.qi=0;
  G.queue=shuffle(stageEntries(i)).slice(0,Q_PER_STAGE);
  const s=STAGES[i], list=stageEntries(i);
  const [y0,y1]=stageYears(i);
  renderHUD(); $('#pbar').style.width='0%';
  sfx.stage();
  banner(`<div class="b-kicker">STAGE ${i+1}</div><div class="b-title">${slamLetters('第'+NUMS[i]+'關')}</div><div class="b-sub">${s.name}</div><div class="b-years">${y0} — ${y1}</div>`,2400)
    .then(()=>{ if (!G.queue.length) return stageClear(); nextQuestion(); });
}
function renderHUD(){
  const full=G.mode==='full';
  $('#hud-stage').textContent= full ? '📜 題庫大挑戰' : `第${NUMS[G.stage]}關・${STAGES[G.stage].name}`;
  const n= full ? G.total : G.queue.length;
  $('#hud-count').textContent=`第 ${Math.min(G.qi+1,n)} / ${n} 題`;
  $('#hud-hearts').innerHTML= full ? '<span class="inf">∞ 練習模式</span>'
    : Array.from({length:Math.max(G.lives,START_LIVES)},(_,i)=>`<span class="h ${i<G.lives?'':'lost'}">♥</span>`).join('');
  $('#hud-dots').innerHTML= full ? '' : STAGES.map((_,i)=>`<i class="${i===G.stage?'cur':(i<G.stage&&i>=(G.startStage||0))?'done':''}" title="第${NUMS[i]}關・${STAGES[i].name}"></i>`).join('');
  $('#hud-combo').textContent= G.combo>=2 ? `🔥 連擊 ×${G.combo}` : '';
}
function animateScore(to){
  const el=$('#hud-score'), from=+el.dataset.v||0, t0=performance.now();
  el.dataset.v=to;
  (function step(t){ const k=Math.min(1,(t-t0)/600); el.textContent=Math.round(from+(to-from)*(1-Math.pow(1-k,3))).toLocaleString(); if (k<1) requestAnimationFrame(step); })(t0);
}

function nextQuestion(){
  const n=G.queue.length;
  if (G.qi>=n) return G.mode==='full' ? finish(true) : stageClear();
  const e=G.queue[G.qi];
  const types= G.mode==='full' ? ['year','event','blank','date'] : STAGES[G.stage].types;
  const q=makeQuestion(e,types);
  if (!q){ G.qi++; return nextQuestion(); }
  G.q=q; G.locked=false;
  renderHUD();
  $('#pbar').style.width=(G.qi/n*100)+'%';
  $('#q-type').textContent=TYPE_LABEL[q.type];
  $('#q-date').textContent=q.date; $('#q-date').style.display=q.date?'':'none';
  $('#q-prompt').textContent=q.prompt;
  $('#q-body').innerHTML=q.body; $('#q-body').style.display=q.body?'':'none';
  const card=$('#qcard'); card.classList.remove('enter','shake'); void card.offsetWidth; card.classList.add('enter');
  const box=$('#options'); box.innerHTML='';
  q.options.forEach((o,i)=>{
    const b=document.createElement('button'); b.className='opt'; b.style.animationDelay=(.25+i*.1)+'s';
    b.innerHTML=`<span class="key">${'ABC'[i]}</span><span class="txt"></span>`; b.querySelector('.txt').textContent=o.text;
    b.addEventListener('click',()=>answer(i)); box.appendChild(b);
  });
  $('#reveal').classList.remove('show');
  boost(6,400);
  startTimer(G.mode==='full'?FULL_TIME:STAGES[G.stage].time);
}

let timerStep=null, pausedLeft=0;
function setPaused(p){
  G.paused=p;
  $('#scr-game').classList.toggle('paused',p); $('#timer').classList.toggle('paused',p);
  $('#timer-ico').textContent= p ? '▶ 繼續' : '⏸ 暫停';
}
function togglePause(){
  if (G.locked||G.over||!timerStep) return;
  sfx.click();
  if (!G.paused){ cancelAnimationFrame(timerRAF); pausedLeft=timerEnd-performance.now(); setPaused(true); }
  else { timerEnd=performance.now()+pausedLeft; setPaused(false); timerRAF=requestAnimationFrame(timerStep); }
}
function startTimer(sec){
  cancelAnimationFrame(timerRAF); setPaused(false);
  const C=2*Math.PI*26, bar=$('#timer-bar'), num=$('#timer-num'), tm=$('#timer');
  bar.style.strokeDasharray=C; tm.classList.remove('warn');
  timerEnd=performance.now()+sec*1000+600; lastTick=sec+1;
  (timerStep=function step(t){
    const left=Math.max(0,(timerEnd-t)/1000); G.timeLeft=left;
    const whole=Math.ceil(Math.min(left,sec));
    num.textContent=whole; bar.style.strokeDashoffset=C*(1-Math.min(1,left/sec));
    if (left<=5){ tm.classList.add('warn'); if (whole<lastTick&&whole>0){ sfx.tick(); } }
    lastTick=whole;
    if (left<=0){ answer(-1); return; }
    timerRAF=requestAnimationFrame(step);
  })(performance.now());
}

function answer(idx){
  if (G.locked||G.paused) return; G.locked=true;
  cancelAnimationFrame(timerRAF);
  const q=G.q, btns=[...$('#options').children], ok= idx>=0 && q.options[idx].correct;
  btns.forEach((b,i)=>{ b.disabled=true; b.style.animationDelay='0s';
    if (q.options[i].correct) b.classList.add('correct'); else if (i===idx) b.classList.add('wrong'); else b.classList.add('dim'); });
  G.answered++;
  const target=btns[idx>=0?idx:q.options.findIndex(o=>o.correct)].getBoundingClientRect();
  const cx=target.left+target.width/2, cy=target.top+target.height/2;
  let verdict='';
  if (ok){
    G.combo++; G.correct++; G.maxCombo=Math.max(G.maxCombo,G.combo);
    const gain=Math.round((100+Math.ceil(G.timeLeft)*6)*(1+Math.min(G.combo-1,10)*.1));
    G.score+=gain; animateScore(G.score);
    sfx.correct(); flash('good'); burst(cx,cy); boost(18,600);
    floater(`+${gain}`,cx,target.top);
    if (G.combo>=2) comboPop(`連擊 ×${G.combo}`);
    if (G.mode==='stage' && G.combo%5===0 && G.lives<MAX_LIVES){
      G.lives++; setTimeout(()=>{ renderHUD(); const h=[...document.querySelectorAll('.hearts .h')][G.lives-1]; h&&h.classList.add('pop'); sfx.heart(); },350);
      verdict=`✦ 答對了！ +${gain}　♥ 回復一顆心`;
    } else verdict=`✦ 答對了！ +${gain}`;
  } else {
    G.combo=0;
    G.wrong.push({ q, picked: idx>=0 ? q.options[idx].text : '（時間到）' });
    sfx.wrong(); flash('bad');
    if (!reduceMotion){ const card=$('#qcard'); card.classList.remove('enter','shake'); void card.offsetWidth; card.classList.add('shake'); }
    burst(cx,cy,['#39f0a2','#fff1c1'],18,5);
    if (G.mode==='stage'){
      G.lives--; const h=[...document.querySelectorAll('.hearts .h')][G.lives]; if (h){ h.classList.add('break'); }
      setTimeout(renderHUD,650);
    }
    verdict= idx<0 ? '⌛ 時間到！' : '✕ 答錯了';
  }
  renderHUD();
  const e=q.entry;
  $('#verdict').textContent=verdict; $('#verdict').className='verdict '+(ok?'ok':'ng');
  $('#record').innerHTML=`<b>${esc(e.ds)}</b>　${esc(e.raw)}`;
  const last = (G.mode==='stage' && G.lives<=0);
  $('#btn-next').textContent= last ? '查看結果' : (G.qi+1>=G.queue.length ? (G.mode==='full'||G.stage===STAGES.length-1 ? '查看結果 →' : '前往下一關 →') : '下一題 →');
  setTimeout(()=>{ $('#reveal').classList.add('show'); if (innerWidth<700) $('#reveal').scrollIntoView({behavior:'smooth',block:'nearest'}); },350);
}

function next(){
  if (!$('#reveal').classList.contains('show')) return;
  sfx.click();
  $('#reveal').classList.remove('show');
  if (G.mode==='stage' && G.lives<=0) return finish(false);
  G.qi++; nextQuestion();
}

function stageClear(){
  G.locked=true;
  const bonus=300+G.lives*50; G.score+=bonus; animateScore(G.score);
  $('#pbar').style.width='100%';
  if (G.stage>=STAGES.length-1) return finish(true);
  confetti(90); sfx.win();
  banner(`<div class="b-kicker">STAGE CLEAR</div><div class="b-title">${slamLetters('過關')}</div><div class="b-sub">${STAGES[G.stage].name}</div><div class="b-years">過關獎勵 +${bonus}</div>`,2100)
    .then(()=>enterStage(G.stage+1));
}

function finish(cleared){
  G.locked=true; G.over=true; cancelAnimationFrame(timerRAF); setPaused(false);
  const acc=G.answered?Math.round(G.correct/G.answered*100):0;
  const full=G.mode==='full';
  const allDone = full ? G.qi>=G.queue.length : cleared;
  $('#r-kicker').textContent= allDone ? 'MISSION COMPLETE' : (full?'CHALLENGE ENDED':'GAME OVER');
  $('#r-title').textContent= full ? (allDone?'題庫全破！':'挑戰結束') : (cleared?'通關成功！':`止步第${NUMS[G.stage]}關`);
  const rank= acc>=95?'苑史大師': acc>=80?'苑史達人': acc>=60?'精進行者': acc>=40?'初心學徒':'時光旅人';
  $('#r-rank').textContent=`稱號・${rank}`;
  $('#s-acc').textContent=acc+'%'; $('#s-cor').textContent=`${G.correct}/${G.answered}`; $('#s-combo').textContent=G.maxCombo;
  const key='best.'+G.mode, best=+store.get(key)||0, isNew=G.score>best&&G.score>0;
  if (isNew) store.set(key,G.score);
  const rb=$('#r-best'); rb.className='r-best'+(isNew?' new':''); rb.textContent= isNew ? '★ 新紀錄！' : `最佳紀錄 ${best.toLocaleString()}`;
  // 錯題回顧
  $('#review').style.display=G.wrong.length?'':'none'; $('#review').open=false;
  $('#review-sum').textContent=`錯題回顧（${G.wrong.length} 題）`;
  $('#review-list').innerHTML=G.wrong.map(({q,picked})=>{
    const right=q.options.find(o=>o.correct).text;
    return `<div class="rv"><span class="d">${esc(q.entry.ds)}</span>　${esc(q.entry.raw)}<div class="a">${esc(TYPE_LABEL[q.type])}｜你的答案：<em>${esc(picked)}</em>　正解：<strong>${esc(right)}</strong></div></div>`;
  }).join('');
  show('scr-result');
  const el=$('#r-score'), t0=performance.now(), to=G.score;
  (function step(t){ const k=Math.min(1,(t-t0)/1400); el.textContent=Math.round(to*(1-Math.pow(1-k,4))).toLocaleString(); if (k<1) requestAnimationFrame(step); })(t0);
  if (allDone||acc>=80){ sfx.win(); setTimeout(()=>confetti(220),300); boost(20,1500); } else sfx.lose();
}

/* =========================================================
   首頁 & 事件綁定
   ========================================================= */
function stageYears(i){
  const s=STAGES[i], list=stageEntries(i);
  return list.length ? [Math.min(...list.map(e=>e.y)), Math.max(...list.map(e=>e.y))] : [s.from, s.to];
}
function renderTitle(){
  $('#stage-map').innerHTML=STAGES.map((s,i)=>{ const [a,b]=stageYears(i);
    return `<li style="animation-delay:${.6+i*.12}s"><button type="button" class="stage-pick" data-stage="${i}" title="從第${NUMS[i]}關開始挑戰"><span class="node">${NUMS[i]}</span><span class="sl">第${NUMS[i]}關</span><span class="sn">${s.name}</span><span class="sy">${a}–${b}</span></button></li>`; }).join('');
  const logo=$('#logo'); logo.innerHTML=[...'苑史闖關'].map((c,i)=>`<span style="animation-delay:${.15+i*.12}s">${c}</span>`).join('');
  const bs=+store.get('best.stage')||0, bf=+store.get('best.full')||0;
  $('#full-sub').textContent=`每一條苑史紀錄一題・共 ${ENTRIES.length} 題`;
  $('#meta').innerHTML=
    `<span class="chip ${DATA_SRC==='cloud'?'live':''}">${DATA_SRC==='cloud'?'雲端資料庫已連線':'離線備份資料'}</span>`+
    `<span class="chip">題庫 <b>${ENTRIES.length}</b> 條紀錄</span>`+
    (bs?`<span class="chip">闖關最佳 <b>${bs.toLocaleString()}</b></span>`:'')+
    (bf?`<span class="chip">題庫最佳 <b>${bf.toLocaleString()}</b></span>`:'');
  $('#btn-sound').textContent= muted ? '🔇 音效關' : '🔊 音效開';
}
$('#btn-start').onclick=()=>startGame('stage');
$('#stage-map').addEventListener('click',ev=>{ const b=ev.target.closest('.stage-pick'); if (b) startGame('stage', +b.dataset.stage); });
$('#btn-full').onclick=()=>startGame('full');
$('#btn-sound').onclick=()=>{ muted=!muted; store.set('muted',muted?'1':'0'); renderTitle(); sfx.click(); };
$('#btn-reload').onclick=async()=>{ show('scr-loading'); await loadData(); renderTitle(); show('scr-title'); };
$('#btn-next').onclick=next;
$('#timer').onclick=togglePause;
if (fsSupported) $('#btn-fs').onclick=toggleFS; else $('#btn-fs').style.display='none';
$('#btn-quit').onclick=()=>{ if (G.over) return; if (confirm('確定要結束這次挑戰嗎？')){ cancelAnimationFrame(timerRAF); finish(false); } };
$('#btn-again').onclick=()=>startGame(G.mode, G.startStage||0);
$('#btn-home').onclick=()=>{ sfx.click(); renderTitle(); show('scr-title'); };
addEventListener('keydown',ev=>{
  if (!$('#scr-game').classList.contains('active') || $('#banner').classList.contains('show')) return;
  const k=ev.key.toLowerCase(), map={'1':0,'2':1,'3':2,a:0,b:1,c:2};
  if (!G.locked && (k==='p'||k===' ')){ togglePause(); ev.preventDefault(); }
  else if (!G.locked && k in map){ answer(map[k]); ev.preventDefault(); }
  else if (G.locked && (k==='enter'||k===' ')){ next(); ev.preventDefault(); }
});

(async function init(){
  await loadData();
  if (!ENTRIES.length){ $('.loading-text').textContent='無法讀取題庫資料，請稍後再試。'; return; }
  renderTitle(); show('scr-title'); boost(20,900);
})();
