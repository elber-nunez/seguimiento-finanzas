const STORAGE_KEY = "finanzas_elber_mayra_v3";
const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const NAMES = {general:"General", elber:"Elber", mayra:"Mayra"};
const EXPENSE_CATEGORIES = ["Alimentación","Frutas","Transporte","Servicios del hogar","Internet","Luz","Agua","Celulares","Mascotas","Combustible / GNV","Deudas / cuotas","Salidas","Streaming","Familia","Educación","Salud","Otros"];

let state = loadState();
let selectedProfile = state.ui.selectedProfile || "elber";

const $ = id => document.getElementById(id);
const money = value => new Intl.NumberFormat("es-PE",{style:"currency",currency:"PEN"}).format(Number(value || 0));
const escapeHtml = (value="") => String(value).replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));

function defaultState(){
  return {
    settings:{currentUser:"elber"},
    months:{},
    ui:{selectedProfile:"elber"}
  };
}

function loadState(){
  try{
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if(saved) return saved;
  }catch(error){ console.warn(error); }
  return defaultState();
}

function saveState(){
  state.ui.selectedProfile = selectedProfile;
  localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
  renderAll();
}

function periodKey(){
  return `${$("yearPicker").value}-${String(Number($("monthPicker").value)+1).padStart(2,"0")}`;
}

function ensureMonth(){
  const key = periodKey();
  if(!state.months[key]){
    state.months[key] = {
      elber:{incomes:[],expenses:[]},
      mayra:{incomes:[],expenses:[]}
    };
  }
  return state.months[key];
}

function profileData(profile){
  const month = ensureMonth();
  if(profile === "general"){
    return {
      incomes:[...month.elber.incomes,...month.mayra.incomes],
      expenses:[...month.elber.expenses,...month.mayra.expenses]
    };
  }
  return month[profile];
}

function totals(profile=selectedProfile){
  const data = profileData(profile);
  const totalIncome = data.incomes.reduce((sum,item)=>sum+Number(item.amount||0),0);
  const plannedExpenses = data.expenses.reduce((sum,item)=>sum+Number(item.amount||0),0);
  const paidExpenses = data.expenses.filter(item=>item.paid).reduce((sum,item)=>sum+Number(item.amount||0),0);
  return {
    totalIncome,
    plannedExpenses,
    paidExpenses,
    currentAvailable: totalIncome-paidExpenses,
    expectedBalance: totalIncome-plannedExpenses,
    paidCount:data.expenses.filter(item=>item.paid).length,
    expenseCount:data.expenses.length,
    incomeCount:data.incomes.length
  };
}

function init(){
  const now = new Date();
  $("monthPicker").innerHTML = MONTHS.map((month,index)=>`<option value="${index}">${month}</option>`).join("");
  $("monthPicker").value = now.getMonth();

  const years=[];
  for(let year=now.getFullYear()-2;year<=now.getFullYear()+2;year++) years.push(`<option value="${year}">${year}</option>`);
  $("yearPicker").innerHTML = years.join("");
  $("yearPicker").value = now.getFullYear();

  const categoryOptions = EXPENSE_CATEGORIES.map(category=>`<option>${category}</option>`).join("");
  $("expenseCategory").innerHTML = categoryOptions;
  $("extraCategory").innerHTML = categoryOptions;

  $("profileSelect").value = selectedProfile;
  $("currentUserInput").value = state.settings.currentUser;

  $("monthPicker").onchange = renderAll;
  $("yearPicker").onchange = renderAll;
  $("profileSelect").onchange = event => {
    selectedProfile = event.target.value;
    saveState();
  };

  bindNavigation();
  bindForms();
  renderAll();
}

function renderAll(){
  ensureMonth();
  renderHeader();
  renderSummary();
  renderDashboardCharts();
  renderExpenses();
  renderIncomes();
  renderHistory();
  $("currentUserInput").value = state.settings.currentUser;
}

function renderHeader(){
  $("profileSelect").value = selectedProfile;
  $("periodText").textContent = `${MONTHS[Number($("monthPicker").value)]} ${$("yearPicker").value}`;
}

