// Get the current origin (website URL)
const API = window.location.origin;
let password = '';

async function login() {
    password = document.getElementById('adminPassword').value.trim();
    
    if (!password) {
        alert('Please enter admin password');
        return;
    }

    console.log('🔐 Attempting login...');
    console.log('   API URL:', API);
    console.log('   Password length:', password.length);

    try {
        // First check if server is reachable
        console.log('🩺 Checking server health...');
        const healthRes = await fetch(`${API}/health`);
        const healthData = await healthRes.json();
        console.log('   Health check:', healthData);

        if (!healthRes.ok) {
            throw new Error('Server is not responding properly');
        }

        // Try debug endpoint first to see auth status
        console.log('🔍 Testing auth with debug endpoint...');
        const debugRes = await fetch(`${API}/api/debug-auth`, {
            headers: { 
                'Authorization': password
            }
        });
        
        const debugData = await debugRes.json();
        console.log('   Debug auth result:', debugData);

        if (!debugRes.ok || !debugData.matches) {
            throw new Error(`Authentication failed. Check that password is correct.`);
        }

        // Now try to get channels
        console.log('📡 Fetching channels...');
        const res = await fetch(`${API}/api/channels`, {
            headers: { 
                'Authorization': password
            }
        });
        
        console.log('   Channels response status:', res.status);
        
        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`Failed to get channels: ${res.status} ${errorText}`);
        }

        const channels = await res.json();
        console.log(`   Received ${channels.length} channels`);

        // Fill all channel selects
        const selects = ['channelSelect', 'scheduleChannelSelect', 'testChannelSelect'];
        selects.forEach(selectId => {
            const select = document.getElementById(selectId);
            if (select) {
                select.innerHTML = '<option value="">-- Select Channel --</option>' +
                    channels.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
            }
        });

        // Show dashboard
        document.getElementById('login-container').classList.add('hidden');
        document.getElementById('dashboard-container').classList.remove('hidden');

        // Load initial data
        await loadScheduled();
        await loadHistory();
        
        alert('✅ Connected to bot successfully!');
        
    } catch (err) {
        console.error('❌ Login error:', err);
        alert('Login failed: ' + err.message + '\n\nCheck browser console for details.');
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
    const tabElement = document.getElementById(tabName + '-tab');
    if (tabElement) {
        tabElement.classList.remove('hidden');
    }
    
    if (event && event.target) {
        event.target.classList.add('active');
    }
}

// ===== SEND POST =====
async function sendPost() {
    const channelSelect = document.getElementById('channelSelect');
    const manualChannelId = document.getElementById('manualChannelId');
    const channelId = channelSelect.value || manualChannelId.value.trim();
    const message = document.getElementById('message').value.trim();
    const videoUrl = document.getElementById('videoUrl').value.trim();
    const files = document.getElementById('mediaFiles').files;

    if (!channelId) {
        alert('Please select or enter a channel ID');
        return;
    }

    if (!message && !videoUrl && files.length === 0) {
        alert('Please add a message, video URL, or upload media files');
        return;
    }

    console.log('📤 Preparing to send post...');
    console.log('   Channel ID:', channelId);
    console.log('   Message:', message || '(none)');
    console.log('   Video URL:', videoUrl || '(none)');
    console.log('   Files:', files.length);

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
            alert('✅ Post sent successfully!');
            // Clear form
            document.getElementById('message').value = '';
            document.getElementById('videoUrl').value = '';
            document.getElementById('mediaFiles').value = '';
            document.getElementById('preview-container').innerHTML = '';
            // Refresh history
            await loadHistory();
        } else {
            alert('❌ Error: ' + (data.error || 'Failed to send post'));
        }
    } catch (err) {
        console.error('Send error:', err);
        alert('❌ Error: ' + err.message);
    }
}

