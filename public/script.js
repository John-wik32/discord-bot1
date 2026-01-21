const API = location.origin;
let auth = '';

async function login() {
  auth = document.getElementById('password').value;
  const res = await fetch(`${API}/api/channels`, {
    headers: { Authorization: auth }
  });

  if (!res.ok) return alert('Wrong password');

  const channels = await res.json();
  document.getElementById('login').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  ['sendChannel','scheduleChannel','testChannel'].forEach(id => {
    document.getElementById(id).innerHTML =
      channels.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  });

  loadScheduled();
  loadHistory();
}

function showTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.add('hidden'));
  document.querySelectorAll('.tabs button').forEach(b => b.classList.remove('active'));
  document.getElementById(tab).classList.remove('hidden');
  event.target.classList.add('active');
}

async function sendNow() {
  const fd = new FormData();
  fd.append('channelId', sendChannel.value);
  fd.append('postTitle', sendText.value);
  [...sendFiles.files].forEach(f => fd.append('mediaFile', f));

  await fetch(`${API}/api/post`, {
    method: 'POST',
    headers: { Authorization: auth },
    body: fd
  });

  alert('Sent');
  sendText.value = '';
  sendFiles.value = '';
  loadHistory();
}

async function schedulePost() {
  const fd = new FormData();
  fd.append('channelId', scheduleChannel.value);
  fd.append('postTitle', scheduleText.value);
  fd.append('scheduleTime', scheduleTime.value);
  [...scheduleFiles.files].forEach(f => fd.append('mediaFile', f));

  await fetch(`${API}/api/post`, {
    method: 'POST',
    headers: { Authorization: auth },
    body: fd
  });

  alert('Scheduled');
  loadScheduled();
}

async function testSend() {
  const fd = new FormData();
  fd.append('channelId', testChannel.value);
  fd.append('postTitle', testText.value);
  [...testFiles.files].forEach(f => fd.append('mediaFile', f));

  await fetch(`${API}/api/post`, {
    method: 'POST',
    headers: { Authorization: auth },
    body: fd
  });

  alert('Test sent');
}

async function loadScheduled() {
  const res = await fetch(`${API}/api/scheduled`, {
    headers: { Authorization: auth }
  });
  const data = await res.json();

  scheduledList.innerHTML = data.map(p =>
    `<div>${new Date(p.time).toLocaleString()} — ${p.postTitle}</div>`
  ).join('');
}

async function loadHistory() {
  const res = await fetch(`${API}/api/history`, {
    headers: { Authorization: auth }
  });
  const data = await res.json();

  historyList.innerHTML = data.reverse().map(p =>
    `<div>${new Date(p.time).toLocaleString()} — ${p.title}</div>`
  ).join('');
}
