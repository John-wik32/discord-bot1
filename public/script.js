// REPLACE THIS URL WITH YOUR RENDER URL AFTER DEPLOYING BACKEND
// Example: const API_URL = "https://my-discord-bot.onrender.com";
const API_URL = "YOUR_RENDER_BACKEND_URL_HERE"; 

let authToken = localStorage.getItem('staffPassword') || "";

// --- LOGIN LOGIC ---
if (authToken) {
    showDashboard();
}

function handleLogin() {
    const pwd = document.getElementById('password-input').value;
    if (!pwd) return;
    authToken = pwd;
    localStorage.setItem('staffPassword', authToken);
    showDashboard();
}

function logout() {
    localStorage.removeItem('staffPassword');
    location.reload();
}

function showDashboard() {
    document.getElementById('login-container').classList.add('hidden');
    document.getElementById('dashboard-container').classList.remove('hidden');
    fetchChannels();
}

// --- DASHBOARD LOGIC ---
async function fetchChannels() {
    const select = document.getElementById('channel-select');
    select.innerHTML = '<option>Loading...</option>';

    try {
        const res = await fetch(`${API_URL}/api/channels`, {
            headers: { 'Authorization': authToken }
        });
        
        if (res.status === 403) {
            alert("Incorrect Password. Logging out.");
            logout();
            return;
        }

        const channels = await res.json();
        select.innerHTML = '<option value="" disabled selected>Select a Channel</option>';
        
        channels.forEach(ch => {
            const option = document.createElement('option');
            option.value = ch.id;
            option.textContent = ch.name;
            select.appendChild(option);
        });

    } catch (err) {
        console.error(err);
        select.innerHTML = '<option>Error loading channels (Wake up backend?)</option>';
    }
}

// --- FILE PREVIEW LOGIC ---
const fileInput = document.getElementById('file-input');
const dropArea = document.getElementById('drop-area');

dropArea.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', handleFileSelect);

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    document.getElementById('preview-container').classList.remove('hidden');
    const imgPreview = document.getElementById('img-preview');
    const vidPreview = document.getElementById('video-preview');

    const url = URL.createObjectURL(file);

    if (file.type.startsWith('image/')) {
        imgPreview.src = url;
        imgPreview.classList.remove('hidden');
        vidPreview.classList.add('hidden');
    } else if (file.type.startsWith('video/')) {
        vidPreview.src = url;
        vidPreview.classList.remove('hidden');
        imgPreview.classList.add('hidden');
    }
}

function clearFile() {
    fileInput.value = "";
    document.getElementById('preview-container').classList.add('hidden');
}

// --- SEND POST LOGIC ---
async function sendPost() {
    const channelId = document.getElementById('channel-select').value;
    const title = document.getElementById('post-title').value;
    const file = fileInput.files[0];
    const status = document.getElementById('status-msg');

    if (!channelId) return alert("Please select a channel!");

    const formData = new FormData();
    formData.append('channelId', channelId);
    formData.append('postTitle', title);
    if (file) formData.append('mediaFile', file);

    status.textContent = "Sending... please wait.";
    document.getElementById('send-btn').disabled = true;

    try {
        const res = await fetch(`${API_URL}/api/post`, {
            method: 'POST',
            headers: { 'Authorization': authToken },
            body: formData
        });

        const data = await res.json();

        if (data.success) {
            status.textContent = "✅ Sent successfully!";
            status.style.color = "lightgreen";
            setTimeout(() => {
                status.textContent = "";
                document.getElementById('post-title').value = "";
                clearFile();
            }, 3000);
        } else {
            status.textContent = "❌ Error: " + data.error;
            status.style.color = "#DA373C";
        }
    } catch (err) {
        status.textContent = "❌ Network Error";
    } finally {
        document.getElementById('send-btn').disabled = false;
    }
}
