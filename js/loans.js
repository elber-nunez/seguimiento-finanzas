import { uid, today } from "./utils.js";
import { ensureMonth } from "./budget.js";

export function addMonths(monthKey, offset) {
  const [year,month] = monthKey.split("-").map(Number);
  const date = new Date(year,month-1+offset,1);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}`;
}

export function installmentAmounts(total, count) {
  const cents = Math.round(Number(total) * 100);
  const base = Math.floor(cents / count);
  const remainder = cents - (base * count);
  return Array.from({length:count},(_,index)=>
    (base + (index === count-1 ? remainder : 0)) / 100
  );
}

export function loanRecords(state, loanId) {
  const incomes = [];
  const installments = [];
  Object.entries(state.months || {}).forEach(([monthKey,month])=>{
    ["elber","mayra"].forEach(owner=>{
      (month[owner]?.incomes || []).forEach(item=>{
        if(item.loanId===loanId) incomes.push({item,monthKey,owner});
      });
      (month[owner]?.fixed || []).forEach(item=>{
        if(item.loanId===loanId) installments.push({item,monthKey,owner});
      });
    });
  });
  return {incomes,installments};
}

export function createLoan(state, values) {
  state.loans ||= [];
  const loan = {
    id:uid(),
    owner:values.owner,
    concept:values.concept,
    principal:Number(values.principal),
    totalRepayment:Number(values.totalRepayment),
    installments:Number(values.installments),
    receivedMonthKey:values.receivedMonthKey,
    firstPaymentMonthKey:values.firstPaymentMonthKey,
    status:"active",
    payoffMonthKey:null,
    createdAt:today()
  };
  state.loans.push(loan);
  generateLoanRecords(state,loan);
  return loan;
}

export function generateLoanRecords(state,loan) {
  const receivedMonth = ensureMonth(state,loan.receivedMonthKey);
  receivedMonth[loan.owner].incomes.push({
    id:uid(),
    owner:loan.owner,
    concept:loan.concept,
    category:"Préstamo",
    plannedAmount:loan.principal,
    actualAmount:loan.principal,
    realized:true,
    date:today(),
    sourceType:"loan-income",
    loanId:loan.id
  });

  const amounts = installmentAmounts(loan.totalRepayment,loan.installments);
  amounts.forEach((amount,index)=>{
    const monthKey=addMonths(loan.firstPaymentMonthKey,index);
    const month=ensureMonth(state,monthKey);
    month[loan.owner].fixed.push({
      id:uid(),
      owner:loan.owner,
      concept:`${loan.concept} · Cuota ${index+1} de ${loan.installments}`,
      category:"Préstamo",
      plannedAmount:amount,
      actualAmount:0,
      realized:false,
      date:`${monthKey}-01`,
      sourceType:"loan-installment",
      loanId:loan.id,
      installmentNumber:index+1,
      totalInstallments:loan.installments,
      installmentMonthKey:monthKey
    });
  });
}

export function updateLoanMetadata(state,loanId,values) {
  const loan=(state.loans || []).find(item=>item.id===loanId);
  if(!loan) return null;
  loan.concept=values.concept;
  loan.owner=values.owner;
  const records=loanRecords(state,loanId);
  records.incomes.forEach(({item})=>{
    item.concept=values.concept;
    item.owner=values.owner;
  });
  records.installments.forEach(({item})=>{
    item.owner=values.owner;
    item.concept=`${values.concept} · Cuota ${item.installmentNumber} de ${loan.installments}`;
  });
  return loan;
}

export function payoffLoan(state,loanId,payoffMonthKey) {
  const loan=(state.loans || []).find(item=>item.id===loanId);
  if(!loan) throw new Error("Préstamo no encontrado.");

  const records=loanRecords(state,loanId);
  const priorPaid=records.installments
    .filter(({item,monthKey})=>monthKey < payoffMonthKey && item.realized)
    .reduce((sum,{item})=>sum+Number(item.actualAmount||0),0);

  const remaining=Math.max(0,Math.round((loan.totalRepayment-priorPaid)*100)/100);
  let payoffRecord=records.installments.find(({monthKey})=>monthKey===payoffMonthKey);

  if(!payoffRecord){
    const month=ensureMonth(state,payoffMonthKey);
    const item={
      id:uid(), owner:loan.owner,
      concept:`${loan.concept} · Cancelación total`,
      category:"Préstamo",
      plannedAmount:remaining,
      actualAmount:remaining,
      realized:true,
      date:`${payoffMonthKey}-01`,
      sourceType:"loan-installment",
      loanId:loan.id,
      installmentNumber:null,
      totalInstallments:loan.installments,
      installmentMonthKey:payoffMonthKey,
      payoff:true
    };
    month[loan.owner].fixed.push(item);
    payoffRecord={item,monthKey:payoffMonthKey,owner:loan.owner};
  }else{
    payoffRecord.item.concept=`${loan.concept} · Cancelación total`;
    payoffRecord.item.plannedAmount=remaining;
    payoffRecord.item.actualAmount=remaining;
    payoffRecord.item.realized=true;
    payoffRecord.item.payoff=true;
  }

  records.installments
    .filter(({monthKey})=>monthKey>payoffMonthKey)
    .forEach(({item,monthKey,owner})=>{
      const month=ensureMonth(state,monthKey);
      month[owner].fixed=month[owner].fixed.filter(row=>row.id!==item.id);
    });

  loan.status="paid";
  loan.payoffMonthKey=payoffMonthKey;
  loan.paidOffAt=today();
  return remaining;
}

export function deleteLoan(state,loanId) {
  const records=loanRecords(state,loanId);
  const paid=records.installments.filter(({item})=>item.realized);
  if(paid.length && !confirm("Este préstamo tiene cuotas pagadas. ¿Eliminar también esos registros del historial?")) return false;

  records.incomes.forEach(({item,monthKey,owner})=>{
    const month=ensureMonth(state,monthKey);
    month[owner].incomes=month[owner].incomes.filter(row=>row.id!==item.id);
  });
  records.installments.forEach(({item,monthKey,owner})=>{
    const month=ensureMonth(state,monthKey);
    month[owner].fixed=month[owner].fixed.filter(row=>row.id!==item.id);
  });
  state.loans=(state.loans || []).filter(item=>item.id!==loanId);
  return true;
}

export function loanMetrics(state,profile,currentMonthKey) {
  const loans=(state.loans || []).filter(loan=>profile==="general" || loan.owner===profile);
  const ids=new Set(loans.map(loan=>loan.id));
  const allInstallments=[];
  Object.entries(state.months || {}).forEach(([monthKey,month])=>{
    ["elber","mayra"].forEach(owner=>{
      (month[owner]?.fixed || []).forEach(item=>{
        if(ids.has(item.loanId)) allInstallments.push({item,monthKey});
      });
    });
  });

  const paid=allInstallments.filter(({item})=>item.realized).reduce((sum,{item})=>sum+Number(item.actualAmount||0),0);
  const totalRepayment=loans.reduce((sum,loan)=>sum+Number(loan.totalRepayment||0),0);
  const principal=loans.reduce((sum,loan)=>sum+Number(loan.principal||0),0);
  const monthRows=allInstallments.filter(({monthKey})=>monthKey===currentMonthKey);

  return {
    loans,
    active:loans.filter(loan=>loan.status!=="paid").length,
    principal,
    totalRepayment,
    interest:totalRepayment-principal,
    pending:Math.max(0,totalRepayment-paid),
    monthPlanned:monthRows.reduce((sum,{item})=>sum+Number(item.plannedAmount||0),0),
    monthActual:monthRows.filter(({item})=>item.realized).reduce((sum,{item})=>sum+Number(item.actualAmount||0),0)
  };
}
