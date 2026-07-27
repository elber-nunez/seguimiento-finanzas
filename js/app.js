import { $, MONTHS, NAMES, money, escapeHtml, today, uid, formatDate } from "./utils.js";
import { loginWithGoogle, observeSession, logout } from "./auth.js";
import { observeFinanceData, saveFinanceData } from "./firestore.js";
import { createEmptyState, normalizeState, ensureMonth, getProfileData, calculateTotals, getHistory, previousMonthKey, syncCarryoverForMonth, suppressCarryover, markCarryoverManual } from "./budget.js";
import { initNavigation, showView } from "./navigation.js";
import { renderDashboard } from "./dashboard.js";
import { initHistoryFilters, renderHistory, renderHistoryCategoryOptions } from "./history.js";
import { createLoan, createActiveLoan, updateLoanMetadata, payoffLoan, deleteLoan, loanMetrics, loanRecords, applyFlexiblePayment, flexiblePrincipalOutstanding, effectiveLoanTotal, flexibleRemainingMonths, fixedOutstanding } from "./loans.js";
import { SCHOOL_ROWS, createSchoolPension, updateSchoolPension, deleteSchoolPension, pensionRecords, schoolPensionsForYear, schoolMetrics } from "./school-pensions.js";
import { renderAnalytics } from "./analytics.js";

let currentUser = null;
let currentUserProfile = null;
let state = createEmptyState();
let stopFinanceObserver = null;
let selectedProfile = "general";
let selectedMonths = new Set();
let saving = false;
let saveQueued = false;
let undoSnapshot = null;
let undoTimer = null;
let syncingCarryover = false;

function allowedMonthIndexes(year=Number($("yearPicker").value)) {
  // En 2026 la analítica y los resúmenes comienzan en agosto.
  return year===2026
    ? [7,8,9,10,11]
    : Array.from({length:12},(_,index)=>index);
}

function sortedSelectedMonths() {
  return [...selectedMonths].sort((a,b)=>a-b);
}

function primaryMonthIndex() {
  const selected=sortedSelectedMonths();
  return selected.length ? selected[0] : allowedMonthIndexes()[0];
}

function currentKey() {
  const month=primaryMonthIndex();
  $("monthPicker").value=String(month);
  return `${$("yearPicker").value}-${String(month+1).padStart(2,"0")}`;
}

function selectedPeriodKeys() {
  const year=Number($("yearPicker").value);
  return sortedSelectedMonths().map(month=>
    `${year}-${String(month+1).padStart(2,"0")}`
  );
}

function periodRows() {
  return sortedSelectedMonths().map(month=>({
    key:`${$("yearPicker").value}-${String(month+1).padStart(2,"0")}`,
    label:MONTHS[month].slice(0,3)
  }));
}

function periodNote() {
  const months=sortedSelectedMonths();
  const year=Number($("yearPicker").value);
  if(months.length===1) return `${MONTHS[months[0]]} ${year}`;
  if(months.length===allowedMonthIndexes(year).length){
    return year===2026
      ? "Todos: agosto a diciembre de 2026. Enero a julio se excluyen de la analítica."
      : `Todos: enero a diciembre de ${year}.`;
  }
  return `${months.map(month=>MONTHS[month]).join(", ")} · ${year}`;
}

function updateMonthFilterLabel() {
  const months=sortedSelectedMonths();
  const allowed=allowedMonthIndexes();
  let label="Seleccionar meses";
  if(months.length===1) label=MONTHS[months[0]];
  else if(months.length===allowed.length) label="Todos";
  else if(months.length>1) label=`${MONTHS[months[0]]} +${months.length-1}`;
  $("monthFilterLabel").textContent=label;
  $("selectAllMonths").checked=months.length===allowed.length;
  $("selectAllMonths").indeterminate=months.length>0 && months.length<allowed.length;
}

function renderMonthCheckboxes(resetInvalid=false) {
  const year=Number($("yearPicker").value);
  const allowed=allowedMonthIndexes(year);

  if(resetInvalid){
    selectedMonths=new Set([...selectedMonths].filter(month=>allowed.includes(month)));
  }
  if(!selectedMonths.size){
    const now=new Date();
    const preferred=year===now.getFullYear() && allowed.includes(now.getMonth())
      ? now.getMonth()
      : allowed[0];
    selectedMonths.add(preferred);
  }

  $("monthCheckboxList").innerHTML=MONTHS.map((month,index)=>{
    const enabled=allowed.includes(index);
    return `<label class="month-check ${enabled?"":"disabled"}">
      <input type="checkbox" value="${index}" ${selectedMonths.has(index)?"checked":""} ${enabled?"":"disabled"}>
      <span>${month}</span>
      ${!enabled && year===2026 ? '<small>Fuera del periodo</small>' : ""}
    </label>`;
  }).join("");

  $("monthCheckboxList").querySelectorAll("input:not(:disabled)").forEach(check=>{
    check.addEventListener("change",()=>{
      const month=Number(check.value);
      if(check.checked) selectedMonths.add(month);
      else selectedMonths.delete(month);

      if(!selectedMonths.size){
        selectedMonths.add(month);
        check.checked=true;
      }
      updateMonthFilterLabel();
      renderAll();
    });
  });
  updateMonthFilterLabel();
}

function toggleAllMonths(checked) {
  const allowed=allowedMonthIndexes();
  selectedMonths=checked ? new Set(allowed) : new Set([allowed[0]]);
  renderMonthCheckboxes();
  renderAll();
}

function initPeriodPickers() {
  const now = new Date();
  $("monthPicker").innerHTML = MONTHS.map((month,index)=>`<option value="${index}">${month}</option>`).join("");

  const years=[];
  for(let year=now.getFullYear()-3;year<=now.getFullYear()+3;year++) years.push(`<option value="${year}">${year}</option>`);
  $("yearPicker").innerHTML=years.join("");
  $("yearPicker").value=now.getFullYear();

  const initialAllowed=allowedMonthIndexes(now.getFullYear());
  selectedMonths.add(initialAllowed.includes(now.getMonth()) ? now.getMonth() : initialAllowed[0]);
  renderMonthCheckboxes();

  $("yearPicker").addEventListener("change",()=>{
    renderMonthCheckboxes(true);
    renderAll();
  });

  $("monthFilterButton").addEventListener("click",event=>{
    event.stopPropagation();
    const popover=$("monthFilterPopover");
    popover.classList.toggle("hidden");
    $("monthFilterButton").setAttribute("aria-expanded",String(!popover.classList.contains("hidden")));
  });
  $("monthFilterPopover").addEventListener("click",event=>event.stopPropagation());
  document.addEventListener("click",()=>{
    $("monthFilterPopover").classList.add("hidden");
    $("monthFilterButton").setAttribute("aria-expanded","false");
  });
  $("selectAllMonths").addEventListener("change",event=>toggleAllMonths(event.target.checked));
}


function setSyncStatus(status,text) {
  const node=$("syncStatus");
  node.className=`sync-pill ${status}`;
  node.innerHTML=`<i></i><b>${text}</b>`;
}

function cloneState(value=state) {
  return JSON.parse(JSON.stringify(value));
}

function prepareUndo(message) {
  undoSnapshot=cloneState();
  clearTimeout(undoTimer);
  $("undoMessage").textContent=message;
  $("undoToast").classList.remove("hidden");
  undoTimer=setTimeout(dismissUndo,8000);
}

function dismissUndo() {
  clearTimeout(undoTimer);
  undoSnapshot=null;
  $("undoToast").classList.add("hidden");
}

async function undoLastChange() {
  if(!undoSnapshot) return;
  state=normalizeState(undoSnapshot);
  dismissUndo();
  renderAll();
  await persist();
}

