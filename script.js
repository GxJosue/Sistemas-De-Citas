// script.js (reemplazo completo)
// Incluye: calendario mensual, validación "mínimo 1 día", formateo de fecha,
// bloqueo por citas puntuales, filtros/admin, modal compacto móvil,
// y borrado seguro de todas las citas (batch writeBatch).
// Sustituye completamente tu script.js actual con este archivo.

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-app.js";
import {
  getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc,
  getDocs, getDoc, writeBatch
} from "https://www.gstatic.com/firebasejs/11.3.1/firebase-firestore.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.3.1/firebase-auth.js";

/* ---------- Configuración Firebase ---------- */
const firebaseConfig = {
  apiKey: "AIzaSyDeSHWfxU-lU-ID4YvaQQm479CADhXowWE",
  authDomain: "barberiacitas-94e43.firebaseapp.com",
  projectId: "barberiacitas-94e43",
  storageBucket: "barberiacitas-94e43.firebasestorage.app",
  messagingSenderId: "113964486737",
  appId: "1:113964486737:web:c513937562113309d5e870",
  measurementId: "G-ZQ4LV7M646"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

/* ---------- Estado global ---------- */
const horarios = {
  Lunes:    ["7:00 AM","8:00 AM","9:00 AM","10:00 AM","11:00 AM","12:00 PM","1:00 PM","2:00 PM","3:00 PM","4:00 PM","5:00 PM","6:00 PM"],
  Martes:   ["7:00 AM","8:00 AM","9:00 AM","10:00 AM","11:00 AM","12:00 PM","1:00 PM","2:00 PM","3:00 PM","4:00 PM","5:00 PM","6:00 PM"],
  Miércoles:["7:00 AM","8:00 AM","9:00 AM","10:00 AM","11:00 AM","12:00 PM","1:00 PM","2:00 PM","3:00 PM","4:00 PM","5:00 PM","6:00 PM"],
  Jueves:   ["7:00 AM","8:00 AM","9:00 AM","10:00 AM","11:00 AM","12:00 PM","1:00 PM","2:00 PM","3:00 PM","4:00 PM","5:00 PM","6:00 PM"],
  Viernes:  ["7:00 AM","8:00 AM","9:00 AM","10:00 AM","11:00 AM","12:00 PM","1:00 PM","2:00 PM","3:00 PM","4:00 PM","5:00 PM","6:00 PM"],
  Sábado:   ["7:00 AM","8:00 AM","9:00 AM","10:00 AM","11:00 AM","12:00 PM","1:00 PM","2:00 PM","3:00 PM","4:00 PM","5:00 PM","6:00 PM"],
  Domingo:  ["7:00 AM","8:00 AM","9:00 AM","10:00 AM","11:00 AM","12:00 PM","1:00 PM","2:00 PM","3:00 PM","4:00 PM","5:00 PM","6:00 PM"]
};

let diaSeleccionado = "";
let diaCitaSeleccionado = "";
let horaSeleccionada = "";

let calYear = null, calMonth = null;
let selectedDateISO = null;

let currentUser = null;
let isAdmin = false;

const adminFilters = { month: 'all', day: 'all', q: '' };
let latestCitasSnapshot = null;

let adminActionInProgress = false;
let pendingAdminAction = null;

/* ---------- Helpers de fecha y hora ---------- */
function getStartOfDayISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function formatFechaDisplay(isoDate) {
  if (!isoDate || typeof isoDate !== 'string') return isoDate;
  try {
    const d = new Date(isoDate + 'T00:00:00');
    if (isNaN(d)) return isoDate;
    const weekdayNames = ["DOMINGO","LUNES","MARTES","MIÉRCOLES","JUEVES","VIERNES","SÁBADO"];
    const months = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];
    const day = String(d.getDate()).padStart(2, '0');
    const mon = months[d.getMonth()];
    const year = d.getFullYear();
    const weekday = weekdayNames[d.getDay()];
    return `${weekday} - ${day}/${mon}/${year}`;
  } catch (e) { return isoDate; }
}
function parseTimeTo24(hora) {
  if (!hora || typeof hora !== 'string') return null;
  const m = hora.match(/^\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*$/i);
  if (!m) return null;
  let hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  const period = m[3].toUpperCase();
  if (period === 'PM' && hh !== 12) hh += 12;
  if (period === 'AM' && hh === 12) hh = 0;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/* ---------- UI Helpers: modales, focus trap, toasts ---------- */
let activeModal = null;
let lastFocusedElement = null;

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  activeModal = modal;
  lastFocusedElement = document.activeElement;
  modal.style.display = 'flex';
  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  const focusable = modal.querySelector('input, button, [tabindex]:not([tabindex="-1"])');
  if (focusable) focusable.focus();
  modal.addEventListener('keydown', modalKeyHandler);
  modal.addEventListener('focusin', trapFocus);
}
function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove('show');
  modal.setAttribute('aria-hidden', 'true');
  try { modal.style.display = 'none'; } catch(e) {}
  document.body.style.overflow = '';
  modal.removeEventListener('keydown', modalKeyHandler);
  modal.removeEventListener('focusin', trapFocus);
  if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') lastFocusedElement.focus();
  activeModal = null;
}
function modalKeyHandler(e) {
  if (e.key === 'Escape') {
    if (activeModal) {
      const btnCancel = activeModal.querySelector('.btn-secondary');
      if (btnCancel) btnCancel.click();
      else closeModal(activeModal.id);
    }
  }
}
function trapFocus(e) {
  if (!activeModal) return;
  const focusables = Array.from(activeModal.querySelectorAll('input, button, a, [tabindex]:not([tabindex="-1"])')).filter(n => !n.hasAttribute('disabled'));
  if (focusables.length === 0) return;
  const first = focusables[0], last = focusables[focusables.length - 1];
  if (e.relatedTarget === null && document.activeElement === document.body) first.focus();
  activeModal.addEventListener('keydown', function(ev) {
    if (ev.key !== 'Tab') return;
    if (ev.shiftKey) {
      if (document.activeElement === first) { ev.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { ev.preventDefault(); first.focus(); }
    }
  }, { once: true });
}
function showToast(message, type = 'success', duration = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = message;
  container.appendChild(t);
  setTimeout(() => t.classList.add('show'), 20);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => { try { container.removeChild(t); } catch(e) {} }, 220); }, duration);
}

