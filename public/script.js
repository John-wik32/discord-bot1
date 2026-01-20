const API_BASE = window.location.origin;
let currentPassword = '';
let selectedGuildId = '';

// ===== AUTHENTICATION =====
async function fetchChannels() {
    const password = document.getElementById('adminPassword').value;
    if (!password) {
        alert('Please enter a password');
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/api/channels`, {
            headers: { 'Authorization': password }
        });
        if (!res.ok) throw new Error("Invalid password");

        const channels = await res.json();
        currentPassword = password;
        
        const select = document.getElementById('channelSelect');
        select.innerHTML = '<option value="">-- Select Channel --</option>' + 
            channels.map(c => `<option value="${c.id}" data-guild="${c.guildId}">${c.name}</option>`).join('');
        
        document.getElementById('login-container').classList.add('hidden');
        document.getElementById('dashboard-container').classList.remove('hidden');
        
        loadTemplates();
        loadLibrary();
        loadScheduled();
        loadHistory();
        alert('✓ Connected!');
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

function setGuildFromChannel() {
    const select = document.getElementById('channelSelect');
    const option = select.options[select.selectedIndex];
    selectedGuildId = option.dataset.guild || '';
    loadQueue();
}

// ===== SEND/SCHEDULE =====
async function sendPost() {
    const channelId = document.getElementById('channelSelect').value;
    const postTitle = document.getElementById('postContent').value;
    const scheduleTime = document.getElementById('scheduleTime').value;
    const videoUrl = document.getElementById('videoUrl').value;
    const fileInput = document.getElementById('mediaFile');

    if (!channelId) return alert('Select a channel');
    if (!postTitle && !fileInput.files[0] && !videoUrl) return alert('Add message, media, or URL');

    const formData = new FormData();
    formData.append('channelId', channelId);
    formData.append('postTitle', postTitle);
    if (scheduleTime) formData.append('scheduleTime', scheduleTime);
    if (videoUrl) formData.append('videoUrl', videoUrl);
    if (fileInput.files[0]) formData.append('mediaFile', fileInput.files[0]);

    try {
        const res = await fetch(`${API_BASE}/api/post`, {
            method: 'POST',
            headers: { 'Authorization': currentPassword },
            body: formData
        });
        const result = await res.json();
        if (res.ok) {
            alert(result.scheduled ? '✓ Post Scheduled!' : '✓ Post Sent!');
            clearForm();
            loadScheduled();
        } else {
            alert('Error: ' + result.error);
        }
    } catch (err) {
        alert('Server error: ' + err.message);
    }
}

// TEST MODE - Simple send without schedule
async function testSend() {
    const channelId = document.getElementById('testChannelSelect').value;
    const title = document.getElementById('testVideoTitle').value;
    const fileInput = document.getElementById('testMediaFile');

    if (!channelId) return alert('Select a channel');
    if (!title && !fileInput.files[0]) return alert('Add title or media');

    const formData = new FormData();
    formData.append('channelId', channelId);
    formData.append('postTitle', title);
    if (fileInput.files[0]) formData.append('mediaFile', fileInput.files[0]);

    try {
        const res = await fetch(`${API_BASE}/api/post`, {
            method: 'POST',
            headers: { 'Authorization': currentPassword },
            body: formData
        });
        const result = await res.json();
        if (res.ok) {
            alert('✓ Post Sent!');
            document.getElementById('testVideoTitle').value = '';
            document.getElementById('testMediaFile').value = '';
            document.getElementById('testPreview').innerHTML = '';
        } else {
            alert('Error: ' + result.error);
        }
    } catch (err) {
        alert('Server error');
    }
}

function clearForm() {
    document.getElementById('postContent').value = '';
    document.getElementById('scheduleTime').value = '';
    document.getElementById('videoUrl').value = '';
    document.getElementById('mediaFile').value = '';
    document.getElementById('preview-container').innerHTML = '';
}

// ===== QUEUE SYSTEM =====
async function addToQueue() {
    const channelId = document.getElementById('channelSelect').value;
    const title = document.getElementById('queueTitle').value;
    const message = document.getElementById('queueMessage').value;
    const videoUrl = document.getElementById('queueVideoUrl').value;
    const fileInput = document.getElementById('queueMediaFile');

    if (!channelId || (!title && !fileInput.files[0] && !videoUrl)) {
        return alert('Fill required fields');
    }

    const formData = new FormData();
    formData.append('channelId', channelId);
    formData.append('title', title);
    formData.append('guildId', selectedGuildId);
    formData.append('message', message);
    if (videoUrl) formData.append('videoUrl', videoUrl);
    if (fileInput.files[0]) formData.append('mediaFile', fileInput.files[0]);

    try {
        const res = await fetch(`${API_BASE}/api/queue/add`, {
            method: 'POST',
            headers: { 'Authorization': currentPassword },
            body: formData
        });
        const result = await res.json();
        if (res.ok) {
            alert(`✓ Added to queue (${result.queueLength} items)`);
            document.getElementById('queueTitle').value = '';
            document.getElementById('queueMessage').value = '';
            document.getElementById('queueVideoUrl').value = '';
            document.getElementById('queueMediaFile').value = '';
            loadQueue();
        } else {
            alert('Error: ' + result.error);
        }
    } catch (err) {
        alert('Server error');
    }
}

async function loadQueue() {
    if (!selectedGuildId) return;
    try {
        const res = await fetch(`${API_BASE}/api/queue/${selectedGuildId}`, {
            headers: { 'Authorization': currentPassword }
        });
        const items = await res.json();
        const container = document.getElementById('queue-container');
        
        if (items.length === 0) {
            container.innerHTML = '<p style="color: #888;">Queue empty</p>';
            return;
        }

        container.innerHTML = items.map((item, idx) => `
            <div class="queue-item">
                <strong>${item.title}</strong>
                <p>${item.message.substring(0, 50)}</p>
                <small>${item.status}</small>
                <button class="delete-btn" onclick="deleteQueueItem('${selectedGuildId}', ${item.id})">Delete</button>
            </div>
        `).join('');
    } catch (err) {
        console.error('Queue load error:', err);
    }
}

async function deleteQueueItem(guildId, itemId) {
    if (!confirm('Delete from queue?')) return;
    try {
        await fetch(`${API_BASE}/api/queue/${guildId}/${itemId}`, {
            method: 'DELETE',
            headers: { 'Authorization': currentPassword }
        });
        loadQueue();
    } catch (err) {
        alert('Error deleting');
    }
}

// ===== LIBRARY SYSTEM =====
async function saveToLibrary() {
    const title = document.getElementById('libTitle').value;
    const category = document.getElementById('libCategory').value;
    const videoUrl = document.getElementById('libVideoUrl').value;
    const fileInput = document.getElementById('libMediaFile');

    if (!title || (!fileInput.files[0] && !videoUrl)) {
        return alert('Title and media required');
    }

    const formData = new FormData();
    formData.append('title', title);
    formData.append('category', category);
    if (videoUrl) formData.append('videoUrl', videoUrl);
    if (fileInput.files[0]) formData.append('mediaFile', fileInput.files[0]);

    try {
        const res = await fetch(`${API_BASE}/api/library/save`, {
            method: 'POST',
            headers: { 'Authorization': currentPassword },
            body: formData
        });
        const result = await res.json();
        if (res.ok) {
            alert('✓ Saved to library');
            document.getElementById('libTitle').value = '';
            document.getElementById('libVideoUrl').value = '';
            document.getElementById('libMediaFile').value = '';
            loadLibrary();
        } else {
            alert('Error: ' + result.error);
        }
    } catch (err) {
        alert('Server error');
    }
}

async function loadLibrary() {
    try {
        const res = await fetch(`${API_BASE}/api/library`, {
            headers: { 'Authorization': currentPassword }
        });
        const videos = await res.json();
        const container = document.getElementById('library-container');
        
        if (videos.length === 0) {
            container.innerHTML = '<p style="color: #888;">Library empty</p>';
            return;
        }

        container.innerHTML = videos.map(v => `
            <div class="library-item">
                ${v.thumbnail ? `<img src="${v.thumbnail}" alt="${v.title}">` : ''}
                <strong>${v.title}</strong>
                <small>${v.category}</small>
                <button onclick="quickPostFromLibrary(${v.id})">Quick Send</button>
                <button class="delete-btn" onclick="deleteLibraryItem(${v.id})">Delete</button>
            </div>
        `).join('');
    } catch (err) {
        console.error('Library load error:', err);
    }
}

async function deleteLibraryItem(id) {
    if (!confirm('Delete from library?')) return;
    try {
        await fetch(`${API_BASE}/api/library/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': currentPassword }
        });
        loadLibrary();
    } catch (err) {
        alert('Error');
    }
}

