const API_BASE = window.location.origin;
let currentPassword = '';
let selectedGuildId = '';
let allChannels = [];

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
        allChannels = channels;
        
        // Populate ALL channel selects on the page
        updateAllChannelSelects(channels);
        
        document.getElementById('login-container').classList.add('hidden');
        document.getElementById('dashboard-container').classList.remove('hidden');
        
        loadTemplates();
        loadLibrary();
        loadScheduled();
        loadHistory();
        loadAnalytics();
        alert('✓ Connected!');
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

function updateAllChannelSelects(channels) {
    const selects = document.querySelectorAll('select[id$="ChannelSelect"], select[id="testChannelSelect"]');
    selects.forEach(select => {
        select.innerHTML = '<option value="">-- Select Channel --</option>' + 
            channels.map(c => `<option value="${c.id}" data-guild="${c.guildId}">${c.name}</option>`).join('');
    });
}

function setGuildFromChannel(selectId = 'channelSelect') {
    const select = document.getElementById(selectId);
    const option = select.options[select.selectedIndex];
    selectedGuildId = option.dataset.guild || '';
    if (selectId.includes('queue')) {
        loadQueue();
    }
}

// ===== SEND/SCHEDULE =====
async function sendPost() {
    const channelId = document.getElementById('channelSelect').value || document.getElementById('manualChannelId').value;
    const postTitle = document.getElementById('postContent').value;
    const videoUrl = document.getElementById('videoUrl').value;
    const fileInput = document.getElementById('mediaFile');

    if (!channelId) return alert('Select a channel or enter channel ID');
    if (!postTitle && !fileInput.files[0] && !videoUrl) return alert('Add message, media, or URL');

    const formData = new FormData();
    formData.append('channelId', channelId);
    formData.append('postTitle', postTitle);
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
            alert('✓ Post Sent!');
            clearForm();
        } else {
            alert('Error: ' + result.error);
        }
    } catch (err) {
        alert('Server error: ' + err.message);
    }
}

async function schedulePost() {
    const channelId = document.getElementById('scheduleChannelSelect').value || document.getElementById('scheduleManualChannelId').value;
    const postTitle = document.getElementById('schedulePostContent').value;
    const scheduleTime = document.getElementById('scheduleTime').value;
    const videoUrl = document.getElementById('scheduleVideoUrl').value;
    const fileInput = document.getElementById('scheduleMediaFile');

    if (!channelId) return alert('Select a channel or enter channel ID');
    if (!scheduleTime) return alert('Set schedule time');
    if (!postTitle && !fileInput.files[0] && !videoUrl) return alert('Add message, media, or URL');

    const formData = new FormData();
    formData.append('channelId', channelId);
    formData.append('postTitle', postTitle);
    formData.append('scheduleTime', scheduleTime);
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
            alert('✓ Post Scheduled!');
            document.getElementById('schedulePostContent').value = '';
            document.getElementById('scheduleTime').value = '';
            document.getElementById('scheduleVideoUrl').value = '';
            document.getElementById('scheduleMediaFile').value = '';
            document.getElementById('schedulePreview').innerHTML = '';
            loadScheduled();
        } else {
            alert('Error: ' + result.error);
        }
    } catch (err) {
        alert('Server error: ' + err.message);
    }
}

// TEST MODE
async function testSend() {
    const channelId = document.getElementById('testChannelSelect').value || document.getElementById('testManualChannelId').value;
    const title = document.getElementById('testVideoTitle').value;
    const fileInput = document.getElementById('testMediaFile');

    if (!channelId) return alert('Select a channel or enter channel ID');
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
    document.getElementById('videoUrl').value = '';
    document.getElementById('mediaFile').value = '';
    document.getElementById('preview-container').innerHTML = '';
}

