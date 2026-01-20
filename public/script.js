const API_BASE = window.location.origin;

async function fetchChannels() {
    const password = document.getElementById('adminPassword').value;
    
    if (!password) {
        alert("Please enter the password: 123test");
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/channels`, {
            headers: { 'Authorization': password }
        });

        if (!response.ok) {
            throw new Error("Invalid Password or Server Error");
        }

        const channels = await response.json();
        const select = document.getElementById('channelSelect');
        select.innerHTML = '<option value="">-- Select a Channel --</option>';

        channels.forEach(ch => {
            const opt = document.createElement('option');
            opt.value = ch.id;
            opt.textContent = ch.name;
            select.appendChild(opt);
        });

        alert("Logged in! Channels loaded.");
    } catch (err) {
        alert(err.message);
    }
}

async function sendPost() {
    const password = document.getElementById('adminPassword').value;
    const channelId = document.getElementById('channelSelect').value;
    const content = document.getElementById('postContent').value;
    const fileInput = document.getElementById('mediaFile');

    if (!channelId) return alert("Select a channel first!");

    const formData = new FormData();
    formData.append('channelId', channelId);
    formData.append('postTitle', content);
    if (fileInput.files[0]) {
        formData.append('mediaFile', fileInput.files[0]);
    }

    try {
        const response = await fetch(`${API_BASE}/api/post`, {
            method: 'POST',
            headers: { 'Authorization': password },
            body: formData
        });

        if (response.ok) {
            alert("Post sent successfully!");
            document.getElementById('postContent').value = '';
        } else {
            alert("Failed to send post.");
        }
    } catch (err) {
        alert("Error: " + err.message);
    }
}
