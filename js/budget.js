import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from "./utils.js";

export function createEmptyState() {
  return {
    months:{},
    loans:[],
    schoolPensions:[],
    monthClosures:{},
    carryoverControls:{},
    ui:{ selectedProfile:"general" },
    settings:{
      categories:{
        income:[...DEFAULT_INCOME_CATEGORIES],
        expense:[...DEFAULT_EXPENSE_CATEGORIES]
      }
    }
  };
}

function migrateRecord(item, kind) {
  if (item.plannedAmount !== undefined) {
    item.plannedAmount = Number(item.plannedAmount || 0);
    item.actualAmount = Number(item.actualAmount || 0);
    item.realized = Boolean(item.realized);
    return item;
  }

  const legacyAmount = Number(item.amount || 0);
  item.plannedAmount = legacyAmount;

  if (kind === "income") {
    item.realized = true;
    item.actualAmount = legacyAmount;
  } else if (kind === "fixed") {
    item.realized = Boolean(item.paid);
    item.actualAmount = item.realized ? legacyAmount : 0;
  } else {
    // En versiones anteriores los variables se consideraban realizados al crearse.
    item.realized = true;
    item.actualAmount = legacyAmount;
  }

  delete item.amount;
  delete item.paid;
  return item;
}

export function normalizeState(state) {
  const normalized = state || createEmptyState();
  normalized.months ||= {};
  normalized.loans ||= [];
  normalized.schoolPensions ||= [];
  normalized.monthClosures ||= {};
  normalized.carryoverControls ||= {};
  normalized.ui ||= { selectedProfile:"general" };
  normalized.settings ||= {};
  normalized.settings.categories ||= {};
  normalized.settings.categories.income =
    Array.isArray(normalized.settings.categories.income) && normalized.settings.categories.income.length
      ? normalized.settings.categories.income
      : [...DEFAULT_INCOME_CATEGORIES];
  normalized.settings.categories.expense =
    Array.isArray(normalized.settings.categories.expense) && normalized.settings.categories.expense.length
      ? normalized.settings.categories.expense
      : [...DEFAULT_EXPENSE_CATEGORIES];

  if (!normalized.settings.categories.income.includes("Saldo anterior")) normalized.settings.categories.income.unshift("Saldo anterior");
  if (!normalized.settings.categories.income.includes("Préstamo")) normalized.settings.categories.income.unshift("Préstamo");
  if (!normalized.settings.categories.expense.includes("Préstamo")) normalized.settings.categories.expense.unshift("Préstamo");
  if (!normalized.settings.categories.expense.includes("Pensión escolar")) normalized.settings.categories.expense.unshift("Pensión escolar");

  Object.values(normalized.months).forEach(month => {
    ["elber","mayra"].forEach(person => {
      month[person] ||= { incomes:[], fixed:[], variable:[] };
      month[person].incomes ||= [];
      month[person].fixed ||= [];
      month[person].variable ||= [];

      month[person].incomes = month[person].incomes.map(item => {
        item.category ||= "Sueldo";
        return migrateRecord(item,"income");
      });
      month[person].fixed = month[person].fixed.map(item => migrateRecord(item,"fixed"));
      month[person].variable = month[person].variable.map(item => migrateRecord(item,"variable"));
    });
  });
  return normalized;
}

export function ensureMonth(state, key) {
  if (!state.months[key]) {
    state.months[key] = {
      elber:{ incomes:[], fixed:[], variable:[] },
      mayra:{ incomes:[], fixed:[], variable:[] }
    };
  }
  return state.months[key];
}

function rawProfileData(state,key,profile) {
  const month = state.months?.[key];
  const result = { incomes:[], fixed:[], variable:[] };
  if(!month) return result;

  const owners = profile === "general" ? ["elber","mayra"] : [profile];
  owners.forEach(owner => {
    result.incomes.push(...(month[owner]?.incomes || []).map(item=>({...item,periodKey:key})));
    result.fixed.push(...(month[owner]?.fixed || []).map(item=>({...item,periodKey:key})));
    result.variable.push(...(month[owner]?.variable || []).map(item=>({...item,periodKey:key})));
  });
  return result;
}

const sum = (rows,field) => rows.reduce((total,item)=>total+Number(item[field]||0),0);
const sumRealized = rows => rows.filter(item=>item.realized).reduce((total,item)=>total+Number(item.actualAmount||0),0);