function isMonthClosed(key=currentKey()) {
  return Boolean(state.monthClosures?.[key]?.closed);
}

function closedMonthMessage(key=currentKey()) {
  const [year,month]=key.split("-").map(Number);
  return `${MONTHS[month-1]} ${year} está cerrado. Reabre el mes para modificarlo.`;
}

function assertMonthOpen(key=currentKey()) {
  if(!isMonthClosed(key)) return true;
  alert(closedMonthMessage(key));
  return false;
}

function findRecordLocation(kind,id,owner=null) {
  const property=kind==="income"?"incomes":kind;
  for(const [key,month] of Object.entries(state.months||{})){
    for(const person of owner ? [owner] : ["elber","mayra"]){
      const collection=month?.[person]?.[property]||[];
      const item=collection.find(row=>row.id===id);
      if(item) return {key,owner:person,property,item,collection};
    }
  }
  return null;
}

function updateMonthCloseButton() {
  const button=$("monthCloseBtn");
  const months=sortedSelectedMonths();
  if(months.length!==1){
    button.disabled=true;
    button.textContent="Selecciona un mes";
    button.classList.remove("reopen");
    return;
  }
  button.disabled=false;
  const closed=isMonthClosed(currentKey());
  button.textContent=closed?"Reabrir mes":"Cerrar mes";
  button.classList.toggle("reopen",closed);
}

async function toggleMonthClosure() {
  if(sortedSelectedMonths().length!==1) return alert("Selecciona un solo mes para cerrarlo o reabrirlo.");
  const key=currentKey();
  state.monthClosures ||= {};

  if(isMonthClosed(key)){
    if(!confirm(`¿Reabrir ${periodNote()} para permitir modificaciones?`)) return;
    prepareUndo("Mes reabierto");
    delete state.monthClosures[key];
    renderAll();
    await persist();
    return;
  }

  if(!confirm(`¿Cerrar ${periodNote()}? El mes quedará bloqueado y el saldo final se usará para el siguiente mes.`)) return;
  prepareUndo("Mes cerrado");
  state.monthClosures[key]={
    closed:true,
    closedAt:new Date().toISOString(),
    closedBy:currentUser?.email||"",
    snapshot:{
      elber:calculateTotals(state,key,"elber"),
      mayra:calculateTotals(state,key,"mayra"),
      general:calculateTotals(state,key,"general")
    }
  };
  renderAll();
  await persist();
}

async function persist() {
  if (!currentUser) return;

  if (saving) {
    saveQueued = true;
    setSyncStatus("pending","Cambios pendientes…");
    return;
  }

  saving = true;
  try {
    do {
      saveQueued = false;
      setSyncStatus("saving","Guardando…");

      // Guardamos una copia estable. Si el usuario marca otro check
      // mientras se guarda, saveQueued obliga a una nueva escritura.
      const stateSnapshot = JSON.parse(JSON.stringify(state));
      await saveFinanceData(stateSnapshot,currentUser.email);
    } while (saveQueued);

    setSyncStatus("synced","Sincronizado");
  } catch(error) {
    console.error(error);
    setSyncStatus("error","Error al guardar");
    alert("No se pudo guardar en Firestore. Revisa las reglas de seguridad.");
  } finally {
    saving = false;
  }
}

function selectedOwner() {
  return selectedProfile==="general" ? currentUserProfile : selectedProfile;
}

function syncSelectedMonthCarryovers() {
  const key=currentKey();
  let changed=false;

  ["elber","mayra"].forEach(owner=>{
    if(syncCarryoverForMonth(state,key,owner,new Date())) changed=true;
  });

  if(changed && currentUser && !syncingCarryover){
    syncingCarryover=true;
    persist().finally(()=>{ syncingCarryover=false; });
  }
}

function renderAll() {
  ensureMonth(state,currentKey());
  syncSelectedMonthCarryovers();
  selectedProfile = $("profileSelect").value;
  state.ui.selectedProfile = selectedProfile;
  updateMonthCloseButton();
  renderHome();
  renderIncome();
  renderFixed();
  renderVariable();
  renderSummary();
  const analysisKeys=selectedPeriodKeys();
  $("dashboardPeriodNote").textContent=periodNote();
  renderDashboard(state,analysisKeys,selectedProfile);

  renderAnalytics(
    state,
    analysisKeys,
    selectedProfile,
    periodRows(),
    periodNote()
  );

  renderLoans();
  renderSchoolPensions();
  renderCategoryEditors();
  renderHistoryCategoryOptions(state);
  renderHistory(state,currentKey(),selectedProfile);
}

function renderHome() {
  const totals = calculateTotals(state,currentKey(),selectedProfile);
  $("homeAvailable").textContent = money(totals.available);
  $("homeIncomePlanned").textContent = money(totals.incomePlanned);
  $("homeIncomeActual").textContent = money(totals.incomeActual);
  $("homeExpensePlanned").textContent = money(totals.expensePlanned);
  $("homeExpenseActual").textContent = money(totals.expenseActual);
  $("homeExpected").textContent = money(totals.expected);
  $("homeVariance").textContent = money(totals.variance);
  $("homeVariance").className = totals.variance >= 0 ? "positive-value" : "negative-value";

  const data = getProfileData(state,currentKey(),selectedProfile);
  const pending = [...data.fixed,...data.variable].filter(item=>!item.realized).slice(0,5);
  $("homePendingList").innerHTML = pending.length
    ? pending.map(item=>itemRow({...item,kind:data.fixed.includes(item)?"fixed":"variable"},"expense",false)).join("")
    : '<div class="empty">No hay gastos pendientes.</div>';

  const recent = getHistory(state,currentKey(),selectedProfile).slice(0,5);
  $("homeRecentList").innerHTML = recent.length
    ? recent.map(item=>itemRow(item,item.type,false)).join("")
    : '<div class="empty">No hay movimientos realizados.</div>';
}

function itemRow(item,type,editable=true,withCheck=false) {
  const editAttrs = editable && !item.locked ? `data-edit-id="${item.id}" data-kind="${item.kind || type}" data-owner="${item.owner}"` : "";
  const check = withCheck
    ? `<input type="checkbox" data-realize-id="${item.id}" data-kind="${item.kind || type}" data-owner="${item.owner}" ${item.realized?"checked":""} ${item.locked?"disabled":""}>`
    : "";
  return `<article class="${withCheck?"check-row":"item-row"} ${item.realized?"paid":""}">
    ${check}
    <div class="item-content" ${editAttrs}>
      <div class="item-title">${escapeHtml(item.concept)} ${item.owner!=="general"?`<span class="owner-tag">${NAMES[item.owner]}</span>`:""} <span class="status-tag ${item.sourceType==="carryover"?"carryover":item.realized?"real":"planned"}">${item.sourceType==="carryover"?"Saldo anterior":item.realized?"Real":"Previsto"}</span></div>
      <div class="item-meta">${escapeHtml(item.category || "Ingreso")} · ${item.sourceType==="carryover"?"Generado automáticamente":formatDate(item.date)}</div>
    </div>
    <div class="amount-comparison">
      <small>Prev. ${money(item.plannedAmount)}</small>
      <strong class="${type==="income"?"income-color":"expense-color"}">${item.realized?`Real ${money(item.actualAmount)}`:"Pendiente"}</strong>
    </div>
  </article>`;
}

function renderIncome() {
  const data = getProfileData(state,currentKey(),selectedProfile);
  const locked=isMonthClosed(currentKey());
  data.incomes.forEach(item=>item.locked=locked);
  const totals = calculateTotals(state,currentKey(),selectedProfile);
  $("incomePlannedTotal").textContent = money(totals.incomePlanned);
  $("incomeActualTotal").textContent = money(totals.incomeActual);
  $("incomeList").innerHTML = data.incomes.length
    ? data.incomes.map(item=>itemRow({...item,kind:"income"},"income",true,item.sourceType!=="carryover")).join("")
    : '<div class="empty">No hay ingresos registrados.</div>';
  bindRealizeChecks($("incomeList"));
  bindEditRows($("incomeList"));
}

