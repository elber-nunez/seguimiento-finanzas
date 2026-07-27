import { $, MONTHS, NAMES, money, escapeHtml, today, uid, formatDate } from "./utils.js";
import { loginWithGoogle, observeSession, logout } from "./auth.js";
import { observeFinanceData, saveFinanceData } from "./firestore.js";
import { createEmptyState, normalizeState, ensureMonth, getProfileData, calculateTotals, getHistory, previousMonthKey } from "./budget.js";
import { initNavigation, showView } from "./navigation.js";
import { renderDashboard } from "./dashboard.js";
import { initHistoryFilters, renderHistory, renderHistoryCategoryOptions } from "./history.js";
import { createLoan, updateLoanMetadata, payoffLoan, deleteLoan, loanMetrics, loanRecords, applyFlexiblePayment, flexiblePrincipalOutstanding, effectiveLoanTotal, flexibleRemainingMonths } from "./loans.js";
import { SCHOOL_ROWS, createSchoolPension, updateSchoolPension, deleteSchoolPension, pensionRecords, schoolPensionsForYear, schoolMetrics } from "./school-pensions.js";

let currentUser = null;
let currentUserProfile = null;
let state = createEmptyState();
let stopFinanceObserver = null;
let selectedProfile = "general";
let saving = false;
let saveQueued = false;

function currentKey() {
  return `${$("yearPicker").value}-${String(Number($("monthPicker").value)+1).padStart(2,"0")}`;
}

function initPeriodPickers() {
  const now = new Date();
  $("monthPicker").innerHTML = MONTHS.map((month,index)=>`<option value="${index}">${month}</option>`).join("");
  $("monthPicker").value = now.getMonth();
  const years=[];
  for(let year=now.getFullYear()-3;year<=now.getFullYear()+3;year++) years.push(`<option value="${year}">${year}</option>`);
  $("yearPicker").innerHTML=years.join("");
  $("yearPicker").value=now.getFullYear();
  $("monthPicker").addEventListener("change",renderAll);
  $("yearPicker").addEventListener("change",renderAll);
}

async function persist() {
  if (!currentUser) return;

  if (saving) {
    saveQueued = true;
    $("syncStatus").textContent = "Cambios pendientes…";
    return;
  }

  saving = true;
  try {
    do {
      saveQueued = false;
      $("syncStatus").textContent = "Guardando…";

      // Guardamos una copia estable. Si el usuario marca otro check
      // mientras se guarda, saveQueued obliga a una nueva escritura.
      const stateSnapshot = JSON.parse(JSON.stringify(state));
      await saveFinanceData(stateSnapshot,currentUser.email);
    } while (saveQueued);

    $("syncStatus").textContent = "Sincronizado";
  } catch(error) {
    console.error(error);
    $("syncStatus").textContent = "Error al guardar";
    alert("No se pudo guardar en Firestore. Revisa las reglas de seguridad.");
  } finally {
    saving = false;
  }
}

function selectedOwner() {
  return selectedProfile==="general" ? currentUserProfile : selectedProfile;
}

function renderAll() {
  ensureMonth(state,currentKey());
  selectedProfile = $("profileSelect").value;
  state.ui.selectedProfile = selectedProfile;
  renderHome();
  renderIncome();
  renderFixed();
  renderVariable();
  renderSummary();
  renderDashboard(state,currentKey(),selectedProfile);
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
  const editAttrs = editable ? `data-edit-id="${item.id}" data-kind="${item.kind || type}" data-owner="${item.owner}"` : "";
  const check = withCheck
    ? `<input type="checkbox" data-realize-id="${item.id}" data-kind="${item.kind || type}" data-owner="${item.owner}" ${item.realized?"checked":""}>`
    : "";
  return `<article class="${withCheck?"check-row":"item-row"} ${item.realized?"paid":""}">
    ${check}
    <div class="item-content" ${editAttrs}>
      <div class="item-title">${escapeHtml(item.concept)} <span class="owner-tag">${NAMES[item.owner]}</span> <span class="status-tag ${item.realized?"real":"planned"}">${item.realized?"Real":"Previsto"}</span></div>
      <div class="item-meta">${escapeHtml(item.category || "Ingreso")} · ${formatDate(item.date)}</div>
    </div>
    <div class="amount-comparison">
      <small>Prev. ${money(item.plannedAmount)}</small>
      <strong class="${type==="income"?"income-color":"expense-color"}">${item.realized?`Real ${money(item.actualAmount)}`:"Pendiente"}</strong>
    </div>
  </article>`;
}

