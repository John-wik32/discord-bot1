const API_BASE = window.location.origin;
let currentPassword = '';

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

        if (!res.ok) {
            throw new Error("Invalid password");
        }

        const channels = await res.json();
        currentPassword = password;
        
        const select = document.getElementById('channelSelect');
        select.innerHTML = '<option value="">-- Select Channel --</option>' + 
            channels.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        
        document.getElementById('login-container').classList.add('hidden');
        document.getElementById('dashboard-container').classList.remove('hidden');
        
        loadScheduledPosts();
        alert('✓ Connected!');
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function sendPost() {
    const channelId = document.getElementById('channelSelect').value;
    const content = document.getElementById('postContent').value;
    const scheduleTime = document.getElementById('scheduleTime').value;
    const fileInput = document.getElementById('mediaFile');

    if (!channelId) {
        alert('Please select a channel');
        return;
    }

    if (!content && !fileInput.files[0]) {
        alert('Please add message content or media');
        return;
    }

    const formData = new FormData();
    formData.append('channelId', channelId);
    formData.append('postTitle', content);
    if (scheduleTime) formData.append('scheduleTime', scheduleTime);
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
            document.getElementById('postContent').value = '';
            document.getElementById('scheduleTime').value = '';
            document.getElementById('mediaFile').value = '';
            document.getElementById('preview-container').innerHTML = '';
            
            if (result.scheduled) {
                loadScheduledPosts();
            }
        } else {
            alert('Error: ' + result.error);
        }
    } catch (err) {
        alert('Server error: ' + err.message);
    }
}

async function loadScheduledPosts() {
    try {
        const res = await fetch(`${API_BASE}/api/scheduled`, {
            headers: { 'Authorization': currentPassword }
        });

        if (!res.ok) return;

        const tasks = await res.json();
        const container = document.getElementById('scheduled-posts');
        
        if (tasks.length === 0) {
            container.innerHTML = '<p style="color: #888;">No scheduled posts</p>';
            return;
        }

        container.innerHTML = tasks.map((task, idx) => `
            <div class="scheduled-item">
                <div>
                    <strong>${new Date(task.time).toLocaleString()}</strong>
                    <p>${task.content}${task.hasMedia ? ' [Has Media]' : ''}</p>
                </div>
                <button class="delete-btn" onclick="deleteScheduled(${idx})">Delete</button>
            </div>
        `).join('');
    } catch (err) {
        console.error('Load scheduled error:', err);
    }
}

async function deleteScheduled(index) {
    if (!confirm('Delete this scheduled post?')) return;

    try {
        const res = await fetch(`${API_BASE}/api/scheduled/${index}`, {
            method: 'DELETE',
            headers: { 'Authorization': currentPassword }
        });

        if (res.ok) {
            alert('✓ Deleted');
            loadScheduledPosts();
        } else {
            alert('Error deleting post');
        }
    } catch (err) {
        alert('Server error: ' + err.message);
    }
}

function previewMedia() {
    const fileInput = document.getElementById('mediaFile');
    const preview = document.getElementById('preview-container');
    
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

// Keyboard shortcut: Enter to send (Ctrl+Enter in textarea)
document.addEventListener('DOMContentLoaded', () => {
    const textarea = document.getElementById('postContent');
    textarea?.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
            sendPost();
        }
    });
});
