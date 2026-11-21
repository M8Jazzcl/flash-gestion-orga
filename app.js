// ====== Config ======
const EXAM_DATE = "2026-12-02"; // date du contrôle
const STATE_KEY = "flashorga_state_v1";
const QUEUE_KEY = "flashorga_queue_v1";
const DONE_KEY = "flashorga_donecount_v1";

// ====== Utils ======
function todayISO(){
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
}
function daysBetween(a, b){
  const da = new Date(a+"T00:00:00");
  const db = new Date(b+"T00:00:00");
  return Math.round((db - da) / 86400000);
}
function addDays(dateISO, n){
  const d = new Date(dateISO+"T00:00:00");
  d.setDate(d.getDate()+n);
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
}
function shuffle(arr){
  for(let i=arr.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]] = [arr[j],arr[i]];
  }
  return arr;
}
function loadJSON(key, fallback){
  try{
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  }catch(e){ return fallback; }
}
function saveJSON(key, val){
  localStorage.setItem(key, JSON.stringify(val));
}

// ====== State (spaced repetition, SM-2 like) ======
// per question id: {introduced, dueDate, interval, ease, reps, lapses}
function initState(questions){
  let state = loadJSON(STATE_KEY, null);
  if(!state){
    state = {};
    questions.forEach(q=>{
      state[q.id] = {introduced:false, dueDate:null, interval:0, ease:2.5, reps:0, lapses:0};
    });
    saveJSON(STATE_KEY, state);
  }
  // make sure any new question ids (if bank updated) get an entry
  questions.forEach(q=>{
    if(!state[q.id]) state[q.id] = {introduced:false, dueDate:null, interval:0, ease:2.5, reps:0, lapses:0};
  });
  return state;
}

function grade(state, qid, grading){
  // grading: 'again' | 'hard' | 'good' | 'easy'
  const s = state[qid];
  const today = todayISO();
  s.introduced = true;
  s.reps = (s.reps||0) + 1;
  if(grading === 'again'){
    s.lapses = (s.lapses||0) + 1;
    s.interval = 1; // revient vite -> "2x plus proposé"
    s.ease = Math.max(1.3, (s.ease||2.5) - 0.2);
  } else if(grading === 'hard'){
    s.interval = s.interval <= 0 ? 1 : Math.max(1, Math.round(s.interval * 1.2));
    s.ease = Math.max(1.3, (s.ease||2.5) - 0.05);
  } else if(grading === 'good'){
    s.interval = s.interval <= 0 ? 1 : (s.interval === 1 ? 6 : Math.round(s.interval * (s.ease||2.5)));
  } else if(grading === 'easy'){
    s.interval = s.interval <= 0 ? 2 : Math.round(s.interval * (s.ease||2.5) * 1.3) || 2;
    s.ease = (s.ease||2.5) + 0.15;
  }
  s.dueDate = addDays(today, s.interval);
  state[qid] = s;
  saveJSON(STATE_KEY, state);
}

// ====== Build today's queue ======
function buildTodayQueue(questions, state){
  const today = todayISO();
  const cached = loadJSON(QUEUE_KEY, null);
  if(cached && cached.day === today){
    return cached.ids;
  }
  const reviews = questions.filter(q => state[q.id].introduced && state[q.id].dueDate && state[q.id].dueDate <= today);
  const newOnes = questions.filter(q => !state[q.id].introduced);
  const daysLeft = Math.max(1, daysBetween(today, EXAM_DATE) + 1);
  const newToday = newOnes.length === 0 ? 0 : Math.max(1, Math.ceil(newOnes.length / daysLeft));
  const selectedNew = newOnes.slice(0, newToday);
  const ids = shuffle(reviews.map(q=>q.id).concat(selectedNew.map(q=>q.id)));
  saveJSON(QUEUE_KEY, {day: today, ids: ids});
  saveJSON(DONE_KEY, {day: today, count: 0, total: ids.length});
  return ids;
}

// ====== Rendering ======
let QUESTIONS = [];
let STATE = {};
let QUEUE = [];
let QIDX = 0;
let byId = {};