function renderFixed() {
  const data = getProfileData(state,currentKey(),selectedProfile);
  const locked=isMonthClosed(currentKey());
  data.fixed.forEach(item=>item.locked=locked);
  const currentFilter=$("fixedCategoryFilter").value || "all";
  const categories=[...new Set(data.fixed.map(item=>item.category).filter(Boolean))].sort((x,y)=>x.localeCompare(y,"es"));
  $("fixedCategoryFilter").innerHTML='<option value="all">Todas las categorías</option>'+categories.map(category=>`<option>${escapeHtml(category)}</option>`).join("");
  $("fixedCategoryFilter").value=categories.includes(currentFilter)?currentFilter:"all";

  const filtered=$("fixedCategoryFilter").value==="all"
    ? data.fixed
    : data.fixed.filter(item=>item.category===$("fixedCategoryFilter").value);

  const filteredPlanned=filtered.reduce((sum,item)=>sum+Number(item.plannedAmount||0),0);
  const filteredActual=filtered.filter(item=>item.realized).reduce((sum,item)=>sum+Number(item.actualAmount||0),0);
  const filteredPending=filtered.filter(item=>!item.realized).reduce((sum,item)=>sum+Number(item.plannedAmount||0),0);
  $("fixedPlanned").textContent=money(filteredPlanned);
  $("fixedPaid").textContent=money(filteredActual);
  $("fixedPending").textContent=money(filteredPending);

  $("fixedList").innerHTML = filtered.length
    ? filtered.map(item=>itemRow({...item,kind:"fixed"},"expense",true,true)).join("")
    : '<div class="empty">No hay gastos fijos para esta categoría.</div>';
  bindRealizeChecks($("fixedList"));
  bindEditRows($("fixedList"));
}

function renderVariable() {
  const data = getProfileData(state,currentKey(),selectedProfile);
  const locked=isMonthClosed(currentKey());
  data.variable.forEach(item=>item.locked=locked);
  const totals = calculateTotals(state,currentKey(),selectedProfile);
  $("variablePlannedTotal").textContent = money(totals.variablePlanned);
  $("variableActualTotal").textContent = money(totals.variableActual);
  $("variableList").innerHTML = data.variable.length
    ? data.variable.map(item=>itemRow({...item,kind:"variable"},"expense",true,true)).join("")
    : '<div class="empty">No hay gastos variables registrados.</div>';
  bindRealizeChecks($("variableList"));
  bindEditRows($("variableList"));
}

function renderSummary() {
  const totals = calculateTotals(state,selectedPeriodKeys(),selectedProfile);
  $("summaryPeriodNote").textContent=periodNote();

  $("summaryIncomePlanned").textContent=money(totals.incomePlanned);
  $("summaryIncomeActual").textContent=money(totals.incomeActual);
  $("summaryExpensePlanned").textContent=money(totals.expensePlanned);
  $("summaryExpenseActual").textContent=money(totals.expenseActual);
  $("summaryPending").textContent=money(totals.pendingExpenses);
  $("summaryAvailable").textContent=money(totals.available);
  $("summaryExpected").textContent=money(totals.expected);

  const afterPending=totals.available-totals.pendingExpenses;
  $("summaryAfterPending").textContent=money(afterPending);

  const incomePct=totals.incomePlanned>0
    ? Math.min(100,Math.max(0,(totals.incomeActual/totals.incomePlanned)*100))
    : (totals.incomeActual>0 ? 100 : 0);
  const expensePct=totals.expensePlanned>0
    ? Math.min(100,Math.max(0,(totals.expenseActual/totals.expensePlanned)*100))
    : 0;

  $("summaryIncomePct").textContent=`${incomePct.toFixed(0)}%`;
  $("summaryIncomeProgress").value=incomePct;
  $("summaryExpensePct").textContent=`${expensePct.toFixed(0)}%`;
  $("summaryExpenseProgress").value=expensePct;

  $("summaryVariance").textContent=money(totals.variance);
  $("summaryVarianceText").textContent=`Diferencia frente al plan: ${totals.variance>=0?"+":""}${money(totals.variance)}`;

  const badge=$("summaryHealthBadge");
  const message=$("summaryMessage");
  badge.className="summary-health-badge";

  if(totals.incomeActual===0 && totals.expenseActual===0){
    badge.textContent="Sin movimientos";
    badge.classList.add("neutral");
    message.textContent="Todavía no hay ingresos ni pagos reales registrados.";
  }else if(afterPending<0){
    badge.textContent="Saldo insuficiente";
    badge.classList.add("danger");
    message.textContent=`Faltarían ${money(Math.abs(afterPending))} para cubrir todos los gastos pendientes.`;
  }else if(totals.pendingExpenses>0){
    badge.textContent="Con compromisos";
    badge.classList.add("warning");
    message.textContent=`Después de pagar todo lo pendiente quedarían ${money(afterPending)} disponibles.`;
  }else{
    badge.textContent="Al día";
    badge.classList.add("good");
    message.textContent=`Todos los gastos registrados están pagados y quedan ${money(totals.available)} disponibles.`;
  }

  const valueMap={
    summaryAvailable:totals.available,
    summaryAfterPending:afterPending,
    summaryExpected:totals.expected
  };
  Object.entries(valueMap).forEach(([id,value])=>{
    $(id).classList.toggle("negative-value",value<0);
  });
}

async function updateRealized(kind,id,owner,realized,checkElement) {
  const location=findRecordLocation(kind,id,owner);
  if(!location) return;
  if(!assertMonthOpen(location.key)){
    checkElement.checked=!realized;
    return;
  }
  prepareUndo(realized ? "Pago registrado" : "Pago vuelto a pendiente");
  const item=location.item;

  if(realized){
    const entered=prompt("Ingresa el monto real. Puedes dejar el monto previsto si fue igual:",String(item.plannedAmount));
    if(entered===null){
      dismissUndo();
      checkElement.checked=false;
      return;
    }
    const actual=Number(String(entered).replace(",","."));
    if(!Number.isFinite(actual)||actual<0){
      dismissUndo();
      alert("Ingresa un monto real válido.");
      checkElement.checked=false;
      return;
    }
    if(item.sourceType==="loan-installment" && item.loanType==="flexible"){
      applyFlexiblePayment(state,item.loanId,item,actual);
    }else{
      item.realized=true;
      item.actualAmount=actual;
      item.date=today();
    }
  }else{
    if(!confirm("¿Volver a dejar este registro como previsto y pendiente?")){
      dismissUndo();
      checkElement.checked=true;
      return;
    }
    item.realized=false;
    item.actualAmount=0;
    if(item.loanType==="flexible"){
      item.actualInterest=0;
      item.actualPrincipal=0;
      const loan=(state.loans||[]).find(row=>row.id===item.loanId);
      if(loan) loan.status="active";
    }
  }
  renderAll();
  await persist();
}

function bindRealizeChecks(container) {
  container.querySelectorAll("[data-realize-id]").forEach(check=>{
    check.addEventListener("change",()=>updateRealized(
      check.dataset.kind,
      check.dataset.realizeId,
      check.dataset.owner,
      check.checked,
      check
    ));
  });
}

function bindEditRows(container) {
  container.querySelectorAll("[data-edit-id]").forEach(row=>row.addEventListener("click",()=>openRecordModal(row.dataset.kind,row.dataset.editId,row.dataset.owner)));
}

