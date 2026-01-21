const API_BASE = window.location.origin;
let currentPassword = '';

async function fetchChannels() {
    const password = document.getElementById('adminPassword').value;
    if (!password) return alert('Enter password');

    try {
        const res = await fetch(`${API_BASE}/api/channels`, {
            headers: { 'Authorization': password }
        });

        if (!res.ok) throw new Error('Invalid Password');

        const channels = await res.json();
        currentPassword = password;

        // Fill dropdowns
        const selects = document.querySelectorAll('select[id$="ChannelSelect"]');
        selects.forEach(s => {
            s.innerHTML = '<option value="">-- Select Channel --</option>' + 
                channels.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        });

        document.getElementById('login-container').classList.add('hidden');
        document.getElementById('dashboard-container').classList.remove('hidden');

        // Load data sections - wrapped in try/catch so one failure doesn't stop others
        loadTemplates().catch(e => console.error("Templates failed", e));
        loadLibrary().catch(e => console.error("Library failed", e));
        loadScheduled().catch(e => console.error("Scheduled failed", e));
        loadHistory().catch(e => console.error("History failed", e));
        loadSuggestions().catch(e => console.error("Suggestions failed", e));
        loadRecurringPosts().catch(e => console.error("Recurring failed", e));

    } catch (err) {
        alert(err.message);
    }
}

// Generic Send Function
async function sendPost() {
    const channelId = document.getElementById('channelSelect').value;
    const postTitle = document.getElementById('postContent').value;
    const files = document.getElementById('mediaFile').files;

    if (!channelId) return alert('Select a channel');

    const formData = new FormData();
    formData.append('channelId', channelId);
    formData.append('postTitle', postTitle);
    for (let i = 0; i < files.length; i++) {
        formData.append('mediaFile', files[i]);
    }

    const res = await fetch(`${API_BASE}/api/post`, {
        method: 'POST',
        headers: { 'Authorization': currentPassword },
        body: formData
    });

    if (res.ok) {
        alert('✓ Sent!');
        document.getElementById('postContent').value = '';
    } else {
        alert('Failed to send');
    }
}

// Data Loading functions
async function loadTemplates() {
    const res = await fetch(`${API_BASE}/api/templates`, { headers: { 'Authorization': currentPassword } });
    const data = await res.json();
    document.getElementById('templates-container').innerHTML = data.length ? data.map(t => `<div>${t.name}</div>`).join('') : 'No templates';
}

async function loadLibrary() {
    const res = await fetch(`${API_BASE}/api/library`, { headers: { 'Authorization': currentPassword } });
    const data = await res.json();
    document.getElementById('library-container').innerHTML = data.length ? data.map(v => `<div>${v.title}</div>`).join('') : 'Library empty';
}

async function loadHistory() {
    const res = await fetch(`${API_BASE}/api/history`, { headers: { 'Authorization': currentPassword } });
    const data = await res.json();
    document.getElementById('history-container').innerHTML = data.length ? data.map(h => `<div>${h.videoTitle} - ${new Date(h.sentAt).toLocaleTimeString()}</div>`).join('') : 'No history';
}

async function loadSuggestions() {
    const res = await fetch(`${API_BASE}/api/suggestions`, { headers: { 'Authorization': currentPassword } });
    const data = await res.json();
    document.getElementById('suggestions-container').innerHTML = data.length ? data.map(s => `
        <div class="scheduled-item">
            <strong>${s.idea}</strong>
            <button class="delete-btn" onclick="deleteSuggestion(${s.id})">Delete</button>
        </div>
    `).join('') : 'No suggestions';
}

async function deleteSuggestion(id) {
    await fetch(`${API_BASE}/api/suggestions/${id}`, { method: 'DELETE', headers: { 'Authorization': currentPassword } });
    loadSuggestions();
}

async function loadScheduled() {
    const res = await fetch(`${API_BASE}/api/scheduled`, { headers: { 'Authorization': currentPassword } });
    const data = await res.json();
    document.getElementById('scheduled-posts').innerHTML = data.length ? data.map((t, i) => `
        <div class="scheduled-item">
            <span>${new Date(t.time).toLocaleString()}</span>
            <button onclick="deleteScheduled(${i})">Cancel</button>
        </div>
    `).join('') : 'Nothing scheduled';
}

async function deleteScheduled(index) {
    await fetch(`${API_BASE}/api/scheduled/${index}`, { method: 'DELETE', headers: { 'Authorization': currentPassword } });
    loadScheduled();
}
