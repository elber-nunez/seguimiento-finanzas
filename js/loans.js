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

export function effectiveLoanTotal(loan) {
  return Number(loan.adjustedTotalRepayment ?? loan.totalRepayment ?? 0);
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
  installments.sort((a,b)=>a.monthKey.localeCompare(b.monthKey));
  return {incomes,installments};
}

export function createLoan(state, values) {
  state.loans ||= [];
  const loan = {
    id:uid(),
    owner:values.owner,
    concept:values.concept,
    type:values.type || "fixed",
    principal:Number(values.principal),
    totalRepayment:values.type==="fixed" ? Number(values.totalRepayment) : null,
    adjustedTotalRepayment:null,
    monthlyInterest:values.type==="flexible" ? Number(values.monthlyInterest) : null,
    plannedPrincipal:values.type==="flexible" ? Number(values.plannedPrincipal) : null,
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

function createIncome(state,loan) {
  const receivedMonth = ensureMonth(state,loan.receivedMonthKey);
  receivedMonth[loan.owner].incomes.push({
    id:uid(), owner:loan.owner, concept:loan.concept, category:"Préstamo",
    plannedAmount:loan.principal, actualAmount:loan.principal, realized:true,
    date:today(), sourceType:"loan-income", loanId:loan.id
  });
}

function fixedInstallmentRecord(loan, amount, index, monthKey) {
  return {
    id:uid(), owner:loan.owner,
    concept:`${loan.concept} · Cuota ${index+1} de ${loan.installments}`,
    category:"Préstamo",
    plannedAmount:amount, actualAmount:0, realized:false,
    date:`${monthKey}-01`, sourceType:"loan-installment", loanType:"fixed",
    loanId:loan.id, installmentNumber:index+1, totalInstallments:loan.installments,
    installmentMonthKey:monthKey
  };
}

function flexibleInstallmentRecord(loan, index, monthKey, principalOutstanding) {
  const plannedPrincipal=Math.min(Number(loan.plannedPrincipal||0),principalOutstanding);
  const interest=Number(loan.monthlyInterest||0);
  return {
    id:uid(), owner:loan.owner,
    concept:`${loan.concept} · Pago ${index+1}`,
    category:"Préstamo",
    plannedAmount:interest+plannedPrincipal, actualAmount:0, realized:false,
    date:`${monthKey}-01`, sourceType:"loan-installment", loanType:"flexible",
    loanId:loan.id, installmentNumber:index+1, totalInstallments:loan.installments,
    installmentMonthKey:monthKey,
    interestDue:interest, plannedPrincipal,
    actualInterest:0, actualPrincipal:0
  };
}

export function generateLoanRecords(state,loan) {
  createIncome(state,loan);

  if(loan.type==="fixed"){
    installmentAmounts(loan.totalRepayment,loan.installments).forEach((amount,index)=>{
      const monthKey=addMonths(loan.firstPaymentMonthKey,index);
      ensureMonth(state,monthKey)[loan.owner].fixed.push(fixedInstallmentRecord(loan,amount,index,monthKey));
    });
    return;
  }

  let outstanding=loan.principal;
  for(let index=0; index<loan.installments && outstanding>0; index++){
    const monthKey=addMonths(loan.firstPaymentMonthKey,index);
    const row=flexibleInstallmentRecord(loan,index,monthKey,outstanding);
    ensureMonth(state,monthKey)[loan.owner].fixed.push(row);
    outstanding=Math.max(0,outstanding-row.plannedPrincipal);
  }
}

export function updateLoanMetadata(state,loanId,values) {
  const loan=(state.loans || []).find(item=>item.id===loanId);
  if(!loan) return null;
  loan.concept=values.concept;
  const records=loanRecords(state,loanId);
  records.incomes.forEach(({item})=>item.concept=values.concept);
  records.installments.forEach(({item})=>{
    item.concept=loan.type==="fixed"
      ? `${values.concept} · Cuota ${item.installmentNumber} de ${loan.installments}`
      : `${values.concept} · Pago ${item.installmentNumber || ""}`.trim();
  });
  return loan;
}

export function paidLoanAmount(state,loanId) {
  return loanRecords(state,loanId).installments
    .filter(({item})=>item.realized)
    .reduce((sum,{item})=>sum+Number(item.actualAmount||0),0);
}

export function flexibleCapitalPaid(state,loanId) {
  return loanRecords(state,loanId).installments
    .filter(({item})=>item.realized)
    .reduce((sum,{item})=>sum+Number(item.actualPrincipal||0),0);
}

export function flexiblePrincipalOutstanding(state,loanId) {
  const loan=(state.loans || []).find(item=>item.id===loanId);
  return Math.max(0,Number(loan?.principal||0)-flexibleCapitalPaid(state,loanId));
}

export function applyFlexiblePayment(state, loanId, installmentItem, actualAmount) {
  const loan=(state.loans || []).find(item=>item.id===loanId);
  if(!loan) throw new Error("Préstamo no encontrado.");
  const interestDue=Number(installmentItem.interestDue ?? loan.monthlyInterest ?? 0);
  const actualInterest=Math.min(actualAmount,interestDue);
  const actualPrincipal=Math.max(0,actualAmount-actualInterest);

  installmentItem.realized=true;
  installmentItem.actualAmount=actualAmount;
  installmentItem.actualInterest=actualInterest;
  installmentItem.actualPrincipal=actualPrincipal;
  installmentItem.date=today();

  const outstanding=flexiblePrincipalOutstanding(state,loanId);
  if(outstanding<=0){
    loan.status="paid";
    loan.paidOffAt=today();
    removeFutureInstallments(state,loanId,installmentItem.installmentMonthKey);
  }else{
    ensureFlexibleFutureRow(state,loan,installmentItem.installmentMonthKey,outstanding);
  }
}

function ensureFlexibleFutureRow(state,loan,currentMonthKey,outstanding) {
  const records=loanRecords(state,loan.id);
  const hasFuture=records.installments.some(({monthKey,item})=>monthKey>currentMonthKey && !item.realized);
  if(hasFuture) return;
  const nextKey=addMonths(currentMonthKey,1);
  const nextNumber=Math.max(0,...records.installments.map(({item})=>Number(item.installmentNumber||0)))+1;
  const row=flexibleInstallmentRecord(loan,nextNumber-1,nextKey,outstanding);
  row.totalInstallments=Math.max(loan.installments,nextNumber);
  ensureMonth(state,nextKey)[loan.owner].fixed.push(row);
}

function removeFutureInstallments(state,loanId,monthKey) {
  loanRecords(state,loanId).installments
    .filter(record=>record.monthKey>monthKey)
    .forEach(({item,monthKey:recordMonth,owner})=>{
      const month=ensureMonth(state,recordMonth);
      month[owner].fixed=month[owner].fixed.filter(row=>row.id!==item.id);
    });
}

export function payoffLoan(state,loanId,payoffMonthKey,newFinalTotal=null) {
  const loan=(state.loans || []).find(item=>item.id===loanId);
  if(!loan) throw new Error("Préstamo no encontrado.");

  if(loan.type==="flexible"){
    const records=loanRecords(state,loanId);
    const outstanding=flexiblePrincipalOutstanding(state,loanId);
    const interest=Number(loan.monthlyInterest||0);
    const finalAmount=newFinalTotal===null ? outstanding+interest : Number(newFinalTotal);
    let payoffRecord=records.installments.find(({monthKey})=>monthKey===payoffMonthKey);
    if(!payoffRecord){
      const item=flexibleInstallmentRecord(loan,999,payoffMonthKey,outstanding);
      ensureMonth(state,payoffMonthKey)[loan.owner].fixed.push(item);
      payoffRecord={item,monthKey:payoffMonthKey,owner:loan.owner};
    }
    payoffRecord.item.concept=`${loan.concept} · Cancelación total`;
    payoffRecord.item.plannedAmount=finalAmount;
    payoffRecord.item.actualAmount=finalAmount;
    payoffRecord.item.realized=true;
    payoffRecord.item.actualInterest=Math.min(finalAmount,interest);
    payoffRecord.item.actualPrincipal=Math.max(0,finalAmount-payoffRecord.item.actualInterest);
    payoffRecord.item.payoff=true;
    loan.adjustedTotalRepayment=paidLoanAmount(state,loanId);
    removeFutureInstallments(state,loanId,payoffMonthKey);
    loan.status="paid"; loan.payoffMonthKey=payoffMonthKey; loan.paidOffAt=today();
    return finalAmount;
  }

  const records=loanRecords(state,loanId);
  const originalTotal=effectiveLoanTotal(loan);
  const finalTotal=newFinalTotal===null ? originalTotal : Number(newFinalTotal);
  const priorPaid=records.installments
    .filter(({item,monthKey})=>monthKey < payoffMonthKey && item.realized)
    .reduce((sum,{item})=>sum+Number(item.actualAmount||0),0);
  const remaining=Math.max(0,Math.round((finalTotal-priorPaid)*100)/100);
  let payoffRecord=records.installments.find(({monthKey})=>monthKey===payoffMonthKey);

  if(!payoffRecord){
    const item=fixedInstallmentRecord(loan,remaining,999,payoffMonthKey);
    ensureMonth(state,payoffMonthKey)[loan.owner].fixed.push(item);
    payoffRecord={item,monthKey:payoffMonthKey,owner:loan.owner};
  }
  payoffRecord.item.concept=`${loan.concept} · Cancelación total`;
  payoffRecord.item.plannedAmount=remaining;
  payoffRecord.item.actualAmount=remaining;
  payoffRecord.item.realized=true;
  payoffRecord.item.payoff=true;
  removeFutureInstallments(state,loanId,payoffMonthKey);

  loan.adjustedTotalRepayment=finalTotal;
  loan.status="paid"; loan.payoffMonthKey=payoffMonthKey; loan.paidOffAt=today();
  return remaining;
}

export function deleteLoan(state,loanId) {
  const records=loanRecords(state,loanId);
  const paid=records.installments.filter(({item})=>item.realized);
  if(paid.length && !confirm("Este préstamo tiene pagos realizados. ¿Eliminar también esos registros del historial?")) return false;
  records.incomes.forEach(({item,monthKey,owner})=>{
    ensureMonth(state,monthKey)[owner].incomes=ensureMonth(state,monthKey)[owner].incomes.filter(row=>row.id!==item.id);
  });
  records.installments.forEach(({item,monthKey,owner})=>{
    ensureMonth(state,monthKey)[owner].fixed=ensureMonth(state,monthKey)[owner].fixed.filter(row=>row.id!==item.id);
  });
  state.loans=(state.loans || []).filter(item=>item.id!==loanId);
  return true;
}

export function loanMetrics(state,profile,currentMonthKey) {
  const loans=(state.loans || []).filter(loan=>profile==="general" || loan.owner===profile);
  const ids=new Set(loans.map(loan=>loan.id));
  const rows=[];
  Object.entries(state.months || {}).forEach(([monthKey,month])=>{
    ["elber","mayra"].forEach(owner=>{
      (month[owner]?.fixed || []).forEach(item=>{
        if(ids.has(item.loanId)) rows.push({item,monthKey});
      });
    });
  });

  const totalRepayment=loans.reduce((sum,loan)=>{
    if(loan.type==="flexible"){
      const paid=paidLoanAmount(state,loan.id);
      const outstanding=flexiblePrincipalOutstanding(state,loan.id);
      return sum+paid+outstanding;
    }
    return sum+effectiveLoanTotal(loan);
  },0);
  const principal=loans.reduce((sum,loan)=>sum+Number(loan.principal||0),0);
  const paid=rows.filter(({item})=>item.realized).reduce((sum,{item})=>sum+Number(item.actualAmount||0),0);
  const pending=loans.reduce((sum,loan)=>{
    if(loan.type==="flexible") return sum+flexiblePrincipalOutstanding(state,loan.id);
    return sum+Math.max(0,effectiveLoanTotal(loan)-paidLoanAmount(state,loan.id));
  },0);
  const monthRows=rows.filter(({monthKey})=>monthKey===currentMonthKey);

  return {
    loans,
    active:loans.filter(loan=>loan.status!=="paid").length,
    principal,totalRepayment,
    interest:Math.max(0,totalRepayment-principal),
    pending,
    monthPlanned:monthRows.reduce((sum,{item})=>sum+Number(item.plannedAmount||0),0),
    monthActual:monthRows.filter(({item})=>item.realized).reduce((sum,{item})=>sum+Number(item.actualAmount||0),0)
  };
}
