import { $, MONTHS, NAMES, money, escapeHtml, today, uid, formatDate } from "./utils.js";
import { loginWithGoogle, observeSession, logout } from "./auth.js";
import { observeFinanceData, saveFinanceData } from "./firestore.js";
import { createEmptyState, normalizeState, ensureMonth, getProfileData, calculateTotals, getHistory, previousMonthKey } from "./budget.js";
import { initNavigation, showView } from "./navigation.js";
import { renderDashboard } from "./dashboard.js";
import { initHistoryFilters, renderHistory, renderHistoryCategoryOptions } from "./history.js";

let currentUser = null;
let currentUserProfile = null;
let state = createEmptyState();
let stopFinanceObserver = null;
let selectedProfile = "general";
let saving = false;

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
  if (!currentUser || saving) return;
  saving = true;
  $("syncStatus").textContent = "Guardando…";
  try {
    await saveFinanceData(state,currentUser.email);
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
  renderCategoryEditors();
  renderHistoryCategoryOptions(state);
  renderHistory(state,currentKey(),selectedProfile);
}

function renderHome() {
  const totals = calculateTotals(state,currentKey(),selectedProfile);
  $("homeAvailable").textContent = money(totals.available);
  $("homeIncome").textContent = money(totals.income);
  $("homePaid").textContent = money(totals.paid);
  $("homePending").textContent = money(totals.pending);
  $("homeExpected").textContent = money(totals.expected);

  const data = getProfileData(state,currentKey(),selectedProfile);
  const pending = data.fixed.filter(item=>!item.paid).slice(0,5);
  $("homePendingList").innerHTML = pending.length ? pending.map(item=>itemRow(item,"expense",false)).join("") : '<div class="empty">No hay gastos pendientes.</div>';

  const recent = getHistory(state,currentKey(),selectedProfile).slice(0,5);
  $("homeRecentList").innerHTML = recent.length ? recent.map(item=>itemRow(item,item.type,false)).join("") : '<div class="empty">No hay movimientos realizados.</div>';
}

function itemRow(item,type,editable=true) {
  const editAttrs = editable ? `data-edit-id="${item.id}" data-kind="${item.kind || type}" data-owner="${item.owner}"` : "";
  return `<article class="item-row" ${editAttrs}>
    <div class="item-content"><div class="item-title">${escapeHtml(item.concept)} <span class="owner-tag">${NAMES[item.owner]}</span></div>
    <div class="item-meta">${escapeHtml(item.category || "Ingreso")} · ${formatDate(item.date)}</div></div>
    <div class="item-amount ${type==="income"?"income-color":"expense-color"}">${type==="income"?"+":"-"} ${money(item.amount)}</div>
  </article>`;
}

function renderIncome() {
  const data = getProfileData(state,currentKey(),selectedProfile);
  const total = data.incomes.reduce((sum,item)=>sum+Number(item.amount||0),0);
  $("incomeTotal").textContent = money(total);
  $("incomeList").innerHTML = data.incomes.length ? data.incomes.map(item=>itemRow({...item,kind:"income"},"income")).join("") : '<div class="empty">No hay ingresos registrados.</div>';
  bindEditRows($("incomeList"));
}

function renderFixed() {
  const data = getProfileData(state,currentKey(),selectedProfile);
  const planned = data.fixed.reduce((sum,item)=>sum+Number(item.amount||0),0);
  const paid = data.fixed.filter(item=>item.paid).reduce((sum,item)=>sum+Number(item.amount||0),0);
  $("fixedPlanned").textContent=money(planned);$("fixedPaid").textContent=money(paid);$("fixedPending").textContent=money(planned-paid);
  $("fixedList").innerHTML = data.fixed.length ? data.fixed.map(item=>`
    <article class="check-row ${item.paid?"paid":""}">
      <input type="checkbox" data-check-id="${item.id}" data-owner="${item.owner}" ${item.paid?"checked":""}>
      <div class="item-content" data-edit-id="${item.id}" data-kind="fixed" data-owner="${item.owner}">
        <div class="item-title">${escapeHtml(item.concept)} <span class="owner-tag">${NAMES[item.owner]}</span></div>
        <div class="item-meta">${escapeHtml(item.category)} · ${formatDate(item.date)}</div>
      </div>
      <div class="item-amount">${money(item.amount)}</div>
    </article>`).join("") : '<div class="empty">No hay gastos fijos planificados.</div>';

  document.querySelectorAll("[data-check-id]").forEach(check=>check.addEventListener("change",async()=>{
    const item = ensureMonth(state,currentKey())[check.dataset.owner].fixed.find(row=>row.id===check.dataset.checkId);
    if(item){ item.paid=check.checked; item.date=today(); renderAll(); await persist(); }
  }));
  bindEditRows($("fixedList"));
}

