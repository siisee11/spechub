(function () {
  var grid = document.getElementById("spec-grid");
  var search = document.getElementById("spec-search");
  var count = document.getElementById("visible-count");
  var empty = document.getElementById("empty-state");

  function updateSearch() {
    if (!grid || !search || !count || !empty) return;

    var query = search.value.trim().toLowerCase();
    var cards = grid.querySelectorAll(".spec-card");
    var visible = 0;

    cards.forEach(function (card) {
      var text = (card.getAttribute("data-search") || "").toLowerCase();
      var match = text.indexOf(query) !== -1;
      card.hidden = !match;
      if (match) visible += 1;
    });

    count.textContent = String(visible);
    empty.hidden = visible !== 0;
  }

  if (search) {
    search.addEventListener("input", updateSearch);
  }

  document.addEventListener("click", async function (event) {
    var target = event.target;
    if (!(target instanceof Element)) return;

    var button = target.closest(".copy-command");
    if (!button) return;

    var command = button.getAttribute("data-command");
    if (!command) return;

    try {
      if (!navigator.clipboard || !window.isSecureContext) {
        throw new Error("clipboard-unavailable");
      }
      await navigator.clipboard.writeText(command);
      button.textContent = "Copied command";
      button.classList.add("copied");
      setTimeout(function () {
        button.textContent = "Download spec";
        button.classList.remove("copied");
      }, 1400);
    } catch (_error) {
      window.prompt("Copy install command:", command);
    }
  });

  updateSearch();
})();
