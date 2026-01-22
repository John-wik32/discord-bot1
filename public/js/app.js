const API_URL = window.location.origin;
let selectedFiles = [];
let isScheduling = false;
let allSchedules = [];
let currentPassword = '';

function updateActiveUsers() {
  fetch(API_URL + '/api/active-users').then(r => r.json()).then(d => {
    document.getElementById('userCount').textContent = d.count;
  }).catch(e => console.log('User count error'));
}

updateActiveUsers();
setInterval(updateActiveUsers, 5000);

function switchPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(page).classList.add('active');
  event.target.classList.add('active');
  if (page === 'schedules') loadSchedules();
}

const fileUpload = document.getElementById('fileUpload');
const fileInput = document.getElementById('fileInput');

fileUpload.addEventListener('click', () => fileInput.click());
fileUpload.addEventListener('dragover', (e) => { e.preventDefault(); fileUpload.style.borderColor = '#764ba2'; });
fileUpload.addEventListener('dragleave', () => { fileUpload.style.borderColor = '#667eea'; });
fileUpload.addEventListener('drop', (e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); });
fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

function handleFiles(files) {
  Array.from(files).forEach(file => {
    if (!selectedFiles.find(f => f.name === file.name && f.size === file.size)) {
      selectedFiles.push(file);
    }
  });
  renderFileList();
}

function renderFileList() {
  document.getElementById('fileList').innerHTML = selectedFiles.map((file, idx) => 
    '<div class="file-item"><span>' + file.name + ' (' + (file.size / 1024 / 1024).toFixed(2) + 'MB)</span><button type="button" onclick="removeFile(' + idx + ')">Remove</button></div>'
  ).join('');
}

function removeFile(idx) {
  selectedFiles.splice(idx, 1);
  renderFileList();
}

async function loadChannels() {
  const pwd = document.getElementById('password').value;
  currentPassword = pwd;
  if (!pwd) {
    showMessage('Please enter the dashboard password', 'info');
    return;
  }
  
  try {
    const res = await fetch(API_URL + '/api/channels', { headers: { 'x-dashboard-pwd': pwd } });
    if (res.status === 401) { showMessage('Invalid password', 'error'); return; }
    if (!res.ok) throw new Error(await res.text());
    
    const channels = await res.json();
    const select = document.getElementById('channel');
    select.innerHTML = '<option value="">Select a channel...</option>' + channels.map(ch => 
      '<option value="' + ch.id + '">' + ch.guild + ' - ' + ch.name + '</option>'
    ).join('');
  } catch (err) {
    showMessage('Failed to load channels: ' + err.message, 'error');
  }
}

document.getElementById('password').addEventListener('change', loadChannels);

document.getElementById('scheduleBtn').addEventListener('click', (e) => {
  e.preventDefault();
  isScheduling = !isScheduling;
  document.getElementById('scheduleFields').classList.toggle('show');
});

document.getElementById('sendNowBtn').addEventListener('click', async (e) => {
  e.preventDefault();
  const pwd = document.getElementById('password').value;
  const channelId = document.getElementById('channel').value;
  const title = document.getElementById('title').value;
  
  if (!pwd || !channelId || selectedFiles.length === 0) {
    showMessage('Please fill in all fields and select files', 'error');
    return;
  }
  
  try {
    document.getElementById('sendNowBtn').disabled = true;
    showMessage('Uploading files...', 'info');
    
    const formData = new FormData();
    selectedFiles.forEach(file => formData.append('files', file));
    
    const uploadRes = await fetch(API_URL + '/api/upload', {
      method: 'POST',
      headers: { 'x-dashboard-pwd': pwd },
      body: formData
    });
    
    if (!uploadRes.ok) throw new Error(await uploadRes.text());
    const uploadData = await uploadRes.json();
    
    showMessage('Sending to Discord...', 'info');
    
    const sendRes = await fetch(API_URL + '/api/send-now', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-dashboard-pwd': pwd },
      body: JSON.stringify({ channelId, title, files: uploadData.files })
    });
    
    if (!sendRes.ok) throw new Error(await sendRes.text());
    
    showMessage('Post sent successfully!', 'success');
    selectedFiles = [];
    renderFileList();
    document.getElementById('mediaForm').reset();
  } catch (err) {
    showMessage('Error: ' + err.message, 'error');
  } finally {
    document.getElementById('sendNowBtn').disabled = false;
  }
});

document.getElementById('scheduleBtn').addEventListener('click', async (e) => {
  if (isScheduling) return;
  
  e.preventDefault();
  
  const pwd = document.getElementById('password').value;
  const channelId = document.getElementById('channel').value;
  const title = document.getElementById('title').value;
  const date = document.getElementById('scheduleDate').value;
  const time = document.getElementById('scheduleTime').value;
  
  if (!pwd || !channelId || !date || !time || selectedFiles.length === 0) {
    showMessage('Please fill in all fields and select files', 'error');
    return;
  }
  
  try {
    document.getElementById('scheduleBtn').disabled = true;
    showMessage('Uploading files...', 'info');
    
    const formData = new FormData();
    selectedFiles.forEach(file => formData.append('files', file));
    
    const uploadRes = await fetch(API_URL + '/api/upload', {
      method: 'POST',
      headers: { 'x-dashboard-pwd': pwd },
      body: formData
    });
    
    if (!uploadRes.ok) throw new Error(await uploadRes.text());
    const uploadData = await uploadRes.json();
    
    showMessage('Scheduling post...', 'info');
    
    const schedRes = await fetch(API_URL + '/api/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-dashboard-pwd': pwd },
      body: JSON.stringify({
        channelId,
        title,
        files: uploadData.files,
        scheduledTime: new Date(date + 'T' + time).toISOString()
      })
    });
    
    if (!schedRes.ok) throw new Error(await schedRes.text());
    
    showMessage('Post scheduled successfully!', 'success');
    selectedFiles = [];
    renderFileList();
    document.getElementById('mediaForm').reset();
    document.getElementById('scheduleFields').classList.remove('show');
    isScheduling = false;
    setTimeout(() => loadSchedules(), 1000);
  } catch (err) {
    showMessage('Error: ' + err.message, 'error');
  } finally {
    document.getElementById('scheduleBtn').disabled = false;
  }
});

