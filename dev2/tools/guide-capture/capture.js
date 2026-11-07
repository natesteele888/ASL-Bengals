// Captures every How-To Guide screenshot from the real app running on the
// made-up team (rig.js). Writes out/<id>.png plus out/callouts.json.
const {launch}=require('./rig.js'),path=require('path'),fs=require('fs');
const OUT=path.join(__dirname,'out'); fs.mkdirSync(OUT,{recursive:true});
const only=process.argv[2]?process.argv[2].split(','):null;
const W=ms=>new Promise(r=>setTimeout(r,ms));
const sec=s=>async p=>{await p.click(`[data-section="${s}"]`);await W(1600);};
const mode=m=>async p=>{await p.click(`[data-mode="${m}"]`);await W(1400);};
const top=(sel,off=0)=>async p=>{await p.evaluate(([s,o])=>{const e=document.querySelector(s);if(!e)return;const y=e.getBoundingClientRect().top+scrollY-o;scrollTo(0,y)},[sel,off]);await W(500);};
const ct=k=>async p=>{await sec('coachtools')(p);await p.evaluate(k=>window.openCoachToolsTab(k),k);await W(1800);};
const SHOTS=[
 // ---------- players ----------
 {id:'nav',role:'player',prep:[],co:['#playSectionBtn','.modeBtn[data-mode="study"]','#playerMenuBtn','#openLeaderboardBtn','#helpBtn']},
 {id:'plays',role:'player',prep:[async p=>{await p.click('.formation-card');await W(1200);},top('.pc-back-btn',120)],co:['.play-tile','.pc-back-btn']},
 {id:'playcard',role:'player',prep:[async p=>{await p.click('.formation-card');await W(900);await p.click('.play-tile');await W(1800);},top('.card-outer',8)],co:['.card-toggle-row','svg text:1','.card-face.card-front .card-play-btn, .card-front button[class*=play]']},
 {id:'signals',role:'player',prep:[mode('study')],co:[]},
 {id:'quiz',role:'player',prep:[mode('quiz')],co:[]},
 {id:'timed',role:'player',prep:[mode('timed')],co:[]},
 {id:'playquiz',role:'player',prep:[mode('playcallsquiz')],co:[]},
 {id:'twomin',role:'player',prep:[async p=>{await p.evaluate(()=>window.openTwoMinDrillOverlay());await W(1800);}],co:[]},
 {id:'opp',role:'player',prep:[sec('oppoffense')],co:[]},
 {id:'film',role:'player',prep:[sec('film')],co:['.frNews','[data-fr="board"]','.frFilm']},
 {id:'filmreport',role:'player',prep:[sec('film'),async p=>{await p.click('.frFilm');await W(1800);}],co:[]},
 {id:'filmopen',role:'player',prep:[sec('film'),async p=>{await p.getByText('Westfield vs Riverside').first().click();await W(2500);}],co:['#frFrame','#frMark','#frPost','.frNote']},
 {id:'c_filmopen',role:'coach',prep:[sec('film'),async p=>{await p.getByText('Westfield vs Riverside').first().click();await W(2500);},top('.frNote',300)],co:[]},
 {id:'filmboard',role:'player',prep:[sec('film'),async p=>{await p.click('[data-fr="board"]');await W(1500);}],co:[]},
 {id:'thisweek',role:'player',prep:[sec('thisweek')],co:[]},
 {id:'schedule',role:'player',prep:[sec('schedule')],co:[]},
 {id:'standings',role:'player',prep:[sec('standings')],co:[]},
 {id:'board',role:'player',prep:[async p=>{await p.click('#openLeaderboardBtn');await W(1600);}],co:[]},
 {id:'menu',role:'player',prep:[async p=>{await p.click('#playerMenuBtn');await W(1000);}],co:[]},
 // ---------- parents ----------
 {id:'p_schedule',role:'parent',prep:[sec('schedule')],co:[]},
 {id:'p_menu',role:'parent',prep:[async p=>{await p.click('#playerMenuBtn');await W(1000);}],co:[]},
 {id:'p_game',role:'parent',prep:[sec('schedule'),async p=>{await p.click('.scheduleResultBadge.upcoming');await W(2200);}],co:['#schedAddToCalBtn']},
 {id:'p_standings',role:'parent',prep:[sec('standings')],co:[]},
 // ---------- coaches ----------
 {id:'c_scout',role:'coach',prep:[ct('opponentfilm'),top('#scoutDiagramsAdmin',40)],co:['#scoutDiagTeam','#scoutDiagFile','#scoutDiagImport']},
 {id:'c_game',role:'coach',prep:[sec('schedule'),async p=>{await p.getByText('Hillcrest',{exact:true}).first().click();await W(2200);await p.getByText('Edit This Game').first().click();await W(1500);await p.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Add Footage Link'));if(b)scrollTo(0,b.getBoundingClientRect().top+scrollY-420);});await W(600);}],co:['text:+ Add Footage Link']},
 {id:'c_tools',role:'coach',prep:[sec('coachtools')],co:[]},
 {id:'c_oppfilm',role:'coach',prep:[ct('opponentfilm')],co:[]},
 {id:'c_vault',role:'coach',prep:[ct('filmvault')],co:[]},
 {id:'c_dash',role:'coach',prep:[ct('dashboard')],co:[]},
 {id:'c_roster',role:'coach',prep:[ct('roster')],co:[]},
 {id:'c_import',role:'coach',prep:[ct('scheduleimport')],co:[]},
 {id:'c_thisweek',role:'coach',prep:[sec('thisweek'),top('#thisweekEditSection',90)],co:[]},
 {id:'c_studio',role:'coach',prep:[ct('playstudio')],co:[]},
];
async function where(p,sel){return p.evaluate(sel=>{
  const vis=e=>{const r=e.getBoundingClientRect();return r.width>2&&r.height>2&&r.bottom>0&&r.top<innerHeight&&getComputedStyle(e).visibility!=='hidden'};
  let el=null;
  if(sel.startsWith('text:')){const t=sel.slice(5);el=[...document.querySelectorAll('body *')].filter(e=>vis(e)&&e.textContent.includes(t)).sort((a,b)=>a.textContent.length-b.textContent.length)[0];}
  else if(sel.startsWith('svg text:')){const t=sel.slice(9);el=[...document.querySelectorAll('svg text')].filter(e=>vis(e)&&e.textContent.trim()===t)[0];}
  else el=[...document.querySelectorAll(sel)].filter(vis)[0];
  if(!el)return null;const r=el.getBoundingClientRect();
  return {x:+((r.left+r.width/2)/innerWidth*100).toFixed(1),y:+((r.top+r.height/2)/innerHeight*100).toFixed(1),w:+(r.width/innerWidth*100).toFixed(1),h:+(r.height/innerHeight*100).toFixed(1)};},sel);}
(async()=>{
  const CO=fs.existsSync(path.join(OUT,'callouts.json'))?JSON.parse(fs.readFileSync(path.join(OUT,'callouts.json'))):{};
  const shots=SHOTS.filter(s=>!only||only.includes(s.id));
  for(const s of shots){
    const {b,p,errs}=await launch({role:s.role});
    try{for(const f of s.prep)await f(p);}catch(e){console.log(s.id,'prep fail',e.message.split('\n')[0]);}
    await W(400);
    CO[s.id]=[];for(const c of s.co){const r=await where(p,c);if(!r)console.log(s.id,'missing callout',c);CO[s.id].push(r);}
    await p.screenshot({path:path.join(OUT,s.id+'.png')});
    if(errs.length)console.log(s.id,'errors',errs.slice(0,3));
    await b.close();
  }
  fs.writeFileSync(path.join(OUT,'callouts.json'),JSON.stringify(CO,null,1));
  console.log('done',shots.length);
})();
