import { $, money, escapeHtml, formatDate, NAMES, EXPENSE_CATEGORIES } from "./utils.js";
import { getHistory } from "./budget.js";

export function initHistoryFilters(onChange) {
  $("historyCategoryFilter").innerHTML = '<option value="all">Todas las categorías</option>' + EXPENSE_CATEGORIES.map(c=>`<option>${c}</option>`).join("");
  $("historyTypeFilter").addEventListener("change",onChange);
  $("historyCategoryFilter").addEventListener("change",onChange);
}

export function renderHistory(state,key,profile) {
  let rows = getHistory(state,key,profile);
  const type = $("historyTypeFilter").value;
  const category = $("historyCategoryFilter").value;
  if (type!=="all") rows = rows.filter(item=>item.type===type);
  if (category!=="all") rows = rows.filter(item=>item.category===category);
  $("historyList").innerHTML = rows.length ? rows.map(item=>`
    <article class="item-row">
      <div class="item-content">
        <div class="item-title">${escapeHtml(item.concept)} <span class="owner-tag">${NAMES[item.owner]}</span></div>
        <div class="item-meta">${escapeHtml(item.category)} · ${formatDate(item.date)}</div>
      </div>
      <div class="item-amount ${item.type==="income"?"income-color":"expense-color"}">${item.type==="income"?"+":"-"} ${money(item.amount)}</div>
    </article>
  `).join("") : '<div class="empty">No hay movimientos para estos filtros.</div>';
}