function openRecordModal(kind,id=null,owner=null) {
  const location=id ? findRecordLocation(kind,id,owner) : null;
  const targetKey=location?.key || currentKey();
  if(!assertMonthOpen(targetKey)) return;
  $("recordForm").reset();
  $("recordId").value=id||"";$("recordKind").value=kind;$("recordOwner").value=owner||selectedOwner();$("recordDate").value=today();
  const categoryType = kind==="income" ? "income" : "expense";
  const categories = state.settings.categories[categoryType];
  $("recordCategory").innerHTML=categories.map(category=>`<option>${escapeHtml(category)}</option>`).join("");
  $("categoryField").classList.remove("hidden");
  $("paidField").classList.remove("hidden");
  $("actualAmountField").classList.remove("hidden");
  $("recordActualAmount").required=false;
  $("recordActualAmount").value="0";
  $("recordActualAmount").dataset.edited="false";
  $("plannedAmountLabel").textContent=kind==="income" ? "Monto previsto (opcional)" : "Monto previsto";
  $("recordPlannedAmount").required=kind!=="income";
  $("recordAmountHelp").textContent=kind==="income"
    ? "En ingresos, el monto previsto es opcional. El monto real puede quedar en 0 si todavía no se recibió."
    : "En gastos, el monto previsto es obligatorio. El monto real puede quedar en 0 si todavía no se pagó.";

  $("modalTitle").textContent = id ? "Editar registro" : kind==="income" ? "Agregar ingreso" : kind==="fixed" ? "Agregar gasto fijo" : "Agregar gasto variable";
  $("deleteRecordBtn").classList.toggle("hidden",!id);

  if(id){
    const item = location?.item;
    if(item){
      $("recordConcept").value=item.concept;
      $("recordPlannedAmount").value=item.plannedAmount;
      $("recordActualAmount").value=Number(item.actualAmount || 0);
      $("recordDate").value=item.date;
      $("recordCategory").value=item.category || (kind==="income" ? state.settings.categories.income[0] : state.settings.categories.expense[0]);
      $("recordRealized").checked=item.realized;
      toggleActualAmountField();
    }
  }
  $("formModal").classList.add("open");
}

function toggleActualAmountField() {
  const actual=Number($("recordActualAmount").value||0);
  $("recordRealized").checked=actual>0;
}

function closeModal(){ $("formModal").classList.remove("open"); }

async function saveRecord(event) {
  event.preventDefault();
  if(!assertMonthOpen()) return;
  prepareUndo($("recordId").value ? "Registro actualizado" : "Registro agregado");
  const id=$("recordId").value||uid(), kind=$("recordKind").value, owner=$("recordOwner").value;
  const month=ensureMonth(state,currentKey());
  const property=kind==="income"?"incomes":kind;
  ["elber","mayra"].forEach(person=>month[person][property]=month[person][property].filter(item=>item.id!==id));
  const plannedRaw=$("recordPlannedAmount").value.trim();
  const actualAmount=Number($("recordActualAmount").value||0);

  if(kind!=="income" && plannedRaw===""){
    alert("El monto previsto es obligatorio para los gastos.");
    $("recordPlannedAmount").focus();
    return;
  }

  const plannedAmount=plannedRaw==="" ? 0 : Number(plannedRaw);
  if(!Number.isFinite(plannedAmount) || plannedAmount<0){
    alert("Ingresa un monto previsto válido.");
    return;
  }
  if(!Number.isFinite(actualAmount) || actualAmount<0){
    alert("Ingresa un monto real válido.");
    return;
  }

  const realized=actualAmount>0 || $("recordRealized").checked;
  const existingLocation=findRecordLocation(kind,id);
  if(existingLocation?.item?.sourceType==="carryover"){
    markCarryoverManual(state,existingLocation.key,existingLocation.owner);
  }
  const preservedMetadata=existingLocation?.item
    ? Object.fromEntries(Object.entries(existingLocation.item).filter(([key])=>![
        "id","owner","concept","category","plannedAmount","actualAmount","realized","date","periodKey","locked"
      ].includes(key)))
    : {};

  const item={
    ...preservedMetadata,
    id,owner,
    concept:$("recordConcept").value.trim(),
    category:$("recordCategory").value,
    plannedAmount,
    actualAmount,
    realized,
    date:$("recordDate").value
  };
  month[owner][property].push(item);
  closeModal();renderAll();await persist();
}

async function deleteRecord() {
  const id=$("recordId").value, kind=$("recordKind").value;
  const location=findRecordLocation(kind,id);
  if(!id || !location || !confirm("¿Eliminar este registro?")) return;
  if(!assertMonthOpen(location.key)) return;
  prepareUndo("Registro eliminado");
  if(location.item.sourceType==="carryover"){
    suppressCarryover(state,location.key,location.owner);
  }
  location.collection.splice(location.collection.findIndex(item=>item.id===id),1);
  closeModal();
  renderAll();
  await persist();
}

function duplicateKey(item) {
  return `${item.owner}|${(item.concept||"").trim().toLowerCase()}|${(item.category||"").trim().toLowerCase()}`;
}

function selectedConfigurationUser() {
  if(selectedProfile==="general"){
    alert("Selecciona Elber o Mayra para copiar o restablecer información del mes.");
    return null;
  }
  return selectedProfile;
}

function isLoanRelatedRecord(item) {
  const source=String(item.sourceType||"").toLowerCase();
  const category=String(item.category||"").trim().toLowerCase();
  const concept=String(item.concept||"").trim();

  return Boolean(
    item.loanId ||
    item.registeredActiveLoan ||
    source==="loan-income" ||
    source==="loan-installment" ||
    source.startsWith("loan-") ||
    category==="préstamo" ||
    category==="prestamo" ||
    /(?:cuota|pago)\s+\d+\s+de\s+\d+/i.test(concept)
  );
}

async function copyPreviousIncomes() {
  const person=selectedConfigurationUser();
  if(!person) return;
  if(!assertMonthOpen()) return;

  const destination=currentKey();
  const source=previousMonthKey(destination);
  if(!state.months[source]) return alert("El mes anterior no tiene información registrada.");

  prepareUndo(`Ingresos de ${NAMES[person]} copiados`);
  const target=ensureMonth(state,destination);
  const existing=new Set(target[person].incomes.map(duplicateKey));
  let copied=0, skipped=0;

  state.months[source][person].incomes
    .filter(item=>!isLoanRelatedRecord(item) && item.sourceType!=="carryover")
    .forEach(item=>{
      const candidate={
        ...item,
        id:uid(),
        owner:person,
        date:today(),
        realized:false,
        actualAmount:0
      };
      const key=duplicateKey(candidate);
      if(existing.has(key)){
        skipped++;
        return;
      }
      target[person].incomes.push(candidate);
      existing.add(key);
      copied++;
    });

  renderAll();
  if(copied) await persist();
  alert(`Ingresos de ${NAMES[person]} copiados: ${copied}. Duplicados omitidos: ${skipped}. Los ingresos de préstamos no se copiaron.`);
}

function isGeneratedFixedExpense(item) {
  const source=String(item.sourceType||"").toLowerCase();
  const category=String(item.category||"").trim().toLowerCase();
  const concept=String(item.concept||"").trim();

  return Boolean(
    item.loanId ||
    item.schoolPensionId ||
    item.registeredActiveLoan ||
    source==="loan-installment" ||
    source==="school-pension" ||
    source.startsWith("loan-") ||
    source.startsWith("school-") ||
    category==="préstamo" ||
    category==="prestamo" ||
    category==="pensión escolar" ||
    category==="pension escolar" ||
    /(?:cuota|pago)\s+\d+\s+de\s+\d+/i.test(concept)
  );
}