/* ---------- Calendario ---------- */
function renderCalendar(year, month) {
  calYear = year; calMonth = month;
  const calendarEl = document.getElementById('calendar');
  const titleEl = document.getElementById('cal-title');
  if (!calendarEl || !titleEl) return;
  const monthNames = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  titleEl.textContent = `${monthNames[month]} ${year}`;
  calendarEl.innerHTML = '';
  const dayNames = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
  dayNames.forEach(dn => {
    const div = document.createElement('div');
    div.className = 'cal-day-name';
    div.textContent = dn;
    calendarEl.appendChild(div);
  });
  const first = new Date(year, month, 1);
  const firstWeekday = first.getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  for (let i=0;i<firstWeekday;i++) {
    const empty = document.createElement('div');
    empty.className = 'cal-cell disabled';
    calendarEl.appendChild(empty);
  }
  const now = new Date();
  const minAllowedDate = addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate()), 1);
  const minISO = getStartOfDayISO(minAllowedDate);
  const weekdayNames = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
  for (let d=1; d<=daysInMonth; d++) {
    const cellDate = new Date(year, month, d);
    const dateISO = getStartOfDayISO(cellDate);
    const cell = document.createElement('div');
    cell.className = 'cal-cell';
    if (dateISO < minISO) cell.classList.add('disabled');
    const num = document.createElement('div'); num.className = 'date-num'; num.textContent = d; cell.appendChild(num);
    const small = document.createElement('div'); small.className = 'small-note'; small.textContent = weekdayNames[cellDate.getDay()]; cell.appendChild(small);
    cell.addEventListener('click', () => {
      if (cell.classList.contains('disabled')) {
        if (!currentUser) openModal('modal-login-required');
        else showToast('No puedes seleccionar una fecha pasada o hoy. Debes seleccionar al menos mañana.', 'error');
        return;
      }
      if (!currentUser) { openModal('modal-login-required'); return; }
      document.querySelectorAll('.calendar .cal-cell').forEach(c => c.classList.remove('selected'));
      cell.classList.add('selected');
      selectedDateISO = dateISO;
      diaSeleccionado = weekdayNames[cellDate.getDay()];
      diaCitaSeleccionado = dateISO;
      startHorariosListener(diaSeleccionado);
      if (titleEl) titleEl.textContent = `${monthNames[month]} ${year} — ${dateISO}`;
    });
    calendarEl.appendChild(cell);
  }
}
function calendarPrev() {
  let ny = calYear, nm = calMonth - 1;
  if (nm < 0) { nm = 11; ny -= 1; }
  renderCalendar(ny, nm);
}
function calendarNext() {
  let ny = calYear, nm = calMonth + 1;
  if (nm > 11) { nm = 0; ny += 1; }
  renderCalendar(ny, nm);
}

