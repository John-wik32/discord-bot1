const API = location.origin;
let auth = '';

async function login() {
  auth = pw.value;
  const r = await fetch(`${API}/api/channels`, {
    headers: { Authorization: auth }
  });
  if (!r.ok) return alert('Wrong password');

  const ch = await r.json();
  [sendChannel, scheduleChannel, testChannel].forEach(s =>
    s.innerHTML = ch.map(c => `<option value="${c.id}">${c.name}</option>`)
  );

  login.style.display = 'none';
  app.classList.remove('hidden');
  load();
}

function tab(t) {
  ['send','schedule','test','scheduled','history']
    .forEach(i => document.getElementById(i).classList.add('hidden'));
  document.getElementById(t).classList.remove('hidden');
}

async function send() {
  const f = new FormData();
  f.append('channelId', sendChannel.value);
  f.append('postTitle', sendText.value);
  [...sendFiles.files].forEach(x => f.append('mediaFile', x));
  await fetch(`${API}/api/post`, { method:'POST', headers:{Authorization:auth}, body:f });
}

async function schedule() {
  const f = new FormData();
  f.append('channelId', scheduleChannel.value);
  f.append('postTitle', scheduleText.value);
  f.append('scheduleTime', scheduleTime.value);
  [...scheduleFiles.files].forEach(x => f.append('mediaFile', x));
  await fetch(`${API}/api/post`, { method:'POST', headers:{Authorization:auth}, body:f });
}

async function test() {
  const f = new FormData();
  f.append('channelId', testChannel.value);
  [...testFiles.files].forEach(x => f.append('mediaFile', x));
  await fetch(`${API}/api/post`, { method:'POST', headers:{Authorization:auth}, body:f });
}

async function load() {
  scheduled.innerHTML = JSON.stringify(await (await fetch(`${API}/api/scheduled`, { headers:{Authorization:auth} })).json(), null, 2);
  history.innerHTML = JSON.stringify(await (await fetch(`${API}/api/history`, { headers:{Authorization:auth} })).json(), null, 2);
}
