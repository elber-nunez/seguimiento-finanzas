import { $, money, escapeHtml, NAMES } from "./utils.js";
import { calculateTotals, getProfileData } from "./budget.js";

export function renderDashboard(state,key,profile) {
  const data = calculateTotals(state,key,profile);
  const values = [
    {label:"Ingresos",value:data.income,cls:"income"},
    {label:"Gastos fijos",value:data.fixedPlanned,cls:"fixed"},
    {label:"Pagado",value:data.paid,cls:"paid"},
    {label:"Saldo esperado",value:Math.max(0,data.expected),cls:"expected"}
  ];
  const max = Math.max(...values.map(item=>item.value),1);
  $("dashboardBars").innerHTML = values.map(item=>`
    <div class="bar-chart-row"><span>${item.label}</span><div class="bar-track"><i class="bar-fill ${item.cls}" style="width:${Math.max(item.value?3:0,item.value/max*100)}%"></i></div><strong>${money(item.value)}</strong></div>
  `).join("");

  const totalPlanned = data.fixedPlanned + data.variable;
  const pct = totalPlanned ? Math.min(100,data.paid/totalPlanned*100) : 0;
  $("dashboardPct").textContent = `${pct.toFixed(0)}%`;
  $("dashboardDonut").style.background = `conic-gradient(var(--green) 0deg ${pct*3.6}deg,#e7edf4 ${pct*3.6}deg 360deg)`;
  $("dashboardLegend").innerHTML = `
    <div class="legend-row"><i class="legend-dot paid"></i><span>Realizado</span><strong>${money(data.paid)}</strong></div>
    <div class="legend-row"><i class="legend-dot pending"></i><span>Pendiente</span><strong>${money(data.pending)}</strong></div>
    <div class="legend-row"><i class="legend-dot balance"></i><span>Saldo esperado</span><strong>${money(data.expected)}</strong></div>`;

  const categories = {};
  const profileData = getProfileData(state,key,profile);
  [...profileData.fixed,...profileData.variable].forEach(item=>categories[item.category]=(categories[item.category]||0)+Number(item.amount||0));
  const ordered = Object.entries(categories).sort((a,b)=>b[1]-a[1]);
  const categoryMax = ordered.length ? ordered[0][1] : 1;
  $("categoryChart").innerHTML = ordered.length ? ordered.map(([name,value])=>`
    <div class="category-row"><div class="category-name">${escapeHtml(name)}</div><div class="category-track"><i class="category-fill" style="width:${Math.max(3,value/categoryMax*100)}%"></i></div><div class="category-value">${money(value)}</div></div>
  `).join("") : '<div class="empty">No hay gastos registrados.</div>';

  $("comparisonPanel").classList.toggle("hidden",profile!=="general");
  if (profile==="general") {
    const rows = ["elber","mayra","general"].map(person=>{
      const totals = calculateTotals(state,key,person);
      return `<tr><td>${NAMES[person]}</td><td>${money(totals.income)}</td><td>${money(totals.paid)}</td><td>${money(totals.pending)}</td><td>${money(totals.available)}</td><td>${money(totals.expected)}</td></tr>`;
    }).join("");
    $("comparisonTable").innerHTML = rows;
  }
}