function renderSummary(){
  const data = totals();
  $("currentAvailable").textContent = money(data.currentAvailable);
  $("totalIncome").textContent = money(data.totalIncome);
  $("plannedExpenses").textContent = money(data.plannedExpenses);
  $("paidExpenses").textContent = money(data.paidExpenses);
  $("expectedBalance").textContent = money(data.expectedBalance);

  $("incomeCount").textContent = `${data.incomeCount} ingreso${data.incomeCount===1?"":"s"} registrado${data.incomeCount===1?"":"s"}`;
  $("plannedCount").textContent = `${data.expenseCount} gasto${data.expenseCount===1?"":"s"} mensual${data.expenseCount===1?"":"es"}`;
  $("paidCount").textContent = `${data.paidCount} gasto${data.paidCount===1?"":"s"} marcado${data.paidCount===1?"":"s"}`;

  const healthy = data.currentAvailable >= 0;
  $("currentStatus").textContent = healthy ? "Aún tienes saldo disponible" : "Tus gastos superaron tus ingresos";
  $("currentStatus").className = `status ${healthy ? "good" : "bad"}`;
  $("currentAvailable").style.color = healthy ? "#fff" : "#fecaca";
  $("expectedBalance").style.color = data.expectedBalance >= 0 ? "var(--green)" : "var(--red)";

  const pct = data.plannedExpenses ? (data.paidExpenses/data.plannedExpenses)*100 : 0;
  $("expenseProgressPct").textContent = `${pct.toFixed(0)}%`;
  $("expenseProgressBar").style.width = `${Math.min(100,pct)}%`;
  $("expenseProgressBar").style.background = pct > 100 ? "var(--red)" : "var(--orange)";
  $("expenseProgressText").textContent = data.plannedExpenses
    ? `Has gastado ${money(data.paidExpenses)} de ${money(data.plannedExpenses)} planificados.`
    : "Aún no has registrado gastos mensuales.";

  $("generalComparison").style.display = selectedProfile === "general" ? "block" : "none";
  if(selectedProfile === "general"){
    const elber = totals("elber");
    const mayra = totals("mayra");
    $("elberAvailable").textContent = money(elber.currentAvailable);
    $("elberAvailable").style.color = elber.currentAvailable>=0 ? "var(--green)" : "var(--red)";
    $("elberDetail").textContent = `Ingresos ${money(elber.totalIncome)} · Gastado ${money(elber.paidExpenses)}`;
    $("mayraAvailable").textContent = money(mayra.currentAvailable);
    $("mayraAvailable").style.color = mayra.currentAvailable>=0 ? "var(--green)" : "var(--red)";
    $("mayraDetail").textContent = `Ingresos ${money(mayra.totalIncome)} · Gastado ${money(mayra.paidExpenses)}`;
  }
}

function expenseRow(item){
  return `<article class="check-item ${item.paid?"paid":""}">
    <input type="checkbox" data-toggle-expense="${item.id}" data-owner="${item.owner}" ${item.paid?"checked":""} aria-label="Marcar gasto">
    <div class="check-main" data-edit-expense="${item.id}" data-owner="${item.owner}">
      <div class="check-title">${escapeHtml(item.concept)} <span class="owner">${NAMES[item.owner]}</span> ${item.extra?'<span class="extra-badge">Particular</span>':""}</div>
      <div class="check-meta">${escapeHtml(item.category)}</div>
    </div>
    <div class="check-amount">${money(item.amount)}</div>
  </article>`;
}


