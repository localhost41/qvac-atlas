for (const catalog of document.querySelectorAll("[data-catalog]")) {
  const form = catalog.querySelector("[data-filters]");
  const records = [...catalog.querySelectorAll("[data-record]")];
  const search = catalog.querySelector("[data-search]");
  const count = catalog.querySelector("[data-count]");
  const empty = catalog.querySelector("[data-empty]");
  if (
    !(form instanceof HTMLFormElement) ||
    !(count instanceof HTMLElement) ||
    !(empty instanceof HTMLElement)
  ) {
    continue;
  }

  const applyFilters = () => {
    const selections = [...form.querySelectorAll("select[data-filter]")];
    const query =
      search instanceof HTMLInputElement
        ? search.value.trim().toLowerCase()
        : "";
    let visible = 0;
    for (const record of records) {
      const matchesFilters = selections.every((select) => {
        if (!(select instanceof HTMLSelectElement)) return false;
        if (select.value === "") return true;
        const key = select.dataset.filter;
        return key !== undefined && record.dataset[key] === select.value;
      });
      const matchesSearch =
        query === "" ||
        (record.dataset.searchText ?? "").toLowerCase().includes(query);
      const matches = matchesFilters && matchesSearch;
      record.hidden = !matches;
      if (matches) visible += 1;
    }
    count.textContent = `Showing ${visible} ${visible === 1 ? "result" : "results"}`;
    empty.hidden = visible !== 0;
  };

  form.addEventListener("change", applyFilters);
  search?.addEventListener("input", applyFilters);
  form.addEventListener("reset", () => queueMicrotask(applyFilters));
}
