const API_BASE = window.location.origin;

async function fetchChannels() {
    const password = document.getElementById('adminPassword').value;
    try {
        const res = await fetch(`${API_BASE}/api/channels`, {
            headers: { 'Authorization': password }
        });
        if (!res.ok) throw new Error("Check Password");
        const channels = await res.json();
        const select = document.getElementById('channelSelect');
        select.innerHTML = channels.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        alert("Connected!");
    } catch (err) { alert(err.message); }
}

async function sendPost() {
    const password = document.getElementById('adminPassword').value;
    const channelId = document.getElementById('channelSelect').value;
    const content = document.getElementById('postContent').value;
    const scheduleTime = document.getElementById('scheduleTime').value;
    const fileInput = document.getElementById('mediaFile');

    if (!channelId) return alert("Select a channel!");

    const formData = new FormData();
    formData.append('channelId', channelId);
    formData.append('postTitle', content);
    if (scheduleTime) formData.append('scheduleTime', scheduleTime);
    if (fileInput.files[0]) formData.append('mediaFile', fileInput.files[0]);

    try {
        const res = await fetch(`${API_BASE}/api/post`, {
            method: 'POST',
            headers: { 'Authorization': password },
            body: formData
        });
        const result = await res.json();
        if (res.ok) {
            alert(result.scheduled ? "✅ Post Scheduled!" : "✅ Post Sent Now!");
        } else {
            alert("Error: " + result.error);
        }
    } catch (err) { alert("Server Error"); }
}
