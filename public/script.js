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

    const loginBtn = document.querySelector('#login-container button');
    const originalText = loginBtn.innerText;
    loginBtn.innerText = 'Connecting...';
    loginBtn.disabled = true;

    try {
        console.log('Fetching channels...');
        const res = await fetch(`${API_BASE}/api/channels`, {
            headers: { 'Authorization': password }
        });
        
        // FIX: Check if server returned HTML (error page) instead of JSON
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            const text = await res.text();
            console.error("Server returned non-JSON:", text);
            throw new Error("Server Error: The bot returned an invalid response. Check server logs.");
        }

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: Invalid password or server error`);
        }

        let channels = await res.json();
        
        // Retry logic for empty channels (sometimes discord is slow to wake up)
        if (!channels || channels.length === 0) {
            console.log('No channels found, retrying in 2 seconds...');
            await new Promise(resolve => setTimeout(resolve, 2000));
            const retryRes = await fetch(`${API_BASE}/api/channels`, {
                headers: { 'Authorization': password }
            });
            if (retryRes.ok && retryRes.headers.get("content-type")?.includes("json")) {
                channels = await retryRes.json();
            }
        }

        console.log(`Got ${channels.length} channels`);

        currentPassword = password;
        allChannels = channels;
        
        updateAllChannelSelects(channels);
        
        document.getElementById('login-container').classList.add('hidden');
        document.getElementById('dashboard-container').classList.remove('hidden');
        
        // Load all data sections safely
        loadTemplates();
        loadLibrary();
        loadScheduled();
        loadHistory();
        loadAnalytics();
        loadRecurringPosts();
        loadSuggestions();
        
    } catch (err) {
        console.error('Auth error:', err);
        alert('Connection Failed: ' + err.message);
        loginBtn.innerText = originalText;
        loginBtn.disabled = false;
    }
}

function updateAllChannelSelects(channels) {
    // Updates every channel dropdown on the page
    const selects = document.querySelectorAll('select[id$="ChannelSelect"], select[id="testChannelSelect"]');
    
    selects.forEach(select => {
        const currentVal = select.value;
        select.innerHTML = '<option value="">-- Select Channel --</option>' + 
            channels.map(c => `<option value="${c.id}" data-guild="${c.guildId}">${c.name}</option>`).join('');
        
        // Try to keep previous selection
        if (currentVal) {
             const exists = Array.from(select.options).some(o => o.value === currentVal);
             if (exists) select.value = currentVal;
        }
    });
}

function setGuildFromChannel(selectId = 'channelSelect') {
    const select = document.getElementById(selectId);
    if (!select || select.selectedIndex === -1) return;
    
    const option = select.options[select.selectedIndex];
    selectedGuildId = option.dataset.guild || '';
    
    // If we are on the queue tab, reload the queue for this specific guild
    if (selectId.includes('queue')) {
        loadQueue();
    }
}

// ===== SEND/SCHEDULE =====
async function sendPost() {
    const channelId = document.getElementById('channelSelect').value || document.getElementById('manualChannelId').value;
    const postTitle = document.getElementById('postContent').value;
    const videoUrl = document.getElementById('videoUrl').value;
    const fileInputs = document.getElementById('mediaFile').files;

    if (!channelId) return alert('Select a channel or enter channel ID');
    if (!postTitle && fileInputs.length === 0 && !videoUrl) return alert('Add message, media, or URL');
    if (fileInputs.length > 3) return alert('Maximum 3 files allowed');

    const formData = new FormData();
    formData.append('channelId', channelId);
    formData.append('postTitle', postTitle);
    if (videoUrl) formData.append('videoUrl', videoUrl);
    
    for (let i = 0; i < fileInputs.length; i++) {
        formData.append('mediaFile', fileInputs[i]);
    }

    try {
        const res = await fetch(`${API_BASE}/api/post`, {
            method: 'POST',
            headers: { 'Authorization': currentPassword },
            body: formData
        });
        
        const result = await res.json();
        if (res.ok) {
            alert(`✓ Post Sent!`);
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
    const fileInputs = document.getElementById('scheduleMediaFile').files;

    if (!channelId) return alert('Select a channel or enter channel ID');
    if (!scheduleTime) return alert('Set schedule time');
    if (!postTitle && fileInputs.length === 0 && !videoUrl) return alert('Add message, media, or URL');

    // Check if time is valid (at least 1 minute in future)
    const scheduledDate = new Date(scheduleTime);
    const now = new Date();
    const minTime = new Date(now.getTime() + 60000); // 1 minute from now

    if (scheduledDate < minTime) {
        return alert(`Schedule time must be at least 1 minute in the future.`);
    }

    const formData = new FormData();
    formData.append('channelId', channelId);
    formData.append('postTitle', postTitle);
    formData.append('scheduleTime', scheduleTime);
    if (videoUrl) formData.append('videoUrl', videoUrl);
    
    for (let i = 0; i < fileInputs.length; i++) {
        formData.append('mediaFile', fileInputs[i]);
    }

    try {
        const res = await fetch(`${API_BASE}/api/post`, {
            method: 'POST',
            headers: { 'Authorization': currentPassword },
            body: formData
        });
        const result = await res.json();
        if (res.ok) {
            alert(`✓ Post Scheduled for ${new Date(scheduleTime).toLocaleString()}!`);
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
            alert(`✓ Added to queue`);
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
        if (!res.ok) return;

        let items = await res.json();
        // Safety check
        if (!Array.isArray(items)) items = [];

        const container = document.getElementById('queue-container');
        
        if (items.length === 0) {
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
        if (!res.ok) return;

        let videos = await res.json();
        if (!Array.isArray(videos)) videos = [];

        const container = document.getElementById('library-container');
        
        if (videos.length === 0) {
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

// ===== SUGGESTIONS =====
async function submitSuggestion() {
    const idea = document.getElementById('suggestionIdea').value;
    const details = document.getElementById('suggestionDetails').value;
    const userName = document.getElementById('suggestionName').value || 'Anonymous';

    if (!idea) return alert('Please enter your idea');

    try {
        const res = await fetch(`${API_BASE}/api/suggestions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idea, details, userName })
        });
        const result = await res.json();
        if (res.ok) {
            alert('✓ Thank you for your suggestion!');
            document.getElementById('suggestionIdea').value = '';
            document.getElementById('suggestionDetails').value = '';
            loadSuggestions();
        } else {
            alert('Error: ' + result.error);
        }
    } catch (err) {
        alert('Server error');
    }
}

