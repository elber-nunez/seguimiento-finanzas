import { uid } from "./utils.js";
import { ensureMonth } from "./budget.js";

export const SCHOOL_ROWS = [
  { key:"enrollment", label:"Matrícula", month:3, day:1, type:"enrollment" },
  { key:"march", label:"Marzo", month:3, day:31, type:"monthly" },
  { key:"april", label:"Abril", month:4, day:30, type:"monthly" },
  { key:"may", label:"Mayo", month:5, day:31, type:"monthly" },
  { key:"june", label:"Junio", month:6, day:30, type:"monthly" },
  { key:"july", label:"Julio", month:7, day:15, type:"monthly" },
  { key:"august", label:"Agosto", month:8, day:31, type:"monthly" },
  { key:"september", label:"Septiembre", month:9, day:30, type:"monthly" },
  { key:"october", label:"Octubre", month:10, day:31, type:"monthly" },
  { key:"november", label:"Noviembre", month:11, day:30, type:"monthly" },
  { key:"december", label:"Diciembre", month:12, day:15, type:"monthly" }
];

function monthKey(year,month) {
  return `${year}-${String(month).padStart(2,"0")}`;
}

function safeDate(year,month,day) {
  const lastDay = new Date(year,month,0).getDate();
  return `${year}-${String(month).padStart(2,"0")}-${String(Math.min(day,lastDay)).padStart(2,"0")}`;
}

export function pensionRecords(state,pensionId) {
  const records=[];
  Object.entries(state.months || {}).forEach(([periodKey,month])=>{
    ["elber","mayra"].forEach(owner=>{
      (month[owner]?.fixed || []).forEach(item=>{
        if(item.schoolPensionId===pensionId) records.push({item,periodKey,owner});
      });
    });
  });
  return records.sort((a,b)=>a.item.schoolOrder-b.item.schoolOrder);
}

export function createSchoolPension(state,values) {
  state.schoolPensions ||= [];
  const pension={
    id:uid(),
    studentName:values.studentName.trim(),
    year:Number(values.year),
    owner:values.owner || "mayra",
    enrollmentAmount:Number(values.enrollmentAmount||0),
    monthlyAmount:Number(values.monthlyAmount||0),
    status:"active"
  };
  state.schoolPensions.push(pension);
  generateSchoolRecords(state,pension);
  return pension;
}

export function generateSchoolRecords(state,pension) {
  SCHOOL_ROWS.forEach((row,index)=>{
    const key=monthKey(pension.year,row.month);
    const amount=row.type==="enrollment" ? pension.enrollmentAmount : pension.monthlyAmount;
    ensureMonth(state,key)[pension.owner].fixed.push({
      id:uid(),
      owner:pension.owner,
      concept:row.type==="enrollment"
        ? `Matrícula ${pension.studentName}`
        : `Pensión ${pension.studentName} · ${row.label}`,
      category:"Pensión escolar",
      plannedAmount:amount,
      actualAmount:0,
      realized:false,
      date:safeDate(pension.year,row.month,row.day),
      sourceType:"school-pension",
      schoolPensionId:pension.id,
      schoolRowKey:row.key,
      schoolOrder:index,
      schoolYear:pension.year,
      studentName:pension.studentName
    });
  });
}

export function updateSchoolPension(state,pensionId,values) {
  const pension=(state.schoolPensions||[]).find(item=>item.id===pensionId);
  if(!pension) return null;
  pension.studentName=values.studentName.trim();
  pension.enrollmentAmount=Number(values.enrollmentAmount||0);
  pension.monthlyAmount=Number(values.monthlyAmount||0);

  pensionRecords(state,pensionId).forEach(({item})=>{
    const row=SCHOOL_ROWS.find(entry=>entry.key===item.schoolRowKey);
    item.studentName=pension.studentName;
    item.concept=row?.type==="enrollment"
      ? `Matrícula ${pension.studentName}`
      : `Pensión ${pension.studentName} · ${row?.label || ""}`;
    if(!item.realized){
      item.plannedAmount=row?.type==="enrollment" ? pension.enrollmentAmount : pension.monthlyAmount;
    }
  });
  return pension;
}

export function deleteSchoolPension(state,pensionId) {
  const paid=pensionRecords(state,pensionId).filter(({item})=>item.realized);
  if(paid.length && !confirm("Esta pensión tiene pagos realizados. ¿Eliminar también esos registros del historial?")) return false;
  pensionRecords(state,pensionId).forEach(({item,periodKey,owner})=>{
    const month=ensureMonth(state,periodKey);
    month[owner].fixed=month[owner].fixed.filter(row=>row.id!==item.id);
  });
  state.schoolPensions=(state.schoolPensions||[]).filter(item=>item.id!==pensionId);
  return true;
}

export function schoolPensionsForYear(state,year,profile="general") {
  return (state.schoolPensions||[]).filter(pension=>
    Number(pension.year)===Number(year) &&
    (profile==="general" || pension.owner===profile || pensionRecords(state,pension.id).some(record=>record.owner===profile))
  );
}

export function schoolMetrics(state,year,profile="general") {
  const pensions=schoolPensionsForYear(state,year,profile);
  const ids=new Set(pensions.map(item=>item.id));
  const rows=[];
  Object.entries(state.months||{}).forEach(([periodKey,month])=>{
    ["elber","mayra"].forEach(owner=>{
      (month[owner]?.fixed||[]).forEach(item=>{
        if(ids.has(item.schoolPensionId) && (profile==="general" || owner===profile)){
          rows.push({item,periodKey,owner});
        }
      });
    });
  });
  const planned=rows.reduce((sum,{item})=>sum+Number(item.plannedAmount||0),0);
  const actual=rows.filter(({item})=>item.realized).reduce((sum,{item})=>sum+Number(item.actualAmount||0),0);
  return {pensions,rows,planned,actual,pending:Math.max(0,planned-actual)};
}
