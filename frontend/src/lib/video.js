const YT_HOSTS = ["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com", "youtu.be", "www.youtu.be"];
const YT_ID = /^[A-Za-z0-9_-]{11}$/;

const decode = (s) => s.replace(/&amp;/gi, "&").replace(/&#0?38;/g, "&").replace(/&quot;/gi, '"').replace(/&#0?39;/g, "'");

function extractUrl(raw) {
  const s = decode(String(raw || "").trim());
  if (/<\s*iframe/i.test(s)) {
    const m = s.match(/<\s*iframe\b[^>]*?\bsrc\s*=\s*(["'])(.*?)\1/i) || s.match(/<\s*iframe\b[^>]*?\bsrc\s*=\s*([^\s>]+)/i);
    return { url: m ? decode(m[2] ?? m[1]).trim() : "", fromCode: true };
  }
  if (/<\s*\/?\s*[a-z]/i.test(s)) return { url: "", fromCode: true };
  return { url: s.split(/\s+/)[0], fromCode: false };
}

function seconds(t) {
  if (!t) return 0;
  if (/^\d+$/.test(t)) return +t;
  const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0;
}

function youtube(u) {
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split("/").filter(Boolean);
  let id = "";
  if (host.endsWith("youtu.be")) id = parts[0];
  else if (parts[0] === "watch") id = u.searchParams.get("v");
  else if (["embed", "shorts", "live", "v", "e"].includes(parts[0])) id = parts[1];
  if (!YT_ID.test(id || "")) return { error: "This YouTube link has no valid video ID. Use a link like youtube.com/watch?v=… or youtu.be/…" };
  const start = seconds(u.searchParams.get("t") || u.searchParams.get("start") || (u.hash.match(/t=([\dhms]+)/) || [])[1]);
  return { provider: "youtube", id, url: `https://www.youtube.com/embed/${id}${start ? `?start=${start}` : ""}`, watch: `https://www.youtube.com/watch?v=${id}` };
}

function vimeo(u) {
  const parts = u.pathname.split("/").filter(Boolean);
  let id = "";
  let hash = u.searchParams.get("h") || "";
  if (u.hostname.toLowerCase() === "player.vimeo.com") { if (parts[0] === "video") id = parts[1]; }
  else {
    const v = parts.findIndex((p) => p === "video" || p === "videos");
    const i = v >= 0 && /^\d+$/.test(parts[v + 1] || "") ? v + 1 : parts.findIndex((p) => /^\d+$/.test(p));
    if (i >= 0) { id = parts[i]; if (!hash && /^[a-f0-9]{6,}$/i.test(parts[i + 1] || "")) hash = parts[i + 1]; }
  }
  if (!/^\d+$/.test(id || "")) return { error: "This Vimeo link has no video number. Use a link like vimeo.com/123456789 (or vimeo.com/123456789/abc123 for unlisted videos)." };
  if (hash && !/^[A-Za-z0-9]+$/.test(hash)) hash = "";
  return { provider: "vimeo", id, hash, url: `https://player.vimeo.com/video/${id}${hash ? `?h=${hash}` : ""}`, watch: `https://vimeo.com/${id}${hash ? `/${hash}` : ""}` };
}

export function toEmbed(raw) {
  if (!String(raw || "").trim()) return { empty: true };
  const { url } = extractUrl(raw);
  if (!url) return { error: "Couldn't find a video link in that code. Paste the Vimeo/YouTube link or its <iframe> embed code." };
  let u;
  try { u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(url) ? url : url.startsWith("//") ? `https:${url}` : `https://${url}`); } catch { return { error: "That doesn't look like a valid link." }; }
  if (!["https:", "http:"].includes(u.protocol)) return { error: "Only https video links can be embedded." };
  const host = u.hostname.toLowerCase();
  if (YT_HOSTS.includes(host)) return youtube(u);
  if (host === "vimeo.com" || host.endsWith(".vimeo.com")) return vimeo(u);
  if (u.protocol !== "https:") return { error: "Only https video links can be embedded." };
  return { provider: "other", url: u.toString(), warning: "Not a YouTube or Vimeo link — it may refuse to play inside the lesson." };
}

export const embedSrc = (v) => { const r = toEmbed(v); return r.url && !r.error ? r.url : ""; };
