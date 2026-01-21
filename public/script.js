const API = location.origin;
let AUTH = "";

/* ---------- LOGIN ---------- */
async function login() {
  AUTH = document.getElementById("pw").value;
  if (!AUTH) return alert("Enter admin password");

  try {
    const res = await fetch(`${API}/api/channels`, {
      headers: { Authorization: AUTH }
    });

    if (!res.ok) throw new Error("Invalid password");

    const channels = await res.json();

    ["sendChannel", "scheduleChannel", "testChannel"].forEach(id => {
      const select = document.getElementById(id);
      select.innerHTML = channels
        .map(c => `<option value="${c.id}">${c.name}</option>`)
        .join("");
    });

    document.getElementById("login").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");

    loadScheduled();
    loadHistory();
  } catch (err) {
    alert(err.message);
  }
}

/* ---------- TABS ---------- */
function tab(name) {
  document.querySelectorAll(".tab").forEach(t =>
    t.classList.add("hidden")
  );
  document.querySelectorAll(".tabs button").forEach(b =>
    b.classList.remove("active")
  );

  document.getElementById(name).classList.remove("hidden");
  event.target.classList.add("active");
}

/* ---------- SEND NOW ---------- */
async function send() {
  if (!sendChannel.value) return alert("Select channel");

  const fd = new FormData();
  fd.append("channelId", sendChannel.value);
  fd.append("postTitle", sendText.value);

  [...sendFiles.files].forEach(f =>
    fd.append("mediaFile", f)
  );

  try {
    const res = await fetch(`${API}/api/post`, {
      method: "POST",
      headers: { Authorization: AUTH },
      body: fd
    });

    if (!res.ok) throw new Error("Failed to send");

    alert("Sent!");
    sendText.value = "";
    sendFiles.value = "";
    loadHistory();
  } catch (err) {
    alert(err.message);
  }
}

/* ---------- SCHEDULE ---------- */
async function schedule() {
  if (!scheduleChannel.value) return alert("Select channel");
  if (!scheduleTime.value) return alert("Pick date & time");

  const fd = new FormData();
  fd.append("channelId", scheduleChannel.value);
  fd.append("postTitle", scheduleText.value);
  fd.append("scheduleTime", scheduleTime.value);

  [...scheduleFiles.files].forEach(f =>
    fd.append("mediaFile", f)
  );

  try {
    const res = await fetch(`${API}/api/post`, {
      method: "POST",
      headers: { Authorization: AUTH },
      body: fd
    });

    if (!res.ok) throw new Error("Failed to schedule");

    alert("Scheduled!");
    scheduleText.value = "";
    scheduleFiles.value = "";
    scheduleTime.value = "";
    loadScheduled();
  } catch (err) {
    alert(err.message);
  }
}

/* ---------- TEST ---------- */
async function test() {
  if (!testChannel.value) return alert("Select channel");

  const fd = new FormData();
  fd.append("channelId", testChannel.value);

  [...testFiles.files].forEach(f =>
    fd.append("mediaFile", f)
  );

  try {
    const res = await fetch(`${API}/api/post`, {
      method: "POST",
      headers: { Authorization: AUTH },
      body: fd
    });

    if (!res.ok) throw new Error("Test failed");

    alert("Test sent!");
    testFiles.value = "";
  } catch (err) {
    alert(err.message);
  }
}

/* ---------- LOAD SCHEDULED ---------- */
async function loadScheduled() {
  const res = await fetch(`${API}/api/scheduled`, {
    headers: { Authorization: AUTH }
  });
  const data = await res.json();

  const box = document.getElementById("scheduled");
  box.innerHTML = "<h2>📋 Scheduled</h2>";

  if (!data.length) {
    box.innerHTML += "<p>No scheduled posts</p>";
    return;
  }

  data.forEach(p => {
    box.innerHTML += `
      <div class="list-item">
        <strong>${p.postTitle || "(No message)"}</strong>
        <small>${new Date(p.time).toLocaleString()}</small>
      </div>
    `;
  });
}

/* ---------- LOAD HISTORY ---------- */
async function loadHistory() {
  const res = await fetch(`${API}/api/history`, {
    headers: { Authorization: AUTH }
  });
  const data = await res.json();

  const box = document.getElementById("history");
  box.innerHTML = "<h2>📜 History</h2>";

  if (!data.length) {
    box.innerHTML += "<p>No history</p>";
    return;
  }

  data
    .slice()
    .reverse()
    .forEach(p => {
      box.innerHTML += `
        <div class="list-item">
          <strong>${p.title || "(No message)"}</strong>
          <small>${new Date(p.time).toLocaleString()}</small>
        </div>
      `;
    });
}