async function copyPreviousFixed() {
  const person=selectedConfigurationUser();
  if(!person) return;
  if(!assertMonthOpen()) return;

  const destination=currentKey();
  const source=previousMonthKey(destination);
  if(!state.months[source]) return alert("El mes anterior no tiene información registrada.");

  prepareUndo(`Gastos fijos de ${NAMES[person]} copiados`);
  const target=ensureMonth(state,destination);
  const existing=new Set(target[person].fixed.map(duplicateKey));
  let copied=0, skipped=0;

  state.months[source][person].fixed
    .filter(item=>!isGeneratedFixedExpense(item))
    .forEach(item=>{
      const candidate={
        ...item,
        id:uid(),
        owner:person,
        realized:false,
        actualAmount:0,
        date:today()
      };
      const key=duplicateKey(candidate);
      if(existing.has(key)){
        skipped++;
        return;
      }
      target[person].fixed.push(candidate);
      existing.add(key);
      copied++;
    });

  renderAll();
  if(copied) await persist();
  alert(`Gastos fijos manuales de ${NAMES[person]} copiados: ${copied}. Duplicados omitidos: ${skipped}. Los préstamos y pensiones automáticos no se copiaron.`);
}

function normalizeCategoryName(value) {
  return value.trim().replace(/\s+/g," ");
}

async function addCategory(type,inputId) {
  const input=$(inputId);
  const value=normalizeCategoryName(input.value);
  if(!value) return;
  const categories=state.settings.categories[type];
  if(categories.some(category=>category.toLowerCase()===value.toLowerCase())){
    return alert("Esa categoría ya existe.");
  }
  categories.push(value);
  categories.sort((a,b)=>a.localeCompare(b,"es"));
  input.value="";
  renderAll();
  await persist();
}

async function deleteCategory(type,category) {
  const categories=state.settings.categories[type];
  if(categories.length<=1) return alert("Debe quedar al menos una categoría.");
  const inUse=Object.values(state.months).some(month=>
    ["elber","mayra"].some(person=>{
      const records=type==="income"
        ? month[person].incomes
        : [...month[person].fixed,...month[person].variable];
      return records.some(item=>item.category===category);
    })
  );
  const message=inUse
    ? `La categoría "${category}" ya está usada en registros. Se quitará de las opciones nuevas, pero los registros anteriores conservarán el nombre. ¿Continuar?`
    : `¿Eliminar la categoría "${category}"?`;
  if(!confirm(message)) return;
  state.settings.categories[type]=categories.filter(item=>item!==category);
  renderAll();
  await persist();
}

function renderCategoryEditors() {
  const renderList=(type,id)=>{
    const categories=state.settings.categories[type];
    $(id).innerHTML=categories.map(category=>`
      <div class="editable-category">
        <span>${escapeHtml(category)}</span>
        <button type="button" data-delete-category="${escapeHtml(category)}" data-category-type="${type}" aria-label="Eliminar categoría">×</button>
      </div>`).join("");
  };
  renderList("income","incomeCategoryList");
  renderList("expense","expenseCategoryList");
  document.querySelectorAll("[data-delete-category]").forEach(button=>{
    button.addEventListener("click",()=>deleteCategory(button.dataset.categoryType,button.dataset.deleteCategory));
  });
}

async function resetMonth() {
  const person=selectedConfigurationUser();
  if(!person) return;
  if(!assertMonthOpen()) return;

  const key=currentKey();
  const month=ensureMonth(state,key);
  const loanIncomes=month[person].incomes.filter(isLoanRelatedRecord);
  const loanFixed=month[person].fixed.filter(isLoanRelatedRecord);

  const message=[
    `¿Restablecer ${periodNote()} únicamente para ${NAMES[person]}?`,
    "",
    "Se eliminarán sus ingresos, gastos fijos y gastos variables del mes.",
    "Las cuotas e ingresos vinculados a préstamos se conservarán."
  ].join("\n");

  if(!confirm(message)) return;

  prepareUndo(`Mes de ${NAMES[person]} restablecido`);
  month[person]={
    incomes:loanIncomes,
    fixed:loanFixed,
    variable:[]
  };

  renderAll();
  await persist();
}



function schoolSelectedYear() {
  return Number($("schoolYearFilter").value || $("yearPicker").value);
}

function renderSchoolYearOptions() {
  const current=String($("schoolYearFilter").value || $("yearPicker").value);
  const years=[...new Set([
    ...Object.keys(state.months||{}).map(key=>Number(key.slice(0,4))),
    ...(state.schoolPensions||[]).map(item=>Number(item.year)),
    Number($("yearPicker").value)
  ])].filter(Boolean).sort((a,b)=>b-a);
  $("schoolYearFilter").innerHTML=years.map(year=>`<option value="${year}">${year}</option>`).join("");
  $("schoolYearFilter").value=years.includes(Number(current))?current:String(years[0]||new Date().getFullYear());
}

function renderSchoolPensions() {
  renderSchoolYearOptions();
  const year=schoolSelectedYear();
  const metrics=schoolMetrics(state,year,selectedProfile);
  $("schoolStudentCount").textContent=String(metrics.pensions.length);
  $("schoolPlannedTotal").textContent=money(metrics.planned);
  $("schoolActualTotal").textContent=money(metrics.actual);
  $("schoolPendingTotal").textContent=money(metrics.pending);

  const pensions=metrics.pensions;
  $("schoolMatrixHead").innerHTML=`
    <tr>
      <th>Mensualidad</th>
      ${pensions.map(pension=>`<th colspan="2">${escapeHtml(pension.studentName)}</th>`).join("")}
    </tr>
    <tr>
      <th></th>
      ${pensions.map(()=>"<th>Monto</th><th>Pago</th>").join("")}
    </tr>`;

  $("schoolMatrixBody").innerHTML=SCHOOL_ROWS.map(row=>`
    <tr>
      <td>${row.label}</td>
      ${pensions.map(pension=>{
        const record=pensionRecords(state,pension.id).find(({item})=>item.schoolRowKey===row.key);
        if(!record) return "<td>—</td><td>—</td>";
        const locked=isMonthClosed(record.periodKey);
        return `<td class="school-amount-cell ${locked?"locked":""}" ${locked?"":`data-school-edit="${record.item.id}" data-owner="${record.owner}"`}>${money(record.item.plannedAmount)}</td>
          <td><input type="checkbox" data-school-check="${record.item.id}" data-owner="${record.owner}" ${record.item.realized?"checked":""} ${locked?"disabled":""}></td>`;
      }).join("")}
    </tr>`).join("");

  $("schoolMatrixFoot").innerHTML=`
    <tr>
      <td>Total</td>
      ${pensions.map(pension=>{
        const records=pensionRecords(state,pension.id);
        const total=records.reduce((sum,{item})=>sum+Number(item.plannedAmount||0),0);
        return `<td>${money(total)}</td><td></td>`;
      }).join("")}
    </tr>`;

  $("schoolCards").innerHTML=pensions.length ? pensions.map(pension=>{
    const records=pensionRecords(state,pension.id);
    const paidCount=records.filter(({item})=>item.realized).length;
    const total=records.reduce((sum,{item})=>sum+Number(item.plannedAmount||0),0);
    return `<article class="school-card" data-school-pension-id="${pension.id}">
      <div>
        <strong>${escapeHtml(pension.studentName)}</strong>
        <span>Periodo ${pension.year} · Responsable inicial ${NAMES[pension.owner]}</span>
      </div>
      <div>
        <strong>${money(total)}</strong>
        <span>${paidCount} de ${records.length} pagos realizados</span>
      </div>
    </article>`;
  }).join("") : '<div class="empty">No hay pensiones escolares para este periodo.</div>';

  document.querySelectorAll("[data-school-check]").forEach(check=>{
    check.addEventListener("change",()=>updateRealized("fixed",check.dataset.schoolCheck,check.dataset.owner,check.checked,check));
  });
  document.querySelectorAll("[data-school-edit]").forEach(cell=>{
    cell.addEventListener("click",()=>openRecordModal("fixed",cell.dataset.schoolEdit,cell.dataset.owner));
  });
  document.querySelectorAll("[data-school-pension-id]").forEach(card=>{
    card.addEventListener("click",()=>openSchoolModal(card.dataset.schoolPensionId));
  });
}