// ===== TEMPLATES =====
async function saveTemplate() {
    const name = document.getElementById('tempName').value;
    const before = document.getElementById('tempBefore').value;
    const after = document.getElementById('tempAfter').value;

    if (!name) return alert('Template name required');

    try {
        const res = await fetch(`${API_BASE}/api/templates`, {
            method: 'POST',
            headers: { 'Authorization': currentPassword, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, before, after })
        });
        if (res.ok) {
            alert('✓ Template saved');
            clearTemplateForm();
            loadTemplates();
        }
    } catch (err) {
        alert('Error');
    }
}

async function loadTemplates() {
    try {
        const res = await fetch(`${API_BASE}/api/templates`, {
            headers: { 'Authorization': currentPassword }
        });
        const templates = await res.json();
        const container = document.getElementById('templates-container');
        
        if (templates.length === 0) {
            container.innerHTML = '<p style="color: #888;">No templates</p>';
            return;
        }

        container.innerHTML = templates.map(t => `
            <div class="template-item">
                <strong>${t.name}</strong>
                <p>Before: ${t.before.substring(0, 30)}</p>
                <p>After: ${t.after.substring(0, 30)}</p>
                <button onclick="applyTemplate(${t.id})">Apply</button>
                <button class="delete-btn" onclick="deleteTemplate(${t.id})">Delete</button>
            </div>
        `).join('');
    } catch (err) {
        console.error('Templates load error:', err);
    }
}

