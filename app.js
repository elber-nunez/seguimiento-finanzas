const KEY = "finanzas_elber_mayra_v2";
const OLD_KEY = "mis_finanzas_mobile_v1";
const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const NAMES = {general:"General", elber:"Elber", mayra:"Mayra"};
const CATEGORIES = {
  income:["Sueldo","Ingresos extra","Gratificación / CTS","Otros ingresos"],
  expense:["Alimentación","Frutas","Transporte","Salidas","Mascotas","Servicios del hogar","Combustible / GNV","Gastos extras","Streaming","Celulares","Internet","Deudas / cuotas","Familia","Regalos","Educación","Ahorro / inversión","Salud","Otros"]
};

let state = loadState();
let selectedProfile = state.ui?.selectedProfile || "elber";
let entryType = "expense";

function defaultState(){
  return {
    settings:{currentUser:"elber",savingPercent:20,initialBalances:{elber:2750,mayra:0}},
    entries:[],
    ui:{selectedProfile:"elber"}
  };
}

function loadState(){
  try{
    const current = JSON.parse(localStorage.getItem(KEY));
    if(current) return normalizeState(current);

    const old = JSON.parse(localStorage.getItem(OLD_KEY));
    if(old){
      const migrated = defaultState();
      migrated.settings.savingPercent = old.settings?.savingPercent ?? 20;
      migrated.settings.initialBalances.elber = old.settings?.initialBalance ?? 2750;
      migrated.entries = (old.entries || []).map(e => ({...e, owner:"elber", createdBy:"elber"}));
      localStorage.setItem(KEY,JSON.stringify(migrated));
      return migrated;
    }
  }catch(error){ console.warn("No se pudieron cargar los datos", error); }
  return defaultState();
}

function normalizeState(value){
  const base = defaultState();
  return {
    settings:{
      currentUser:value.settings?.currentUser || base.settings.currentUser,
      savingPercent:Number(value.settings?.savingPercent ?? base.settings.savingPercent),
      initialBalances:{
        elber:Number(value.settings?.initialBalances?.elber ?? 2750),
        mayra:Number(value.settings?.initialBalances?.mayra ?? 0)
      }
    },
    entries:(value.entries || []).map(e=>({...e,owner:e.owner || "elber",createdBy:e.createdBy || e.owner || "elber"})),
    ui:{selectedProfile:value.ui?.selectedProfile || "elber"}
  };
}

function saveState(){
  state.ui.selectedProfile = selectedProfile;
  localStorage.setItem(KEY,JSON.stringify(state));
  renderAll();
}

const $ = id => document.getElementById(id);
const money = value => new Intl.NumberFormat("es-PE",{style:"currency",currency:"PEN"}).format(Number(value || 0));
const escapeHtml = (value="") => String(value).replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
const formatDate = value => new Date(value+"T00:00:00").toLocaleDateString("es-PE",{day:"2-digit",month:"short"});

function selectedPeriod(){
  return {month:Number($("monthPicker").value),year:Number($("yearPicker").value)};
}

function periodEntries(profile=selectedProfile){
  const period=selectedPeriod();
  return state.entries.filter(entry=>{
    const date=new Date(entry.date+"T00:00:00");
    const correctPeriod=date.getMonth()===period.month && date.getFullYear()===period.year;
    const correctProfile=profile==="general" || entry.owner===profile;
    return correctPeriod && correctProfile;
  });
}

function totals(profile=selectedProfile){
  const entries=periodEntries(profile);
  const sum=(type,key)=>entries.filter(e=>e.type===type).reduce((acc,e)=>acc+Number(e[key]||0),0);
  return {
    incomePlanned:sum("income","planned"), incomeActual:sum("income","actual"),
    expensePlanned:sum("expense","planned"), expenseActual:sum("expense","actual")
  };
}

function initialBalance(profile=selectedProfile){
  if(profile==="general") return state.settings.initialBalances.elber + state.settings.initialBalances.mayra;
  return state.settings.initialBalances[profile] || 0;
}

