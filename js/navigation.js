import { $ } from "./utils.js";

const titles = {
  homeView:"Inicio", incomeView:"Presupuesto · Ingresos", fixedView:"Presupuesto · Gastos fijos",
  variableView:"Presupuesto · Gastos variables", summaryView:"Presupuesto · Resumen",
  loansView:"Préstamos", dashboardView:"Dashboard", historyView:"Historial", settingsView:"Configuración"
};

export function showView(viewId) {
  document.querySelectorAll(".view").forEach(view=>view.classList.toggle("active",view.id===viewId));
  document.querySelectorAll("[data-view]").forEach(button=>button.classList.toggle("active",button.dataset.view===viewId));
  $("viewTitle").textContent = titles[viewId] || "Finanzas";
  $("sidebar").classList?.remove("open");
  window.scrollTo({top:0,behavior:"smooth"});
}

export function initNavigation(onChange) {
  document.querySelector(".sidebar").id = "sidebar";
  document.querySelectorAll("[data-view]").forEach(button=>{
    button.addEventListener("click",()=>{
      showView(button.dataset.view);
      onChange?.(button.dataset.view);
    });
  });
  $("budgetMenuButton").addEventListener("click",()=>$("budgetSubmenu").classList.toggle("open"));
  $("mobileMenuBtn").addEventListener("click",()=>$("sidebar").classList.toggle("open"));
}