// ===== SCHEDULE POST =====
async function schedulePost() {
    const channelSelect = document.getElementById('scheduleChannelSelect');
    const manualChannelId = document.getElementById('scheduleManualChannelId');
    const channelId = channelSelect.value || manualChannelId.value.trim();
    const message = document.getElementById('scheduleMessage').value.trim();
    const videoUrl = document.getElementById('scheduleVideoUrl').value.trim();
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

    console.log('⏰ Preparing to schedule post...');
    console.log('   Channel ID:', channelId);
    console.log('   Schedule Time:', scheduleTime);
    console.log('   Files:', files.length);

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
            alert('✅ Post scheduled successfully!\nScheduled for: ' + data.scheduledFor);
            // Clear form
            document.getElementById('scheduleMessage').value = '';
            document.getElementById('scheduleVideoUrl').value = '';
            document.getElementById('scheduleTime').value = '';
            document.getElementById('scheduleMediaFiles').value = '';
            document.getElementById('schedulePreview').innerHTML = '';
            // Refresh scheduled posts
            await loadScheduled();
        } else {
            alert('❌ Error: ' + (data.error || 'Failed to schedule post'));
        }
    } catch (err) {
        console.error('Schedule error:', err);
        alert('❌ Error: ' + err.message);
    }
}

// ===== LOAD SCHEDULED POSTS =====
async function loadScheduled() {
    try {
        const res = await fetch(`${API}/api/scheduled`, {
            headers: { 'Authorization': password }
        });
        
        if (!res.ok) {
            console.error('Failed to load scheduled posts:', res.status);
            const container = document.getElementById('scheduled-posts');
            container.innerHTML = '<p style="color: #888; padding: 20px; text-align: center;">Error loading scheduled posts</p>';
            return;
        }
        
        const posts = await res.json();
        const container = document.getElementById('scheduled-posts');

        if (!posts || posts.length === 0) {
            container.innerHTML = '<p style="color: #888; padding: 20px; text-align: center;">No scheduled posts</p>';
            return;
        }

        // Sort by schedule time (earliest first)
        posts.sort((a, b) => new Date(a.scheduleTime) - new Date(b.scheduleTime));

        container.innerHTML = posts.map(post => `
            <div class="scheduled-item">
                <div>
                    <strong>📅 ${new Date(post.scheduleTime).toLocaleString()}</strong>
                    <p>Channel ID: ${post.channelId}</p>
                    ${post.message ? `<p>${post.message}</p>` : ''}
                    ${post.videoUrl ? `<p><a href="${post.videoUrl}" target="_blank">Video Link</a></p>` : ''}
                    ${post.files && post.files.length > 0 ? `<p>📎 ${post.files.length} file(s)</p>` : ''}
                    <small>Created: ${new Date(post.createdAt).toLocaleString()}</small>
                </div>
                <button class="delete-btn" onclick="deleteScheduled('${post.id}')">Delete</button>
            </div>
        `).join('');
    } catch (err) {
        console.error('Error loading scheduled posts:', err);
        const container = document.getElementById('scheduled-posts');
        container.innerHTML = '<p style="color: #888; padding: 20px; text-align: center;">Error loading scheduled posts</p>';
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
            await loadScheduled();
        } else {
            alert('❌ Failed to delete scheduled post');
        }
    } catch (err) {
        alert('❌ Error: ' + err.message);
    }
}

// ===== LOAD HISTORY =====
async function loadHistory() {
    try {
        const res = await fetch(`${API}/api/history`, {
            headers: { 'Authorization': password }
        });
        
        if (!res.ok) {
            console.error('Failed to load history:', res.status);
            const container = document.getElementById('history-container');
            container.innerHTML = '<p style="color: #888; padding: 20px; text-align: center;">Error loading history</p>';
            return;
        }
        
        const posts = await res.json();
        const container = document.getElementById('history-container');

        if (!posts || posts.length === 0) {
            container.innerHTML = '<p style="color: #888; padding: 20px; text-align: center;">No history yet</p>';
            return;
        }

        // Show most recent 20 posts (newest first)
        const recentPosts = posts.slice(-20).reverse();
        
        container.innerHTML = recentPosts.map(post => `
            <div class="history-item">
                <strong>${post.scheduled ? '⏰ ' : '📤 '}${new Date(post.sentAt).toLocaleString()}</strong>
                <p>Channel: ${post.channelId}</p>
                ${post.message ? `<p>${post.message}</p>` : ''}
                ${post.filesCount > 0 ? `<p>📎 ${post.filesCount} file(s)</p>` : ''}
            </div>
        `).join('');
    } catch (err) {
        console.error('Error loading history:', err);
        const container = document.getElementById('history-container');
        container.innerHTML = '<p style="color: #888; padding: 20px; text-align: center;">Error loading history</p>';
    }
}

