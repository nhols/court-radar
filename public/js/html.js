export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

export function formatPrice(value) {
  return `£${Number(value).toFixed(2).replace(/\.00$/, "")}`;
}

export function plural(count, one, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

export function capitalise(value) {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}