/* ---------- Horarios ---------- */
let unsubscribeHorarios = null;
function startHorariosListener(dia) {
  if (unsubscribeHorarios) unsubscribeHorarios();
  const col = collection(db, "citas");
  unsubscribeHorarios = onSnapshot(col, (snapshot) => {
    const citasGuardadas = snapshot.docs.map(d => d.data());
    renderHorarios(dia, citasGuardadas);
  }, error => {
    console.error("Error al escuchar citas para horarios:", error);
    showToast("Error cargando horarios (sin permisos)", "error");
  });
}
function renderHorarios(dia, citasGuardadas) {
  const contenedor = document.getElementById("horarios");
  if (!contenedor) return;
  contenedor.innerHTML = "";
  if (!dia) return;
  horarios[dia].forEach(hora => {
    const btn = document.createElement("button");
    btn.textContent = hora;
    btn.classList.add("hora-disponible");
    let citaExistente = null;
    if (selectedDateISO) {
      citaExistente = citasGuardadas.find(c => {
        if (c && (c.fecha === selectedDateISO || c.fechaISO === selectedDateISO)) return c.hora === hora;
        return false;
      });
      if (!citaExistente) {
        citaExistente = citasGuardadas.find(c => {
          const hasFecha = c && (typeof c.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.fecha) || (c.fechaISO && typeof c.fechaISO === 'string'));
          if (hasFecha) return false;
          return c && c.dia === dia && c.hora === hora;
        });
      }
    } else {
      citaExistente = citasGuardadas.find(c => c.dia === dia && c.hora === hora);
    }
    if (citaExistente) {
      btn.classList.remove("hora-disponible");
      btn.classList.add("hora-ocupada");
      btn.disabled = true;
    } else {
      btn.disabled = false;
      btn.addEventListener("click", () => {
        if (selectedDateISO) agendarCita(selectedDateISO, hora);
        else agendarCita(dia, hora);
      });
    }
    contenedor.appendChild(btn);
  });
}
function ocultarHorarios() {
  const contenedor = document.getElementById("horarios");
  if (contenedor) contenedor.innerHTML = "";
}
function cargarHorariosPara(dia) {
  if (!dia) { showToast("Debe seleccionar un día.", "error"); return; }
  if (!currentUser) { openModal('modal-login-required'); return; }
  diaSeleccionado = dia;
  startHorariosListener(dia);
}

/* ---------- Agendar / Confirmar cita ---------- */
function agendarCita(fechaOrDia, hora) {
  if (!currentUser) { openModal('modal-login-required'); return; }
  const isoMatch = typeof fechaOrDia === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fechaOrDia);
  if (isoMatch) {
    diaCitaSeleccionado = fechaOrDia;
    horaSeleccionada = hora;
    const d = new Date(fechaOrDia + 'T00:00:00');
    const weekdayNames = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
    diaSeleccionado = weekdayNames[d.getDay()];
  } else {
    diaCitaSeleccionado = fechaOrDia;
    horaSeleccionada = hora;
  }
  openModal("modal");
}
async function confirmarCita() {
  const nombreInput = document.getElementById("nombre");
  const telefonoInput = document.getElementById("telefono");
  if (!nombreInput || !telefonoInput) return;
  const nombre = nombreInput.value.trim();
  const telefono = telefonoInput.value.trim();
  if (!nombre || !telefono) { showToast("Debe ingresar un nombre y un número válido.", "error"); return; }
  if (diaCitaSeleccionado && /^\d{4}-\d{2}-\d{2}$/.test(diaCitaSeleccionado)) {
    const minDate = getStartOfDayISO(addDays(new Date(), 1));
    if (diaCitaSeleccionado < minDate) { showToast("La reserva debe hacerse con al menos 1 día de anticipación.", "error"); return; }
  }
  const cita = { dia: diaSeleccionado, hora: horaSeleccionada, nombre, telefono, userId: currentUser.uid, createdAt: new Date().toISOString() };
  if (diaCitaSeleccionado && /^\d{4}-\d{2}-\d{2}$/.test(diaCitaSeleccionado)) cita.fecha = diaCitaSeleccionado;
  try {
    await addDoc(collection(db, "citas"), cita);
    closeModal('modal');
    showToast("Cita agendada correctamente", "success");
    openModal("modal-confirmacion");
  } catch (err) {
    console.error("Error al guardar la cita:", err);
    showToast("Error guardando cita", "error");
  }
}
function cerrarModalAgendar() {
  closeModal("modal");
  const nombreInput = document.getElementById("nombre");
  const telefonoInput = document.getElementById("telefono");
  if (nombreInput) nombreInput.value = "";
  if (telefonoInput) telefonoInput.value = "";
}

