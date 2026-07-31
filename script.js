(() => {
  const config = window.MOON_PLAYLIST_CONFIG || {};
  const phone = String(config.whatsappNumber || "").replace(/\D/g, "");
  const message = config.optInMessage || "Please notify me when a new song is added.";
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  const ntfyServer = String(config.ntfyServer || "https://ntfy.sh").replace(/\/$/, "");
  const ntfyTopic = String(config.ntfyTopic || "").trim();
  const ntfyUrl = ntfyTopic
    ? `${ntfyServer}/${encodeURIComponent(ntfyTopic)}`
    : "https://ntfy.sh/app";
  const ntfyAppUrl = ntfyTopic
    ? `ntfy://${ntfyServer.replace(/^https?:\/\//, "")}/${encodeURIComponent(ntfyTopic)}`
    : "ntfy://ntfy.sh";
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  for (const id of ["whatsapp-link", "whatsapp-link-secondary"]) {
    const link = document.getElementById(id);
    if (!link) continue;
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    if (!phone) {
      link.href = `https://wa.me/?text=${encodeURIComponent(message)}`;
      link.title = "Add the WhatsApp Business number in config.js before publishing";
    }
  }

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
