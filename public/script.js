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
    console.log('   Password entered');

    try {
        // First check if server is reachable
        console.log('🩺 Checking server health...');
        const healthRes = await fetch(`${API}/health`);
        const healthData = await healthRes.json();
        console.log('   Health check:', healthData);

        if (!healthRes.ok) {
            throw new Error('Server is not responding');
        }

        // Try to get channels
        console.log('📡 Fetching channels...');
        const res = await fetch(`${API}/api/channels`, {
            headers: { 
                'Authorization': password
            }
        });
        
        console.log('   Channels response status:', res.status);
        
        if (res.status === 401 || res.status === 403) {
            throw new Error('Wrong password. Try: 123test');
        }
        
        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`Server error: ${res.status}`);
        }

        const channels = await res.json();
        console.log(`✅ Received ${channels.length} channels`);
        
        // Update channel dropdowns
        updateChannelDropdowns(channels);
        
        // Show dashboard
        document.getElementById('login-container').classList.add('hidden');
        document.getElementById('dashboard-container').classList.remove('hidden');

        // Load initial data
        await loadScheduled();
        await loadHistory();
        
        alert(`✅ Connected! Found ${channels.length} channels`);
        
    } catch (err) {
        console.error('❌ Login error:', err);
        alert('Login failed: ' + err.message);
    }
}

function updateChannelDropdowns(channels) {
    // Fill all channel selects
    const selects = ['channelSelect', 'scheduleChannelSelect', 'testChannelSelect'];
    
    selects.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (select) {
            // Clear existing options
            select.innerHTML = '<option value="">-- Select a Channel --</option>';
            
            // Group by guild
            const guilds = {};
            channels.forEach(channel => {
                if (!guilds[channel.guildName]) {
                    guilds[channel.guildName] = [];
                }
                guilds[channel.guildName].push(channel);
            });
            
            // Add options grouped by guild
            Object.keys(guilds).forEach(guildName => {
                const optgroup = document.createElement('optgroup');
                optgroup.label = guildName;
                
                guilds[guildName].forEach(channel => {
                    const option = document.createElement('option');
                    option.value = channel.id;
                    option.textContent = `#${channel.channelName}`;
                    optgroup.appendChild(option);
                });
                
                select.appendChild(optgroup);
            });
            
            // Add manual input option
            const manualOption = document.createElement('option');
            manualOption.value = 'manual';
            manualOption.textContent = '-- Enter Channel ID Manually --';
            select.appendChild(manualOption);
            
            // Add change listener to show manual input
            select.addEventListener('change', function() {
                const manualInputId = selectId.replace('Select', 'ManualChannelId');
                const manualInput = document.getElementById(manualInputId);
                if (manualInput) {
                    manualInput.style.display = this.value === 'manual' ? 'block' : 'none';
                    if (this.value !== 'manual') {
                        manualInput.value = '';
                    }
                }
            });
        }
    });
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
    
    // Find and activate the clicked button
    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(btn => {
        if (btn.textContent.toLowerCase().includes(tabName)) {
            btn.classList.add('active');
        }
    });
}