function renderDashboardCharts(){
  const data = totals();
  const values = [
    {label:"Ingresos", value:data.totalIncome, cls:"income"},
    {label:"Gastos previstos", value:data.plannedExpenses, cls:"planned"},
    {label:"Gastos pagados", value:data.paidExpenses, cls:"paid"},
    {label:"Saldo esperado", value:Math.max(0,data.expectedBalance), cls:"expected"}
  ];
  const maxValue = Math.max(...values.map(item=>item.value),1);

  $("summaryBars").innerHTML = values.map(item=>`
    <div class="bar-row">
      <span>${item.label}</span>
      <div class="bar-track"><i class="bar-fill ${item.cls}" style="width:${Math.max(item.value>0?3:0,(item.value/maxValue)*100)}%"></i></div>
      <strong>${money(item.value)}</strong>
    </div>
  `).join("");

  const paidPct = data.plannedExpenses ? Math.min(100,(data.paidExpenses/data.plannedExpenses)*100) : 0;
  $("donutPct").textContent = `${paidPct.toFixed(0)}%`;
  $("budgetDonut").style.background = `conic-gradient(#16a34a 0deg ${paidPct*3.6}deg,#e2e8f0 ${paidPct*3.6}deg 360deg)`;

  const pending = Math.max(0,data.plannedExpenses-data.paidExpenses);
  $("budgetLegend").innerHTML = `
    <div class="legend-row"><i class="legend-dot paid"></i><span>Gastos pagados</span><strong>${money(data.paidExpenses)}</strong></div>
    <div class="legend-row"><i class="legend-dot pending"></i><span>Gastos pendientes</span><strong>${money(pending)}</strong></div>
    <div class="legend-row"><i class="legend-dot balance"></i><span>Saldo esperado</span><strong>${money(data.expectedBalance)}</strong></div>
  `;

  const categoryMap = {};
  profileData(selectedProfile).expenses.forEach(item=>{
    categoryMap[item.category] = (categoryMap[item.category] || 0) + Number(item.amount||0);
  });
  const categories = Object.entries(categoryMap).sort((a,b)=>b[1]-a[1]);
  const maxCategory = categories.length ? categories[0][1] : 1;
  $("categoryBars").innerHTML = categories.length ? categories.map(([name,value])=>`
    <div class="category-row">
      <div class="category-name" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
      <div class="category-track"><span class="category-fill" style="width:${Math.max(3,(value/maxCategory)*100)}%"></span></div>
      <div class="category-value">${money(value)}</div>
    </div>
  `).join("") : '<div class="empty">Agrega gastos para ver la distribución por categoría.</div>';

  $("generalTableCard").style.display = selectedProfile==="general" ? "block" : "none";
  if(selectedProfile==="general"){
    const elber = totals("elber");
    const mayra = totals("mayra");
    const total = totals("general");
    const row = (name,item,isTotal=false) => {
      const pendingAmount = Math.max(0,item.plannedExpenses-item.paidExpenses);
      return `<tr>
        <td>${name}</td>
        <td>${money(item.totalIncome)}</td>
        <td>${money(item.paidExpenses)}</td>
        <td>${money(pendingAmount)}</td>
        <td class="${item.currentAvailable>=0?"value-good":"value-bad"}">${money(item.currentAvailable)}</td>
        <td class="${item.expectedBalance>=0?"value-good":"value-bad"}">${money(item.expectedBalance)}</td>
      </tr>`;
    };
    $("generalSummaryTable").innerHTML = row("Elber",elber)+row("Mayra",mayra)+row("General",total,true);
  }
}

function renderExpenses(){
  const expenses = [...profileData(selectedProfile).expenses].sort((a,b)=>Number(a.paid)-Number(b.paid));
  $("expenseChecklist").innerHTML = expenses.length
    ? expenses.map(expenseRow).join("")
    : '<div class="empty">Aún no hay gastos planificados para este mes.</div>';

  document.querySelectorAll("[data-toggle-expense]").forEach(check=>{
    check.onchange = () => {
      const owner = check.dataset.owner;
      const item = ensureMonth()[owner].expenses.find(expense=>expense.id===check.dataset.toggleExpense);
      if(item){ item.paid = check.checked; saveState(); }
    };
  });

  document.querySelectorAll("[data-edit-expense]").forEach(node=>{
    node.onclick = () => openExpenseModal(node.dataset.editExpense,node.dataset.owner);
  });
}

function incomeRow(item){
  return `<article class="item" data-edit-income="${item.id}" data-owner="${item.owner}">
    <div class="item-main">
      <div class="item-title">${escapeHtml(item.concept)} <span class="owner">${NAMES[item.owner]}</span></div>
      <div class="item-meta">Ingreso mensual</div>
    </div>
    <div class="amount income">+ ${money(item.amount)}</div>
  </article>`;
}

function renderIncomes(){
  const incomes = profileData(selectedProfile).incomes;
  $("incomeList").innerHTML = incomes.length
    ? incomes.map(incomeRow).join("")
    : '<div class="empty">Aún no hay ingresos registrados para este mes.</div>';

  document.querySelectorAll("[data-edit-income]").forEach(node=>{
    node.onclick = () => openIncomeModal(node.dataset.editIncome,node.dataset.owner);
  });
}

