import { initializeApp } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-app.js";
import {
  getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc,
  getDocs, getDoc, writeBatch, query, where
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

// Lista global de barberos
let barberosList = [];


const CLIENT_ID_KEY = 'appointments_client_id';
let CLIENT_ID = null;
try {
  CLIENT_ID = sessionStorage.getItem(CLIENT_ID_KEY);
  if (!CLIENT_ID) {
    CLIENT_ID = 'c_' + Math.random().toString(36).slice(2, 12);
    sessionStorage.setItem(CLIENT_ID_KEY, CLIENT_ID);
  }
  console.debug("CLIENT_ID:", CLIENT_ID);
} catch (e) {
  // si sessionStorage no está disponible, fallback a id temporal en memoria
  CLIENT_ID = 'c_' + Math.random().toString(36).slice(2, 12);
  console.warn("sessionStorage no disponible, usando CLIENT_ID temporal:", CLIENT_ID);
}

async function cargarBarberos() {
  const select = document.getElementById("barbero-select");
  if (!select) return;
  // placeholder mientras cargan / por si hay error
  select.innerHTML = '<option value="">Cargando barberos...</option>';
  try {
    const snapshot = await getDocs(collection(db, "barberos"));
    // build list of barberos
    const barberos = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data() || {};
      // soporte para distintos nombres de campo y fallback al id
      const nombre = (data.nombre && String(data.nombre).trim()) ||
                     (data.name && String(data.name).trim()) ||
                     docSnap.id;
      
      const activo = (typeof data.activo === 'undefined') ? true : Boolean(data.activo);
      if (activo && nombre) {
        barberos.push({ id: docSnap.id, nombre });
      }
    });
    // orden alfabético para mejor UX
    barberos.sort((a, b) => a.nombre.localeCompare(b.nombre, undefined, { sensitivity: 'base' }));

    // actualizar la lista global de barberos 
    barberosList = barberos.map(b => b.nombre);

    // render opciones
    if (barberos.length === 0) {
      select.innerHTML = '<option value="">No hay barberos disponibles</option>';
    } else {
      select.innerHTML = '<option value="">Selecciona un barbero</option>';
      barberos.forEach(b => {
        const opt = document.createElement("option");
        opt.value = b.nombre;
        opt.textContent = b.nombre;
        opt.dataset.docId = b.id;
        select.appendChild(opt);
      });
    }

    // Poblar select de filtro por barbero (si existe)
    try {
      const filterBarbero = document.getElementById('filter-barbero');
      if (filterBarbero) {
        // limpiar y añadir opción "Todos"
        filterBarbero.innerHTML = '<option value="all">Todos los barberos</option>';
        barberos.forEach(b => {
          const opt = document.createElement('option');
          opt.value = b.nombre;
          opt.textContent = b.nombre;
          filterBarbero.appendChild(opt);
        });
        // Si había un valor previamente seleccionado en adminFilters, restaurarlo
        if (adminFilters.barbero && adminFilters.barbero !== 'all') {
          filterBarbero.value = adminFilters.barbero;
        }
      }
    } catch (e) {
      console.debug("No se pudo poblar filter-barbero:", e);
    }

  } catch (err) {
    console.error("Error cargando barberos desde Firestore:", err);
    select.innerHTML = '<option value="">Error cargando barberos</option>';
  }
}

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