function renderVariable() {
  const data = getProfileData(state,currentKey(),selectedProfile);
  $("variableTotal").textContent = money(data.variable.reduce((sum,item)=>sum+Number(item.amount||0),0));
  $("variableList").innerHTML = data.variable.length ? data.variable.map(item=>itemRow({...item,kind:"variable"},"expense")).join("") : '<div class="empty">No hay gastos variables registrados.</div>';
  bindEditRows($("variableList"));
}

function renderSummary() {
  const totals = calculateTotals(state,currentKey(),selectedProfile);
  $("summaryIncome").textContent=money(totals.income);$("summaryFixed").textContent=money(totals.fixedPlanned);
  $("summaryVariable").textContent=money(totals.variable);$("summaryPaid").textContent=money(totals.paid);
  $("summaryPending").textContent=money(totals.pending);$("summaryAvailable").textContent=money(totals.available);
  $("summaryExpected").textContent=money(totals.expected);
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
  $("paidField").classList.toggle("hidden",kind!=="fixed");
  $("modalTitle").textContent = id ? "Editar registro" : kind==="income" ? "Agregar ingreso" : kind==="fixed" ? "Agregar gasto fijo" : "Agregar gasto variable";
  $("deleteRecordBtn").classList.toggle("hidden",!id);

  if(id){
    const collection = ensureMonth(state,currentKey())[owner][kind==="income"?"incomes":kind];
    const item = collection.find(row=>row.id===id);
    if(item){
      $("recordConcept").value=item.concept;$("recordAmount").value=item.amount;$("recordDate").value=item.date;
      $("recordCategory").value=item.category || (kind==="income" ? state.settings.categories.income[0] : state.settings.categories.expense[0]);
      if(kind==="fixed") $("recordPaid").checked=item.paid;
    }
  }
  $("formModal").classList.add("open");
}

function closeModal(){ $("formModal").classList.remove("open"); }

async function saveRecord(event) {
  event.preventDefault();
  const id=$("recordId").value||uid(), kind=$("recordKind").value, owner=$("recordOwner").value;
  const month=ensureMonth(state,currentKey());
  const property=kind==="income"?"incomes":kind;
  ["elber","mayra"].forEach(person=>month[person][property]=month[person][property].filter(item=>item.id!==id));
  const item={
    id,owner,
    concept:$("recordConcept").value.trim(),
    category:$("recordCategory").value,
    amount:Number($("recordAmount").value),
    date:$("recordDate").value
  };
  if(kind==="fixed") item.paid=$("recordPaid").checked;
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
    state.months[source][person].incomes.forEach(item=>{
      const candidate={...item,id:uid(),owner:person,date:today()};
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
    state.months[source][person].fixed.forEach(item=>{
      const candidate={...item,id:uid(),owner:person,paid:false,date:today()};
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

function bindUi() {
  initNavigation();
  initHistoryFilters(renderAll);
  $("profileSelect").addEventListener("change",renderAll);
  $("googleLoginBtn").addEventListener("click",async()=>{
    $("loginMessage").textContent="";
    try{await loginWithGoogle();}catch(error){$("loginMessage").textContent=error.message;}
  });
  $("logoutBtn").addEventListener("click",logout);$("userButton").addEventListener("click",()=>confirm("¿Cerrar sesión?")&&logout());
  $("addIncomeBtn").addEventListener("click",()=>openRecordModal("income"));
  $("addFixedBtn").addEventListener("click",()=>openRecordModal("fixed"));
  $("addVariableBtn").addEventListener("click",()=>openRecordModal("variable"));
  $("quickExpenseBtn").addEventListener("click",()=>openRecordModal("variable"));
  $("closeModalBtn").addEventListener("click",closeModal);
  $("formModal").addEventListener("click",event=>event.target===$("formModal")&&closeModal());
  $("recordForm").addEventListener("submit",saveRecord);
  $("deleteRecordBtn").addEventListener("click",deleteRecord);
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