/* ---------- Lista de citas y renderizado ---------- */
let unsubscribeLista = null;
function startListaListener() {
  if (unsubscribeLista) unsubscribeLista();
  const listaCitas = document.getElementById("lista-citas");
  if (!listaCitas) return;
  if (!currentUser) { listaCitas.innerHTML = "<li>Inicia sesión para ver tus citas.</li>"; return; }
  unsubscribeLista = onSnapshot(collection(db, "citas"), (snapshot) => {
    latestCitasSnapshot = snapshot;
    renderLista(snapshot);
  }, error => {
    console.error("Error al cargar citas:", error);
    showToast("Error cargando citas", "error");
  });
}
function renderLista(snapshot) {
  const listaCitas = document.getElementById("lista-citas");
  if (!listaCitas) return;
  listaCitas.innerHTML = "";
  const items = [];
  snapshot.forEach(docSnap => {
    const cita = docSnap.data();
    const id = docSnap.id;
    let ts = Infinity;
    if (cita && cita.fecha && cita.hora) {
      const time24 = parseTimeTo24(cita.hora);
      if (time24) {
        const isoDT = `${cita.fecha}T${time24}:00`;
        const dt = new Date(isoDT);
        if (!isNaN(dt)) ts = dt.getTime();
      } else {
        const dt = new Date(cita.fecha + 'T00:00:00');
        if (!isNaN(dt)) ts = dt.getTime();
      }
    }
    items.push({ id, cita, ts });
  });

  let filtered = items;
  if (isAdmin) {
    filtered = filtered.filter(item => {
      const c = item.cita;
      if (adminFilters.month !== 'all') {
        if (!c.fecha) return false;
        const dt = new Date(c.fecha + 'T00:00:00');
        if (isNaN(dt)) return false;
        const monthNum = dt.getMonth() + 1;
        if (parseInt(adminFilters.month, 10) !== monthNum) return false;
      }
      if (adminFilters.day !== 'all') {
        if (c.fecha) {
          const dt = new Date(c.fecha + 'T00:00:00');
          if (isNaN(dt)) return false;
          const weekdayNames = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
          if (weekdayNames[dt.getDay()] !== adminFilters.day) return false;
        } else {
          if (!c.dia) return false;
          if (c.dia !== adminFilters.day) return false;
        }
      }
      if (adminFilters.q && adminFilters.q.trim() !== '') {
        const q = adminFilters.q.trim().toLowerCase();
        const name = (c.nombre || '').toLowerCase();
        const phone = (c.telefono || '').toLowerCase();
        const uid = (c.userId || '').toLowerCase();
        if (!name.includes(q) && !phone.includes(q) && !uid.includes(q)) return false;
      }
      return true;
    });
  } else {
    filtered = filtered.filter(item => item.cita.userId === (currentUser && currentUser.uid));
  }

  filtered.sort((a, b) => {
    if (a.ts === b.ts) {
      const na = (a.cita.nombre || '').toLowerCase();
      const nb = (b.cita.nombre || '').toLowerCase();
      return na < nb ? -1 : (na > nb ? 1 : 0);
    }
    return a.ts - b.ts;
  });

  filtered.forEach(item => {
    const cita = item.cita;
    const citaId = item.id;
    const li = document.createElement("li");
    li.className = "appt-card";
    const info = document.createElement("div");
    info.className = "appt-info";
    const rawName = (cita.nombre || "").replace(/\s+/g, " ").trim();
    const nombreEl = document.createElement("div");
    nombreEl.className = "appt-name";
    nombreEl.textContent = rawName || "Sin nombre";
    const metaEl = document.createElement("div");
    metaEl.className = "appt-meta";
    const dia = cita.dia || "-";
    const hora = cita.hora || "-";
    if (cita.fecha) metaEl.textContent = `${formatFechaDisplay(cita.fecha)} · ${hora}`;
    else metaEl.textContent = `${dia} · ${hora}`;
    const telefonoEl = document.createElement("div");
    telefonoEl.className = "appt-phone-small";
    if (cita.telefono) telefonoEl.textContent = cita.telefono;
    info.appendChild(nombreEl);
    info.appendChild(metaEl);
    if (telefonoEl.textContent) info.appendChild(telefonoEl);
    const accionesWrapper = document.createElement("div");
    accionesWrapper.className = "appt-actions";
    if (cita.userId === (currentUser && currentUser.uid)) {
      const btnEditar = document.createElement("button");
      btnEditar.textContent = "Editar";
      btnEditar.className = "editar-btn appt-btn";
      btnEditar.addEventListener("click", () => abrirModalEditar(citaId, cita));
      accionesWrapper.appendChild(btnEditar);
      const btnEliminar = document.createElement("button");
      btnEliminar.textContent = "Eliminar";
      btnEliminar.className = "eliminar-btn appt-btn";
      btnEliminar.addEventListener("click", () => eliminarCita(citaId));
      accionesWrapper.appendChild(btnEliminar);
    }
    if (isAdmin && cita.userId !== (currentUser && currentUser.uid)) {
      const btnEliminarAdmin = document.createElement("button");
      btnEliminarAdmin.textContent = "Eliminar (admin)";
      btnEliminarAdmin.className = "eliminar-btn appt-btn";
      btnEliminarAdmin.addEventListener("click", () => confirmAdminDelete(citaId));
      accionesWrapper.appendChild(btnEliminarAdmin);
    }
    if (isAdmin) {
      const ownerEl = document.createElement("div");
      ownerEl.className = "appt-owner";
      ownerEl.textContent = `Owner: ${cita.userId}`;
      info.appendChild(ownerEl);
    }
    li.appendChild(info);
    if (accionesWrapper.childElementCount > 0) li.appendChild(accionesWrapper);
    listaCitas.appendChild(li);
  });

  if (isAdmin && filtered.length === 0) {
    const li = document.createElement("li");
    li.className = "appt-card";
    li.textContent = "No hay citas que coincidan con los filtros seleccionados.";
    listaCitas.appendChild(li);
  }
  if (!isAdmin && filtered.length === 0) {
    const li = document.createElement("li");
    li.className = "appt-card";
    li.textContent = "No tienes citas agendadas.";
    listaCitas.appendChild(li);
  }
}