function renderHistory(){
  const incomes = profileData(selectedProfile).incomes.map(item=>({...item,type:"income"}));
  const expenses = profileData(selectedProfile).expenses.filter(item=>item.paid).map(item=>({...item,type:"expense"}));
  const history = [...incomes,...expenses];

  $("historyList").innerHTML = history.length ? history.map(item=>`
    <article class="item">
      <div class="item-main">
        <div class="item-title">${escapeHtml(item.concept)} <span class="owner">${NAMES[item.owner]}</span></div>
        <div class="item-meta">${item.type==="income"?"Ingreso":"Gasto realizado"} · ${escapeHtml(item.category||"Ingreso")}</div>
      </div>
      <div class="amount ${item.type}">${item.type==="income"?"+":"-"} ${money(item.amount)}</div>
    </article>
  `).join("") : '<div class="empty">Aún no hay movimientos realizados.</div>';
}

function modalOpen(id){ $(id).classList.add("open"); }
function modalClose(id){ $(id).classList.remove("open"); }

function defaultOwner(){
  return selectedProfile==="general" ? state.settings.currentUser : selectedProfile;
}

function openIncomeModal(id=null,owner=null){
  $("incomeForm").reset();
  $("incomeId").value = id || "";
  $("incomeOwner").value = owner || defaultOwner();
  $("incomeFormTitle").textContent = id ? "Editar ingreso" : "Agregar ingreso";
  $("deleteIncomeBtn").classList.toggle("hidden",!id);

  if(id){
    const item = ensureMonth()[owner].incomes.find(income=>income.id===id);
    if(item){
      $("incomeConcept").value = item.concept;
      $("incomeAmount").value = item.amount;
    }
  }
  modalOpen("incomeModal");
}

function openExpenseModal(id=null,owner=null){
  $("expenseForm").reset();
  $("expenseId").value = id || "";
  $("expenseOwner").value = owner || defaultOwner();
  $("expenseFormTitle").textContent = id ? "Editar gasto mensual" : "Agregar gasto mensual";
  $("deleteExpenseBtn").classList.toggle("hidden",!id);

  if(id){
    const item = ensureMonth()[owner].expenses.find(expense=>expense.id===id);
    if(item){
      $("expenseConcept").value = item.concept;
      $("expenseCategory").value = item.category;
      $("expenseAmount").value = item.amount;
      $("expensePaid").checked = item.paid;
    }
  }
  modalOpen("expenseModal");
}

function bindNavigation(){
  document.querySelectorAll("[data-page]").forEach(button=>{
    button.onclick = () => {
      document.querySelectorAll(".page").forEach(page=>page.classList.remove("active"));
      $(button.dataset.page).classList.add("active");
      document.querySelectorAll(".bottom-nav button").forEach(nav=>nav.classList.toggle("active",nav.dataset.page===button.dataset.page));
      window.scrollTo({top:0,behavior:"smooth"});
    };
  });
}