// ===== SEND POST =====
async function sendPost() {
    const channelSelect = document.getElementById('channelSelect');
    const manualChannelId = document.getElementById('manualChannelId');
    let channelId = '';
    
    if (channelSelect.value === 'manual') {
        channelId = manualChannelId.value.trim();
    } else {
        channelId = channelSelect.value;
    }
    
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
    let channelId = '';
    
    if (channelSelect.value === 'manual') {
        channelId = manualChannelId.value.trim();
    } else {
        channelId = channelSelect.value;
    }
    
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
            let errorMsg = data.error || 'Failed to schedule post';
            if (data.difference) {
                errorMsg += `\nTime difference: ${Math.round(data.difference/1000)} seconds`;
                errorMsg += `\nNeed at least 60 seconds in future`;
            }
            alert('❌ Error: ' + errorMsg);
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
                    <p>Channel: ${post.channelId}</p>
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

// ===== TEST SEND WITH FILES =====
async function testSend() {
    const channelSelect = document.getElementById('testChannelSelect');
    const manualChannelId = document.getElementById('testManualChannelId');
    let channelId = '';
    
    if (channelSelect.value === 'manual') {
        channelId = manualChannelId.value.trim();
    } else {
        channelId = channelSelect.value;
    }
    
    const testMessage = document.getElementById('testMessage').value.trim();
    const testFiles = document.getElementById('testMediaFiles').files;

    if (!channelId) {
        alert('Please select or enter a channel ID');
        return;
    }

    console.log('🧪 Sending test with files...');
    console.log('   Channel ID:', channelId);
    console.log('   Test message:', testMessage || '(default)');
    console.log('   Files:', testFiles.length);

    const formData = new FormData();
    formData.append('channelId', channelId);
    if (testMessage) formData.append('message', testMessage);
    
    for (let file of testFiles) {
        formData.append('mediaFiles', file);
    }

    try {
        const res = await fetch(`${API}/api/test`, {
            method: 'POST',
            headers: { 'Authorization': password },
            body: formData
        });
        
        const data = await res.json();
        
        if (res.ok) {
            alert(`✅ Test message sent successfully!${data.filesCount ? `\nWith ${data.filesCount} file(s)` : ''}`);
            document.getElementById('testMessage').value = '';
            document.getElementById('testMediaFiles').value = '';
            document.getElementById('testPreview').innerHTML = '';
        } else {
            alert('❌ Error: ' + (data.error || 'Failed to send test'));
        }
    } catch (err) {
        console.error('Test error:', err);
        alert('❌ Error: ' + err.message);
    }
}

// ===== MEDIA PREVIEW FUNCTIONS =====
document.addEventListener('DOMContentLoaded', function() {
    // Set up file previews
    setupFilePreview('mediaFiles', 'preview-container');
    setupFilePreview('scheduleMediaFiles', 'schedulePreview');
    setupFilePreview('testMediaFiles', 'testPreview');
    
    // Set minimum datetime to 1 minute from now
    setMinDateTime();
    
    // Add tab button listeners
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
    
    // Set default schedule time to 5 minutes from now
    const scheduleTimeInput = document.getElementById('scheduleTime');
    if (scheduleTimeInput) {
        const now = new Date();
        const future = new Date(now.getTime() + 5 * 60000); // 5 minutes
        scheduleTimeInput.value = formatDateTimeLocal(future);
    }
});

function setupFilePreview(inputId, previewId) {
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);
    
    if (input && preview) {
        input.addEventListener('change', function() {
            showPreviews(this.files, preview);
        });
    }
}

function showPreviews(files, container) {
    if (files.length === 0) {
        container.innerHTML = '';
        return;
    }

    let html = `<div class="preview-header">📁 Selected Files (${files.length}):</div>`;
    html += '<div class="preview-grid">';
    
    Array.from(files).forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const isVideo = file.type.includes('video');
            const isImage = file.type.includes('image');
            
            let preview = '';
            if (isVideo) {
                preview = `
                    <div class="preview-item">
                        <div class="preview-video">
                            <video controls>
                                <source src="${e.target.result}" type="${file.type}">
                            </video>
                        </div>
                        <div class="preview-info">
                            <div class="file-name">${file.name}</div>
                            <div class="file-size">${formatFileSize(file.size)}</div>
                        </div>
                    </div>
                `;
            } else if (isImage) {
                preview = `
                    <div class="preview-item">
                        <div class="preview-image">
                            <img src="${e.target.result}" alt="${file.name}">
                        </div>
                        <div class="preview-info">
                            <div class="file-name">${file.name}</div>
                            <div class="file-size">${formatFileSize(file.size)}</div>
                        </div>
                    </div>
                `;
            } else {
                preview = `
                    <div class="preview-item">
                        <div class="preview-other">
                            <div class="file-icon">📄</div>
                        </div>
                        <div class="preview-info">
                            <div class="file-name">${file.name}</div>
                            <div class="file-size">${formatFileSize(file.size)}</div>
                        </div>
                    </div>
                `;
            }
            
            // Append to existing previews
            const previewDiv = document.createElement('div');
            previewDiv.innerHTML = preview;
            container.appendChild(previewDiv.firstChild);
        };
        reader.readAsDataURL(file);
    });
    
    container.innerHTML = html + '</div>';
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDateTimeLocal(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function setMinDateTime() {
    const now = new Date();
    const minDate = new Date(now.getTime() + 60000); // 1 minute from now
    
    const scheduleTimeInput = document.getElementById('scheduleTime');
    if (scheduleTimeInput) {
        scheduleTimeInput.min = formatDateTimeLocal(minDate);
    }
}
