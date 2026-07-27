export const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
export const NAMES = { general:"General", elber:"Elber", mayra:"Mayra" };
export const DEFAULT_EXPENSE_CATEGORIES = ["Préstamo","Alimentación","Frutas","Transporte","Servicios del hogar","Internet","Luz","Agua","Celulares","Mascotas","Combustible / GNV","Deudas / cuotas","Salidas","Streaming","Familia","Educación","Salud","Otros"];
export const DEFAULT_INCOME_CATEGORIES = ["Préstamo","Sueldo","Trabajo externo","Bono","Gratificación / CTS","Otros ingresos"];

export const $ = id => document.getElementById(id);
export const money = value => new Intl.NumberFormat("es-ES",{style:"currency",currency:"PEN"}).format(Number(value || 0));
export const escapeHtml = (value="") => String(value).replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
export const today = () => new Date().toISOString().slice(0,10);
export const uid = () => crypto.randomUUID();
export const formatDate = value => new Date(`${value}T00:00:00`).toLocaleDateString("es-ES",{day:"2-digit",month:"short",year:"numeric"});
