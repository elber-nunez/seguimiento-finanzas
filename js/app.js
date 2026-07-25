import { $, MONTHS, NAMES, EXPENSE_CATEGORIES, money, escapeHtml, today, uid, formatDate } from "./utils.js";
import { loginWithGoogle, observeSession, logout } from "./auth.js";
import { observeFinanceData, saveFinanceData } from "./firestore.js";
import { createEmptyState, ensureMonth, getProfileData, calculateTotals, getHistory, previousMonthKey } from "./budget.js";
import { initNavigation, showView } from "./navigation.js";
import { renderDashboard } from "./dashboard.js";
import { initHistoryFilters, renderHistory } from "./history.js";

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
  $("recordCategory").innerHTML=EXPENSE_CATEGORIES.map(category=>`<option>${category}</option>`).join("");
  $("categoryField").classList.toggle("hidden",kind==="income");
  $("paidField").classList.toggle("hidden",kind!=="fixed");
  $("modalTitle").textContent = id ? "Editar registro" : kind==="income" ? "Agregar ingreso" : kind==="fixed" ? "Agregar gasto fijo" : "Agregar gasto variable";
  $("deleteRecordBtn").classList.toggle("hidden",!id);

  if(id){
    const collection = ensureMonth(state,currentKey())[owner][kind==="income"?"incomes":kind];
    const item = collection.find(row=>row.id===id);
    if(item){
      $("recordConcept").value=item.concept;$("recordAmount").value=item.amount;$("recordDate").value=item.date;
      if(kind!=="income") $("recordCategory").value=item.category;
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
    id,owner,concept:$("recordConcept").value.trim(),amount:Number($("recordAmount").value),date:$("recordDate").value
  };
  if(kind!=="income") item.category=$("recordCategory").value;
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

async function copyPreviousMonth() {
  const destination=currentKey(), source=previousMonthKey(destination);
  if(!state.months[source]) return alert("El mes anterior no tiene presupuesto registrado.");
  if(!confirm("¿Copiar ingresos y gastos fijos del mes anterior?")) return;
  const target=ensureMonth(state,destination);
  ["elber","mayra"].forEach(person=>{
    target[person].incomes=state.months[source][person].incomes.map(item=>({...item,id:uid(),date:today()}));
    target[person].fixed=state.months[source][person].fixed.map(item=>({...item,id:uid(),paid:false,date:today()}));
  });
  renderAll();await persist();
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
  $("copyPreviousBtn").addEventListener("click",copyPreviousMonth);
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
      state=remoteState;
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