function openSchoolModal(id=null) {
  if(id){
    const closed=pensionRecords(state,id).find(record=>isMonthClosed(record.periodKey));
    if(closed) return alert(closedMonthMessage(closed.periodKey));
  }
  $("schoolForm").reset();
  $("schoolPensionId").value=id||"";
  $("schoolStudentName").value="";
  $("schoolPeriodYear").value=Number($("yearPicker").value);
  $("schoolOwner").value="mayra";
  $("schoolEnrollmentAmount").value="200";
  $("schoolMonthlyAmount").value="295";
  $("schoolModalTitle").textContent=id?"Editar pensión escolar":"Agregar pensión escolar";
  $("deleteSchoolPensionBtn").classList.toggle("hidden",!id);
  $("schoolPeriodYear").disabled=Boolean(id);
  $("schoolOwner").disabled=Boolean(id);

  if(id){
    const pension=(state.schoolPensions||[]).find(item=>item.id===id);
    if(!pension) return;
    $("schoolStudentName").value=pension.studentName;
    $("schoolPeriodYear").value=pension.year;
    $("schoolOwner").value=pension.owner;
    $("schoolEnrollmentAmount").value=pension.enrollmentAmount;
    $("schoolMonthlyAmount").value=pension.monthlyAmount;
  }
  $("schoolModal").classList.add("open");
}

function closeSchoolModal(){ $("schoolModal").classList.remove("open"); }

async function saveSchoolPension(event) {
  event.preventDefault();
  const id=$("schoolPensionId").value;
  const values={
    studentName:$("schoolStudentName").value,
    year:Number($("schoolPeriodYear").value),
    owner:$("schoolOwner").value,
    enrollmentAmount:Number($("schoolEnrollmentAmount").value),
    monthlyAmount:Number($("schoolMonthlyAmount").value)
  };
  if(!id){
    const targetYear=Number(values.year);
    const closedKey=Object.keys(state.monthClosures||{}).find(key=>key.startsWith(`${targetYear}-`) && isMonthClosed(key));
    if(closedKey) return alert(closedMonthMessage(closedKey));
    const duplicate=(state.schoolPensions||[]).some(item=>
      item.studentName.trim().toLowerCase()===values.studentName.trim().toLowerCase() &&
      Number(item.year)===values.year
    );
    if(duplicate) return alert("Ya existe una pensión para ese alumno y periodo.");
    prepareUndo("Pensión escolar agregada");
    createSchoolPension(state,values);
  }else{
    prepareUndo("Pensión escolar actualizada");
    updateSchoolPension(state,id,values);
  }
  closeSchoolModal();
  renderAll();
  await persist();
}

async function removeSchoolPension() {
  const id=$("schoolPensionId").value;
  const closed=pensionRecords(state,id).find(record=>isMonthClosed(record.periodKey));
  if(closed) return alert(closedMonthMessage(closed.periodKey));
  if(!id || !confirm("¿Eliminar esta pensión escolar y todos sus pagos relacionados?")) return;
  if(deleteSchoolPension(state,id)){
    prepareUndo("Pensión escolar eliminada");
    closeSchoolModal();
    renderAll();
    await persist();
  }
}

function renderLoans() {
  const metrics=loanMetrics(state,selectedProfile,currentKey());
  $("loanCapitalTotal").textContent=money(metrics.principal);
  $("loanRepaymentTotal").textContent=money(metrics.totalRepayment);
  $("loanInterestTotal").textContent=money(metrics.interest);
  $("loanDebtPending").textContent=money(metrics.pending);

  $("loanList").innerHTML=metrics.loans.length ? metrics.loans.map(loan=>{
    const records=loanRecords(state,loan.id);
    const paid=records.installments.filter(({item})=>item.realized).reduce((sum,{item})=>sum+Number(item.actualAmount||0),0);
    const historicalPaid=Number(loan.historicalPaidAmount||0);
    const effectiveTotal=loan.type==="fixed" ? effectiveLoanTotal(loan) : paid+historicalPaid+flexiblePrincipalOutstanding(state,loan.id);
    const pending=loan.type==="fixed"
      ? fixedOutstanding(state,loan.id)
      : flexiblePrincipalOutstanding(state,loan.id);
    const paidInApp=records.installments.filter(({item})=>item.realized).length;
    const paidCount=Number(loan.paidInstallmentsBeforeRegistration||loan.previousPaymentsBeforeRegistration||0)+paidInApp;
    const remainingMonths = loan.type==="flexible"
      ? flexibleRemainingMonths(state,loan.id)
      : Math.max(0, records.installments.filter(({item})=>!item.realized).length);
    const typeLabel=loan.type==="flexible"?"Interés + abono flexible":"Cuotas fijas";
    return `<article class="loan-card" data-loan-id="${loan.id}">
      <div class="loan-card-heading">
        <div>
          <div class="loan-title">${escapeHtml(loan.concept)} <span class="owner-tag">${NAMES[loan.owner]}</span></div>
          <div class="item-meta">${typeLabel} · ${loan.registrationMode==="active"?"Registrado como préstamo ya activo":"Préstamo nuevo"} · ${loan.status==="paid"?"Cancelado en su totalidad":"Préstamo activo"} · Próxima cuota ${loan.firstPaymentMonthKey}</div>
        </div>
        <span class="loan-status ${loan.status==="paid"?"paid":"active"}">${loan.status==="paid"?"Cancelado":"Activo"}</span>
      </div>
      <div class="loan-card-grid">
        <div><span>Recibido</span><strong>${money(loan.principal)}</strong></div>
        <div><span>${loan.type==="fixed"?"Total final":"Interés mensual"}</span><strong>${money(loan.type==="fixed"?effectiveTotal:loan.monthlyInterest)}</strong></div>
        <div><span>Pagado total</span><strong>${money(paid+historicalPaid)}</strong></div>
        <div><span>${loan.type==="fixed"?"Pendiente":"Capital pendiente"}</span><strong>${money(pending)}</strong></div>
        <div><span>Meses estimados</span><strong>${loan.installments}</strong></div>
        <div><span>Meses pendientes</span><strong>${remainingMonths}</strong></div>
      </div>
    </article>`;
  }).join("") : '<div class="empty">No hay préstamos registrados.</div>';

  document.querySelectorAll("[data-loan-id]").forEach(card=>{
    card.addEventListener("click",()=>openLoanModal(card.dataset.loanId));
  });
}

function autoFillPlannedPrincipal(force=false) {
  if($("loanType").value!=="flexible") return;
  const principal=Number($("loanPrincipal").value||0);
  const installments=Math.max(1,Number($("loanInstallments").value||1));
  const input=$("loanPlannedPrincipal");
  if(force || !input.value || input.dataset.auto==="true"){
    input.value=(principal/installments).toFixed(2);
    input.dataset.auto="true";
  }
}

