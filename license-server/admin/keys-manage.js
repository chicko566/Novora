// CSP-konforme Bestaetigungen und Mehrfachauswahl fuer die Schluesselverwaltung.
document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  const msg = form.dataset.confirm;
  if (msg && !window.confirm(msg)) {
    event.preventDefault();
  }
});

const selAll = document.getElementById('selAll');
const bulkBtn = document.getElementById('bulkDelBtn');
const bulkCount = document.getElementById('bulkSelCount');

function rowBoxes() {
  return [...document.querySelectorAll('input.row-sel[type="checkbox"]')];
}

function syncBulkUi() {
  const boxes = rowBoxes();
  const checked = boxes.filter((b) => b.checked);
  if (selAll) {
    selAll.checked = boxes.length > 0 && checked.length === boxes.length;
    selAll.indeterminate = checked.length > 0 && checked.length < boxes.length;
  }
  if (bulkBtn) {
    bulkBtn.disabled = checked.length === 0;
    bulkBtn.textContent = checked.length > 0
      ? `Ausgewählte löschen (${checked.length})`
      : 'Ausgewählte löschen';
  }
  if (bulkCount) {
    bulkCount.textContent = checked.length > 0
      ? `${checked.length} von ${boxes.length} ausgewählt`
      : '';
  }
}

if (selAll) {
  selAll.addEventListener('change', () => {
    for (const box of rowBoxes()) box.checked = selAll.checked;
    syncBulkUi();
  });
}

document.addEventListener('change', (event) => {
  if (event.target instanceof HTMLInputElement && event.target.classList.contains('row-sel')) {
    syncBulkUi();
  }
});

syncBulkUi();
