import { $ } from "./utils.js";

const titles = {
  homeView:"Inicio",
  incomeView:"Presupuesto · Ingresos",
  fixedView:"Presupuesto · Gastos fijos",
  variableView:"Presupuesto · Gastos variables",
  summaryView:"Presupuesto · Resumen",
  loansView:"Préstamos",
  schoolView:"Pensiones escolares",
  dashboardView:"Dashboard",
  analyticsView:"Analítica",
  historyView:"Historial",
  settingsView:"Configuración"
};

function closeSidebar() {
  $("sidebar")?.classList.remove("open");
  $("sidebarBackdrop")?.classList.add("hidden");
  document.body.classList.remove("sidebar-open");
}

function openSidebar() {
  $("sidebar")?.classList.add("open");
  $("sidebarBackdrop")?.classList.remove("hidden");
  document.body.classList.add("sidebar-open");
}

export function showView(viewId) {
  document.querySelectorAll(".view").forEach(view=>view.classList.toggle("active",view.id===viewId));
  document.querySelectorAll("[data-view]").forEach(button=>button.classList.toggle("active",button.dataset.view===viewId));
  $("viewTitle").textContent = titles[viewId] || "Finanzas";
  closeSidebar();
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
  $("mobileMenuBtn").addEventListener("click",()=>{
    if($("sidebar").classList.contains("open")) closeSidebar();
    else openSidebar();
  });
  $("closeSidebarBtn")?.addEventListener("click",closeSidebar);
  $("sidebarBackdrop")?.addEventListener("click",closeSidebar);

  window.addEventListener("resize",()=>{
    if(window.innerWidth>900) closeSidebar();
  });

  document.addEventListener("keydown",event=>{
    if(event.key==="Escape") closeSidebar();
  });
}