function updateLoanPreview() {
  const principal=Number($("loanPrincipal").value||0);
  const type=$("loanType").value;
  const active=$("loanRegistrationMode").value==="active";
  const installments=Math.max(1,Number($("loanInstallments").value||1));

  if(type==="fixed"){
    const total=Number($("loanTotalRepayment").value||0);
    const paid=Math.max(0,Number($("loanPaidInstallments").value||0));
    const remaining=Math.max(0,installments-paid);
    const outstanding=active ? Number($("loanOutstandingBalance").value||0) : total;
    $("loanInterestPreview").textContent=money(Math.max(0,total-principal));
    $("loanInstallmentPreview").textContent=money(remaining>0 ? outstanding/remaining : 0);
    $("loanRemainingPreview").textContent=String(remaining);
  }else{
    if(!active) autoFillPlannedPrincipal();
    const interest=Number($("loanMonthlyInterest").value||0);
    const capital=Number($("loanPlannedPrincipal").value||0);
    const outstanding=active ? Number($("loanOutstandingPrincipal").value||0) : principal;
    const remaining=capital>0 ? Math.ceil(outstanding/capital) : 0;
    $("loanInterestPreview").textContent=money(interest*remaining);
    $("loanInstallmentPreview").textContent=money(interest+Math.min(capital,outstanding));
    $("loanRemainingPreview").textContent=String(remaining);
  }
}

function toggleLoanTypeFields() {
  const flexible=$("loanType").value==="flexible";
  const active=$("loanRegistrationMode").value==="active";

  $("loanTotalRepaymentField").classList.toggle("hidden",flexible);
  $("loanMonthlyInterestField").classList.toggle("hidden",!flexible);
  $("loanPlannedPrincipalField").classList.toggle("hidden",!flexible);
  $("activeFixedFields").classList.toggle("hidden",!(active && !flexible));
  $("activeFlexibleFields").classList.toggle("hidden",!(active && flexible));
  $("activeLoanNotice").classList.toggle("hidden",!active);
  $("loanRemainingPreviewField").classList.toggle("hidden",!active);

  $("loanInstallmentsLabel").textContent=flexible
    ? (active ? "Plazo original o pagos estimados" : "Plazo referencial en meses")
    : "Número total de cuotas";

  $("loanTotalRepayment").required=!flexible;
  $("loanMonthlyInterest").required=flexible;
  $("loanPlannedPrincipal").required=flexible;
  $("loanPaidInstallments").required=active && !flexible;
  $("loanOutstandingBalance").required=active && !flexible;
  $("loanPreviousPayments").required=active && flexible;
  $("loanOutstandingPrincipal").required=active && flexible;

  if(flexible && !active) autoFillPlannedPrincipal(true);
  updateLoanPreview();
}

function togglePayoffFields() {
  const checked=$("loanPaidOff").checked;
  $("loanPayoffMonthField").classList.toggle("hidden",!checked);
  $("loanAdjustedTotalField").classList.toggle("hidden",!checked);
  $("loanPayoffHelp").classList.toggle("hidden",!checked);
  $("loanPayoffMonth").required=checked;
  $("loanAdjustedTotal").required=checked;
}

function openLoanModal(id=null,registrationMode="new") {
  if(!id && !assertMonthOpen()) return;
  if(id){
    const records=loanRecords(state,id);
    const closed=records.incomes.concat(records.installments).find(record=>isMonthClosed(record.monthKey));
    if(closed) return alert(closedMonthMessage(closed.monthKey));
  }
  $("loanForm").reset();
  $("loanId").value=id||"";
  $("loanRegistrationMode").value=id ? ((state.loans||[]).find(item=>item.id===id)?.registrationMode||"new") : registrationMode;
  $("loanOwner").value=selectedOwner();
  $("loanFirstPaymentMonth").value=currentKey();
  $("loanPayoffMonth").value=currentKey();
  $("loanType").value="fixed";
  $("loanPlannedPrincipal").dataset.auto="true";
  $("loanPaidOffField").classList.toggle("hidden",!id);
  $("deleteLoanBtn").classList.toggle("hidden",!id);
  $("loanModalTitle").textContent=id
    ? "Editar préstamo"
    : registrationMode==="active"
      ? "Registrar préstamo ya activo"
      : "Agregar préstamo";

  if(id){
    const loan=(state.loans||[]).find(item=>item.id===id);
    if(!loan) return;
    $("loanOwner").value=loan.owner;
    $("loanConcept").value=loan.concept;
    $("loanType").value=loan.type||"fixed";
    $("loanPrincipal").value=loan.principal;
    $("loanTotalRepayment").value=loan.totalRepayment||"";
    $("loanMonthlyInterest").value=loan.monthlyInterest||"";
    $("loanPlannedPrincipal").value=loan.plannedPrincipal||"";
    $("loanPlannedPrincipal").dataset.auto="false";
    $("loanInstallments").value=loan.installments;
    $("loanPaidInstallments").value=loan.paidInstallmentsBeforeRegistration||0;
    $("loanPreviousPayments").value=loan.previousPaymentsBeforeRegistration||0;
    $("loanOutstandingBalance").value=loan.registrationMode==="active" && loan.type==="fixed" ? loan.openingOutstanding||"" : "";
    $("loanOutstandingPrincipal").value=loan.registrationMode==="active" && loan.type==="flexible" ? loan.openingOutstanding||"" : "";
    $("loanFirstPaymentMonth").value=loan.firstPaymentMonthKey;
    $("loanPrincipal").disabled=true;
    $("loanTotalRepayment").disabled=true;
    $("loanInstallments").disabled=true;
    $("loanFirstPaymentMonth").disabled=true;
    $("loanOwner").disabled=true;
    $("loanType").disabled=true;
    ["loanPaidInstallments","loanPreviousPayments","loanOutstandingBalance","loanOutstandingPrincipal"].forEach(field=>$(field).disabled=true);
    $("loanPaidOff").checked=loan.status==="paid";
    $("loanPayoffMonth").value=loan.payoffMonthKey||currentKey();
    $("loanAdjustedTotal").value=loan.type==="fixed" ? effectiveLoanTotal(loan) : flexiblePrincipalOutstanding(state,loan.id)+Number(loan.monthlyInterest||0);
  }else{
    ["loanPrincipal","loanTotalRepayment","loanInstallments","loanFirstPaymentMonth","loanOwner","loanType","loanMonthlyInterest","loanPlannedPrincipal","loanPaidInstallments","loanPreviousPayments","loanOutstandingBalance","loanOutstandingPrincipal"].forEach(id=>$(id).disabled=false);
    $("loanPlannedPrincipal").dataset.auto="true";
  }
  toggleLoanTypeFields();
  togglePayoffFields();
  updateLoanPreview();
  $("loanModal").classList.add("open");
}

function closeLoanModal(){ $("loanModal").classList.remove("open"); }

