import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from "./utils.js";

export function createEmptyState() {
  return {
    months:{},
    loans:[],
    schoolPensions:[],
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

export function getProfileData(state, key, profile) {
  const month = ensureMonth(state,key);
  if (profile === "general") {
    return {
      incomes:[...month.elber.incomes,...month.mayra.incomes],
      fixed:[...month.elber.fixed,...month.mayra.fixed],
      variable:[...month.elber.variable,...month.mayra.variable]
    };
  }
  return month[profile];
}

const sum = (rows,field) => rows.reduce((total,item)=>total+Number(item[field]||0),0);
const sumRealized = rows => rows.filter(item=>item.realized).reduce((total,item)=>total+Number(item.actualAmount||0),0);

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