function bindForms(){
  $("addIncomeBtn").onclick = ()=>openIncomeModal();
  $("addPlannedExpenseBtn").onclick = ()=>openExpenseModal();
  $("fab").onclick = () => {
    $("extraForm").reset();
    $("extraOwner").value = defaultOwner();
    modalOpen("extraModal");
  };

  document.querySelectorAll(".modal").forEach(modal=>{
    modal.onclick = event => { if(event.target===modal) modal.classList.remove("open"); };
  });

  $("incomeForm").onsubmit = event => {
    event.preventDefault();
    const id = $("incomeId").value || crypto.randomUUID();
    const owner = $("incomeOwner").value;

    for(const person of ["elber","mayra"]){
      state.months[periodKey()][person].incomes = state.months[periodKey()][person].incomes.filter(item=>item.id!==id);
    }

    state.months[periodKey()][owner].incomes.push({
      id, owner, concept:$("incomeConcept").value.trim(), amount:Number($("incomeAmount").value)
    });
    saveState();
    modalClose("incomeModal");
  };

  $("expenseForm").onsubmit = event => {
    event.preventDefault();
    const id = $("expenseId").value || crypto.randomUUID();
    const owner = $("expenseOwner").value;

    for(const person of ["elber","mayra"]){
      state.months[periodKey()][person].expenses = state.months[periodKey()][person].expenses.filter(item=>item.id!==id);
    }

    state.months[periodKey()][owner].expenses.push({
      id, owner,
      concept:$("expenseConcept").value.trim(),
      category:$("expenseCategory").value,
      amount:Number($("expenseAmount").value),
      paid:$("expensePaid").checked,
      extra:false
    });
    saveState();
    modalClose("expenseModal");
  };

  $("extraForm").onsubmit = event => {
    event.preventDefault();
    const owner = $("extraOwner").value;
    state.months[periodKey()][owner].expenses.push({
      id:crypto.randomUUID(), owner,
      concept:$("extraConcept").value.trim(),
      category:$("extraCategory").value,
      amount:Number($("extraAmount").value),
      paid:true,
      extra:true
    });
    saveState();
    modalClose("extraModal");
  };

  $("deleteIncomeBtn").onclick = () => {
    const id = $("incomeId").value;
    if(confirm("¿Eliminar este ingreso?")){
      for(const person of ["elber","mayra"]){
        state.months[periodKey()][person].incomes = state.months[periodKey()][person].incomes.filter(item=>item.id!==id);
      }
      saveState();
      modalClose("incomeModal");
    }
  };

  $("deleteExpenseBtn").onclick = () => {
    const id = $("expenseId").value;
    if(confirm("¿Eliminar este gasto?")){
      for(const person of ["elber","mayra"]){
        state.months[periodKey()][person].expenses = state.months[periodKey()][person].expenses.filter(item=>item.id!==id);
      }
      saveState();
      modalClose("expenseModal");
    }
  };

  $("currentUserInput").onchange = event => {
    state.settings.currentUser = event.target.value;
    saveState();
  };

  $("seedBtn").onclick = () => {
    if(!confirm("¿Cargar datos de ejemplo para el mes seleccionado?")) return;
    const month = ensureMonth();
    month.elber = {
      incomes:[
        {id:crypto.randomUUID(),owner:"elber",concept:"Sueldo",amount:2980},
        {id:crypto.randomUUID(),owner:"elber",concept:"Trabajo externo",amount:1500}
      ],
      expenses:[
        {id:crypto.randomUUID(),owner:"elber",concept:"Gastos comida",category:"Alimentación",amount:300,paid:false,extra:false},
        {id:crypto.randomUUID(),owner:"elber",concept:"Frutas",category:"Frutas",amount:50,paid:false,extra:false},
        {id:crypto.randomUUID(),owner:"elber",concept:"Internet",category:"Internet",amount:60,paid:true,extra:false},
        {id:crypto.randomUUID(),owner:"elber",concept:"GNV",category:"Combustible / GNV",amount:670,paid:false,extra:false},
        {id:crypto.randomUUID(),owner:"elber",concept:"Comida del perro",category:"Mascotas",amount:70,paid:false,extra:false}
      ]
    };
    month.mayra = {
      incomes:[
        {id:crypto.randomUUID(),owner:"mayra",concept:"Sueldo",amount:2500}
      ],
      expenses:[
        {id:crypto.randomUUID(),owner:"mayra",concept:"Agua",category:"Agua",amount:80,paid:true,extra:false},
        {id:crypto.randomUUID(),owner:"mayra",concept:"Celular",category:"Celulares",amount:66,paid:false,extra:false},
        {id:crypto.randomUUID(),owner:"mayra",concept:"Comida",category:"Alimentación",amount:350,paid:false,extra:false}
      ]
    };
    saveState();
  };

  $("clearBtn").onclick = () => {
    if(confirm("¿Borrar todos los datos guardados en este navegador?")){
      state = defaultState();
      selectedProfile = "elber";
      localStorage.removeItem(STORAGE_KEY);
      saveState();
    }
  };

  $("exportBtn").onclick = () => {
    const blob = new Blob([JSON.stringify(state,null,2)],{type:"application/json"});
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "respaldo-finanzas-elber-mayra.json";
    link.click();
    URL.revokeObjectURL(link.href);
  };
}

init();