async function saveLoan(event) {
  event.preventDefault();
  const id=$("loanId").value;
  const values={
    owner:$("loanOwner").value,
    concept:$("loanConcept").value.trim(),
    type:$("loanType").value,
    principal:Number($("loanPrincipal").value),
    totalRepayment:Number($("loanTotalRepayment").value||0),
    monthlyInterest:Number($("loanMonthlyInterest").value||0),
    plannedPrincipal:Number($("loanPlannedPrincipal").value||0),
    installments:Number($("loanInstallments").value),
    paidInstallments:Number($("loanPaidInstallments").value||0),
    previousPayments:Number($("loanPreviousPayments").value||0),
    outstandingBalance:Number($("loanOutstandingBalance").value||0),
    outstandingPrincipal:Number($("loanOutstandingPrincipal").value||0),
    registrationMode:$("loanRegistrationMode").value,
    receivedMonthKey:currentKey(),
    firstPaymentMonthKey:$("loanFirstPaymentMonth").value
  };
  if(values.type==="fixed" && values.totalRepayment<values.principal) return alert("El total a devolver no puede ser menor que el monto recibido.");
  if(values.type==="flexible" && values.monthlyInterest<0) return alert("El interés mensual no puede ser negativo.");
  if(values.type==="flexible" && values.plannedPrincipal<=0){
    values.plannedPrincipal = Number((values.principal / Math.max(1, values.installments)).toFixed(2));
  }
  if(values.registrationMode==="active" && values.type==="fixed"){
    if(values.paidInstallments<0 || values.paidInstallments>=values.installments){
      return alert("Las cuotas ya pagadas deben ser menores al número total de cuotas.");
    }
    if(values.outstandingBalance<=0) return alert("Ingresa el saldo pendiente actual.");
  }
  if(values.registrationMode==="active" && values.type==="flexible"){
    if(values.outstandingPrincipal<=0) return alert("Ingresa el capital pendiente actual.");
    if(values.outstandingPrincipal>values.principal) return alert("El capital pendiente no puede superar el capital original.");
  }

  prepareUndo(id ? "Préstamo actualizado" : "Préstamo agregado");
  if(!id){
    if(values.registrationMode==="active") createActiveLoan(state,values);
    else createLoan(state,values);
  }else{
    updateLoanMetadata(state,id,values);
    const loan=(state.loans||[]).find(item=>item.id===id);
    if($("loanPaidOff").checked && loan.status!=="paid"){
      const adjustedTotal=Number($("loanAdjustedTotal").value);
      const payoffAmount=payoffLoan(state,id,$("loanPayoffMonth").value,adjustedTotal);
      alert(`Cancelación total registrada por ${money(payoffAmount)}. Las cuotas posteriores fueron eliminadas.`);
    }
  }
  closeLoanModal();
  renderAll();
  await persist();
}

async function removeLoan() {
  const id=$("loanId").value;
  const records=loanRecords(state,id);
  const closed=records.incomes.concat(records.installments).find(record=>isMonthClosed(record.monthKey));
  if(closed) return alert(closedMonthMessage(closed.monthKey));
  if(!id || !confirm("¿Eliminar este préstamo y sus registros relacionados?")) return;
  if(deleteLoan(state,id)){
    prepareUndo("Préstamo eliminado");
    closeLoanModal();
    renderAll();
    await persist();
  }
}

function bindUi() {
  initNavigation();
  initHistoryFilters(renderAll);
  $("profileSelect").addEventListener("change",renderAll);
  $("fixedCategoryFilter").addEventListener("change",renderFixed);
  $("monthCloseBtn").addEventListener("click",toggleMonthClosure);
  $("undoBtn").addEventListener("click",undoLastChange);
  $("dismissUndoBtn").addEventListener("click",dismissUndo);
  $("googleLoginBtn").addEventListener("click",async()=>{
    $("loginMessage").textContent="";
    try{await loginWithGoogle();}catch(error){$("loginMessage").textContent=error.message;}
  });
  $("logoutBtn").addEventListener("click",logout);$("userButton").addEventListener("click",()=>confirm("¿Cerrar sesión?")&&logout());
  $("addIncomeBtn").addEventListener("click",()=>openRecordModal("income"));
  $("addLoanBtn").addEventListener("click",()=>openLoanModal(null,"new"));
  $("addActiveLoanBtn").addEventListener("click",()=>openLoanModal(null,"active"));
  $("addSchoolPensionBtn").addEventListener("click",()=>openSchoolModal());
  $("addFixedBtn").addEventListener("click",()=>openRecordModal("fixed"));
  $("addVariableBtn").addEventListener("click",()=>openRecordModal("variable"));
  $("quickExpenseBtn").addEventListener("click",()=>openRecordModal("variable"));
  $("closeModalBtn").addEventListener("click",closeModal);
  $("formModal").addEventListener("click",event=>event.target===$("formModal")&&closeModal());
  $("recordForm").addEventListener("submit",saveRecord);
  $("deleteRecordBtn").addEventListener("click",deleteRecord);
  $("recordRealized").addEventListener("change",()=>{
    if($("recordRealized").checked && Number($("recordActualAmount").value||0)===0){
      $("recordActualAmount").value=$("recordPlannedAmount").value || "0";
    }
    if(!$("recordRealized").checked){
      $("recordActualAmount").value="0";
    }
  });
  $("recordActualAmount").addEventListener("input",()=>{
    $("recordActualAmount").dataset.edited="true";
    toggleActualAmountField();
  });
  $("copyIncomeBtn").addEventListener("click",copyPreviousIncomes);
  $("copyFixedBtn").addEventListener("click",copyPreviousFixed);
  $("addIncomeCategoryBtn").addEventListener("click",()=>addCategory("income","newIncomeCategory"));
  $("addExpenseCategoryBtn").addEventListener("click",()=>addCategory("expense","newExpenseCategory"));
  $("newIncomeCategory").addEventListener("keydown",event=>{
    if(event.key==="Enter"){event.preventDefault();addCategory("income","newIncomeCategory");}
  });
  $("newExpenseCategory").addEventListener("keydown",event=>{
    if(event.key==="Enter"){event.preventDefault();addCategory("expense","newExpenseCategory");}
  });
  $("resetMonthBtn").addEventListener("click",resetMonth);
  $("closeLoanModalBtn").addEventListener("click",closeLoanModal);
  $("loanModal").addEventListener("click",event=>event.target===$("loanModal")&&closeLoanModal());
  $("loanForm").addEventListener("submit",saveLoan);
  $("deleteLoanBtn").addEventListener("click",removeLoan);
  ["loanPrincipal","loanTotalRepayment","loanInstallments","loanMonthlyInterest","loanPaidInstallments","loanOutstandingBalance","loanPreviousPayments","loanOutstandingPrincipal"].forEach(id=>$(id).addEventListener("input",updateLoanPreview));
  $("loanPlannedPrincipal").addEventListener("input",()=>{
    $("loanPlannedPrincipal").dataset.auto="false";
    updateLoanPreview();
  });
  $("loanType").addEventListener("change",toggleLoanTypeFields);
  $("loanPaidOff").addEventListener("change",togglePayoffFields);
  $("schoolYearFilter").addEventListener("change",renderSchoolPensions);
  $("closeSchoolModalBtn").addEventListener("click",closeSchoolModal);
  $("schoolModal").addEventListener("click",event=>event.target===$("schoolModal")&&closeSchoolModal());
  $("schoolForm").addEventListener("submit",saveSchoolPension);
  $("deleteSchoolPensionBtn").addEventListener("click",removeSchoolPension);
}

initPeriodPickers();
bindUi();

observeSession(({user,profile,error})=>{
  if(!user){
    currentUser=null;currentUserProfile=null;
    stopFinanceObserver?.();stopFinanceObserver=null;
    $("appShell").classList.add("hidden");$("loginScreen").classList.remove("hidden");
    if(error) $("loginMessage").textContent=error;
    return;
  }

  currentUser=user;currentUserProfile=profile;
  selectedProfile=profile;$("profileSelect").value=profile;
  $("userName").textContent=NAMES[profile];$("userPhoto").src=user.photoURL||"";$("connectedEmail").textContent=user.email;
  $("loginScreen").classList.add("hidden");$("appShell").classList.remove("hidden");

  stopFinanceObserver?.();
  stopFinanceObserver=observeFinanceData(async(remoteState,exists)=>{
    // Mientras existen cambios locales en proceso, no reemplazamos el
    // estado con una respuesta anterior de Firestore.
    if (saving || saveQueued) {
      setSyncStatus(saveQueued ? "pending" : "saving",saveQueued ? "Cambios pendientes…" : "Guardando…");
      return;
    }

    if(remoteState){
      state=normalizeState(remoteState);
    }else{
      state=createEmptyState();
      await saveFinanceData(state,user.email);
    }
    setSyncStatus("synced","Sincronizado");
    renderAll();
  },error=>{
    console.error(error);$("syncStatus").textContent="Sin acceso a Firestore";
    alert("No se pudo leer Firestore. Publica las reglas incluidas en FIRESTORE_RULES.txt.");
  });
});