const adminFilters = { month: 'all', day: 'all', q: '', barbero: 'all' };
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
  if (!Array.isArray(citasGuardadas)) citasGuardadas = [];
  // cantidad total de barberos conocidos
  const totalBarberos = Array.isArray(barberosList) ? barberosList.length : 0;

  horarios[dia].forEach(hora => {
    const btn = document.createElement("button");
    btn.textContent = hora;
    btn.classList.add("hora-disponible");
    btn.disabled = false;

    // Obtener todas las citas que coincidan con la fecha seleccionada o el día
    let citasMatching = [];
    try {
      if (selectedDateISO) {
        citasMatching = citasGuardadas.filter(c => {
          if (!c) return false;
          const fechaMatches = (c.fecha === selectedDateISO) || (c.fechaISO === selectedDateISO);
          return fechaMatches && c.hora === hora;
        });
      } else {
        citasMatching = citasGuardadas.filter(c => c && c.dia === dia && c.hora === hora);
      }
    } catch (e) {
      console.error("Error filtrando citas para horarios:", e);
      citasMatching = [];
    }

    const barberoSelect = document.getElementById("barbero-select");
    const barberoSeleccionado = barberoSelect ? barberoSelect.value.trim() : "";

    if (barberoSeleccionado) {
      // Si hay un barbero seleccionado: la hora está ocupada solo si ese barbero ya tiene cita a esa hora
      const citasDelBarbero = citasMatching.filter(c => c && String(c.barbero || '').trim() === barberoSeleccionado);
      if (citasDelBarbero.length > 0) {
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
    } else {
      // Ningún barbero seleccionado: solo bloquear la hora si TODOS los barberos están reservados en esa hora
      if (totalBarberos === 0) {
        // si no hay barberos definidos, marcamos como no disponible para evitar reservas inválidas
        btn.classList.remove("hora-disponible");
        btn.classList.add("hora-ocupada");
        btn.disabled = true;
      } else {
        const bookedBarberos = new Set();
        citasMatching.forEach(c => {
          if (c && c.barbero) bookedBarberos.add(String(c.barbero).trim());
        });
        if (bookedBarberos.size >= totalBarberos) {
          // todas las plazas (barberos) ocupadas en este horario
          btn.classList.remove("hora-disponible");
          btn.classList.add("hora-ocupada");
          btn.disabled = true;
        } else {
          // todavía hay al menos un barbero disponible en esa hora
          btn.disabled = false;
          btn.addEventListener("click", () => {
            if (selectedDateISO) agendarCita(selectedDateISO, hora);
            else agendarCita(dia, hora);
          });
        }
      }
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

/* ---------- Comprobación de disponibilidad (nuevo) ---------- */
async function isSlotTaken(barbero, fechaISO, dia, hora) {
  try {
    if (!barbero || !hora) return false;
    if (fechaISO && /^\d{4}-\d{2}-\d{2}$/.test(fechaISO)) {
      const q = query(collection(db, "citas"), where("fecha", "==", fechaISO), where("hora", "==", hora), where("barbero", "==", barbero));
      const snap = await getDocs(q);
      return !snap.empty;
    } else {
      const q = query(collection(db, "citas"), where("dia", "==", dia), where("hora", "==", hora), where("barbero", "==", barbero));
      const snap = await getDocs(q);
      return !snap.empty;
    }
  } catch (err) {
    console.error("Error comprobando disponibilidad:", err);
    showToast("No se pudo verificar la disponibilidad. Intenta de nuevo.", "error", 4000);
    // bloquear por seguridad: si no podemos verificar, no permitimos reservar
    return true;
  }
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
  const barberoSelect = document.getElementById("barbero-select");
  const barbero = barberoSelect ? barberoSelect.value.trim() : "";
  if (!barbero) { showToast("Debe seleccionar un barbero.", "error"); return; }
  if (!nombre || !telefono) { showToast("Debe ingresar un nombre y un número válido.", "error"); return; }
  if (diaCitaSeleccionado && /^\d{4}-\d{2}-\d{2}$/.test(diaCitaSeleccionado)) {
    const minDate = getStartOfDayISO(addDays(new Date(), 1));
    if (diaCitaSeleccionado < minDate) { showToast("La reserva debe hacerse con al menos 1 día de anticipación.", "error"); return; }
  }

  // Verificar disponibilidad ANTES de crear la cita
  const fechaIso = (diaCitaSeleccionado && /^\d{4}-\d{2}-\d{2}$/.test(diaCitaSeleccionado)) ? diaCitaSeleccionado : null;
  const diaName = diaSeleccionado;
  const ocupado = await isSlotTaken(barbero, fechaIso, diaName, horaSeleccionada);
  if (ocupado) {
    showToast("Horario ocupado para el barbero seleccionado. Elija otro horario o barbero.", "error");
    return;
  }

const cita = {
  dia: diaSeleccionado,
  hora: horaSeleccionada,
  nombre,
  telefono,
  barbero,
  userId: currentUser ? currentUser.uid : null,
  createdAt: new Date().toISOString(),
  createdByClient: CLIENT_ID // <-- añadido: identifica el cliente que creó el doc
};
if (diaCitaSeleccionado && /^\d{4}-\d{2}-\d{2}$/.test(diaCitaSeleccionado)) cita.fecha = diaCitaSeleccionado;
  try {
    await addDoc(collection(db, "citas"), cita);
    // resetear selección del barbero para que no quede "guardada"
    if (barberoSelect) {
      barberoSelect.value = "";
    }
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

      // Nuevo: filtro por barbero (exact match por nombre)
      if (adminFilters.barbero && adminFilters.barbero !== 'all') {
        if (!c.barbero) return false;
        if (String(c.barbero).trim() !== adminFilters.barbero) return false;
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
    if (cita.barbero) {
      const barberoEl = document.createElement("div");
      barberoEl.className = "appt-barbero";
      barberoEl.textContent = `Barbero: ${cita.barbero}`;
      info.appendChild(barberoEl);
    }
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
      btnEliminarAdmin.textContent = "Eliminar";
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
  const horaSelect = document.getElementById("editar-hora"); // ← nuevo campo de hora

  const btnGuardar = document.getElementById("guardar-edicion");
  const btnCancelar = document.getElementById("cancelar-edicion");
  const btnCerrarConfirmacion = document.getElementById("cerrar-confirmacion-edicion");

  // Validar que todos los elementos existan
  if (!modalEditar || !nombreInput || !telefonoInput || !horaSelect || !btnGuardar || !btnCancelar) {
    console.error("Elementos del modal de edición faltan");
    return;
  }

  // Abrir el modal
  openModal("modal-editar");

  // Precargar los datos existentes de la cita
  nombreInput.value = cita.nombre || "";
  telefonoInput.value = cita.telefono || "";
  horaSelect.value = cita.hora || ""; // ← muestra la hora actual de la cita

  // Clonar botones para evitar duplicar listeners anteriores
  btnGuardar.replaceWith(btnGuardar.cloneNode(true));
  btnCancelar.replaceWith(btnCancelar.cloneNode(true));
  if (btnCerrarConfirmacion) btnCerrarConfirmacion.replaceWith(btnCerrarConfirmacion.cloneNode(true));

  // Volver a capturar los nuevos botones clonados
  const nuevoBtnGuardar = document.getElementById("guardar-edicion");
  const nuevoBtnCancelar = document.getElementById("cancelar-edicion");
  const nuevoBtnCerrarConfirmacion = document.getElementById("cerrar-confirmacion-edicion");

  // Guardar cambios
  nuevoBtnGuardar.addEventListener("click", async function () {
    const nombre = nombreInput.value.trim();
    const telefono = telefonoInput.value.trim();
    const hora = horaSelect.value.trim();

    if (!nombre || !telefono || !hora) {
      showToast("Completa todos los campos antes de guardar.", "warning");
      return;
    }

    try {
      const citaRef = doc(db, "citas", id);
      await updateDoc(citaRef, {
        nombre,
        telefono,
        hora
      });

      closeModal("modal-editar");
      showToast("Cita actualizada correctamente.", "success");

      
      if (nuevoBtnCerrarConfirmacion) openModal("modal-confirmacion-edicion");
    } catch (error) {
      console.error("Error al actualizar la cita:", error);
      showToast("Error actualizando cita", "error");
    }
  });

  // Cancelar edición
  nuevoBtnCancelar.addEventListener("click", function () {
    closeModal("modal-editar");
  });

  // Cerrar confirmación 
  if (nuevoBtnCerrarConfirmacion) {
    nuevoBtnCerrarConfirmacion.addEventListener("click", function () {
      closeModal("modal-confirmacion-edicion");
    });
  }
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
// Reemplaza tu doLogin actual por esta versión
async function doLogin() {
  try {
    await signInWithPopup(auth, provider);
    // Marcar en sessionStorage que acabamos de iniciar sesión en esta sesión
    // y forzar un reload para que toda la UI (listeners, consultas, selects) se
    // inicialicen con el usuario ya autenticado.
    try {
      sessionStorage.setItem('reloaded_after_login', '1');
    } catch (e) {
      // si sessionStorage no está disponible, seguimos sin la marca
      console.warn("sessionStorage no disponible para marcar reload:", e);
    }
    // pequeña espera para que se cierre el popup y la promesa haya "settled"
    setTimeout(() => {
      location.reload();
    }, 80);
  } catch (err) {
    console.error("Error en login:", err);
    showToast("Error al iniciar sesión", "error");
  }
}
async function doLogout() {
  try {
    await signOut(auth);
    try { sessionStorage.removeItem('reloaded_after_login'); } catch(e) {}
    showToast("Sesión cerrada", "success");
  } catch (err) {
    console.error("Error en logout:", err);
    showToast("Error cerrando sesión", "error");
  }
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

/* Helper: small inline Google "G" SVG (brand-ish) */
function googleSVG() {
  return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path fill="#EA4335" d="M12.24 10.285v3.432h4.69c-.2 1.345-1.486 4.01-4.69 4.01-2.818 0-5.11-2.316-5.11-5.17s2.292-5.17 5.11-5.17c1.607 0 2.684.686 3.306 1.28l2.254-2.17C16.6 4.7 14.76 3.5 12.24 3.5 7.74 3.5 4 7.24 4 11.74s3.74 8.24 8.24 8.24c4.75 0 7.9-3.34 7.9-8.04 0-.54-.06-.94-.16-1.32H12.24z"/>
  </svg>`;
}

/* Small logout SVG */
function logoutSVG() {
  return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path stroke-linecap="round" stroke-linejoin="round" d="M16 17l5-5-5-5M21 12H9" />
    <path stroke-linecap="round" stroke-linejoin="round" d="M12 19H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" />
  </svg>`;
}

/* Update auth UI: render login button or avatar + logout. */
function updateAuthUI(user, adminFlag) {
  const authArea = document.getElementById("auth-area");
  if (!authArea) return;
  authArea.innerHTML = "";
  // If no user: show Google login button (with logo)
  if (!user) {
    const btn = document.createElement("button");
    btn.id = "login-btn";
    btn.className = "btn-google";
    btn.type = "button";
    btn.setAttribute('aria-label', 'Iniciar sesión con Google');
    btn.innerHTML = `<span>Iniciar sesión</span>${googleSVG()}`;
    btn.addEventListener("click", doLogin);
    authArea.appendChild(btn);

    // hide admin-only UI
    const r = document.getElementById("reset-all");
    if (r) r.style.display = "none";
    const af = document.getElementById("admin-filters");
    if (af) af.style.display = "none";
    const toggle = document.getElementById("admin-filters-toggle");
    if (toggle) toggle.style.display = "none";
    return;
  }

  // If logged in: show avatar (if any), name/email, and logout button with icon
  const avatarWrapper = document.createElement("div");
  avatarWrapper.className = "auth-avatar";
  const img = document.createElement("img");
  img.alt = `${user.displayName || user.email} avatar`;
  img.loading = "lazy";
  if (user.photoURL) img.src = user.photoURL;
  else {
    // fallback avatar (tiny data URI SVG)
    const fallback = encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.2" fill="#cbd5e1"/><path d="M4 20a8 8 0 0116 0" fill="#e6eefb"/></svg>');
    img.src = `data:image/svg+xml;charset=utf-8,${fallback}`;
  }
  avatarWrapper.appendChild(img);

  const nameSpan = document.createElement("span");
  nameSpan.className = "auth-username";
  nameSpan.textContent = `${user.displayName || user.email || ''}`;

  const btnLogout = document.createElement("button");
  btnLogout.id = "logout-btn";
  btnLogout.className = "btn-logout";
  btnLogout.type = "button";
  btnLogout.setAttribute('aria-label', 'Salir de la sesión');
  btnLogout.innerHTML = `${logoutSVG()}<span>Salir</span>`;
  btnLogout.addEventListener("click", doLogout);

  // Append in a friendly order
  authArea.appendChild(avatarWrapper);
  authArea.appendChild(nameSpan);
  authArea.appendChild(btnLogout);

  // admin-specific UI toggles
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
  // Si venimos de un login y la página fue recargada, borrar la marca para evitar futuros reloads
try {
  if (sessionStorage.getItem('reloaded_after_login')) {
    sessionStorage.removeItem('reloaded_after_login');
    console.debug("reloaded_after_login flag removed on load");
  }
} catch (e) {
  // no crítico
}
  cargarBarberos();
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
  const filterBarbero = document.getElementById('filter-barbero');

  // Listeners de filtros (incluye barbero)
  if (filterBarbero) {
    filterBarbero.addEventListener('change', (e) => {
      adminFilters.barbero = e.target.value;
      if (latestCitasSnapshot) renderLista(latestCitasSnapshot);
    });
  }
  if (filterMonth) filterMonth.addEventListener('change', (e) => { adminFilters.month = e.target.value; if (latestCitasSnapshot) renderLista(latestCitasSnapshot); });
  if (filterDay) filterDay.addEventListener('change', (e) => { adminFilters.day = e.target.value; if (latestCitasSnapshot) renderLista(latestCitasSnapshot); });
  if (filterQ) filterQ.addEventListener('input', (e) => { adminFilters.q = e.target.value; if (latestCitasSnapshot) renderLista(latestCitasSnapshot); });

  // Ajustar el botón limpiar para resetear también el filtro de barbero
  if (filterClear) filterClear.addEventListener('click', () => {
    adminFilters.month = 'all'; adminFilters.day = 'all'; adminFilters.q = ''; adminFilters.barbero = 'all';
    if (filterMonth) filterMonth.value = 'all';
    if (filterDay) filterDay.value = 'all';
    if (filterQ) filterQ.value = '';
    if (filterBarbero) filterBarbero.value = 'all';
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
      const selBarbero = filtersModalContent.querySelector('#filter-barbero');
      const inputQ = filtersModalContent.querySelector('#filter-q');
      const realMonth = document.getElementById('filter-month');
      const realDay = document.getElementById('filter-day');
      const realBarbero = document.getElementById('filter-barbero');
      const realQ = document.getElementById('filter-q');
      if (selMonth && realMonth) realMonth.value = selMonth.value;
      if (selDay && realDay) realDay.value = selDay.value;
      if (selBarbero && realBarbero) realBarbero.value = selBarbero.value;
      if (inputQ && realQ) realQ.value = inputQ.value;
      const evChange = new Event('change', { bubbles: true });
      const evInput = new Event('input', { bubbles: true });
      if (realMonth) realMonth.dispatchEvent(evChange);
      if (realDay) realDay.dispatchEvent(evChange);
      if (realBarbero) realBarbero.dispatchEvent(evChange);
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

// ---- Reemplazo robusto del listener de sincronización con Make (cálculo seguro de startISO/endISO) ----

const MAKE_WEBHOOK_URL = "https://hook.us2.make.com/hnypnb8aww1hfqtx9c4et2uqsku1lhpn";
const citasRef = collection(db, "citas");

/**
 * Intenta construir startISO y endISO de forma robusta.
 * Devuelve { startISO: string|null, endISO: string|null, debug: {...} }
 */
// Reemplaza buildStartEndISO por esta versión robusta (auto-contenida)
function buildStartEndISO(cita) {
  const debug = {
    origenFecha: null,
    fechaRawBefore: null,
    fechaNormalized: null,
    horaInput: cita ? cita.hora : null,
    horaParsed: null,
    reason: null
  };

  if (!cita) {
    debug.reason = 'no-cita';
    return { startISO: null, endISO: null, debug };
  }

  // Obtener la "fecha" desde varios campos posibles
  let fechaRaw = (cita.fecha !== undefined && cita.fecha !== null) ? cita.fecha
               : (cita.fechaISO !== undefined && cita.fechaISO !== null) ? cita.fechaISO
               : (cita.fechaString !== undefined && cita.fechaString !== null) ? cita.fechaString
               : null;

  debug.fechaRawBefore = fechaRaw;

  // Si es Timestamp de Firestore, convertir a YYYY-MM-DD
  if (fechaRaw && typeof fechaRaw.toDate === 'function') {
    try {
      const dt = fechaRaw.toDate();
      const y = dt.getFullYear(), m = dt.getMonth() + 1, d = dt.getDate();
      fechaRaw = `${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      debug.origenFecha = 'timestamp';
      debug.fechaNormalized = fechaRaw;
    } catch (e) {
      debug.reason = 'timestamp-toDate-failed';
      return { startISO: null, endISO: null, debug };
    }
  } else if (typeof fechaRaw === 'string') {
    fechaRaw = fechaRaw.trim();
    debug.origenFecha = 'string';
    if (/^\d{4}-\d{2}-\d{2}$/.test(fechaRaw)) {
      debug.fechaNormalized = fechaRaw;
    } else {
      // intentar parsear como ISO o cualquier otra fecha reconocible
      const dt = new Date(fechaRaw);
      if (!isNaN(dt.getTime())) {
        const y = dt.getFullYear(), m = dt.getMonth() + 1, d = dt.getDate();
        fechaRaw = `${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        debug.fechaNormalized = fechaRaw;
      } else {
        debug.reason = 'fecha-string-no-parseable';
        return { startISO: null, endISO: null, debug };
      }
    }
  } else {
    debug.reason = 'fecha-no-proporcionada-o-tipo-desconocido';
    return { startISO: null, endISO: null, debug };
  }

  // Validar formato final YYYY-MM-DD
  const mFecha = fechaRaw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!mFecha) {
    debug.reason = 'fecha-no-matched';
    return { startISO: null, endISO: null, debug };
  }
  const year = parseInt(mFecha[1], 10);
  const month = parseInt(mFecha[2], 10);
  const day = parseInt(mFecha[3], 10);

  // Parse robusto de la hora: soporta "11:00 AM", "7:00 PM", "07:00", "7:00"
  const horaRaw = (typeof cita.hora === 'string') ? cita.hora.trim() : String(cita.hora || '');
  debug.horaInput = horaRaw;

  if (!horaRaw) {
    debug.reason = 'hora-vacia';
    return { startISO: null, endISO: null, debug };
  }

  // 1) Intentar 12h con AM/PM
  let hh = null, mm = null;
  let m12 = horaRaw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (m12) {
    hh = parseInt(m12[1], 10);
    mm = parseInt(m12[2], 10);
    const period = m12[3].toUpperCase();
    if (period === 'PM' && hh !== 12) hh += 12;
    if (period === 'AM' && hh === 12) hh = 0;
    debug.horaParsed = `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
  } else {
    // 2) Intentar formato 24h "HH:MM"
    const m24 = horaRaw.match(/^(\d{1,2}):(\d{2})$/);
    if (m24) {
      hh = parseInt(m24[1], 10);
      mm = parseInt(m24[2], 10);
      // validación básica
      if (hh < 0 || hh > 23 || mm < 0 || mm > 59) {
        debug.reason = 'hora-fuera-de-rango';
        return { startISO: null, endISO: null, debug };
      }
      debug.horaParsed = `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
    } else {
      debug.reason = 'hora-no-parseable';
      return { startISO: null, endISO: null, debug };
    }
  }

  // Construir Date en hora local (evitar new Date("YYYY-MM-DDTHH:MM") por compatibilidad)
  const startDate = new Date(year, month - 1, day, hh, mm, 0, 0);
  if (isNaN(startDate.getTime())) {
    debug.reason = 'startDate-NaN';
    return { startISO: null, endISO: null, debug };
  }
  const endDate = new Date(startDate.getTime() + 40 * 60 * 1000); // +40 minutos

  // startISO/endISO en formato ISO completo (UTC)
  return {
    startISO: startDate.toISOString(),
    endISO: endDate.toISOString(),
    debug
  };
}

/**
 * Enviar payload a Make (igual que antes, pero añadimos debug de start/end)
 */
function sendToMake(payload) {
  console.debug("Webhook payload:", payload);
  return fetch(MAKE_WEBHOOK_URL, {
    method: "POST",
    mode: "cors",
    cache: "no-store",
    credentials: "omit",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true
  })
  .then(async (res) => {
    if (!res.ok) {
      const text = await res.text().catch(() => "<no body>");
      console.error("Make webhook returned status", res.status, "body:", text);
    } else {
      console.debug("Make webhook OK", res.status);
    }
    return res;
  })
  .catch(err => {
    console.error("Error enviando a Make:", err);
    return null;
  });
}

/**
 * Procesa un change y manda webhook con start/end (intenta construirlos)
 */
function processAndSendWebhook(action, id, citaData, extraMeta = {}) {
  const result = buildStartEndISO(citaData);
  const startISO = result.startISO;
  const endISO = result.endISO;

  const payload = {
    action,
    id,
    cita: citaData || null,
    startISO: startISO || null,
    endISO: endISO || null,
    meta: Object.assign({
      ua: (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : 'unknown',
      sentAt: new Date().toISOString(),
      startBuildDebug: result.debug || null
    }, extraMeta)
  };

  // Si startISO/endISO son null y Make los necesita, puedes:
  // - enviar igual y que Make trate la ausencia, o
  // - evitar enviar y loggear (aquí enviamos siempre, pero con debug para que veas por qué falló)
  return sendToMake(payload);
}

// Mantén la lógica de watchers si usabas hasPendingWrites
const pendingDocWatchers = new Map();
const sentWebhookCache = new Map();
let citasListenerInitialized = false;


function watchDocUntilSynced(docRef, initialAction, initialId, initialCita, timeoutMs = 15000, extraMeta = {}) {
  const id = initialId;
  if (pendingDocWatchers.has(id)) return;

  const unsub = onSnapshot(docRef, { includeMetadataChanges: true }, (docSnap) => {
    try {
      const meta = docSnap.metadata || {};
      if (meta.hasPendingWrites === false) {
        const data = docSnap.exists() ? docSnap.data() : initialCita;
        processAndSendWebhook(initialAction, id, data, Object.assign({ reason: 'synced-event' }, extraMeta));
        const stored = pendingDocWatchers.get(id);
        if (stored) {
          clearTimeout(stored.timeoutId);
          try { stored.unsub(); } catch(e) {}
          pendingDocWatchers.delete(id);
        }
      }
    } catch (err) {
      console.error("Watcher error:", err);
    }
  }, (error) => {
    console.error("Error en watcher de doc:", error);
  });

  const timeoutId = setTimeout(() => {
    try {
      getDoc(docRef).then(docSnap => {
        const data = docSnap.exists() ? docSnap.data() : initialCita;
        processAndSendWebhook(initialAction, id, data, Object.assign({ reason: 'timeout-fallback' }, extraMeta));
      }).catch(err => {
        processAndSendWebhook(initialAction, id, initialCita, Object.assign({ reason: 'timeout-fallback-getdoc-failed' }, extraMeta));
      });
    } finally {
      const stored = pendingDocWatchers.get(id);
      if (stored) {
        try { stored.unsub(); } catch(e) {}
        pendingDocWatchers.delete(id);
      }
    }
  }, timeoutMs);

  pendingDocWatchers.set(id, { unsub, timeoutId });
}
onSnapshot(citasRef, { includeMetadataChanges: true }, (snapshot) => {
  const isInitialSnapshot = !citasListenerInitialized;
  snapshot.docChanges().forEach((change) => {
    try {
      const id = change.doc.id;
      const cita = change.doc.data();
      const meta = change.doc.metadata || {};
      let action = "";
      if (change.type === "added") action = "create";
      if (change.type === "modified") action = "update";
      if (change.type === "removed") action = "delete";

      // En la snapshot inicial NO enviamos webhooks por docs existentes.
      if (isInitialSnapshot) {
        if (meta.hasPendingWrites) {
          // raro en snapshot inicial, pero si hay pendingWrites creamos watcher
          console.debug(`(Inicial) Doc ${id} tiene hasPendingWrites=true. Creando watcher...`);
          const docRef = change.doc.ref;
          const creatorEmail = (typeof currentUser !== 'undefined' && currentUser && currentUser.email) ? currentUser.email : null;
          watchDocUntilSynced(docRef, action, id, cita, 15000, { userEmail: creatorEmail, createdByClient: (cita && cita.createdByClient) || null });
        }
        return;
      }

      // Si tiene pendingWrites (es local), el cliente creador ya creará un watcher para enviar el webhook
      if (meta.hasPendingWrites) {
        console.debug(`Doc ${id} tiene hasPendingWrites=true (action=${action}). Creando watcher...`);
        const docRef = change.doc.ref;
        const creatorEmail = (typeof currentUser !== 'undefined' && currentUser && currentUser.email) ? currentUser.email : null;
        watchDocUntilSynced(docRef, action, id, cita, 15000, { userEmail: creatorEmail, createdByClient: (cita && cita.createdByClient) || null });
        return;
      }

      // Evitar envíos duplicados en ventana corta (cache in-memory)
      const lastSent = sentWebhookCache.get(id);
      const now = Date.now();
      const DUP_WINDOW_MS = 10000; // 10 s
      if (lastSent && (now - lastSent) < DUP_WINDOW_MS) {
        console.debug(`Saltando envío de webhook para ${id} porque ya fue enviado hace ${(now - lastSent)}ms`);
        return;
      }

      // NUEVO: sólo permitir envío directo si la cita fue creada por ESTE cliente
      const docClientId = cita && cita.createdByClient ? String(cita.createdByClient) : null;
      if (!docClientId) {
        // Si no existe createdByClient (documentos viejos), para mayor seguridad NO enviar desde clientes nuevos.
        // Esto evita reenvíos desde múltiples dispositivos si comparten userId.
        console.debug(`Doc ${id} no tiene createdByClient; saltando envío directo (posible doc antiguo).`);
        return;
      }
      if (docClientId !== CLIENT_ID) {
        console.debug(`Doc ${id} fue creado por otro cliente (${docClientId}), este cliente (${CLIENT_ID}) no enviará el webhook.`);
        return;
      }

      // Llegamos aquí: este cliente es el creador registrado -> enviar
      const extraMeta = { reason: 'direct' };
      if (currentUser && currentUser.email) extraMeta.userEmail = currentUser.email;

      // Marcar como enviado y limpiar después
      sentWebhookCache.set(id, now);
      setTimeout(() => sentWebhookCache.delete(id), DUP_WINDOW_MS + 2000);

      console.debug(`Doc ${id} confirmado por servidor, enviando webhook (action=${action}) desde client ${CLIENT_ID}`);
      processAndSendWebhook(action, id, cita, extraMeta);

    } catch (err) {
      console.error("Error procesando change en snapshot:", err);
    }
  });

  if (isInitialSnapshot) {
    citasListenerInitialized = true;
    console.debug("citasRef: snapshot inicial procesada — futuras changes se enviarán normalmente");
  }
}, (error) => {
  console.error("Error en snapshot de citas:", error);
});