/* ---------- Editar / Eliminar individuales ---------- */
function abrirModalEditar(id, cita) {
  const modalEditar = document.getElementById("modal-editar");
  const nombreInput = document.getElementById("editar-nombre");
  const telefonoInput = document.getElementById("editar-telefono");
  const btnGuardar = document.getElementById("guardar-edicion");
  const btnCancelar = document.getElementById("cancelar-edicion");
  const btnCerrarConfirmacion = document.getElementById("cerrar-confirmacion-edicion");
  if (!modalEditar || !nombreInput || !telefonoInput || !btnGuardar || !btnCancelar) { console.error("Elementos modal editar faltan"); return; }
  openModal("modal-editar");
  nombreInput.value = cita.nombre || "";
  telefonoInput.value = cita.telefono || "";
  btnGuardar.replaceWith(btnGuardar.cloneNode(true));
  btnCancelar.replaceWith(btnCancelar.cloneNode(true));
  btnCerrarConfirmacion.replaceWith(btnCerrarConfirmacion.cloneNode(true));
  const nuevoBtnGuardar = document.getElementById("guardar-edicion");
  const nuevoBtnCancelar = document.getElementById("cancelar-edicion");
  const nuevoBtnCerrarConfirmacion = document.getElementById("cerrar-confirmacion-edicion");
  nuevoBtnGuardar.addEventListener("click", async function () {
    try {
      const citaRef = doc(db, "citas", id);
      await updateDoc(citaRef, { nombre: nombreInput.value, telefono: telefonoInput.value });
      closeModal("modal-editar");
      showToast("Cita actualizada", "success");
      openModal("modal-confirmacion-edicion");
    } catch (error) {
      console.error("Error al actualizar la cita:", error);
      showToast("Error actualizando cita", "error");
    }
  });
  nuevoBtnCancelar.addEventListener("click", function () { closeModal("modal-editar"); });
  nuevoBtnCerrarConfirmacion.addEventListener("click", function () { closeModal("modal-confirmacion-edicion"); });
}
function eliminarCita(id) {
  const modalEliminar = document.getElementById("modal-eliminar");
  if (!modalEliminar) return;
  openModal("modal-eliminar");
  const btnConfirmar = document.getElementById("confirmar-eliminar");
  btnConfirmar.replaceWith(btnConfirmar.cloneNode(true));
  const nuevoConfirmar = document.getElementById("confirmar-eliminar");
  nuevoConfirmar.addEventListener("click", async function () {
    try {
      await deleteDoc(doc(db, "citas", id));
      closeModal("modal-eliminar");
      showToast("Cita eliminada", "success");
      openModal("modal-eliminacion-exitosa");
    } catch (error) {
      console.error("Error al eliminar cita:", error);
      showToast("No se pudo eliminar la cita", "error");
    }
  });
}