function initPickers(){
  const now=new Date();
  $("monthPicker").innerHTML=MONTHS.map((month,index)=>`<option value="${index}">${month}</option>`).join("");
  $("monthPicker").value=now.getMonth();

  const years=[];
  for(let year=now.getFullYear()-3;year<=now.getFullYear()+3;year++) years.push(`<option value="${year}">${year}</option>`);
  $("yearPicker").innerHTML=years.join("");
  $("yearPicker").value=now.getFullYear();

  $("monthPicker").onchange=renderAll;
  $("yearPicker").onchange=renderAll;
}

function selectProfile(profile){
  selectedProfile=profile;
  document.querySelectorAll("[data-profile]").forEach(button=>button.classList.toggle("active",button.dataset.profile===profile));
  renderAll();
}

function renderAll(){
  renderHeader();
  renderDashboard();
  renderMovements();
  renderBudgets();
  renderSettings();
}

function renderHeader(){
  const label=NAMES[selectedProfile];
  $("welcomeText").textContent=selectedProfile==="general" ? "Resumen conjunto de Elber y Mayra" : `Resumen de ${label}`;
  $("heroLabel").textContent=selectedProfile==="general" ? "Disponible general al cierre del mes" : `Disponible de ${label} al cierre del mes`;
  document.querySelectorAll("[data-profile]").forEach(button=>button.classList.toggle("active",button.dataset.profile===selectedProfile));
}

function renderDashboard(){
  const data=totals();
  const result=data.incomeActual-data.expenseActual;
  const balance=initialBalance()+result;
  const margin=data.incomeActual ? result/data.incomeActual*100 : 0;
  const savingGoal=data.incomeActual*state.settings.savingPercent/100;

  $("balanceValue").textContent=money(balance);
  $("balanceStatus").textContent=result>=0 ? "Presupuesto saludable" : "Gastos mayores que ingresos";
  $("balanceStatus").className=`status ${result>=0?"good":"bad"}`;

  $("incomeReal").textContent=money(data.incomeActual);
  $("incomePlan").textContent=`Previsto: ${money(data.incomePlanned)}`;
  $("expenseReal").textContent=money(data.expenseActual);
  $("expensePlan").textContent=`Previsto: ${money(data.expensePlanned)}`;
  $("resultValue").textContent=money(result);
  $("resultValue").style.color=result>=0?"var(--green)":"var(--red)";
  $("marginValue").textContent=`${margin.toFixed(1)}%`;
  $("savingGoalStatus").textContent=result>=savingGoal ? `Meta de ${state.settings.savingPercent}% alcanzada` : `Meta: ${money(savingGoal)}`;

  const pct=data.expensePlanned ? data.expenseActual/data.expensePlanned*100 : 0;
  $("budgetPct").textContent=`${pct.toFixed(0)}%`;
  $("budgetBar").style.width=`${Math.min(100,pct)}%`;
  $("budgetBar").style.background=pct>100?"var(--red)":"var(--orange)";
  $("budgetText").textContent=!data.expensePlanned
    ? "Aún no hay presupuesto de gastos."
    : pct>100
      ? `Se excedió el presupuesto en ${money(data.expenseActual-data.expensePlanned)}.`
      : `Quedan ${money(data.expensePlanned-data.expenseActual)} del presupuesto previsto.`;

  $("comparisonCard").style.display=selectedProfile==="general"?"block":"none";
  if(selectedProfile==="general") renderComparison();
  renderRecent();
}

function renderComparison(){
  const elber=totals("elber"), mayra=totals("mayra");
  const er=elber.incomeActual-elber.expenseActual, mr=mayra.incomeActual-mayra.expenseActual;
  $("elberResult").textContent=money(er);
  $("elberResult").style.color=er>=0?"var(--green)":"var(--red)";
  $("elberSummary").textContent=`Ingresos ${money(elber.incomeActual)} · Gastos ${money(elber.expenseActual)}`;
  $("mayraResult").textContent=money(mr);
  $("mayraResult").style.color=mr>=0?"var(--green)":"var(--red)";
  $("mayraSummary").textContent=`Ingresos ${money(mayra.incomeActual)} · Gastos ${money(mayra.expenseActual)}`;
}

