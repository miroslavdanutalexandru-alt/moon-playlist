(() => {
  const config = window.MOON_PLAYLIST_CONFIG || {};
  const ntfyServer = String(config.ntfyServer || "https://ntfy.sh").replace(/\/$/, "");
  const ntfyTopic = String(config.ntfyTopic || "").trim();
  const ntfyUrl = ntfyTopic
    ? `${ntfyServer}/${encodeURIComponent(ntfyTopic)}`
    : "https://ntfy.sh/app";
  const ntfyAppUrl = ntfyTopic
    ? `ntfy://${ntfyServer.replace(/^https?:\/\//, "")}/${encodeURIComponent(ntfyTopic)}`
    : "ntfy://ntfy.sh";
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  for (const id of ["ntfy-link", "ntfy-link-secondary"]) {
    const link = document.getElementById(id);
    if (!link) continue;
    link.href = isMobile ? ntfyAppUrl : ntfyUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.title = "Open ntfy and subscribe to playlist notifications";
  }

  document.getElementById("year").textContent = new Date().getFullYear();
})();