/* ---------- Acciones administrativas (delete single / reset all) ---------- */
function confirmAdminDelete(citaId) {
  if (!isAdmin) { showToast("No autorizado", "error"); return; }
  pendingAdminAction = { type: 'delete', id: citaId };
  openModal('modal-admin-confirm');
  const input = document.getElementById('admin-confirm-input');
  if (input) { input.value = ''; input.focus(); }
}

async function performPendingAdminAction() {
  if (!pendingAdminAction) return;
  if (adminActionInProgress) { showToast("Acción administrativa en progreso. Espera...", "error"); return; }

  adminActionInProgress = true;
  const resetButton = document.getElementById('reset-all');
  if (resetButton) resetButton.disabled = true;

  try {
    if (pendingAdminAction.type === 'delete') {
      await deleteDoc(doc(db, "citas", pendingAdminAction.id));
      showToast("Cita eliminada (admin)", "success");
    } else if (pendingAdminAction.type === 'reset') {
      showToast("Iniciando borrado de todas las citas...", "success", 3000);
      const snapshot = await getDocs(collection(db, "citas"));
      if (!snapshot || snapshot.empty) {
        showToast("No hay citas para borrar.", "success");
        pendingAdminAction = null;
        return;
      }
      const docs = snapshot.docs;
      const BATCH_SIZE = 500;
      for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        const chunk = docs.slice(i, i + BATCH_SIZE);
        chunk.forEach(d => {
          const ref = doc(db, "citas", d.id);
          batch.delete(ref);
        });
        await batch.commit();
        console.log(`Borrado batch ${Math.floor(i / BATCH_SIZE) + 1} - ${chunk.length} docs`);
        showToast(`Borrados ${Math.min(i + BATCH_SIZE, docs.length)} de ${docs.length}`, "success", 1200);
      }
      showToast("Todas las citas eliminadas", "success", 3500);
      if (latestCitasSnapshot) renderLista(latestCitasSnapshot);
    }
  } catch (err) {
    console.error("Error ejecutando acción admin:", err);
    const msg = (err && err.message) ? err.message : "Error al ejecutar acción admin";
    showToast(msg, "error", 6000);
  } finally {
    pendingAdminAction = null;
    adminActionInProgress = false;
    if (resetButton) resetButton.disabled = false;
  }
}

function resetearTodasLasCitas() {
  if (!isAdmin) { showToast("No estás autorizado.", "error"); return; }
  if (adminActionInProgress) { showToast("Acción en progreso, espera a que termine.", "error"); return; }
  pendingAdminAction = { type: 'reset' };
  openModal('modal-admin-confirm');
  const input = document.getElementById('admin-confirm-input');
  if (input) { input.value = ''; input.focus(); }
}