function movementHTML(entry){
  const over=entry.type==="expense" && Number(entry.actual)>Number(entry.planned);
  return `<article class="item" data-edit-id="${entry.id}">
    <div class="item-main">
      <div class="item-title">${escapeHtml(entry.concept)} <span class="owner">${NAMES[entry.owner]}</span></div>
      <div class="item-meta">${escapeHtml(entry.category)} · ${formatDate(entry.date)} ${over?'<span class="badge over">Sobre presupuesto</span>':""}</div>
    </div>
    <div class="amount ${entry.type}">${entry.type==="income"?"+":"-"} ${money(entry.actual)}</div>
  </article>`;
}

function renderRecent(){
  const entries=[...periodEntries()].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5);
  $("recentList").innerHTML=entries.length ? entries.map(movementHTML).join("") : '<div class="empty">Aún no hay movimientos este mes.</div>';
  bindEditEvents($("recentList"));
}

function renderMovements(){
  let entries=[...periodEntries()].sort((a,b)=>b.date.localeCompare(a.date));
  const filter=$("typeFilter").value;
  if(filter!=="all") entries=entries.filter(entry=>entry.type===filter);
  $("movementList").innerHTML=entries.length ? entries.map(movementHTML).join("") : '<div class="empty">No hay movimientos para esta vista.</div>';
  bindEditEvents($("movementList"));
}

function bindEditEvents(container){
  container.querySelectorAll("[data-edit-id]").forEach(item=>item.onclick=()=>editEntry(item.dataset.editId));
}

function renderBudgets(){
  const expenses=periodEntries().filter(entry=>entry.type==="expense");
  const categories={};
  expenses.forEach(entry=>{
    categories[entry.category] ||= {planned:0,actual:0};
    categories[entry.category].planned += Number(entry.planned||0);
    categories[entry.category].actual += Number(entry.actual||0);
  });

  const list=Object.entries(categories).sort((a,b)=>b[1].actual-a[1].actual);
  $("categoryBudgetList").innerHTML=list.length ? list.map(([category,values])=>{
    const pct=values.planned ? values.actual/values.planned*100 : 0;
    return `<article class="card">
      <div class="row-between"><strong>${escapeHtml(category)}</strong><span class="badge ${pct>100?"over":"ok"}">${pct.toFixed(0)}%</span></div>
      <small>Real ${money(values.actual)} · Previsto ${money(values.planned)}</small>
      <div class="progress"><span style="width:${Math.min(100,pct)}%;background:${pct>100?"var(--red)":"var(--green)"}"></span></div>
    </article>`;
  }).join("") : '<div class="empty">Registra gastos para ver el presupuesto por categoría.</div>';
}

function renderSettings(){
  $("currentUserInput").value=state.settings.currentUser;
  $("elberInitialInput").value=state.settings.initialBalances.elber;
  $("mayraInitialInput").value=state.settings.initialBalances.mayra;
  $("savingPercentInput").value=state.settings.savingPercent;
}

function setType(type){
  entryType=type;
  $("incomeType").classList.toggle("active",type==="income");
  $("expenseType").classList.toggle("active",type==="expense");
  $("entryCategory").innerHTML=CATEGORIES[type].map(category=>`<option>${category}</option>`).join("");
}

function resetForm(){
  $("formTitle").textContent="Nuevo movimiento";
  $("entryId").value="";
  $("entryOwner").value=selectedProfile==="general" ? state.settings.currentUser : selectedProfile;
  $("entryDate").value=new Date().toISOString().slice(0,10);
  $("entryConcept").value="";
  $("entryPlanned").value="";
  $("entryActual").value="";
  $("entryNote").value="";
  $("deleteEntryBtn").style.display="none";
  setType("expense");
}

function openModal(){
  resetForm();
  $("entryModal").classList.add("open");
}

function closeModal(){
  $("entryModal").classList.remove("open");
}

function editEntry(id){
  const entry=state.entries.find(item=>item.id===id);
  if(!entry) return;
  resetForm();
  $("formTitle").textContent="Editar movimiento";
  $("entryId").value=entry.id;
  $("entryOwner").value=entry.owner;
  setType(entry.type);
  $("entryDate").value=entry.date;
  $("entryCategory").value=entry.category;
  $("entryConcept").value=entry.concept;
  $("entryPlanned").value=entry.planned;
  $("entryActual").value=entry.actual;
  $("entryNote").value=entry.note||"";
  $("deleteEntryBtn").style.display="block";
  $("entryModal").classList.add("open");
}