// ===== TEST SEND =====
async function testSend() {
    const channelSelect = document.getElementById('testChannelSelect');
    const manualChannelId = document.getElementById('testManualChannelId');
    const channelId = channelSelect.value || manualChannelId.value.trim();
    const testMessage = document.getElementById('testMessage').value.trim();

    if (!channelId) {
        alert('Please select or enter a channel ID');
        return;
    }

    console.log('🧪 Sending test message...');
    console.log('   Channel ID:', channelId);
    console.log('   Test message:', testMessage || '(default)');

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
            alert('✅ Test message sent successfully!');
            document.getElementById('testMessage').value = '';
        } else {
            alert('❌ Error: ' + (data.error || 'Failed to send test'));
        }
    } catch (err) {
        console.error('Test error:', err);
        alert('❌ Error: ' + err.message);
    }
}

// ===== MEDIA PREVIEW =====
document.addEventListener('DOMContentLoaded', function() {
    const mediaFiles = document.getElementById('mediaFiles');
    const scheduleMediaFiles = document.getElementById('scheduleMediaFiles');
    
    if (mediaFiles) {
        mediaFiles.addEventListener('change', previewMedia);
    }
    if (scheduleMediaFiles) {
        scheduleMediaFiles.addEventListener('change', schedulePreviewMedia);
    }
});

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

    let html = `<h4>📁 Preview (${files.length} file${files.length > 1 ? 's' : ''}):</h4>`;
    html += '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; margin-top: 10px;">';
    
    Array.from(files).forEach(file => {
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
                        <small style="display: block; margin-top: 5px; text-align: center; word-break: break-all;">${file.name}</small>
                    </div>
                `;
            } else if (isImage) {
                preview = `
                    <div style="background: #1e1f22; padding: 10px; border-radius: 5px;">
                        <img src="${e.target.result}" style="width: 100%; height: 100px; object-fit: cover; border-radius: 5px;">
                        <small style="display: block; margin-top: 5px; text-align: center; word-break: break-all;">${file.name}</small>
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
    });
    
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
    const scheduleTimeInput = document.getElementById('scheduleTime');
    if (scheduleTimeInput) {
        scheduleTimeInput.min = minDateTime;
        // Set default to 5 minutes from now
        const defaultTime = new Date(now.getTime() + 5 * 60000);
        const defaultYear = defaultTime.getFullYear();
        const defaultMonth = String(defaultTime.getMonth() + 1).padStart(2, '0');
        const defaultDay = String(defaultTime.getDate()).padStart(2, '0');
        const defaultHours = String(defaultTime.getHours()).padStart(2, '0');
        const defaultMinutes = String(defaultTime.getMinutes()).padStart(2, '0');
        scheduleTimeInput.value = `${defaultYear}-${defaultMonth}-${defaultDay}T${defaultHours}:${defaultMinutes}`;
    }
}

// Add click handlers to tab buttons
document.addEventListener('DOMContentLoaded', function() {
    setMinDateTime();
    
    // Add event listeners for tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const text = this.textContent.trim().toLowerCase();
            let tabName = '';
            
            if (text.includes('send')) tabName = 'send';
            else if (text.includes('schedule')) tabName = 'schedule';
            else if (text.includes('scheduled')) tabName = 'scheduled';
            else if (text.includes('history')) tabName = 'history';
            else if (text.includes('test')) tabName = 'test';
            
            if (tabName) {
                switchTab(tabName);
            }
        });
    });
    
    // Add Enter key support for login
    const passwordInput = document.getElementById('adminPassword');
    if (passwordInput) {
        passwordInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                login();
            }
        });
    }
});