/* ---------- Autenticación y UI de auth ---------- */
async function doLogin() {
  try { await signInWithPopup(auth, provider); } catch (err) { console.error("Error en login:", err); showToast("Error al iniciar sesión", "error"); }
}
async function doLogout() {
  try { await signOut(auth); showToast("Sesión cerrada", "success"); } catch (err) { console.error("Error en logout:", err); showToast("Error cerrando sesión", "error"); }
}
async function checkAdminStatus(uid) {
  if (!uid) return false;
  try {
    const adminDoc = await getDoc(doc(db, "admins", uid));
    return adminDoc.exists();
  } catch (err) {
    console.error("Error comprobando admin:", err);
    return false;
  }
}
function updateAuthUI(user, adminFlag) {
  const authArea = document.getElementById("auth-area");
  if (!authArea) return;
  authArea.innerHTML = "";
  if (!user) {
    const btn = document.createElement("button");
    btn.id = "login-btn";
    btn.className = "btn btn-primary";
    btn.textContent = "Iniciar sesión con Google";
    btn.addEventListener("click", doLogin);
    authArea.appendChild(btn);
    const r = document.getElementById("reset-all");
    if (r) r.style.display = "none";
    const af = document.getElementById("admin-filters");
    if (af) af.style.display = "none";
    const toggle = document.getElementById("admin-filters-toggle");
    if (toggle) toggle.style.display = "none";
    return;
  }
  const info = document.createElement("span");
  info.textContent = `${user.displayName || user.email}`;
  info.style.marginRight = "10px";
  authArea.appendChild(info);
  const btnLogout = document.createElement("button");
  btnLogout.textContent = "Salir";
  btnLogout.className = "btn btn-secondary";
  btnLogout.addEventListener("click", doLogout);
  authArea.appendChild(btnLogout);
  const resetBtn = document.getElementById("reset-all");
  const toggle = document.getElementById("admin-filters-toggle");
  if (adminFlag) {
    if (resetBtn) resetBtn.style.display = "inline-block";
    const af = document.getElementById("admin-filters");
    if (af) af.style.display = "flex";
    if (toggle) toggle.style.display = "";
  } else {
    if (resetBtn) resetBtn.style.display = "none";
    const af = document.getElementById("admin-filters");
    if (af) af.style.display = "none";
    if (toggle) toggle.style.display = "none";
  }
}