// ===== QUEUE SYSTEM =====
async function addToQueue() {
    const channelId = document.getElementById('queueChannelSelect').value || document.getElementById('queueManualChannelId').value;
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
    formData.append('guildId', selectedGuildId || 'default');
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
    const guildId = selectedGuildId || 'default';
    try {
        const res = await fetch(`${API_BASE}/api/queue/${guildId}`, {
            headers: { 'Authorization': currentPassword }
        });
        const items = await res.json();
        const container = document.getElementById('queue-container');
        
        if (!items || items.length === 0) {
            container.innerHTML = '<p style="color: #888;">Queue empty</p>';
            return;
        }

        container.innerHTML = items.map((item) => `
            <div class="queue-item">
                <strong>${item.title}</strong>
                <p>${item.message.substring(0, 50)}</p>
                <small>${item.status}</small>
                <button class="delete-btn" onclick="deleteQueueItem('${guildId}', ${item.id})">Delete</button>
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
        
        if (!videos || videos.length === 0) {
            container.innerHTML = '<p style="color: #888;">Library empty</p>';
            return;
        }

        container.innerHTML = videos.map(v => `
            <div class="library-item">
                ${v.thumbnail ? `<img src="${v.thumbnail}" alt="${v.title}">` : '<div style="width:100%;height:120px;background:#404249;border-radius:3px;"></div>'}
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

function quickPostFromLibrary(id) {
    alert('Quick post feature: Select library item #' + id + ' and a channel to post instantly');
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
        
        if (!templates || templates.length === 0) {
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
    alert('Apply template: ' + id);
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
        
        if (!res.ok) {
            document.getElementById('scheduled-posts').innerHTML = '<p style="color: #888;">Error loading</p>';
            return;
        }

        const tasks = await res.json();
        const container = document.getElementById('scheduled-posts');
        
        if (!Array.isArray(tasks) || tasks.length === 0) {
            container.innerHTML = '<p style="color: #888;">No scheduled posts</p>';
            return;
        }

        container.innerHTML = tasks.map((task, idx) => `
            <div class="scheduled-item">
                <strong>${new Date(task.time).toLocaleString()}</strong>
                <p>${task.content || '(No message)'}</p>
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
        
        if (!entries || entries.length === 0) {
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

// ===== ANALYTICS =====
async function loadAnalytics() {
    try {
        const res = await fetch(`${API_BASE}/api/analytics`, {
            headers: { 'Authorization': currentPassword }
        });
        const analytics = await res.json();
        
        if (!analytics || !analytics.totalPosts) {
            document.getElementById('analytics-container').innerHTML = '<p style="color: #888;">No data yet</p>';
            return;
        }

        const topChannel = Object.entries(analytics.channelStats || {}).sort((a, b) => b[1] - a[1])[0];
        
        document.getElementById('analytics-container').innerHTML = `
            <div class="stats-grid">
                <div class="stat-card">
                    <h3>${analytics.totalPosts}</h3>
                    <p>Total Posts</p>
                </div>
                <div class="stat-card">
                    <h3>${analytics.postsToday}</h3>
                    <p>Posts Today</p>
                </div>
                <div class="stat-card">
                    <h3>${analytics.postsThisWeek}</h3>
                    <p>Posts This Week</p>
                </div>
                <div class="stat-card">
                    <h3>${analytics.postsThisMonth}</h3>
                    <p>Posts This Month</p>
                </div>
                ${topChannel ? `<div class="stat-card"><h3>${topChannel[1]}</h3><p>Top Channel</p></div>` : ''}
            </div>
        `;
    } catch (err) {
        console.error('Analytics error:', err);
    }
}

// ===== BATCH UPLOAD =====
async function batchUpload() {
    const channelId = document.getElementById('batchChannelSelect').value || document.getElementById('batchManualChannelId').value;
    const interval = document.getElementById('batchInterval').value;
    const startTime = document.getElementById('batchStartTime').value;
    const fileInputs = document.getElementById('batchFiles').files;

    if (!channelId || !interval || !startTime || fileInputs.length === 0) {
        return alert('Fill all fields and select files');
    }

    const formData = new FormData();
    formData.append('channelId', channelId);
    formData.append('interval', interval);
    formData.append('startTime', new Date(startTime).toISOString());
    
    for (let i = 0; i < fileInputs.length; i++) {
        formData.append('mediaFiles', fileInputs[i]);
    }

    try {
        const res = await fetch(`${API_BASE}/api/batch/upload`, {
            method: 'POST',
            headers: { 'Authorization': currentPassword },
            body: formData
        });
        const result = await res.json();
        if (res.ok) {
            alert(`✓ Scheduled ${result.scheduled} videos starting ${new Date(result.firstPost).toLocaleString()}`);
            document.getElementById('batchFiles').value = '';
            loadScheduled();
        } else {
            alert('Error: ' + result.error);
        }
    } catch (err) {
        alert('Server error');
    }
}

// ===== RECURRING POSTS =====
async function addRecurringPost() {
    const channelId = document.getElementById('recurringChannelSelect').value || document.getElementById('recurringManualChannelId').value;
    const content = document.getElementById('recurringContent').value;
    const frequency = document.getElementById('recurringFrequency').value;
    const videoUrl = document.getElementById('recurringVideoUrl').value;
    const fileInput = document.getElementById('recurringMediaFile');

    if (!channelId || !content || !frequency || (!videoUrl && !fileInput.files[0])) {
        return alert('Fill required fields');
    }

    const formData = new FormData();
    formData.append('channelId', channelId);
    formData.append('content', content);
    formData.append('frequency', frequency);
    if (videoUrl) formData.append('videoUrl', videoUrl);
    if (fileInput.files[0]) formData.append('mediaFile', fileInput.files[0]);

    try {
        const res = await fetch(`${API_BASE}/api/recurring/add`, {
            method: 'POST',
            headers: { 'Authorization': currentPassword },
            body: formData
        });
        const result = await res.json();
        if (res.ok) {
            alert(`✓ Recurring post added (${frequency})`);
            document.getElementById('recurringContent').value = '';
            document.getElementById('recurringVideoUrl').value = '';
            document.getElementById('recurringMediaFile').value = '';
            loadRecurringPosts();
        } else {
            alert('Error: ' + result.error);
        }
    } catch (err) {
        alert('Server error');
    }
}

async function loadRecurringPosts() {
    try {
        const res = await fetch(`${API_BASE}/api/recurring`, {
            headers: { 'Authorization': currentPassword }
        });
        const posts = await res.json();
        const container = document.getElementById('recurring-container');
        
        if (!posts || posts.length === 0) {
            container.innerHTML = '<p style="color: #888;">No recurring posts</p>';
            return;
        }

        container.innerHTML = posts.map(p => `
            <div class="scheduled-item">
                <strong>${p.frequency.toUpperCase()}</strong>
                <p>${p.content}</p>
                <small>Last run: ${p.lastRun ? new Date(p.lastRun).toLocaleString() : 'Never'}</small>
                <button class="delete-btn" onclick="deleteRecurring('${p.id}')">Delete</button>
            </div>
        `).join('');
    } catch (err) {
        console.error('Recurring load error:', err);
    }
}

async function deleteRecurring(id) {
    if (!confirm('Delete recurring post?')) return;
    try {
        await fetch(`${API_BASE}/api/recurring/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': currentPassword }
        });
        loadRecurringPosts();
    } catch (err) {
        alert('Error');
    }
}

// ===== BRANDING =====
async function setBranding() {
    const position = document.getElementById('brandingPosition').value;
    const opacity = document.getElementById('brandingOpacity').value;
    const textWatermark = document.getElementById('brandingText').value;
    const fileInput = document.getElementById('brandingImage');

    const formData = new FormData();
    formData.append('position', position);
    formData.append('opacity', opacity);
    formData.append('textWatermark', textWatermark);
    if (fileInput.files[0]) formData.append('brandingImage', fileInput.files[0]);

    try {
        const res = await fetch(`${API_BASE}/api/branding/set`, {
            method: 'POST',
            headers: { 'Authorization': currentPassword },
            body: formData
        });
        if (res.ok) {
            alert('✓ Branding saved');
        }
    } catch (err) {
        alert('Error');
    }
}

// ===== EXPORT =====
async function exportAllData() {
    try {
        const res = await fetch(`${API_BASE}/api/export/all`, {
            headers: { 'Authorization': currentPassword }
        });
        const data = await res.json();
        
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bot-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        window.URL.revokeObjectURL(url);
        alert('✓ Backup downloaded');
    } catch (err) {
        alert('Error exporting');
    }
}

// ===== MEDIA PREVIEW =====
function previewMedia() {
    const fileInput = document.getElementById('mediaFile');
    const preview = document.getElementById('preview-container');
    showPreview(fileInput, preview);
}

function schedulePreviewMedia() {
    const fileInput = document.getElementById('scheduleMediaFile');
    const preview = document.getElementById('schedulePreview');
    showPreview(fileInput, preview);
}

function testPreviewMedia() {
    const fileInput = document.getElementById('testMediaFile');
    const preview = document.getElementById('testPreview');
    showPreview(fileInput, preview);
}

function showPreview(fileInput, preview) {
    if (!fileInput || !fileInput.files[0]) {
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
            preview.innerHTML = `<video controls style="max-width: 100%; border-radius: 5px; max-height: 400px;"><source src="${e.target.result}"></video>`;
        } else if (imageExts.includes(ext)) {
            preview.innerHTML = `<img src="${e.target.result}" style="max-width: 100%; border-radius: 5px; max-height: 400px;">`;
        } else {
            preview.innerHTML = `<p>File: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)</p>`;
        }
    };

    reader.readAsDataURL(file);
}