function renderIncome() {
  const data = getProfileData(state,currentKey(),selectedProfile);
  const totals = calculateTotals(state,currentKey(),selectedProfile);
  $("incomePlannedTotal").textContent = money(totals.incomePlanned);
  $("incomeActualTotal").textContent = money(totals.incomeActual);
  $("incomeList").innerHTML = data.incomes.length
    ? data.incomes.map(item=>itemRow({...item,kind:"income"},"income",true,true)).join("")
    : '<div class="empty">No hay ingresos registrados.</div>';
  bindRealizeChecks($("incomeList"));
  bindEditRows($("incomeList"));
}

function renderFixed() {
  const data = getProfileData(state,currentKey(),selectedProfile);
  const totals = calculateTotals(state,currentKey(),selectedProfile);
  $("fixedPlanned").textContent=money(totals.fixedPlanned);
  $("fixedPaid").textContent=money(totals.fixedActual);
  $("fixedPending").textContent=money(data.fixed.filter(item=>!item.realized).reduce((sum,item)=>sum+Number(item.plannedAmount||0),0));

  const currentFilter=$("fixedCategoryFilter").value || "all";
  const categories=[...new Set(data.fixed.map(item=>item.category).filter(Boolean))].sort((x,y)=>x.localeCompare(y,"es"));
  $("fixedCategoryFilter").innerHTML='<option value="all">Todas las categorías</option>'+categories.map(category=>`<option>${escapeHtml(category)}</option>`).join("");
  $("fixedCategoryFilter").value=categories.includes(currentFilter)?currentFilter:"all";

  const filtered=$("fixedCategoryFilter").value==="all"
    ? data.fixed
    : data.fixed.filter(item=>item.category===$("fixedCategoryFilter").value);

  $("fixedList").innerHTML = filtered.length
    ? filtered.map(item=>itemRow({...item,kind:"fixed"},"expense",true,true)).join("")
    : '<div class="empty">No hay gastos fijos para esta categoría.</div>';
  bindRealizeChecks($("fixedList"));
  bindEditRows($("fixedList"));
}

function renderVariable() {
  const data = getProfileData(state,currentKey(),selectedProfile);
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
  const totals = calculateTotals(state,currentKey(),selectedProfile);
  $("summaryIncomePlanned").textContent=money(totals.incomePlanned);
  $("summaryIncomeActual").textContent=money(totals.incomeActual);
  $("summaryExpensePlanned").textContent=money(totals.expensePlanned);
  $("summaryExpenseActual").textContent=money(totals.expenseActual);
  $("summaryPending").textContent=money(totals.pendingExpenses);
  $("summaryAvailable").textContent=money(totals.available);
  $("summaryExpected").textContent=money(totals.expected);
  $("summaryVariance").textContent=money(totals.variance);
  $("summaryVariance").className = totals.variance >= 0 ? "positive-value" : "negative-value";
}