function previousKey(key) {
  const [year,month] = key.split("-").map(Number);
  const date = new Date(year,month-2,1);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}`;
}

function monthLabel(key) {
  const names=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  return names[Number(key.slice(5,7))-1];
}

function closingBalance(state,key,profile) {
  const closure=state.monthClosures?.[key];
  if(closure?.closed && closure.snapshot?.[profile]){
    return Number(closure.snapshot[profile].available||0);
  }

  const data=rawProfileData(state,key,profile);
  const incomeActual=sumRealized(data.incomes);
  const fixedActual=sumRealized(data.fixed);
  const variableActual=sumRealized(data.variable);
  return incomeActual-fixedActual-variableActual;
}

export function carryoverAmount(state,key,profile) {
  const priorKey=previousKey(key);
  if(!state.months?.[priorKey]) return 0;
  return Math.max(0,closingBalance(state,priorKey,profile));
}

function carryoverControlKey(key,owner) {
  return `${key}|${owner}`;
}

export function canGenerateCarryoverForMonth(key,now=new Date()) {
  const [year,month]=key.split("-").map(Number);
  const targetValue=year*100+month;
  const currentValue=now.getFullYear()*100+(now.getMonth()+1);
  return targetValue<=currentValue;
}

export function syncCarryoverForMonth(state,key,owner,now=new Date()) {
  if(!canGenerateCarryoverForMonth(key,now)) return false;

  state.carryoverControls ||= {};
  const control=state.carryoverControls[carryoverControlKey(key,owner)];
  if(control==="suppressed" || control==="manual") return false;

  const month=ensureMonth(state,key);
  const incomes=month[owner].incomes;
  const existing=incomes.find(item=>item.sourceType==="carryover");
  const amount=carryoverAmount(state,key,owner);
  const priorKey=previousKey(key);

  if(amount<=0){
    if(existing){
      month[owner].incomes=incomes.filter(item=>item.id!==existing.id);
      return true;
    }
    return false;
  }

  const nextRecord={
    id:existing?.id || `carryover-${owner}-${key}`,
    owner,
    concept:`Saldo restante de ${monthLabel(priorKey)}`,
    category:"Saldo anterior",
    plannedAmount:amount,
    actualAmount:amount,
    realized:true,
    date:`${key}-01`,
    sourceType:"carryover",
    generatedAutomatically:true
  };

  if(!existing){
    incomes.unshift(nextRecord);
    return true;
  }

  const changed=
    Number(existing.plannedAmount||0)!==amount ||
    Number(existing.actualAmount||0)!==amount ||
    existing.concept!==nextRecord.concept ||
    existing.category!=="Saldo anterior" ||
    existing.realized!==true;

  if(changed) Object.assign(existing,nextRecord);
  return changed;
}

export function suppressCarryover(state,key,owner) {
  state.carryoverControls ||= {};
  state.carryoverControls[carryoverControlKey(key,owner)]="suppressed";
}

export function markCarryoverManual(state,key,owner) {
  state.carryoverControls ||= {};
  state.carryoverControls[carryoverControlKey(key,owner)]="manual";
}

export function clearCarryoverControl(state,key,owner) {
  state.carryoverControls ||= {};
  delete state.carryoverControls[carryoverControlKey(key,owner)];
}

export function getProfileData(state, keyOrKeys, profile) {
  const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
  const result = { incomes:[], fixed:[], variable:[] };

  keys.filter(Boolean).forEach((key,index) => {
    const data=rawProfileData(state,key,profile);

    // En vistas de varios meses, el saldo anterior solo se cuenta en el
    // primer mes seleccionado. Así no se duplica como ingreso cada mes.
    const incomes=index===0
      ? data.incomes
      : data.incomes.filter(item=>item.sourceType!=="carryover");

    result.incomes.push(...incomes);
    result.fixed.push(...data.fixed);
    result.variable.push(...data.variable);
  });

  return result;
}

export function calculateTotals(state,key,profile) {
  const data = getProfileData(state,key,profile);

  const incomePlanned = sum(data.incomes,"plannedAmount");
  const incomeActual = sumRealized(data.incomes);

  const fixedPlanned = sum(data.fixed,"plannedAmount");
  const fixedActual = sumRealized(data.fixed);

  const variablePlanned = sum(data.variable,"plannedAmount");
  const variableActual = sumRealized(data.variable);

  const expensePlanned = fixedPlanned + variablePlanned;
  const expenseActual = fixedActual + variableActual;
  const pendingExpenses = data.fixed.concat(data.variable)
    .filter(item=>!item.realized)
    .reduce((total,item)=>total+Number(item.plannedAmount||0),0);

  const expected = incomePlanned - expensePlanned;
  const available = incomeActual - expenseActual;

  return {
    incomePlanned,incomeActual,
    fixedPlanned,fixedActual,
    variablePlanned,variableActual,
    expensePlanned,expenseActual,
    pendingExpenses,
    expected,available,
    variance:available-expected
  };
}

export function getHistory(state,key,profile) {
  const data = getProfileData(state,key,profile);
  return [
    ...data.incomes.filter(item=>item.realized).map(item=>({...item,type:"income",kind:"income"})),
    ...data.fixed.filter(item=>item.realized).map(item=>({...item,type:"expense",kind:"fixed"})),
    ...data.variable.filter(item=>item.realized).map(item=>({...item,type:"expense",kind:"variable"}))
  ].sort((a,b)=>(b.date||"").localeCompare(a.date||""));
}

export function previousMonthKey(key) {
  const [year,month] = key.split("-").map(Number);
  const date = new Date(year,month-2,1);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}`;
}
