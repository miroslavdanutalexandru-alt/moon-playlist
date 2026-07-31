(() => {
  const config = window.MOON_PLAYLIST_CONFIG || {};
  const phone = String(config.whatsappNumber || "").replace(/\D/g, "");
  const message = config.optInMessage || "Please notify me when a new song is added.";
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

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

  document.getElementById("year").textContent = new Date().getFullYear();
})();