/* ---------- Inicialización y bindings ---------- */
document.addEventListener("DOMContentLoaded", () => {
  const today = new Date();
  renderCalendar(today.getFullYear(), today.getMonth());
  const prev = document.getElementById('cal-prev');
  const next = document.getElementById('cal-next');
  if (prev) prev.addEventListener('click', calendarPrev);
  if (next) next.addEventListener('click', calendarNext);

  const botonesDias = document.querySelectorAll("#dias-de-la-semana .dia-btn");
  botonesDias.forEach(boton => {
    boton.addEventListener("click", function () {
      botonesDias.forEach(b => b.classList.remove("dia-actual"));
      this.classList.add("dia-actual");
      const dia = this.getAttribute("data-dia");
      if (diaSeleccionado === dia) {
        diaSeleccionado = "";
        ocultarHorarios();
        this.classList.remove("dia-actual");
      } else {
        diaSeleccionado = dia;
        cargarHorariosPara(diaSeleccionado);
      }
    });
  });

  const btnConfirmar = document.getElementById("confirmar-cita");
  const btnCancelarModal = document.getElementById("cancelar-modal");
  if (btnConfirmar) btnConfirmar.addEventListener("click", confirmarCita);
  if (btnCancelarModal) btnCancelarModal.addEventListener("click", cerrarModalAgendar);

  const cerrarConfirmacion = document.getElementById("cerrar-confirmacion");
  if (cerrarConfirmacion) cerrarConfirmacion.addEventListener("click", () => closeModal("modal-confirmacion"));
  const cancelarEliminar = document.getElementById("cancelar-eliminar");
  if (cancelarEliminar) cancelarEliminar.addEventListener('click', () => closeModal('modal-eliminar'));
  const cerrarEliminacionExitosa = document.getElementById("cerrar-eliminacion-exitosa");
  if (cerrarEliminacionExitosa) cerrarEliminacionExitosa.addEventListener("click", () => closeModal("modal-eliminacion-exitosa"));

  // Reset all button (AHORA fuera del contenedor de filtros)
  const resetAllBtn = document.getElementById("reset-all");
  if (resetAllBtn) {
    resetAllBtn.addEventListener("click", (e) => {
      if (adminActionInProgress) { showToast("Acción en curso. Espera...", "error"); return; }
      resetearTodasLasCitas();
    });
    resetAllBtn.addEventListener("click", () => console.log("reset-all button clicked (external)"));
  }

  const loginNowBtn = document.getElementById('login-now-btn');
  const loginCancelBtn = document.getElementById('login-cancel-btn');
  if (loginNowBtn) {
    loginNowBtn.addEventListener('click', async () => {
      closeModal('modal-login-required');
      try { await doLogin(); } catch (err) { console.error("Error en doLogin desde modal:", err); }
    });
  }
  if (loginCancelBtn) loginCancelBtn.addEventListener('click', () => closeModal('modal-login-required'));

  const approve = document.getElementById('admin-confirm-approve');
  const cancel = document.getElementById('admin-confirm-cancel');
  const input = document.getElementById('admin-confirm-input');
  if (approve) {
    approve.addEventListener('click', async () => {
      if (!input) return;
      if (input.value.trim().toUpperCase() !== 'ELIMINAR') {
        showToast('Escribe ELIMINAR para confirmar', 'error');
        input.focus();
        return;
      }
      closeModal('modal-admin-confirm');
      await performPendingAdminAction();
    });
  }
  if (cancel) cancel.addEventListener('click', () => { pendingAdminAction = null; closeModal('modal-admin-confirm'); });

  const filterMonth = document.getElementById('filter-month');
  const filterDay = document.getElementById('filter-day');
  const filterQ = document.getElementById('filter-q');
  const filterClear = document.getElementById('filter-clear');

  if (filterMonth) filterMonth.addEventListener('change', (e) => { adminFilters.month = e.target.value; if (latestCitasSnapshot) renderLista(latestCitasSnapshot); });
  if (filterDay) filterDay.addEventListener('change', (e) => { adminFilters.day = e.target.value; if (latestCitasSnapshot) renderLista(latestCitasSnapshot); });
  if (filterQ) filterQ.addEventListener('input', (e) => { adminFilters.q = e.target.value; if (latestCitasSnapshot) renderLista(latestCitasSnapshot); });
  if (filterClear) filterClear.addEventListener('click', () => {
    adminFilters.month = 'all'; adminFilters.day = 'all'; adminFilters.q = '';
    if (filterMonth) filterMonth.value = 'all';
    if (filterDay) filterDay.value = 'all';
    if (filterQ) filterQ.value = '';
    if (latestCitasSnapshot) renderLista(latestCitasSnapshot);
  });

  startListaListener();

  // Compact modal bindings (clona controles dentro del modal para móvil)
  const filtersToggle = document.getElementById('admin-filters-toggle');
  const filtersModal = document.getElementById('modal-admin-filters');
  const filtersModalContent = document.getElementById('modal-admin-filters-content');
  const filtersApply = document.getElementById('modal-admin-filters-apply');
  const filtersClose = document.getElementById('modal-admin-filters-close');
  const adminFiltersEl = document.getElementById('admin-filters');

  if (filtersToggle && filtersModal && filtersModalContent && filtersApply && filtersClose) {
    filtersToggle.addEventListener('click', () => {
      if (adminFiltersEl) filtersModalContent.innerHTML = adminFiltersEl.innerHTML;
      else filtersModalContent.innerHTML = '<p>No hay filtros disponibles.</p>';
      openModal('modal-admin-filters');
    });
    filtersApply.addEventListener('click', () => {
      const selMonth = filtersModalContent.querySelector('#filter-month');
      const selDay = filtersModalContent.querySelector('#filter-day');
      const inputQ = filtersModalContent.querySelector('#filter-q');
      const realMonth = document.getElementById('filter-month');
      const realDay = document.getElementById('filter-day');
      const realQ = document.getElementById('filter-q');
      if (selMonth && realMonth) realMonth.value = selMonth.value;
      if (selDay && realDay) realDay.value = selDay.value;
      if (inputQ && realQ) realQ.value = inputQ.value;
      const evChange = new Event('change', { bubbles: true });
      const evInput = new Event('input', { bubbles: true });
      if (realMonth) realMonth.dispatchEvent(evChange);
      if (realDay) realDay.dispatchEvent(evChange);
      if (realQ) realQ.dispatchEvent(evInput);
      closeModal('modal-admin-filters');
    });
    filtersClose.addEventListener('click', () => closeModal('modal-admin-filters'));
  }
});

/* ---------- Observador de autenticación ---------- */
onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (!user) {
    isAdmin = false;
    updateAuthUI(null, false);
    if (unsubscribeLista) { unsubscribeLista(); unsubscribeLista = null; }
    if (unsubscribeHorarios) { unsubscribeHorarios(); unsubscribeHorarios = null; }
    const lista = document.getElementById("lista-citas");
    if (lista) lista.innerHTML = "<li>Inicia sesión para ver y gestionar tus citas.</li>";
    return;
  }
  isAdmin = await checkAdminStatus(user.uid);
  updateAuthUI(user, isAdmin);
  if (activeModal && activeModal.id === 'modal-login-required') closeModal('modal-login-required');
  startHorariosListener(diaSeleccionado || Object.keys(horarios)[0]);
  startListaListener();
});