function applyTemplate(id) {
    alert('Template application feature coming soon');
}

async function deleteTemplate(id) {
    if (!confirm('Delete template?')) return;
    try {
        await fetch(`${API_BASE}/api/templates/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': currentPassword }
        });
        loadTemplates();
    } catch (err) {
        alert('Error');
    }
}

function clearTemplateForm() {
    document.getElementById('tempName').value = '';
    document.getElementById('tempBefore').value = '';
    document.getElementById('tempAfter').value = '';
}

// ===== SCHEDULED POSTS =====
async function loadScheduled() {
    try {
        const res = await fetch(`${API_BASE}/api/scheduled`, {
            headers: { 'Authorization': currentPassword }
        });
        const tasks = await res.json();
        const container = document.getElementById('scheduled-posts');
        
        if (tasks.length === 0) {
            container.innerHTML = '<p style="color: #888;">No scheduled posts</p>';
            return;
        }

        container.innerHTML = tasks.map((task, idx) => `
            <div class="scheduled-item">
                <strong>${new Date(task.time).toLocaleString()}</strong>
                <p>${task.content}</p>
                <button class="delete-btn" onclick="deleteScheduled(${idx})">Cancel</button>
            </div>
        `).join('');
    } catch (err) {
        console.error('Scheduled load error:', err);
    }
}

async function deleteScheduled(index) {
    if (!confirm('Cancel this post?')) return;
    try {
        const res = await fetch(`${API_BASE}/api/scheduled/${index}`, {
            method: 'DELETE',
            headers: { 'Authorization': currentPassword }
        });
        if (res.ok) {
            loadScheduled();
        }
    } catch (err) {
        alert('Error');
    }
}

// ===== HISTORY =====
async function loadHistory() {
    try {
        const res = await fetch(`${API_BASE}/api/history`, {
            headers: { 'Authorization': currentPassword }
        });
        const entries = await res.json();
        const container = document.getElementById('history-container');
        
        if (entries.length === 0) {
            container.innerHTML = '<p style="color: #888;">No history</p>';
            return;
        }

        container.innerHTML = entries.map(e => `
            <div class="history-item">
                <small>${new Date(e.sentAt).toLocaleString()}</small>
                <p>${e.videoTitle}</p>
            </div>
        `).join('');
    } catch (err) {
        console.error('History load error:', err);
    }
}

// ===== MEDIA PREVIEW =====
function previewMedia() {
    const fileInput = document.getElementById('mediaFile');
    const preview = document.getElementById('preview-container');
    showPreview(fileInput, preview);
}

function testPreviewMedia() {
    const fileInput = document.getElementById('testMediaFile');
    const preview = document.getElementById('testPreview');
    showPreview(fileInput, preview);
}

function showPreview(fileInput, preview) {
    if (!fileInput.files[0]) {
        preview.innerHTML = '';
        return;
    }

    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = (e) => {
        const ext = file.name.split('.').pop().toLowerCase();
        const videoExts = ['mp4', 'webm', 'mov', 'avi', 'mkv'];
        const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

        if (videoExts.includes(ext)) {
            preview.innerHTML = `<video controls style="max-width: 100%; border-radius: 5px;"><source src="${e.target.result}"></video>`;
        } else if (imageExts.includes(ext)) {
            preview.innerHTML = `<img src="${e.target.result}" style="max-width: 100%; border-radius: 5px;">`;
        } else {
            preview.innerHTML = `<p>File: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)</p>`;
        }
    };

    reader.readAsDataURL(file);
}

function quickPostFromLibrary(id) {
    alert('Quick post feature coming soon - ID: ' + id);
}