async function updateRealized(kind,id,owner,realized,checkElement) {
  const property=kind==="income"?"incomes":kind;
  const item=ensureMonth(state,currentKey())[owner][property].find(row=>row.id===id);
  if(!item) return;

  if(realized){
    const entered=prompt("Ingresa el monto real. Puedes dejar el monto previsto si fue igual:",String(item.plannedAmount));
    if(entered===null){
      checkElement.checked=false;
      return;
    }
    const actual=Number(String(entered).replace(",","."));
    if(!Number.isFinite(actual)||actual<0){
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
    const collection = ensureMonth(state,currentKey())[owner][kind==="income"?"incomes":kind];
    const item = collection.find(row=>row.id===id);
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
  const item={
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
  if(!id||!confirm("¿Eliminar este registro?")) return;
  const property=kind==="income"?"incomes":kind;
  const month=ensureMonth(state,currentKey());
  ["elber","mayra"].forEach(person=>month[person][property]=month[person][property].filter(item=>item.id!==id));
  closeModal();renderAll();await persist();
}

function duplicateKey(item) {
  return `${item.owner}|${(item.concept||"").trim().toLowerCase()}|${(item.category||"").trim().toLowerCase()}`;
}

async function copyPreviousIncomes() {
  const destination=currentKey(), source=previousMonthKey(destination);
  if(!state.months[source]) return alert("El mes anterior no tiene información registrada.");
  const target=ensureMonth(state,destination);
  let copied=0, skipped=0;

  ["elber","mayra"].forEach(person=>{
    const existing = new Set(target[person].incomes.map(duplicateKey));
    state.months[source][person].incomes.filter(item=>item.sourceType!=="loan-income").forEach(item=>{
      const candidate={...item,id:uid(),owner:person,date:today(),realized:false,actualAmount:0};
      const key=duplicateKey(candidate);
      if(existing.has(key)){ skipped++; return; }
      target[person].incomes.push(candidate);
      existing.add(key);
      copied++;
    });
  });

  renderAll();
  if(copied) await persist();
  alert(`Ingresos copiados: ${copied}. Duplicados omitidos: ${skipped}.`);
}

async function copyPreviousFixed() {
  const destination=currentKey(), source=previousMonthKey(destination);
  if(!state.months[source]) return alert("El mes anterior no tiene información registrada.");
  const target=ensureMonth(state,destination);
  let copied=0, skipped=0;

  ["elber","mayra"].forEach(person=>{
    const existing = new Set(target[person].fixed.map(duplicateKey));
    state.months[source][person].fixed.filter(item=>item.sourceType!=="loan-installment" && item.sourceType!=="school-pension").forEach(item=>{
      const candidate={...item,id:uid(),owner:person,realized:false,actualAmount:0,date:today()};
      const key=duplicateKey(candidate);
      if(existing.has(key)){ skipped++; return; }
      target[person].fixed.push(candidate);
      existing.add(key);
      copied++;
    });
  });

  renderAll();
  if(copied) await persist();
  alert(`Gastos fijos copiados: ${copied}. Duplicados omitidos: ${skipped}.`);
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
  if(!confirm("¿Eliminar todos los datos del mes seleccionado para Elber y Mayra?")) return;
  state.months[currentKey()]={elber:{incomes:[],fixed:[],variable:[]},mayra:{incomes:[],fixed:[],variable:[]}};
  renderAll();await persist();
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
        return `<td class="school-amount-cell" data-school-edit="${record.item.id}" data-owner="${record.owner}">${money(record.item.plannedAmount)}</td>
          <td><input type="checkbox" data-school-check="${record.item.id}" data-owner="${record.owner}" ${record.item.realized?"checked":""}></td>`;
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
    const duplicate=(state.schoolPensions||[]).some(item=>
      item.studentName.trim().toLowerCase()===values.studentName.trim().toLowerCase() &&
      Number(item.year)===values.year
    );
    if(duplicate) return alert("Ya existe una pensión para ese alumno y periodo.");
    createSchoolPension(state,values);
  }else{
    updateSchoolPension(state,id,values);
  }
  closeSchoolModal();
  renderAll();
  await persist();
}

async function removeSchoolPension() {
  const id=$("schoolPensionId").value;
  if(!id || !confirm("¿Eliminar esta pensión escolar y todos sus pagos relacionados?")) return;
  if(deleteSchoolPension(state,id)){
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
    const effectiveTotal=loan.type==="fixed" ? effectiveLoanTotal(loan) : paid+flexiblePrincipalOutstanding(state,loan.id);
    const pending=loan.type==="fixed"
      ? Math.max(0,effectiveTotal-paid)
      : flexiblePrincipalOutstanding(state,loan.id);
    const paidCount=records.installments.filter(({item})=>item.realized).length;
    const remainingMonths = loan.type==="flexible"
      ? flexibleRemainingMonths(state,loan.id)
      : Math.max(0, records.installments.filter(({item})=>!item.realized).length);
    const typeLabel=loan.type==="flexible"?"Interés + abono flexible":"Cuotas fijas";
    return `<article class="loan-card" data-loan-id="${loan.id}">
      <div class="loan-card-heading">
        <div>
          <div class="loan-title">${escapeHtml(loan.concept)} <span class="owner-tag">${NAMES[loan.owner]}</span></div>
          <div class="item-meta">${typeLabel} · ${loan.status==="paid"?"Cancelado en su totalidad":"Préstamo activo"} · Primera cuota ${loan.firstPaymentMonthKey}</div>
        </div>
        <span class="loan-status ${loan.status==="paid"?"paid":"active"}">${loan.status==="paid"?"Cancelado":"Activo"}</span>
      </div>
      <div class="loan-card-grid">
        <div><span>Recibido</span><strong>${money(loan.principal)}</strong></div>
        <div><span>${loan.type==="fixed"?"Total final":"Interés mensual"}</span><strong>${money(loan.type==="fixed"?effectiveTotal:loan.monthlyInterest)}</strong></div>
        <div><span>Pagado</span><strong>${money(paid)}</strong></div>
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
  const installments=Math.max(1,Number($("loanInstallments").value||1));
  if(type==="fixed"){
    const total=Number($("loanTotalRepayment").value||0);
    $("loanInterestPreview").textContent=money(Math.max(0,total-principal));
    $("loanInstallmentPreview").textContent=money(total/installments);
  }else{
    autoFillPlannedPrincipal();
    const interest=Number($("loanMonthlyInterest").value||0);
    const capital=Number($("loanPlannedPrincipal").value||0);
    $("loanInterestPreview").textContent=money(interest*installments);
    $("loanInstallmentPreview").textContent=money(interest+capital);
  }
}

function toggleLoanTypeFields() {
  const flexible=$("loanType").value==="flexible";
  $("loanTotalRepaymentField").classList.toggle("hidden",flexible);
  $("loanMonthlyInterestField").classList.toggle("hidden",!flexible);
  $("loanPlannedPrincipalField").classList.toggle("hidden",!flexible);
  $("loanInstallmentsLabel").textContent=flexible?"Plazo referencial en meses":"Número de cuotas";
  $("loanTotalRepayment").required=!flexible;
  $("loanMonthlyInterest").required=flexible;
  $("loanPlannedPrincipal").required=flexible;
  if(flexible) autoFillPlannedPrincipal(true);
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

function openLoanModal(id=null) {
  $("loanForm").reset();
  $("loanId").value=id||"";
  $("loanOwner").value=selectedOwner();
  $("loanFirstPaymentMonth").value=currentKey();
  $("loanPayoffMonth").value=currentKey();
  $("loanType").value="fixed";
  $("loanPlannedPrincipal").dataset.auto="true";
  $("loanPaidOffField").classList.toggle("hidden",!id);
  $("deleteLoanBtn").classList.toggle("hidden",!id);
  $("loanModalTitle").textContent=id?"Editar préstamo":"Agregar préstamo";

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
    $("loanFirstPaymentMonth").value=loan.firstPaymentMonthKey;
    $("loanPrincipal").disabled=true;
    $("loanTotalRepayment").disabled=true;
    $("loanInstallments").disabled=true;
    $("loanFirstPaymentMonth").disabled=true;
    $("loanOwner").disabled=true;
    $("loanType").disabled=true;
    $("loanPaidOff").checked=loan.status==="paid";
    $("loanPayoffMonth").value=loan.payoffMonthKey||currentKey();
    $("loanAdjustedTotal").value=loan.type==="fixed" ? effectiveLoanTotal(loan) : flexiblePrincipalOutstanding(state,loan.id)+Number(loan.monthlyInterest||0);
  }else{
    ["loanPrincipal","loanTotalRepayment","loanInstallments","loanFirstPaymentMonth","loanOwner","loanType","loanMonthlyInterest","loanPlannedPrincipal"].forEach(id=>$(id).disabled=false);
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
    receivedMonthKey:currentKey(),
    firstPaymentMonthKey:$("loanFirstPaymentMonth").value
  };
  if(values.type==="fixed" && values.totalRepayment<values.principal) return alert("El total a devolver no puede ser menor que el monto recibido.");
  if(values.type==="flexible" && values.monthlyInterest<0) return alert("El interés mensual no puede ser negativo.");
  if(values.type==="flexible" && values.plannedPrincipal<=0){
    values.plannedPrincipal = Number((values.principal / Math.max(1, values.installments)).toFixed(2));
  }

  if(!id){
    createLoan(state,values);
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
  if(!id || !confirm("¿Eliminar este préstamo y sus registros relacionados?")) return;
  if(deleteLoan(state,id)){
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
  $("googleLoginBtn").addEventListener("click",async()=>{
    $("loginMessage").textContent="";
    try{await loginWithGoogle();}catch(error){$("loginMessage").textContent=error.message;}
  });
  $("logoutBtn").addEventListener("click",logout);$("userButton").addEventListener("click",()=>confirm("¿Cerrar sesión?")&&logout());
  $("addIncomeBtn").addEventListener("click",()=>openRecordModal("income"));
  $("addLoanBtn").addEventListener("click",()=>openLoanModal());
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
  ["loanPrincipal","loanTotalRepayment","loanInstallments","loanMonthlyInterest"].forEach(id=>$(id).addEventListener("input",updateLoanPreview));
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
      $("syncStatus").textContent = saveQueued ? "Cambios pendientes…" : "Guardando…";
      return;
    }

    if(remoteState){
      state=normalizeState(remoteState);
    }else{
      state=createEmptyState();
      await saveFinanceData(state,user.email);
    }
    $("syncStatus").textContent="Sincronizado";
    renderAll();
  },error=>{
    console.error(error);$("syncStatus").textContent="Sin acceso a Firestore";
    alert("No se pudo leer Firestore. Publica las reglas incluidas en FIRESTORE_RULES.txt.");
  });
});