function seedData(){
  const {year,month}=selectedPeriod();
  const date=day=>new Date(year,month,day,12).toISOString().slice(0,10);
  const rows=[
    ["elber","income","Sueldo","Sueldo mensual",2980,2980],
    ["elber","expense","Alimentación","Gastos comida",300,300],
    ["elber","expense","Frutas","Gastos fruta",50,80],
    ["elber","expense","Combustible / GNV","GNV",670,670],
    ["elber","expense","Deudas / cuotas","Cuota mensual",230,230],
    ["mayra","income","Sueldo","Sueldo mensual",2500,2500],
    ["mayra","expense","Alimentación","Compras del hogar",350,320],
    ["mayra","expense","Transporte","Pasajes",120,110],
    ["mayra","expense","Celulares","Línea celular",66,66],
    ["mayra","expense","Familia","Apoyo familiar",300,300]
  ];
  rows.forEach((row,index)=>state.entries.push({
    id:crypto.randomUUID(),owner:row[0],createdBy:state.settings.currentUser,date:date(Math.min(index+1,28)),
    type:row[1],category:row[2],concept:row[3],planned:row[4],actual:row[5],note:"Ejemplo editable"
  }));
  saveState();
}

function exportData(){
  const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"});
  const link=document.createElement("a");
  link.href=URL.createObjectURL(blob);
  link.download="respaldo-finanzas-elber-mayra.json";
  link.click();
  URL.revokeObjectURL(link.href);
}

document.querySelectorAll("[data-profile]").forEach(button=>button.onclick=()=>selectProfile(button.dataset.profile));

document.querySelectorAll("[data-page]").forEach(button=>button.onclick=()=>{
  document.querySelectorAll(".page").forEach(page=>page.classList.remove("active"));
  $(button.dataset.page).classList.add("active");
  document.querySelectorAll(".bottom-nav button").forEach(nav=>nav.classList.toggle("active",nav.dataset.page===button.dataset.page));
  window.scrollTo({top:0,behavior:"smooth"});
});

$("fab").onclick=openModal;
$("entryModal").onclick=event=>{if(event.target===$("entryModal")) closeModal();};
$("incomeType").onclick=()=>setType("income");
$("expenseType").onclick=()=>setType("expense");
$("typeFilter").onchange=renderMovements;
$("exportBtn").onclick=exportData;

$("entryForm").onsubmit=event=>{
  event.preventDefault();
  const id=$("entryId").value || crypto.randomUUID();
  const entry={
    id,
    owner:$("entryOwner").value,
    createdBy:state.settings.currentUser,
    date:$("entryDate").value,
    type:entryType,
    category:$("entryCategory").value,
    concept:$("entryConcept").value.trim(),
    planned:Number($("entryPlanned").value),
    actual:Number($("entryActual").value),
    note:$("entryNote").value.trim()
  };
  const index=state.entries.findIndex(item=>item.id===id);
  if(index>=0) entry.createdBy=state.entries[index].createdBy || state.settings.currentUser;
  if(index>=0) state.entries[index]=entry; else state.entries.push(entry);
  saveState();
  closeModal();
};

$("deleteEntryBtn").onclick=()=>{
  const id=$("entryId").value;
  if(confirm("¿Eliminar este movimiento?")){
    state.entries=state.entries.filter(entry=>entry.id!==id);
    saveState();
    closeModal();
  }
};

$("currentUserInput").onchange=event=>{state.settings.currentUser=event.target.value;saveState();};
$("elberInitialInput").onchange=event=>{state.settings.initialBalances.elber=Number(event.target.value);saveState();};
$("mayraInitialInput").onchange=event=>{state.settings.initialBalances.mayra=Number(event.target.value);saveState();};
$("savingPercentInput").onchange=event=>{state.settings.savingPercent=Number(event.target.value);saveState();};
$("seedBtn").onclick=()=>{if(confirm("¿Cargar datos de ejemplo para el mes seleccionado?")) seedData();};
$("clearBtn").onclick=()=>{if(confirm("¿Borrar todos los datos guardados en este navegador?")){state=defaultState();selectedProfile="elber";saveState();}};

initPickers();
selectProfile(selectedProfile);
