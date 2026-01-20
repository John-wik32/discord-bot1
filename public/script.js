// --- CONFIG ---
// This line automatically finds your Koyeb URL so you don't have to hardcode it
const API_BASE = window.location.origin; 

async function fetchChannels() {
    const password = document.getElementById('adminPassword').value;
    
    if (!password) {
        alert("Please enter the Admin Password first!");
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/channels`, {
            headers: {
                'Authorization': password
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to fetch');
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

        alert("Channels loaded successfully!");
    } catch (err) {
        console.error("Error details:", err);
        alert("Error: " + err.message);
    }
}

// Make sure your "Load Channels" button calls fetchChannels()