function render(){
  const app = document.getElementById('app');
  const bar = document.getElementById('progressBar');
  const left = document.getElementById('statsLeft');
  const done = document.getElementById('statsDone');
  const total = QUEUE.length;
  const progressPct = total === 0 ? 100 : Math.round((QIDX/total)*100);
  bar.style.width = progressPct + "%";
  left.textContent = `${Math.max(0,total-QIDX)} restantes aujourd'hui`;
  done.textContent = `${QIDX}/${total} faites`;

  if(QIDX >= total){
    app.innerHTML = `<div class="card done">
      <h2>✅ Terminé pour aujourd'hui !</h2>
      <p>Tu as fait ${total} question${total>1?'s':''} flash.</p>
      <p class="sub">Reviens demain à la même heure pour la suite.</p>
    </div>`;
    return;
  }

  const qid = QUEUE[QIDX];
  const q = byId[qid];
  app.innerHTML = `
    <div class="card">
      <div class="tag">Synthèse ${q.synthese} — ${escapeHtml(q.titre)}</div>
      <div class="question">${escapeHtml(q.question)}</div>
      <textarea id="userAnswer" placeholder="Tape ta réponse ici (pour toi-même, pas corrigée automatiquement)"></textarea>
      <button class="btn-primary" id="revealBtn">Voir la réponse</button>
      <div id="answerArea"></div>
    </div>
  `;
  document.getElementById('revealBtn').addEventListener('click', ()=>{
    document.getElementById('answerArea').innerHTML = `
      <div class="answer-box">
        <div class="label">Corrigé</div>
        <div>${escapeHtml(q.reponse)}</div>
      </div>
      <div class="grade-row">
        <button class="grade-bad" id="gradeAgain">❌ Raté</button>
        <button class="grade-ok" id="gradeHard">😐 Difficile</button>
        <button class="grade-good" id="gradeGood">✅ Bien</button>
      </div>
    `;
    document.getElementById('revealBtn').style.display='none';
    document.getElementById('gradeAgain').addEventListener('click', ()=>answerAndNext('again'));
    document.getElementById('gradeHard').addEventListener('click', ()=>answerAndNext('hard'));
    document.getElementById('gradeGood').addEventListener('click', ()=>answerAndNext('good'));
  });
}

function answerAndNext(g){
  grade(STATE, QUEUE[QIDX], g);
  QIDX += 1;
  const d = loadJSON(DONE_KEY, {day:todayISO(), count:0, total:QUEUE.length});
  d.count = QIDX;
  saveJSON(DONE_KEY, d);
  render();
}

function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function updateExamInfo(){
  const today = todayISO();
  const daysLeft = Math.max(0, daysBetween(today, EXAM_DATE));
  document.getElementById('examInfo').textContent =
    daysLeft > 0
      ? `Contrôle le 02/12 — J-${daysLeft}`
      : "Jour du contrôle (ou passé) — bonne chance !";
}

async function main(){
  updateExamInfo();
  const resp = await fetch('questions.json');
  QUESTIONS = await resp.json();
  byId = {};
  QUESTIONS.forEach(q=> byId[q.id] = q);
  STATE = initState(QUESTIONS);
  QUEUE = buildTodayQueue(QUESTIONS, STATE);
  // if resuming mid-day, skip already answered ones using DONE_KEY count
  const d = loadJSON(DONE_KEY, {day:todayISO(), count:0, total:QUEUE.length});
  QIDX = (d.day === todayISO()) ? d.count : 0;
  render();
  requestNotifPermission();
}

function requestNotifPermission(){
  if("Notification" in window && Notification.permission === "default"){
    const btn = document.createElement('button');
    btn.textContent = "🔔 Activer les rappels";
    btn.className = "btn-primary";
    btn.style.marginTop = "14px";
    btn.onclick = ()=>{ Notification.requestPermission(); btn.remove(); };
    document.getElementById('app').appendChild(btn);
  }
  if("serviceWorker" in navigator){
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  }
}

main();
