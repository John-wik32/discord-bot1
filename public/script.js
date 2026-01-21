const API = window.location.origin;
let password = '';

async function login() {
    password = document.getElementById('adminPassword').value;
    if (!password) {
        alert('Enter admin password');
        return;
    }

    try {
        const res = await fetch(`${API}/api/channels`, {
            headers: { 'Authorization': password }
        });
        
        if (!res.ok) {
            throw new Error('Invalid password');
        }

        const channels = await res.json();
        
        // Fill all channel selects
        const selects = ['channelSelect', 'scheduleChannelSelect', 'testChannelSelect'];
        selects.forEach(selectId => {
            const select = document.getElementById(selectId);
            select.innerHTML = '<option value="">-- Select Channel --</option>' +
                channels.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        });

        document.getElementById('login-container').classList.add('hidden');
        document.getElementById('dashboard-container').classList.remove('hidden');

        // Load initial data
        loadScheduled();
        loadHistory();
        
        alert('✓ Connected to bot!');
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

function switchTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.add('hidden');
    });
    
    // Remove active class from all buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Show selected tab and activate button
    document.getElementById(tabName + '-tab').classList.remove('hidden');
    event.target.classList.add('active');
}

// ===== SEND POST =====
async function sendPost() {
    const channelSelect = document.getElementById('channelSelect');
    const manualChannelId = document.getElementById('manualChannelId');
    const channelId = channelSelect.value || manualChannelId.value;
    const message = document.getElementById('message').value;
    const videoUrl = document.getElementById('videoUrl').value;
    const files = document.getElementById('mediaFiles').files;

    if (!channelId) {
        alert('Please select or enter a channel ID');
        return;
    }

    if (!message && !videoUrl && files.length === 0) {
        alert('Please add a message, video URL, or upload media files');
        return;
    }

    const formData = new FormData();
    formData.append('channelId', channelId);
    if (message) formData.append('message', message);
    if (videoUrl) formData.append('videoUrl', videoUrl);
    
    for (let file of files) {
        formData.append('mediaFiles', file);
    }

    try {
        const res = await fetch(`${API}/api/send`, {
            method: 'POST',
            headers: { 'Authorization': password },
            body: formData
        });
        
        const data = await res.json();
        
        if (res.ok) {
            alert('✓ Post sent successfully!');
            // Clear form
            document.getElementById('message').value = '';
            document.getElementById('videoUrl').value = '';
            document.getElementById('mediaFiles').value = '';
            document.getElementById('preview-container').innerHTML = '';
            // Refresh history
            loadHistory();
        } else {
            alert('Error: ' + (data.error || 'Failed to send post'));
        }
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

// ===== SCHEDULE POST =====
async function schedulePost() {
    const channelSelect = document.getElementById('scheduleChannelSelect');
    const manualChannelId = document.getElementById('scheduleManualChannelId');
    const channelId = channelSelect.value || manualChannelId.value;
    const message = document.getElementById('scheduleMessage').value;
    const videoUrl = document.getElementById('scheduleVideoUrl').value;
    const scheduleTime = document.getElementById('scheduleTime').value;
    const files = document.getElementById('scheduleMediaFiles').files;

    if (!channelId) {
        alert('Please select or enter a channel ID');
        return;
    }

    if (!scheduleTime) {
        alert('Please select a schedule time');
        return;
    }

    if (!message && !videoUrl && files.length === 0) {
        alert('Please add a message, video URL, or upload media files');
        return;
    }

    const formData = new FormData();
    formData.append('channelId', channelId);
    formData.append('scheduleTime', scheduleTime);
    if (message) formData.append('message', message);
    if (videoUrl) formData.append('videoUrl', videoUrl);
    
    for (let file of files) {
        formData.append('mediaFiles', file);
    }

    try {
        const res = await fetch(`${API}/api/schedule`, {
            method: 'POST',
            headers: { 'Authorization': password },
            body: formData
        });
        
        const data = await res.json();
        
        if (res.ok) {
            alert('✓ Post scheduled successfully!');
            // Clear form
            document.getElementById('scheduleMessage').value = '';
            document.getElementById('scheduleVideoUrl').value = '';
            document.getElementById('scheduleTime').value = '';
            document.getElementById('scheduleMediaFiles').value = '';
            document.getElementById('schedulePreview').innerHTML = '';
            // Refresh scheduled posts
            loadScheduled();
        } else {
            alert('Error: ' + (data.error || 'Failed to schedule post'));
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

        container.innerHTML = posts.map(post => `
            <div class="scheduled-item">
                <div>
                    <strong>Scheduled for: ${new Date(post.scheduleTime).toLocaleString()}</strong>
                    <p>Channel: ${post.channelId}</p>
                    ${post.message ? `<p>Message: ${post.message}</p>` : ''}
                    ${post.videoUrl ? `<p>Video URL: ${post.videoUrl}</p>` : ''}
                    ${post.files.length > 0 ? `<p>Files: ${post.files.length} file(s)</p>` : ''}
                    <small>Created: ${new Date(post.createdAt).toLocaleString()}</small>
                </div>
                <button class="delete-btn" onclick="deleteScheduled('${post.id}')">Delete</button>
            </div>
        `).join('');
    } catch (err) {
        console.error('Error loading scheduled posts:', err);
    }
}

async function deleteScheduled(id) {
    if (!confirm('Are you sure you want to delete this scheduled post?')) {
        return;
    }

    try {
        const res = await fetch(`${API}/api/scheduled/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': password }
        });
        
        if (res.ok) {
            loadScheduled();
        } else {
            alert('Failed to delete scheduled post');
        }
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

// ===== LOAD HISTORY =====
async function loadHistory() {
    try {
        const res = await fetch(`${API}/api/history`, {
            headers: { 'Authorization': password }
        });
        
        const posts = await res.json();
        const container = document.getElementById('history-container');

        if (!posts || posts.length === 0) {
            container.innerHTML = '<p style="color: #888;">No history yet</p>';
            return;
        }

        // Show most recent 20 posts
        const recentPosts = posts.slice(-20).reverse();
        
        container.innerHTML = recentPosts.map(post => `
            <div class="history-item">
                <strong>${post.scheduled ? '[SCHEDULED] ' : ''}${new Date(post.sentAt).toLocaleString()}</strong>
                <p>Channel: ${post.channelId}</p>
                ${post.message ? `<p>Message: ${post.message}</p>` : ''}
                ${post.filesCount > 0 ? `<p>Files: ${post.filesCount} file(s)</p>` : ''}
            </div>
        `).join('');
    } catch (err) {
        console.error('Error loading history:', err);
    }
}

// ===== TEST SEND =====
async function testSend() {
    const channelSelect = document.getElementById('testChannelSelect');
    const manualChannelId = document.getElementById('testManualChannelId');
    const channelId = channelSelect.value || manualChannelId.value;
    const testMessage = document.getElementById('testMessage').value;

    if (!channelId) {
        alert('Please select or enter a channel ID');
        return;
    }

    try {
        const res = await fetch(`${API}/api/test`, {
            method: 'POST',
            headers: {
                'Authorization': password,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                channelId: channelId,
                message: testMessage
            })
        });
        
        const data = await res.json();
        
        if (res.ok) {
            alert('✓ Test message sent successfully!');
            document.getElementById('testMessage').value = '';
        } else {
            alert('Error: ' + (data.error || 'Failed to send test'));
        }
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

// ===== MEDIA PREVIEW =====
document.getElementById('mediaFiles').addEventListener('change', previewMedia);
document.getElementById('scheduleMediaFiles').addEventListener('change', schedulePreviewMedia);

function previewMedia() {
    const files = document.getElementById('mediaFiles').files;
    const container = document.getElementById('preview-container');
    showPreviews(files, container);
}

function schedulePreviewMedia() {
    const files = document.getElementById('scheduleMediaFiles').files;
    const container = document.getElementById('schedulePreview');
    showPreviews(files, container);
}

function showPreviews(files, container) {
    if (files.length === 0) {
        container.innerHTML = '';
        return;
    }

    let html = '<h4>Preview (' + files.length + ' file(s)):</h4>';
    html += '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; margin-top: 10px;">';
    
    for (let file of files) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const isVideo = file.type.includes('video');
            const isImage = file.type.includes('image');
            
            let preview = '';
            if (isVideo) {
                preview = `
                    <div style="background: #1e1f22; padding: 10px; border-radius: 5px;">
                        <video controls style="width: 100%; height: 100px; object-fit: cover; border-radius: 5px;">
                            <source src="${e.target.result}" type="${file.type}">
                        </video>
                        <small style="display: block; margin-top: 5px; text-align: center;">${file.name}</small>
                    </div>
                `;
            } else if (isImage) {
                preview = `
                    <div style="background: #1e1f22; padding: 10px; border-radius: 5px;">
                        <img src="${e.target.result}" style="width: 100%; height: 100px; object-fit: cover; border-radius: 5px;">
                        <small style="display: block; margin-top: 5px; text-align: center;">${file.name}</small>
                    </div>
                `;
            } else {
                preview = `
                    <div style="background: #1e1f22; padding: 10px; border-radius: 5px; height: 120px; display: flex; flex-direction: column; justify-content: center; align-items: center;">
                        <div style="font-size: 2em;">📁</div>
                        <small style="text-align: center; word-break: break-all;">${file.name}</small>
                    </div>
                `;
            }
            
            container.innerHTML += preview;
        };
        reader.readAsDataURL(file);
    }
    
    container.innerHTML = html + '</div>';
}

// Set minimum datetime to current time
function setMinDateTime() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    
    const minDateTime = `${year}-${month}-${day}T${hours}:${minutes}`;
    document.getElementById('scheduleTime').min = minDateTime;
}

// Initialize when page loads
window.onload = function() {
    setMinDateTime();
};
