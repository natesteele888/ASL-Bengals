// How-To Guide screenshot rig. Runs the real app (this dev2 folder) in a
// headless browser against a made-up team: fake sign-in, an in-memory
// stand-in database, made-up players, schedule, notes and scout pack. Nothing
// touches the live database, and no real name or team data reaches a picture.
//
//   cd dev2 && python3 -m http.server 8766 --bind 127.0.0.1 &
//   node tools/guide-capture/capture.js            # every shot
//   node tools/guide-capture/capture.js film,opp   # just these
// Then convert out/*.png to assets/guide/*.webp (585 wide, quality ~72) and
// adjust the callout numbers in js/guide.js if a screen moved.
const {chromium}=require('playwright'),fs=require('fs'),path=require('path');
const DIR=__dirname, APP='http://127.0.0.1:8766', DEV2=path.join(__dirname,'..','..');
// Play data: the public shipped defaults (js/shipped-defaults.js) and the
// public signal cards (dev/data/cards.json) -- nothing from the live database.
function shippedPlays(){const w={};new Function('window',fs.readFileSync(path.join(DEV2,'js','shipped-defaults.js'),'utf8'))(w);return w.SHIPPED_PLAYS_JSON;}
const iso=(d)=>new Date(Date.now()+d*864e5).toISOString().slice(0,10);
function demoDb(){
  const names=['Jordan Reyes','Mason Clark','Eli Brooks','Tyler Nunez','Caleb Ford','Owen Price','Liam Park','Noah Hayes','Ryan Cole','Drew Lane'];
  const players={}; names.forEach((n,i)=>players['demo'+i]={name:n,num:String([7,22,10,34,4,55,12,88,3,21][i]),position:['QB','RB','WR','FB','RB','OL','WR','TE','DB','LB'][i],quizStats:{best:Math.round(60+i*3),attempts:3+i},lastSeen:new Date().toISOString(),createdAt:'2026-08-15T12:00:00Z'});
  const film=(id)=>`https://drive.google.com/file/d/DEMO${id}xxxxxxxxxxxxxxxxxxxx/view`;
  const schedule=[
    {id:'gA',date:iso(-20),opponent:'Riverside',gameType:'Regular Season',homeAway:'Home',ourScore:28,oppScore:6,gameTime:'10:00',location:'Home Field',gameFootage:[{id:'f1',title:'Full Game',url:film('A1')}]},
    {id:'gB',date:iso(-13),opponent:'Lakeview',gameType:'Regular Season',homeAway:'Away',ourScore:14,oppScore:7,gameTime:'12:00',location:'Lakeview HS',gameFootage:[{id:'f2',title:'1st Quarter',url:film('B1')},{id:'f3',title:'2nd Quarter',url:film('B2')}]},
    {id:'gC',date:iso(-6),opponent:'Hillcrest',gameType:'Playoff',homeAway:'Home',ourScore:21,oppScore:14,gameTime:'11:00',location:'Home Field',gameFootage:[{id:'f4',title:'Full Game',url:film('C1')}]},
    {id:'gD',date:iso(1),opponent:'Westfield',gameType:'Playoff',homeAway:'Away',ourScore:'',oppScore:'',gameTime:'13:00',arriveTime:'12:00',location:'Westfield Stadium',opponentFilms:[{id:'o1',title:'Westfield vs Riverside',url:film('D1')},{id:'o2',title:'Westfield vs Lakeview',url:film('D2')}]},
  ];
  const t=(d)=>new Date(Date.now()-d*36e5).toISOString();
  const notes={['DEMOD1xxxxxxxxxxxxxxxxxxxx']:{
    n1:{t:252,text:'Every time the fullback steps right, they run right.',tag:'O',by:'Mason Clark',byId:'demo1',at:t(20),likes:{demo2:t(19),demo3:t(18),demo0:t(10)},pick:true,pickAt:t(9)},
    n2:{t:611,text:'#22 looks to the sideline right before a sweep.',tag:'O',by:'Eli Brooks',byId:'demo2',at:t(15),likes:{demo1:t(14)},replies:{r1:{text:'Saw it on the 2nd drive too',by:'Owen Price',byId:'demo5',at:t(12)}}},
    n3:{t:905,text:'Their safety creeps up on 3rd and short.',tag:'D',by:'Jordan Reyes',byId:'demo0',at:t(5)},
  }};
  const ago=d=>new Date(Date.now()-d*864e5).toISOString();
  const leaderboard=names.slice(0,8).map((n,i)=>({name:n,score:31-i*2,total:31,bestStreak:20-i,date:ago(i+1)}));
  const timedLeaderboard=names.slice(0,8).map((n,i)=>({name:n,timeMs:62000+i*7300,mistakes:i%3,date:ago(i+2)}));
  names.forEach((n,i)=>{players['demo'+i].pcqBestScore=10-Math.floor(i/2);});
  const st=[['Bengals',9,1,0,250,60],['Westfield',8,2,0,210,90],['Riverside',6,4,0,170,140],['Hillcrest',5,5,0,150,150],['Lakeview',3,7,0,110,190],['Oakmont',1,9,0,60,240]];
  const standings={updatedAt:ago(1),rawText:'',teams:st.map((t,i)=>({team:t[0],division:'Tackle 11U',wins:t[1],losses:t[2],ties:t[3],pf:t[4],pa:t[5],diff:t[4]-t[5],powerRank:i+1}))};
  return {
    leaderboard, timedLeaderboard, standings,
    dev2PlayData:{cards:JSON.parse(fs.readFileSync(path.join(DEV2,'..','dev','data','cards.json'))),plays:shippedPlays()},
    players:Object.assign(players,{demoC:{name:'Coach Sam',role:'coach',position:'Coach'},demoP:{name:'Pat Reyes',role:'parent',childRosterIds:['demo0']}}), schedule, filmRoom:{notes}, filmViews:{}, analytics:{}, whatsNew:null, settings:{}, practices:[], roster:null, opponentFilm:[{id:'sdDemo',scoutTeam:'Westfield',diagrams:require('./pack.js'),addedAt:new Date().toISOString()},{id:'ofDemo',teamNames:['Westfield','Riverside'],title:'Westfield vs Riverside',url:film('D1'),addedAt:new Date().toISOString()}],
  };
}
function store(db){
  const segs=u=>decodeURIComponent(new URL(u).pathname).replace(/\.json$/,'').split('/').filter(Boolean);
  const get=ks=>ks.reduce((a,k)=>a==null?null:a[k],db);
  const set=(ks,v)=>{if(!ks.length)return;let a=db;ks.slice(0,-1).forEach(k=>{if(a[k]==null||typeof a[k]!=='object')a[k]={};a=a[k]});if(v===null||v===undefined)delete a[ks[ks.length-1]];else a[ks[ks.length-1]]=v;};
  let n=0;
  return async route=>{const r=route.request(),ks=segs(r.url()),m=r.method();let body=null;try{body=r.postData()?JSON.parse(r.postData()):null}catch(e){}
    if(m==='GET'){const v=get(ks);return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(v===undefined?null:v)});}
    if(m==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'*','access-control-allow-headers':'*'}});
    if(m==='POST'){const id='-demo'+(++n);set([...ks,id],body);return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({name:id})});}
    if(m==='PUT'){set(ks,body);}
    if(m==='PATCH'&&body){Object.keys(body).forEach(k=>set([...ks,...k.split('/')],body[k]));}
    if(m==='DELETE'){set(ks,null);}
    return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(body)});};
}
const FIELD=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90"><rect width="160" height="90" fill="#2f6b34"/>${[...Array(11)].map((_,i)=>`<line x1="${8+i*14.4}" y1="0" x2="${8+i*14.4}" y2="90" stroke="#ffffff55" stroke-width=".6"/>`).join('')}<circle cx="80" cy="45" r="12" fill="#0008"/><path d="M76 38 L88 45 L76 52Z" fill="#fff"/></svg>`;
async function launch(opts){
  opts=opts||{};
  const b=await chromium.launch();
  const ctx=await b.newContext({viewport:opts.viewport||{width:390,height:844},deviceScaleFactor:2,serviceWorkers:'block',colorScheme:'light'});
  const db=demoDb(); if(opts.db) opts.db(db);
  await ctx.route(/firebaseio\.com/,store(db));
  await ctx.route(/identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com/,r=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({idToken:'demo',refreshToken:'demo',expiresIn:'3600',localId:'demo',id_token:'demo',refresh_token:'demo',expires_in:'3600',user_id:'demo'})}));
  await ctx.route(/drive\.google\.com/,r=>r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:`<body style="margin:0;background:#000">${FIELD.replace('<svg ','<svg style="width:100%;height:100vh" preserveAspectRatio="xMidYMid slice" ')}</body>`}));
  await ctx.route(/\/js\/auth\.js/,async r=>{const res=await r.fetch();const t=(await res.text()).replace("['coach nate',","['coach sam','coach nate',");r.fulfill({status:200,contentType:'application/javascript',body:t});});
  await ctx.route(/cloudfunctions\.net|fonts\.g|cdnjs|natesteele888\.github\.io\/apps|youtube|open-meteo|api\./,r=>r.abort());
  const role=opts.role||'player', who=opts.who||(role==='coach'?{playerId:'demoC',name:'Coach Sam',position:'Coach'}:role==='parent'?{playerId:'demoP',name:'Pat Reyes',childRosterIds:['demo0']}:{playerId:'demo0',name:'Jordan Reyes',position:'QB'});
  await ctx.addInitScript(({role,who})=>{try{
    localStorage.setItem('bengalsPlaybookAuthed','1');localStorage.setItem('bengalsUserRole',role);
    if(role==='coach')localStorage.setItem('bengalsCoachSession','1');
    localStorage.setItem('bengalsGateSession',JSON.stringify({refreshToken:'demo',kind:role==='coach'?'coach':'player'}));
    localStorage.setItem('bengalsPlayerSession',JSON.stringify(who));
    localStorage.setItem('bengalsTipsSeen','1');['aslBengalsPcTutorialSeen','aslBengalsGettingStartedSeen','twoMinDrillNewBadgeSeen','bengalsWhatsNewSeen_v2'].forEach(k=>localStorage.setItem(k,'1'));const d=new Date();localStorage.setItem('aslBengalsGameDaySplashSeenDate',d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'));
    if(!sessionStorage.getItem('__demoSeeded')){sessionStorage.setItem('__demoSeeded','1');localStorage.setItem('aslFilmRoomLastSeen',String(Date.now()-864e5));}
  }catch(e){}},{role,who});
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto(APP+'/index.html'); 
  await p.waitForFunction(()=>typeof window.setSection==='function'&&window.DATA,null,{timeout:45000}).catch(()=>{});
  await p.waitForTimeout(2500);
  return {b,p,errs,db};
}
module.exports={launch};
if(require.main===module){(async()=>{const {b,p,errs}=await launch();await p.screenshot({path:path.join(DIR,'boot.png')});console.log('setSection',await p.evaluate(()=>typeof window.setSection),'DATA',await p.evaluate(()=>!!window.DATA),'errs',errs.slice(0,8));await b.close();})();}
