
const $=s=>document.querySelector(s);
let me=null,role='',peer,hostConn,conns=[],code='',voted={},endAt=0,curSong=-1,hEnd=0,timer=null;
let S={p1:null,p2:null,songs:[],round:0,phase:'lobby',dur:0,left:0,score:[0,0],votes:[0,0],started:false,win:-1,turn:25};

let CID=window.TWITCH_CLIENT_ID||'';
function showErr(m){const e=$('#err');e.textContent=m;e.classList.remove('hide')}
const pub=()=>({login:me.login,name:me.name,img:me.img});
const scr=id=>{document.querySelectorAll('.screen').forEach(e=>e.classList.toggle('on',e.id===id))};

/* ---------- Twitch Login + Chat ---------- */
$('#tw').onclick=async()=>{
  if(!CID){try{CID=(await(await fetch('/api/config')).json()).clientId||''}catch(e){}}
  if(!CID)return showErr('Client-ID nicht gefunden. Trage TWITCH_CLIENT_ID bei Netlify ein und deploye neu, oder schreibe sie in config.js.');
  const st=[...crypto.getRandomValues(new Uint8Array(12))].map(b=>b.toString(16).padStart(2,'0')).join('');
  document.cookie='rb_state='+st+'; Path=/; Max-Age=600; SameSite=Lax'+(location.protocol==='https:'?'; Secure':'');
  location.href='https://id.twitch.tv/oauth2/authorize?'+new URLSearchParams({client_id:CID,redirect_uri:location.origin+'/',response_type:'token',scope:'chat:read chat:edit',state:st});
};
$('#meBox').onclick=()=>{if(confirm('Twitch trennen?')){localStorage.removeItem('rbtok');location.reload()}};
async function initAuth(){
  const h=new URLSearchParams(location.hash.slice(1)),q=new URLSearchParams(location.search);
  if(q.get('error'))showErr('Twitch: '+(q.get('error_description')||q.get('error')));
  if(h.get('error'))alert('Twitch-Login fehlgeschlagen: '+h.get('error'));
  if(h.get('access_token')){const m=document.cookie.match(/rb_state=([a-f0-9]+)/);if(m&&m[1]===h.get('state'))localStorage.rbtok=h.get('access_token');else alert('Ungültiger Login (state)');history.replaceState(null,'',location.pathname+location.search)}else if(h.get('error'))history.replaceState(null,'',location.pathname)
  const t=localStorage.rbtok;if(!t)return;
  try{
    if(!CID)CID=(await(await fetch('/api/config')).json()).clientId;if(!CID)throw 0;
    const r=await fetch('https://api.twitch.tv/helix/users',{headers:{Authorization:'Bearer '+t,'Client-Id':CID}});
    const d=(await r.json()).data[0];
    me={login:d.login,name:d.display_name,img:d.profile_image_url,token:t};
    $('#tw').classList.add('hide');$('#meBox').classList.remove('hide');$('#meImg').src=me.img;$('#meName').textContent=me.name;
    $('#mk').disabled=$('#jn').disabled=false;chatConnect();
  }catch(e){localStorage.removeItem('rbtok')}
}
function chatConnect(){
  const ws=new WebSocket('wss://irc-ws.chat.twitch.tv:443');me.ws=ws;
  ws.onopen=()=>{ws.send('CAP REQ :twitch.tv/tags');ws.send('PASS oauth:'+me.token);ws.send('NICK '+me.login);ws.send('JOIN #'+me.login)};
  ws.onmessage=e=>e.data.split('\r\n').forEach(l=>{
    if(l.startsWith('PING'))return ws.send('PONG :tmi.twitch.tv');
    const m=l.match(/^@(\S+) :(\w+)!\S+ PRIVMSG #\S+ :(.*)$/);if(!m)return;
    const tg=Object.fromEntries(m[1].split(';').map(x=>x.split('=')));
    emitChat({u:tg['display-name']||m[2],c:tg.color||'#fff',m:m[3]});
  });
  ws.onclose=()=>setTimeout(()=>me&&chatConnect(),4000);
}
function emitChat(c){if(role==='host')hostChat(c);else if(role==='guest'&&hostConn&&hostConn.open)hostConn.send({t:'chat',c})}
function addChat(c){
  const d=document.createElement('div'),b=document.createElement('b');
  b.textContent=c.u;b.style.color=c.c;d.append(b,document.createTextNode(c.m));
  const box=$('#msgs');box.append(d);while(box.children.length>6)box.firstChild.remove();
}
$('#cs').onclick=()=>{const v=$('#ci').value.trim();if(!v||!me)return;me.ws.send('PRIVMSG #'+me.login+' :'+v);emitChat({u:me.name,c:'#9146ff',m:v});$('#ci').value=''};
$('#ci').onkeydown=e=>{if(e.key==='Enter')$('#cs').click()};

/* ---------- Verbindung (PeerJS, Code = Raum) ---------- */
$('#mk').onclick=()=>{if(me)startHost()};
$('#jn').onclick=()=>{const c=$('#jc').value.trim().toUpperCase();if(me&&c)connect(c,'player')};
$('#cp').onclick=()=>{navigator.clipboard&&navigator.clipboard.writeText($('#link').value);$('#cp').textContent='Kopiert'};

function startHost(){
  role='host';code=Math.random().toString(36).slice(2,7).toUpperCase();
  peer=new Peer('rbattle-'+code);
  peer.on('error',e=>{if(e.type==='unavailable-id'){peer.destroy();startHost()}else alert('Verbindungsfehler: '+e.type)});
  peer.on('open',()=>{
    S.p1=pub();$('#code').textContent=code;$('#link').value=location.origin+location.pathname+'?watch='+code;
    $('#chat').classList.remove('hide');scr('lobby');pushState();
  });
  peer.on('connection',c=>{
    c.on('data',d=>hostData(c,d));
    c.on('close',()=>{conns=conns.filter(x=>x!==c);if(c.pl&&!S.started){S.p2=null;pushState()}});
  });
}
function hostData(c,d){
  if(d.t==='hello'){
    if(d.role==='player'){
      if(!d.me||!d.me.login)return c.send({t:'deny',msg:'Du musst zuerst Twitch verbinden.'});
      if(S.p2||S.started)return c.send({t:'deny',msg:'Das Battle ist schon voll oder gestartet.'});
      c.pl=1;S.p2=d.me;
    }
    conns.push(c);pushState();
  }
  if(d.t==='chat')hostChat(d.c);
}
function connect(c,r){
  role=r==='player'?'guest':'spec';peer=new Peer();
  peer.on('error',e=>{alert('Verbindungsfehler: '+(e.type==='peer-unavailable'?'Code nicht gefunden':e.type));location.reload()});
  peer.on('open',()=>{
    hostConn=peer.connect('rbattle-'+c,{reliable:true});
    hostConn.on('open',()=>{hostConn.send({t:'hello',role:r,me:me?pub():null});$('#chat').classList.remove('hide');if(r!=='player')$('#cin').classList.add('hide')});
    hostConn.on('data',d=>{if(d.t==='state')onState(d.s);if(d.t==='chat')addChat(d.c);if(d.t==='deny'){alert(d.msg);location.reload()}});
    hostConn.on('close',()=>{alert('Host hat die Verbindung beendet.');location.reload()});
  });
}
function pushState(){
  S.left=Math.max(0,hEnd-Date.now());S.viewers=conns.filter(c=>!c.pl).length;
  const o=JSON.parse(JSON.stringify(S));
  conns.forEach(c=>c.open&&c.send({t:'state',s:o}));onState(o);
}
function hostChat(c){
  addChat(c);conns.forEach(x=>x.open&&x.send({t:'chat',c}));
  const v=c.m.trim();
  if(S.phase==='vote'&&(v==='1'||v==='2')&&!voted[c.u]){voted[c.u]=1;S.votes[+v-1]++;pushState()}
}

/* ---------- Spielablauf (nur Host) ---------- */
$('#go').onclick=()=>{
  S.songs=$('#songs').value.split('\n').map(x=>x.trim()).filter(x=>/^https?:\/\/(soundcloud\.com|on\.soundcloud\.com|music\.apple\.com)/.test(x)).slice(0,10);
  if(!S.songs.length||!S.p2)return alert('Füge mindestens einen SoundCloud- oder Apple-Music-Link hinzu.');
  S.turn=Math.min(90,Math.max(10,+$('#turn').value||25));S.started=true;S.score=[0,0];S.round=0;
  run('intro',4,round);
};
function run(ph,sec,next){S.phase=ph;S.dur=sec;hEnd=Date.now()+sec*1000;pushState();clearTimeout(timer);timer=setTimeout(next,sec*1000)}
function round(){
  if(S.round>=S.songs.length){S.phase='end';S.dur=0;hEnd=0;return pushState()}
  S.votes=[0,0];voted={};S.win=-1;
  run('rap1',S.turn,()=>run('rap2',S.turn,()=>run('vote',12,()=>{
    S.win=S.votes[0]>S.votes[1]?0:S.votes[1]>S.votes[0]?1:-1;if(S.win>=0)S.score[S.win]++;
    run('result',6,()=>{S.round++;round()});
  })));
}

/* ---------- Anzeige (alle) ---------- */
function embed(u){
  if(/soundcloud\.com/.test(u))return'https://w.soundcloud.com/player/?url='+encodeURIComponent(u)+'&auto_play=true&hide_related=true&show_comments=false';
  return u.replace('music.apple.com','embed.music.apple.com');
}
let lastScore=[0,0];
function onState(s){
  S=s;endAt=Date.now()+s.left;if(!s.started){document.body.dataset.turn='';curSong=-1;$('#music').style.display='none'}
  if(!s.started){
    scr('lobby');
    $('#lp1').textContent=s.p1?s.p1.name+' (Team 1)':'';$('#lp2').textContent=s.p2?s.p2.name+' (Team 2)':'Warte auf Gegner…';$('#lp2').classList.toggle('f',!!s.p2);
    document.querySelectorAll('.ho').forEach(e=>e.classList.toggle('hide',role!=='host'));
    $('.wt').classList.toggle('hide',role==='host');$('#go').disabled=!s.p2;return;
  }
  scr('arena');
  const names=[s.p1.name,s.p2.name],ph=s.phase;document.body.dataset.turn=ph==='rap1'?'1':ph==='rap2'?'2':'';
  $('#role').textContent=(role==='spec'?'Zuschauer':role==='host'?'Host':'Spieler')+' · 👀 '+(s.viewers||0);
  $('#rd').textContent=ph==='end'?'Finale':'Runde '+(s.round+1)+' / '+s.songs.length;
  [1,2].forEach(i=>{
    const p=s['p'+i];$('#n'+i).textContent=p.name;$('#i'+i).src=p.img;$('#c'+i).classList.toggle('act',ph==='rap'+i);
    const e=$('#s'+i);if(+e.textContent!==s.score[i-1]){e.textContent=s.score[i-1];e.classList.remove('pop');void e.offsetWidth;e.classList.add('pop')}
  });
  const L={intro:'Beats an. Gleich geht es los!',rap1:'🎤 '+names[0]+' rappt',rap2:'🎤 '+names[1]+' rappt',vote:'Chat: schreibe 1 oder 2',
    result:s.win<0?'Unentschieden':'Punkt für '+names[s.win],
    end:s.score[0]===s.score[1]?'Unentschieden im Finale':'🏆 '+names[s.score[0]>s.score[1]?0:1]+' gewinnt'};
  if($('#lbl').dataset.k!==ph+s.round){$('#lbl').dataset.k=ph+s.round;$('#lbl').textContent=L[ph];beep(ph==='vote'?660:ph==='result'||ph==='end'?880:440);if(ph==='result'||ph==='end')$('.stage').classList.add('shake');setTimeout(()=>$('.stage').classList.remove('shake'),600)}
  const show=ph==='vote'||ph==='result',tot=s.votes[0]+s.votes[1]||1;
  $('#vt').classList.toggle('hide',!show);
  $('#v1').style.width=(s.votes[0]+s.votes[1]?s.votes[0]/tot*100:50)+'%';$('#v2').style.width=(s.votes[0]+s.votes[1]?s.votes[1]/tot*100:50)+'%';
  $('#v1').textContent=s.votes[0];$('#v2').textContent=s.votes[1];
  if(ph==='rap1'&&curSong!==s.round){curSong=s.round;$('#music').style.display='block';$('#mf').src=embed(s.songs[s.round])}
  $('#again').classList.toggle('hide',!(ph==='end'&&role==='host'));if(ph!=='end')window._cf=0;if(ph==='end'){if(!window._cf){window._cf=1;confetti()}$('#music').style.display='none';$('#mf').src='about:blank'}
}
(function tick(){
  const l=Math.max(0,endAt-Date.now());
  $('#tm').textContent=S.dur&&S.started?Math.ceil(l/1000):'';
  $('#bar').style.width=S.dur?(l/(S.dur*1000)*100)+'%':'0';
  requestAnimationFrame(tick);
})();

function confetti(){const c=['#ffb020','#25d0ff','#9146ff','#fff'];for(let i=0;i<70;i++){const d=document.createElement('i');d.className='cf';d.style.cssText='left:'+Math.random()*100+'vw;background:'+c[i%4]+';animation-duration:'+(2+Math.random()*2.5)+'s;animation-delay:'+Math.random()*.8+'s';document.body.append(d);setTimeout(()=>d.remove(),5500)}}
$('#again').onclick=()=>{clearTimeout(timer);S.started=false;S.phase='lobby';S.round=0;S.score=[0,0];S.votes=[0,0];S.dur=0;hEnd=0;pushState()};
if('serviceWorker'in navigator&&false)navigator.serviceWorker.register('sw.js');
$('#songs').value=localStorage.rbsongs||'';$('#songs').oninput=()=>localStorage.rbsongs=$('#songs').value;
let ac;function beep(f,d=.15){try{ac=ac||new AudioContext();const o=ac.createOscillator(),g=ac.createGain();o.frequency.value=f;g.gain.value=.08;o.connect(g);g.connect(ac.destination);o.start();o.stop(ac.currentTime+d)}catch(e){}}
/* ---------- Start ---------- */
const w=new URLSearchParams(location.search).get('watch');
if(w)connect(w.toUpperCase(),'spectator');
else initAuth();
