const API = window.CRM_API || "https://landing-backend-8gvq.onrender.com/api";
const token = sessionStorage.getItem("token");
const user = JSON.parse(sessionStorage.getItem("user") || "{}");
if (!token) window.location.href = "login.html";
function authHeaders(json = false) {
  const h = { Authorization: `Bearer ${token}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
}
async function request(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    sessionStorage.clear();
    window.location.href = "login.html";
    return;
  }
  if (!res.ok) throw new Error(data.message || "Request failed");
  return data;
}
function safe(v) {
  return String(v ?? "-").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
}
function fmtDate(v) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit", hour12:true });
}
function cleanPhone(phone) { return String(phone || "").replace(/\D/g, "").slice(-10); }
function logout() { sessionStorage.clear(); window.location.href = "login.html"; }
