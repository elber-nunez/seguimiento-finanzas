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
  $("categoryChart").innerHTML = ordered.length ? `
    <div class="category-vertical-chart">
      ${ordered.map(([name,value])=>`
        <div class="category-vertical-item">
          <div class="category-vertical-values">
            <span>P ${money(value.planned)}</span>
            <span>R ${money(value.actual)}</span>
          </div>
          <div class="category-columns">
            <div class="category-column-track">
              <i class="category-column planned-category" style="height:${Math.max(value.planned?4:0,value.planned/categoryMax*100)}%"></i>
            </div>
            <div class="category-column-track">
              <i class="category-column actual-category" style="height:${Math.max(value.actual?4:0,value.actual/categoryMax*100)}%"></i>
            </div>
          </div>
          <div class="category-vertical-name" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
        </div>`).join("")}
    </div>
    <div class="category-vertical-legend">
      <span><i class="planned"></i>Previsto</span>
      <span><i class="actual"></i>Real</span>
    </div>`
    : '<div class="empty">No hay gastos registrados.</div>';

  const selectedKeys=new Set(Array.isArray(key)?key:[key]);
  const owners=profile==="general"?["elber","mayra"]:[profile];
  const periodInstallments=[];
  Object.entries(state.months||{}).forEach(([monthKey,month])=>{
    if(!selectedKeys.has(monthKey)) return;
    owners.forEach(owner=>{
      (month[owner]?.fixed||[]).forEach(item=>{
        if(item.loanId || item.sourceType==="loan-installment"){
          periodInstallments.push(item);
        }
      });
    });
  });

  const periodLoanIds=new Set(periodInstallments.map(item=>item.loanId).filter(Boolean));
  const periodPlanned=periodInstallments.reduce((sum,item)=>sum+Number(item.plannedAmount||0),0);
  const periodActual=periodInstallments.filter(item=>item.realized).reduce((sum,item)=>sum+Number(item.actualAmount||0),0);
  const periodPending=periodInstallments.filter(item=>!item.realized).reduce((sum,item)=>sum+Number(item.plannedAmount||0),0);

  $("dashboardLoanActive").textContent=String(periodLoanIds.size);
  $("dashboardLoanPending").textContent=money(periodPending);
  $("dashboardLoanMonthPlanned").textContent=money(periodPlanned);
  $("dashboardLoanMonthActual").textContent=money(periodActual);

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
