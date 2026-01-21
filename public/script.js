const API = location.origin;
let AUTH = "";

function el(id) {
  return document.getElementById(id);
}

/* -------------------- LOGIN -------------------- */
async function login() {
  const pwInput = el("pw");
  if (!pwInput) {
    alert("Password input not found");
    return;
  }

  AUTH = pwInput.value.trim();
  if (!AUTH) {
    alert("Enter admin password");
    return;
  }

  try {
    const res = await fetch(`${API}/api/channels`, {
      method: "GET",
      headers: {
        "x-admin-password": AUTH
      }
    });

    if (!res.ok) {
      throw new Error("Wrong password");
    }

    const channels = await res.json();

    ["sendChannel", "scheduleChannel", "testChannel"].forEach(id => {
      const select = el(id);
      if (!select) return;

      select.innerHTML = channels
        .map(c => `<option value="${c.id}">${c.name}</option>`)
        .join("");
    });

    el("login")?.classList.add("hidden");
    el("app")?.classList.remove("hidden");

  } catch (err) {
    alert(err.message);
  }
}
