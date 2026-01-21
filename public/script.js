const API = window.location.origin;
let password = '';

async function login() {
    password = document.getElementById('adminPassword').value;
    if (!password) return alert('Enter password');

    try {
        const res = await fetch(`${API}/api/channels`, {
            headers: { 'Authorization': password }
        });
        if (!res.ok) throw new Error('Invalid password');

        const channels = await res.json();
        password = password; // Save password

        // Fill all channel selects
        const selects = document.querySelectorAll('select');
        selects.forEach(select => {
            select.innerHTML = '<option value="">-- Select Channel --</option>' +
                channels.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        });

        document.getElementById('login-container').classList.add('hidden');
        document.getElementById('dashboard-container').classList.remove('hidden');

        loadData();
        alert('✓ Connected!');
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function loadData() {
    await Promise.all([
        loadScheduled(),
        loadHistory(),
        loadSuggestions(),
        loadLibrary(),
        loadTemplates()
    ]);
}

// ===== SEND POST =====
async function sendPost() {
    const channelId = document.getElementById('channelSelect').value;
    const postTitle = document.getElementById('postContent').value;
    const videoUrl = document.getElementById('videoUrl').value;
    const files = document.getElementById('mediaFile').files;

    if (!channelId) return alert('Select channel');
    if (!postTitle && !videoUrl && files.length === 0) return alert('Add message or media');

    const formData = new FormData();
    formData.append('channelId', channelId);
    formData.append('postTitle', postTitle);
    if (videoUrl) formData.append('videoUrl', videoUrl);
    for (let f of files) formData.append('mediaFile', f);

    try {
        const res = await fetch(`${API}/api/post`, {
            method: 'POST',
            headers: { 'Authorization': password },
            body: formData
        });
        const data = await res.json();
        if (res.ok) {
            alert('✓ Post sent!');
            document.getElementById('postContent').value = '';
            document.getElementById('videoUrl').value = '';
            document.getElementById('mediaFile').value = '';
            document.getElementById('preview-container').innerHTML = '';
            loadHistory();
        } else {
            alert('Error: ' + data.error);
        }
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

// ===== SCHEDULE POST =====
async function schedulePost() {
    const channelId = document.getElementById('scheduleChannelSelect').value;
    const postTitle = document.getElementById('schedulePostContent').value;
    const scheduleTime = document.getElementById('scheduleTime').value;
    const videoUrl = document.getElementById('scheduleVideoUrl').value;
    const files = document.getElementById('scheduleMediaFile').files;

    if (!channelId) return alert('Select channel');
    if (!scheduleTime) return alert('Set schedule time');
    if (!postTitle && !videoUrl && files.length === 0) return alert('Add message or media');

    const formData = new FormData();
    formData.append('channelId', channelId);
    formData.append('postTitle', postTitle);
    formData.append('scheduleTime', scheduleTime);
    if (videoUrl) formData.append('videoUrl', videoUrl);
    for (let f of files) formData.append('mediaFile', f);

    try {
        const res = await fetch(`${API}/api/post`, {
            method: 'POST',
            headers: { 'Authorization': password },
            body: formData
        });
        const data = await res.json();
        if (res.ok) {
            alert('✓ Scheduled!');
            document.getElementById('schedulePostContent').value = '';
            document.getElementById('scheduleTime').value = '';
            document.getElementById('scheduleVideoUrl').value = '';
            document.getElementById('scheduleMediaFile').value = '';
            document.getElementById('schedulePreview').innerHTML = '';
            loadScheduled();
        } else {
            alert('Error: ' + data.error);
        }
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

// ===== LOAD SCHEDULED POSTS =====
async function loadScheduled() {
    try {
        const res = await fetch(`${API}/api/scheduled`, {
            headers: { 'Authorization': password }
        });
        const posts = await res.json();
        const container = document.getElementById('scheduled-posts');

        if (!posts || posts.length === 0) {
            container.innerHTML = '<p style="color: #888;">No scheduled posts</p>';
            return;
        }

        container.innerHTML = posts.map(p => `
            <div class="scheduled-item">
                <div>
                    <strong>${new Date(p.time).toLocaleString()}</strong>
                    <p>${p.postTitle || '(No message)'}</p>
                </div>
                <button class="delete-btn" onclick="deleteScheduled('${p.id}')">Delete</button>
            </div>
        `).join('');
    } catch (err) {
        console.error(err);
    }
}

async function deleteScheduled(id) {
    if (!confirm('Delete this post?')) return;
    try {
        await fetch(`${API}/api/scheduled/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': password }
        });
        loadScheduled();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

// ===== HISTORY =====
async function loadHistory() {
    try {
        const res = await fetch(`${API}/api/history`, {
            headers: { 'Authorization': password }
        });
        const posts = await res.json();
        const container = document.getElementById('history-container');

        if (!posts || posts.length === 0) {
            container.innerHTML = '<p style="color: #888;">No history</p>';
            return;
        }

        container.innerHTML = posts.slice(-20).reverse().map(p => `
            <div class="history-item">
                <strong>${p.title || '(No title)'}</strong>
                <small>${new Date(p.time).toLocaleString()}</small>
            </div>
        `).join('');
    } catch (err) {
        console.error(err);
    }
}

// ===== SUGGESTIONS =====
async function submitSuggestion() {
    const idea = document.getElementById('suggestionIdea').value;
    const details = document.getElementById('suggestionDetails').value;
    const userName = document.getElementById('suggestionName').value;

    if (!idea) return alert('Enter your idea');

    try {
        const res = await fetch(`${API}/api/suggestions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idea, details, userName })
        });
        const data = await res.json();
        if (res.ok) {
            alert('✓ Thanks for the suggestion!');
            document.getElementById('suggestionIdea').value = '';
            document.getElementById('suggestionDetails').value = '';
            document.getElementById('suggestionName').value = '';
            loadSuggestions();
        } else {
            alert('Error: ' + data.error);
        }
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function loadSuggestions() {
    try {
        const res = await fetch(`${API}/api/suggestions`, {
            headers: { 'Authorization': password }
        });
        const suggestions = await res.json();
        const container = document.getElementById('suggestions-container');

        if (!suggestions || suggestions.length === 0) {
            container.innerHTML = '<p style="color: #888;">No suggestions yet</p>';
            return;
        }

        container.innerHTML = suggestions.reverse().map(s => `
            <div class="scheduled-item">
                <div>
                    <strong>${s.idea}</strong>
                    ${s.details ? `<p>${s.details}</p>` : ''}
                    <small>by ${s.userName}</small>
                </div>
                <button class="delete-btn" onclick="deleteSuggestion('${s.id}')">Delete</button>
            </div>
        `).join('');
    } catch (err) {
        console.error(err);
    }
}

async function deleteSuggestion(id) {
    if (!confirm('Delete?')) return;
    try {
        await fetch(`${API}/api/suggestions/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': password }
        });
        loadSuggestions();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

// ===== LIBRARY =====
async function saveToLibrary() {
    const title = document.getElementById('libTitle').value;
    const category = document.getElementById('libCategory').value;
    const videoUrl = document.getElementById('libVideoUrl').value;

    if (!title) return alert('Enter title');

    const formData = new FormData();
    formData.append('title', title);
    formData.append('category', category);
    if (videoUrl) formData.append('videoUrl', videoUrl);

    try {
        const res = await fetch(`${API}/api/library`, {
            method: 'POST',
            headers: { 'Authorization': password },
            body: formData
        });
        if (res.ok) {
            alert('✓ Saved!');
            document.getElementById('libTitle').value = '';
            document.getElementById('libCategory').value = '';
            document.getElementById('libVideoUrl').value = '';
            loadLibrary();
        }
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function loadLibrary() {
    try {
        const res = await fetch(`${API}/api/library`, {
            headers: { 'Authorization': password }
        });
        const items = await res.json();
        const container = document.getElementById('library-container');

        if (!items || items.length === 0) {
            container.innerHTML = '<p style="color: #888;">Library empty</p>';
            return;
        }

        container.innerHTML = items.map(item => `
            <div class="library-item">
                <strong>${item.title}</strong>
                <small>${item.category}</small>
            </div>
        `).join('');
    } catch (err) {
        console.error(err);
    }
}

// ===== TEMPLATES =====
async function saveTemplate() {
    const name = document.getElementById('tempName').value;
    const before = document.getElementById('tempBefore').value;
    const after = document.getElementById('tempAfter').value;

    if (!name) return alert('Enter name');

    try {
        const res = await fetch(`${API}/api/templates`, {
            method: 'POST',
            headers: {
                'Authorization': password,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, before, after })
        });
        if (res.ok) {
            alert('✓ Saved!');
            document.getElementById('tempName').value = '';
            document.getElementById('tempBefore').value = '';
            document.getElementById('tempAfter').value = '';
            loadTemplates();
        }
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function loadTemplates() {
    try {
        const res = await fetch(`${API}/api/templates`, {
            headers: { 'Authorization': password }
        });
        const templates = await res.json();
        const container = document.getElementById('templates-container');

        if (!templates || templates.length === 0) {
            container.innerHTML = '<p style="color: #888;">No templates</p>';
            return;
        }

        container.innerHTML = templates.map(t => `
            <div class="template-item">
                <strong>${t.name}</strong>
                <p>${t.before}</p>
            </div>
        `).join('');
    } catch (err) {
        console.error(err);
    }
}

// ===== MEDIA PREVIEW =====
function previewMedia() {
    const files = document.getElementById('mediaFile').files;
    const container = document.getElementById('preview-container');
    showPreviews(files, container);
}

function schedulePreviewMedia() {
    const files = document.getElementById('scheduleMediaFile').files;
    const container = document.getElementById('schedulePreview');
    showPreviews(files, container);
}

function showPreviews(files, container) {
    if (files.length === 0) {
        container.innerHTML = '';
        return;
    }

    let html = '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 10px;">';
    for (let file of files) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const isVideo = file.type.includes('video');
            const isImage = file.type.includes('image');
            let preview = '';
            
            if (isVideo) {
                preview = `<video controls style="width: 100%; height: 100px; object-fit: cover; border-radius: 5px;"><source src="${e.target.result}"></video>`;
            } else if (isImage) {
                preview = `<img src="${e.target.result}" style="width: 100%; height: 100px; object-fit: cover; border-radius: 5px;">`;
            } else {
                preview = `<div style="width: 100%; height: 100px; background: #404249; display: flex; align-items: center; justify-content: center; border-radius: 5px;"><small>${file.name}</small></div>`;
            }
            
            container.innerHTML += preview;
        };
        reader.readAsDataURL(file);
    }
    container.innerHTML += '</div>';
}

// ===== UI =====
function switchTab(name) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    
    document.getElementById(name + '-tab').classList.remove('hidden');
    event.target.classList.add('active');
}
