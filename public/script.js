const API = location.origin;
let AUTH = "";

/* ---------- SAFE DOM HELPER ---------- */
function el(id) {
  return document.getElementById(id);
}

/* ---------- LOGIN ---------- */
async function login() {
  const pwInput = el("pw");
  if (!pwInput) {
    alert("Password input not found (id='pw')");
    return;
  }

  AUTH = pwInput.value.trim();
  if (!AUTH) {
    alert("Enter admin password");
    return;
  }

  try {
    const res = await fetch(`${API}/api/channels`, {
      headers: {
        "x-admin-password": AUTH
      }
    });

    if (!res.ok) {
      throw new Error("Invalid password or server error");
    }

    const channels = await res.json();

    const selects = ["sendChannel", "scheduleChannel", "testChannel"];
    selects.forEach(id => {
      const s = el(id);
      if (!s) return;
      s.innerHTML = channels
        .map(c => `<option value="${c.id}">${c.name}</option>`)
        .join("");
    });

    // Toggle UI SAFELY
    el("login")?.classList.add("hidden");
    el("app")?.classList.remove("hidden");

    loadScheduled();
    loadHistory();

  } catch (err) {
    alert(err.message);
  }
}

/* ---------- TAB SWITCH ---------- */
function tab(name, btn) {
  document.querySelectorAll(".tab").forEach(t =>
    t.classList.add("hidden")
  );
  document.querySelectorAll(".tabs button").forEach(b =>
    b.classList.remove("active")
  );

  el(name)?.classList.remove("hidden");
  btn?.classList.add("active");
}

/* ---------- SEND NOW ---------- */
async function send() {
  if (!el("sendChannel")?.value) {
    alert("Select a channel");
    return;
  }

  const fd = new FormData();
  fd.append("channelId", el("sendChannel").value);
  fd.append("postTitle", el("sendText")?.value || "");

  const files = el("sendFiles")?.files || [];
  for (const f of files) fd.append("mediaFile", f);

  try {
    const res = await fetch(`${API}/api/post`, {
      method: "POST",
      headers: { "x-admin-password": AUTH },
      body: fd
    });

    if (!res.ok) throw new Error("Failed to send");

    alert("Sent!");
    if (el("sendText")) el("sendText").value = "";
    if (el("sendFiles")) el("sendFiles").value = "";
    loadHistory();

  } catch (err) {
    alert(err.message);
  }
}

/* ---------- SCHEDULE ---------- */
async function schedule() {
  if (!el("scheduleChannel")?.value || !el("scheduleTime")?.value) {
    alert("Select channel and time");
    return;
  }

  const fd = new FormData();
  fd.append("channelId", el("scheduleChannel").value);
  fd.append("postTitle", el("scheduleText")?.value || "");
  fd.append("scheduleTime", el("scheduleTime").value);

  const files = el("scheduleFiles")?.files || [];
  for (const f of files) fd.append("mediaFile", f);

  try {
    const res = await fetch(`${API}/api/post`, {
      method: "POST",
      headers: { "x-admin-password": AUTH },
      body: fd
    });

    if (!res.ok) throw new Error("Failed to schedule");

    alert("Scheduled!");
    if (el("scheduleText")) el("scheduleText").value = "";
    if (el("scheduleFiles")) el("scheduleFiles").value = "";
    if (el("scheduleTime")) el("scheduleTime").value = "";
    loadScheduled();

  } catch (err) {
    alert(err.message);
  }
}

/* ---------- TEST ---------- */
async function test() {
  if (!el("testChannel")?.value) {
    alert("Select channel");
    return;
  }

  const fd = new FormData();
  fd.append("channelId", el("testChannel").value);

  const files = el("testFiles")?.files || [];
  for (const f of files) fd.append("mediaFile", f);

  try {
    const res = await fetch(`${API}/api/post`, {
      method: "POST",
      headers: { "x-admin-password": AUTH },
      body: fd
    });

    if (!res.ok) throw new Error("Test failed");

    alert("Test sent!");
    if (el("testFiles")) el("testFiles").value = "";

  } catch (err) {
    alert(err.message);
  }
}

/* ---------- LOAD SCHEDULED ---------- */
async function loadScheduled() {
  const box = el("scheduled");
  if (!box) return;

  const res = await fetch(`${API}/api/scheduled`, {
    headers: { "x-admin-password": AUTH }
  });

  const data = await res.json();
  box.innerHTML = "<h2>Scheduled</h2>";

  if (!data.length) {
    box.innerHTML += "<p>None</p>";
    return;
  }

  data.forEach(p => {
    box.innerHTML += `
      <div class="list-item">
        <strong>${p.postTitle || "(no text)"}</strong>
        <small>${new Date(p.time).toLocaleString()}</small>
      </div>
    `;
  });
}

/* ---------- LOAD HISTORY ---------- */
async function loadHistory() {
  const box = el("history");
  if (!box) return;

  const res = await fetch(`${API}/api/history`, {
    headers: { "x-admin-password": AUTH }
  });

  const data = await res.json();
  box.innerHTML = "<h2>History</h2>";

  if (!data.length) {
    box.innerHTML += "<p>None</p>";
    return;
  }

  data.reverse().forEach(p => {
    box.innerHTML += `
      <div class="list-item">
        <strong>${p.title || "(no text)"}</strong>
        <small>${new Date(p.time).toLocaleString()}</small>
      </div>
    `;
  });
}