async function loadSchedules() {
  if (!currentPassword) {
    showSchedulesMessage('Please enter password first', 'info');
    return;
  }
  
  try {
    const res = await fetch(API_URL + '/api/schedules', { headers: { 'x-dashboard-pwd': currentPassword } });
    if (!res.ok) throw new Error('Failed to load schedules');
    
    allSchedules = await res.json();
    renderSchedules();
  } catch (err) {
    showSchedulesMessage('Error loading schedules: ' + err.message, 'error');
  }
}

function renderSchedules() {
  const list = document.getElementById('schedulesList');
  const empty = document.getElementById('emptySchedules');
  
  if (allSchedules.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  
  empty.style.display = 'none';
  list.innerHTML = allSchedules.map(sched => {
    const time = new Date(sched.scheduledTime).toLocaleString();
    return '<div class="schedule-card" id="card-' + sched.id + '"><h3 class="schedule-title" id="title-' + sched.id + '">' + (sched.title || 'Untitled') + '</h3><div class="schedule-time">⏰ ' + time + '</div><div class="schedule-files">' + sched.files.map(f => '<div class="schedule-file">📄 ' + f.split('/').pop() + '</div>').join('') + '</div><div class="edit-fields" id="edit-' + sched.id + '"><label>New Title</label><input type="text" class="edit-title" value="' + (sched.title || '') + '" placeholder="Update title"></div><div class="schedule-actions"><button class="btn-small btn-edit" onclick="editSchedule(\'' + sched.id + '\')">✏️ Edit</button><button class="btn-small btn-cancel" onclick="cancelEdit(\'' + sched.id + '\')" style="display:none;" id="cancel-' + sched.id + '">Cancel</button><button class="btn-small btn-save" onclick="saveSchedule(\'' + sched.id + '\')" style="display:none;" id="save-' + sched.id + '">💾 Save</button><button class="btn-small btn-delete" onclick="deleteSchedule(\'' + sched.id + '\')">🗑️ Delete</button></div></div>';
  }).join('');
}

function editSchedule(id) {
  const card = document.getElementById('card-' + id);
  const editBtn = card.querySelector('.btn-edit');
  const saveBtn = document.getElementById('save-' + id);
  const cancelBtn = document.getElementById('cancel-' + id);
  const editFields = document.getElementById('edit-' + id);
  
  card.classList.add('editing');
  editFields.classList.add('show');
  editBtn.style.display = 'none';
  saveBtn.style.display = 'block';
  cancelBtn.style.display = 'block';
}

function cancelEdit(id) {
  const card = document.getElementById('card-' + id);
  const editBtn = card.querySelector('.btn-edit');
  const saveBtn = document.getElementById('save-' + id);
  const cancelBtn = document.getElementById('cancel-' + id);
  const editFields = document.getElementById('edit-' + id);
  
  card.classList.remove('editing');
  editFields.classList.remove('show');
  editBtn.style.display = 'block';
  saveBtn.style.display = 'none';
  cancelBtn.style.display = 'none';
}

async function saveSchedule(id) {
  const newTitle = document.querySelector('#edit-' + id + ' .edit-title').value;
  
  try {
    const res = await fetch(API_URL + '/api/schedule/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-dashboard-pwd': currentPassword },
      body: JSON.stringify({ title: newTitle })
    });
    if (!res.ok) throw new Error('Failed to save');
    const idx = allSchedules.findIndex(s => s.id === id);
    if (idx !== -1) allSchedules[idx].title = newTitle;
    cancelEdit(id);
    document.getElementById('title-' + id).textContent = newTitle || 'Untitled';
    showSchedulesMessage('Schedule updated!', 'success');
  } catch (err) {
    showSchedulesMessage('Error: ' + err.message, 'error');
  }
}

async function deleteSchedule(id) {
  if (!confirm('Delete this scheduled post?')) return;
  
  try {
    const res = await fetch(API_URL + '/api/schedule/' + id, {
      method: 'DELETE',
      headers: { 'x-dashboard-pwd': currentPassword }
    });
    if (!res.ok) throw new Error('Failed to delete');
    allSchedules = allSchedules.filter(s => s.id !== id);
    renderSchedules();
    showSchedulesMessage('Schedule deleted!', 'success');
  } catch (err) {
    showSchedulesMessage('Error: ' + err.message, 'error');
  }
}

function showMessage(text, type) {
  const msg = document.getElementById('message');
  msg.textContent = text;
  msg.className = 'message show ' + type;
  if (type === 'success' || type === 'error') setTimeout(() => msg.classList.remove('show'), 5000);
}

function showSchedulesMessage(text, type) {
  const msg = document.getElementById('schedulesMessage');
  msg.textContent = text;
  msg.className = 'message show ' + type;
  if (type === 'success' || type === 'error') setTimeout(() => msg.classList.remove('show'), 5000);
}
