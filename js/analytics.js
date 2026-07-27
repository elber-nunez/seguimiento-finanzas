import { $, money, NAMES } from "./utils.js";
import { calculateTotals, getProfileData } from "./budget.js";
import { loanMetrics } from "./loans.js";

const pct = value => `${Number.isFinite(value) ? value.toFixed(1) : "0.0"}%`;
const safeRatio = (num,den) => den > 0 ? (num/den)*100 : 0;
const clamp = (value,min,max) => Math.min(max,Math.max(min,value));

function healthMetrics(state,keys,profile) {
  const totals=calculateTotals(state,keys,profile);
  const loans=loanMetrics(state,profile,keys);

  const savings=totals.incomeActual-totals.expenseActual;
  const savingsRate=safeRatio(savings,totals.incomeActual);
  const expenseRatio=safeRatio(totals.expenseActual,totals.incomeActual);
  const incomeRealization=safeRatio(totals.incomeActual,totals.incomePlanned);
  const budgetVariance=totals.expensePlanned>0
    ? ((totals.expenseActual-totals.expensePlanned)/totals.expensePlanned)*100
    : 0;
  const fixedRatio=safeRatio(totals.fixedActual,totals.incomeActual);
  const debtRatio=safeRatio(loans.monthActual,totals.incomeActual);

  let score=50;
  score += clamp(savingsRate, -30, 30) * 0.8;
  score += expenseRatio <= 70 ? 15 : expenseRatio <= 90 ? 5 : -15;
  score += incomeRealization >= 95 ? 10 : incomeRealization >= 80 ? 5 : -5;
  score += Math.abs(budgetVariance) <= 10 ? 10 : budgetVariance <= 25 ? 3 : -8;
  score += fixedRatio <= 50 ? 8 : fixedRatio <= 70 ? 2 : -7;
  score += debtRatio <= 20 ? 7 : debtRatio <= 35 ? 1 : -8;
  score=clamp(Math.round(score),0,100);

  return {
    ...totals, loans, savings, savingsRate, expenseRatio,
    incomeRealization,budgetVariance,fixedRatio,debtRatio,score
  };
}

function statusForScore(score) {
  if(score>=80) return {label:"Salud financiera sólida",className:"excellent"};
  if(score>=65) return {label:"Salud financiera estable",className:"good"};
  if(score>=45) return {label:"Salud financiera en observación",className:"warning"};
  return {label:"Salud financiera vulnerable",className:"critical"};
}

function diagnoses(metrics) {
  const rows=[];
  if(metrics.incomeActual<=0){
    rows.push({type:"warning",text:"No hay ingresos reales suficientes para evaluar el periodo."});
    return rows;
  }
  rows.push({
    type:metrics.savingsRate>=20?"good":metrics.savingsRate>=0?"warning":"critical",
    text:metrics.savingsRate>=20
      ? `La tasa de ahorro real es ${pct(metrics.savingsRate)}, un nivel saludable.`
      : metrics.savingsRate>=0
        ? `La tasa de ahorro real es ${pct(metrics.savingsRate)}; conviene elevarla gradualmente.`
        : `Los gastos reales superan los ingresos reales en ${money(Math.abs(metrics.savings))}.`
  });
  rows.push({
    type:metrics.expenseRatio<=80?"good":metrics.expenseRatio<=100?"warning":"critical",
    text:`Los gastos consumen ${pct(metrics.expenseRatio)} de los ingresos reales.`
  });
  rows.push({
    type:metrics.debtRatio<=20?"good":metrics.debtRatio<=35?"warning":"critical",
    text:`La carga de pagos de préstamos representa ${pct(metrics.debtRatio)} de los ingresos reales.`
  });
  rows.push({
    type:Math.abs(metrics.budgetVariance)<=10?"good":"warning",
    text:metrics.budgetVariance>0
      ? `El gasto real está ${pct(Math.abs(metrics.budgetVariance))} por encima del presupuesto previsto.`
      : `El gasto real está ${pct(Math.abs(metrics.budgetVariance))} por debajo del presupuesto previsto.`
  });
  return rows;
}

export function renderAnalytics(state,keys,profile,periodKeysByMonth,periodNote) {
  const metrics=healthMetrics(state,keys,profile);
  const status=statusForScore(metrics.score);

  $("healthScore").textContent=`${metrics.score} / 100`;
  $("healthStatus").textContent=status.label;
  $("healthGauge").className=`health-gauge ${status.className}`;
  $("healthGauge").style.setProperty("--score",`${metrics.score}%`);

  $("analyticsSavingsRate").textContent=pct(metrics.savingsRate);
  $("analyticsExpenseRatio").textContent=pct(metrics.expenseRatio);
  $("analyticsIncomeRealization").textContent=pct(metrics.incomeRealization);
  $("analyticsBudgetVariance").textContent=pct(metrics.budgetVariance);
  $("analyticsFixedRatio").textContent=pct(metrics.fixedRatio);
  $("analyticsDebtRatio").textContent=pct(metrics.debtRatio);
  $("analyticsPeriodNote").textContent=periodNote;

  $("analyticsDiagnosis").innerHTML=diagnoses(metrics).map(row=>
    `<div class="diagnosis-item ${row.type}"><i></i><span>${row.text}</span></div>`
  ).join("");

  const monthly=periodKeysByMonth.map(({key,label})=>{
    const totals=calculateTotals(state,key,profile);
    return {label, income:totals.incomeActual, expense:totals.expenseActual, balance:totals.available};
  });
  const max=Math.max(1,...monthly.flatMap(row=>[row.income,row.expense,Math.max(0,row.balance)]));
  $("analyticsMonthlyTrend").innerHTML=monthly.map(row=>`
    <div class="trend-row">
      <span>${row.label}</span>
      <div class="trend-bars">
        <i class="trend-income" style="width:${Math.max(row.income?2:0,row.income/max*100)}%"></i>
        <i class="trend-expense" style="width:${Math.max(row.expense?2:0,row.expense/max*100)}%"></i>
      </div>
      <small>${money(row.balance)}</small>
    </div>`
  ).join("");

  $("analyticsComparisonPanel").classList.toggle("hidden",profile!=="general");
  if(profile==="general"){
    $("analyticsComparisonTable").innerHTML=["elber","mayra","general"].map(person=>{
      const row=healthMetrics(state,keys,person);
      return `<tr>
        <td>${NAMES[person]}</td>
        <td>${money(row.incomeActual)}</td>
        <td>${money(row.expenseActual)}</td>
        <td>${money(row.savings)}</td>
        <td>${pct(row.savingsRate)}</td>
        <td>${pct(row.debtRatio)}</td>
        <td>${row.score}/100</td>
      </tr>`;
    }).join("");
  }
}
