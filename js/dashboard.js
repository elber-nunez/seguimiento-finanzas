import { $, money, escapeHtml, NAMES } from "./utils.js";
import { calculateTotals, getProfileData } from "./budget.js";
import { loanMetrics } from "./loans.js";

export function renderDashboard(state,key,profile) {
  const data = calculateTotals(state,key,profile);
  const values = [
    {label:"Ingreso previsto",value:data.incomePlanned,cls:"income"},
    {label:"Ingreso real",value:data.incomeActual,cls:"income-actual"},
    {label:"Gasto previsto",value:data.expensePlanned,cls:"fixed"},
    {label:"Gasto real",value:data.expenseActual,cls:"paid"},
    {label:"Saldo previsto",value:Math.max(0,data.expected),cls:"expected"},
    {label:"Saldo real",value:Math.max(0,data.available),cls:"actual-balance"}
  ];
  const max = Math.max(...values.map(item=>item.value),1);
  $("dashboardBars").innerHTML = values.map(item=>`
    <div class="bar-chart-row"><span>${item.label}</span><div class="bar-track"><i class="bar-fill ${item.cls}" style="width:${Math.max(item.value?3:0,item.value/max*100)}%"></i></div><strong>${money(item.value)}</strong></div>
  `).join("");

  const pct = data.expensePlanned ? Math.min(100,data.expenseActual/data.expensePlanned*100) : 0;
  $("dashboardPct").textContent = `${pct.toFixed(0)}%`;
  $("dashboardDonut").style.background = `conic-gradient(var(--green) 0deg ${pct*3.6}deg,#e7edf4 ${pct*3.6}deg 360deg)`;
  $("dashboardLegend").innerHTML = `
    <div class="legend-row"><i class="legend-dot paid"></i><span>Gasto real</span><strong>${money(data.expenseActual)}</strong></div>
    <div class="legend-row"><i class="legend-dot pending"></i><span>Gasto previsto pendiente</span><strong>${money(data.pendingExpenses)}</strong></div>
    <div class="legend-row"><i class="legend-dot balance"></i><span>Saldo previsto</span><strong>${money(data.expected)}</strong></div>
    <div class="legend-row"><i class="legend-dot real-balance"></i><span>Saldo real</span><strong>${money(data.available)}</strong></div>`;

  const categories = {};
  const profileData = getProfileData(state,key,profile);
  [...profileData.fixed,...profileData.variable].forEach(item=>{
    categories[item.category] ||= {planned:0,actual:0};
    categories[item.category].planned += Number(item.plannedAmount||0);
    if(item.realized) categories[item.category].actual += Number(item.actualAmount||0);
  });

  const ordered = Object.entries(categories).sort((a,b)=>b[1].planned-a[1].planned);
  const categoryMax = ordered.length ? Math.max(...ordered.flatMap(([,v])=>[v.planned,v.actual]),1) : 1;
  $("categoryChart").innerHTML = ordered.length ? ordered.map(([name,value])=>`
    <div class="category-comparison">
      <div class="category-name">${escapeHtml(name)}</div>
      <div class="category-double-bars">
        <div class="category-track"><i class="category-fill planned-category" style="width:${Math.max(value.planned?3:0,value.planned/categoryMax*100)}%"></i></div>
        <div class="category-track"><i class="category-fill actual-category" style="width:${Math.max(value.actual?3:0,value.actual/categoryMax*100)}%"></i></div>
      </div>
      <div class="category-values"><span>P ${money(value.planned)}</span><span>R ${money(value.actual)}</span></div>
    </div>
  `).join("") : '<div class="empty">No hay gastos registrados.</div>';

  const loanData=loanMetrics(state,profile,key);
  $("dashboardLoanActive").textContent=String(loanData.active);
  $("dashboardLoanPending").textContent=money(loanData.pending);
  $("dashboardLoanMonthPlanned").textContent=money(loanData.monthPlanned);
  $("dashboardLoanMonthActual").textContent=money(loanData.monthActual);

  $("comparisonPanel").classList.toggle("hidden",profile!=="general");
  if (profile==="general") {
    $("comparisonTable").innerHTML = ["elber","mayra","general"].map(person=>{
      const totals = calculateTotals(state,key,person);
      return `<tr>
        <td>${NAMES[person]}</td>
        <td>${money(totals.incomePlanned)}</td>
        <td>${money(totals.incomeActual)}</td>
        <td>${money(totals.expensePlanned)}</td>
        <td>${money(totals.expenseActual)}</td>
        <td>${money(totals.expected)}</td>
        <td>${money(totals.available)}</td>
      </tr>`;
    }).join("");
  }
}