async function loadSuggestions() {
    try {
        const res = await fetch(`${API_BASE}/api/suggestions`, {
            headers: { 'Authorization': currentPassword }
        });
        if (!res.ok) return;

        let suggestions = await res.json();
        const container = document.getElementById('suggestions-container');
        
        // FIX: Critical fix for "map is not a function"
        if (!Array.isArray(suggestions)) {
            console.warn('Suggestions API returned non-array, treating as empty.');
            suggestions = [];
        }

        if (suggestions.length === 0) {
            container.innerHTML = '<p style="color: #888;">No suggestions yet.</p>';
            return;
        }

        container.innerHTML = suggestions.map(s => `
            <div class="scheduled-item">
                <div>
                    <strong>${s.idea}</strong>
                    ${s.details ? `<p style="color: #888; margin: 5px 0 0 0;">${s.details}</p>` : ''}
                    <small style="color: #aaa;">by ${s.userName} • ${new Date(s.createdAt).toLocaleDateString()}</small>
                </div>
                <button class="delete-btn" onclick="deleteSuggestion(${s.id})" style="white-space: nowrap;">Delete</button>
            </div>
        `).join('');
    } catch (err) {
        console.error('Suggestions load error:', err);
    }
}

async function deleteSuggestion(id) {
    if (!confirm('Delete this suggestion?')) return;
    try {
        await fetch(`${API_BASE}/api/suggestions/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': currentPassword }
        });
        loadSuggestions();
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
        if (!res.ok) return;

        let templates = await res.json();
        // Safety check
        if (!Array.isArray(templates)) templates = [];

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
        if (!res.ok) return;

        let tasks = await res.json();
        // Safety check
        if (!Array.isArray(tasks)) tasks = [];

        const container = document.getElementById('scheduled-posts');
        
        if (tasks.length === 0) {
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
        if (!res.ok) return;

        let entries = await res.json();
        // Safety check
        if (!Array.isArray(entries)) entries = [];

        const container = document.getElementById('history-container');
        
        if (entries.length === 0) {
            container.innerHTML = '<p style="color: #888;">No history</p>';
            return;
        }

        container.innerHTML = entries.map(e => `
            <div class="history-item">
                <small>${new Date(e.sentAt).toLocaleString()}</small>
                <p>${e.videoTitle || 'No content'}</p>
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
        if (!res.ok) return;

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
        if (!res.ok) return;

        let posts = await res.json();
        // Safety check
        if (!Array.isArray(posts)) posts = [];

        const container = document.getElementById('recurring-container');
        
        if (posts.length === 0) {
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

// ===== ADVANCED RECURRING SCHEDULE (UI ONLY FOR NOW) =====
let recurringDayVideos = {};
let currentRecurringDay = 'Monday';
const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function initAdvancedRecurring() {
    const container = document.getElementById('advanced-recurring-container');
    let html = '<div class="recurring-setup">';
    html += '<h3>📅 Schedule Videos by Day & Time</h3>';
    html += '<div class="days-selector" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 10px; margin: 20px 0;">';
    daysOfWeek.forEach(day => {
        html += `<button onclick="selectRecurringDay('${day}')" class="day-btn" id="day-${day}" style="padding: 10px; border: 2px solid #404249; border-radius: 5px; background: #1e1f22; color: white; cursor: pointer;">${day}</button>`;
    });
    html += '</div>';
    html += '<div id="day-content-area"></div>';
    html += '</div>';
    container.innerHTML = html;
    selectRecurringDay('Monday');
}

function selectRecurringDay(day) {
    currentRecurringDay = day;
    daysOfWeek.forEach(d => {
        const btn = document.getElementById(`day-${d}`);
        if (d === day) {
            btn.style.borderColor = '#5865F2';
            btn.style.backgroundColor = '#4752c4';
        } else {
            btn.style.borderColor = '#404249';
            btn.style.backgroundColor = '#1e1f22';
        }
    });
    loadDayContent(day);
}

function loadDayContent(day) {
    const contentArea = document.getElementById('day-content-area');
    if (!recurringDayVideos[day]) recurringDayVideos[day] = [];
    const videos = recurringDayVideos[day];
    
    let html = `<div class="card" style="margin-top: 20px;"><h3>Videos for ${day}</h3>`;
    html += '<div class="time-slots">';
    videos.forEach((video, idx) => {
        html += `
            <div class="time-slot" style="background: #1e1f22; padding: 15px; border-radius: 5px; margin-bottom: 10px; border-left: 3px solid #5865F2;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong>${video.time || 'Not set'}</strong>
                        <p style="margin: 5px 0; color: #888;">${video.title || 'Video'}</p>
                    </div>
                    <button onclick="deleteDayVideo('${day}', ${idx})" class="delete-btn" style="width: auto; padding: 8px 15px;">Delete</button>
                </div>
            </div>
        `;
    });
    html += '</div>';
    html += `<button onclick="openAddVideoModal('${day}')" class="primary-btn" style="margin-top: 15px;">➕ Add Video Slot</button>`;
    html += '</div>';
    contentArea.innerHTML = html;
}

function openAddVideoModal(day) {
    const modal = document.createElement('div');
    modal.id = 'video-modal';
    modal.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 1000;`;
    
    modal.innerHTML = `
        <div class="card" style="max-width: 500px; width: 90%;">
            <h2>Add Video for ${day}</h2>
            <label>Time (24-hour format)</label>
            <input type="time" id="videoTime" placeholder="14:30">
            <label>Message</label>
            <textarea id="videoMessage" rows="3" placeholder="Optional message..."></textarea>
            <div style="display: flex; gap: 10px; margin-top: 20px;">
                <button onclick="saveVideoSlot('${day}')" class="primary-btn">✓ Save</button>
                <button onclick="document.getElementById('video-modal').remove()" class="delete-btn">✕ Cancel</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

async function saveVideoSlot(day) {
    const time = document.getElementById('videoTime').value;
    const message = document.getElementById('videoMessage').value;
    
    if (!time) return alert('Set time');
    
    if (!recurringDayVideos[day]) recurringDayVideos[day] = [];
    
    recurringDayVideos[day].push({
        time,
        title: message || `Video at ${time}`,
        message
    });
    
    document.getElementById('video-modal').remove();
    loadDayContent(day);
}

function deleteDayVideo(day, idx) {
    if (!confirm('Delete this slot?')) return;
    recurringDayVideos[day].splice(idx, 1);
    loadDayContent(day);
}

function saveAdvancedRecurring() {
    alert('Advanced recurring is in UI demo mode. Simple recurring is fully functional.');
}

function showRecurringMethod(method) {
    const simple = document.getElementById('simple-recurring');
    const advanced = document.getElementById('advanced-recurring');
    
    if (method === 'simple') {
        simple.classList.remove('hidden');
        advanced.classList.add('hidden');
        document.getElementById('simple-btn').style.background = 'var(--primary)';
    } else {
        simple.classList.add('hidden');
        advanced.classList.remove('hidden');
        document.getElementById('simple-btn').style.background = '#4e5058';
        initAdvancedRecurring();
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
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        preview.innerHTML = '';
        return;
    }

    if (fileInput.files.length > 3) {
        preview.innerHTML = '<p style="color: #DA373C;">Maximum 3 files allowed</p>';
        return;
    }

    let html = '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px;">';
    
    for (let i = 0; i < fileInput.files.length; i++) {
        const file = fileInput.files[i];
        const reader = new FileReader();

        reader.onload = (e) => {
            const ext = file.name.split('.').pop().toLowerCase();
            const videoExts = ['mp4', 'webm', 'mov', 'avi', 'mkv'];
            const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

            let preview_item = `<div style="border: 1px solid #404249; border-radius: 5px; overflow: hidden;">`;
            
            if (videoExts.includes(ext)) {
                preview_item += `<video controls style="width: 100%; height: 120px; object-fit: cover;"><source src="${e.target.result}"></video>`;
            } else if (imageExts.includes(ext)) {
                preview_item += `<img src="${e.target.result}" style="width: 100%; height: 120px; object-fit: cover;">`;
            } else {
                preview_item += `<div style="width: 100%; height: 120px; background: #404249; display: flex; align-items: center; justify-content: center;"><p style="margin: 0; font-size: 0.8em;">${file.name}</p></div>`;
            }
            
            preview_item += `<p style="margin: 8px; font-size: 0.8em; color: #888;">${(file.size / 1024 / 1024).toFixed(2)}MB</p></div>`;
            
            let container = preview.querySelector(`[data-file="${i}"]`);
            if (!container) {
                container = document.createElement('div');
                container.setAttribute('data-file', i);
                preview.appendChild(container);
            }
            container.innerHTML = preview_item;
        };

        reader.readAsDataURL(file);
    }
    
    html += '</div>';
    if (preview.innerHTML === '') {
        preview.innerHTML = html;
    }
}
