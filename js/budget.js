import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from "./utils.js";

export function createEmptyState() {
  return {
    months:{},
    ui:{ selectedProfile:"general" },
    settings:{
      categories:{
        income:[...DEFAULT_INCOME_CATEGORIES],
        expense:[...DEFAULT_EXPENSE_CATEGORIES]
      }
    }
  };
}

export function normalizeState(state) {
  const normalized = state || createEmptyState();
  normalized.months ||= {};
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

  Object.values(normalized.months).forEach(month => {
    ["elber","mayra"].forEach(person => {
      month[person] ||= { incomes:[], fixed:[], variable:[] };
      month[person].incomes ||= [];
      month[person].fixed ||= [];
      month[person].variable ||= [];
      month[person].incomes.forEach(item => item.category ||= "Sueldo");
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

export function calculateTotals(state,key,profile) {
  const data = getProfileData(state,key,profile);
  const income = data.incomes.reduce((sum,item)=>sum+Number(item.amount||0),0);
  const fixedPlanned = data.fixed.reduce((sum,item)=>sum+Number(item.amount||0),0);
  const fixedPaid = data.fixed.filter(item=>item.paid).reduce((sum,item)=>sum+Number(item.amount||0),0);
  const variable = data.variable.reduce((sum,item)=>sum+Number(item.amount||0),0);
  const paid = fixedPaid + variable;
  const pending = Math.max(0,fixedPlanned-fixedPaid);
  return {
    income,fixedPlanned,fixedPaid,variable,paid,pending,
    available:income-paid,
    expected:income-fixedPlanned-variable
  };
}

export function getHistory(state,key,profile) {
  const data = getProfileData(state,key,profile);
  return [
    ...data.incomes.map(item=>({...item,type:"income",category:item.category || "Sueldo"})),
    ...data.fixed.filter(item=>item.paid).map(item=>({...item,type:"expense",kind:"fixed"})),
    ...data.variable.map(item=>({...item,type:"expense",kind:"variable"}))
  ].sort((a,b)=>(b.date||"").localeCompare(a.date||""));
}

export function previousMonthKey(key) {
  const [year,month] = key.split("-").map(Number);
  const date = new Date(year,month-2,1);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}`;
}
