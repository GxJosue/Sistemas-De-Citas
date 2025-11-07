// script.js (mejorado UI: modales, focus trap, toasts, confirm admin)
// Import Firebase as before
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-app.js";
import {
  getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc,
  query as q, where, getDoc
} from "https://www.gstatic.com/firebasejs/11.3.1/firebase-firestore.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.3.1/firebase-auth.js";

/* ---------- Configuración Firebase (igual) ---------- */
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

/* ---------- Datos y estado ---------- */
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

let currentUser = null;
let isAdmin = false;

/* ---------- UI Helpers: Modales, Focus Trap, Toasts ---------- */
let activeModal = null;
let lastFocusedElement = null;
let pendingAdminAction = null; // { type: 'delete'|'reset', id?: string }

// openModal y closeModal - versión corregida y robusta

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  activeModal = modal;
  lastFocusedElement = document.activeElement;

  // Asegurarnos de quitar cualquier display inline que impida mostrar el modal.
  // Usamos 'flex' porque nuestros estilos .modal.show usan display:flex.
  modal.style.display = 'flex';

  // Mostrar visualmente con clase (activa animaciones)
  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');

  // Bloquear scroll de fondo
  document.body.style.overflow = 'hidden';

  // Focus inicial en primer elemento focusable
  const focusable = modal.querySelector('input, button, [tabindex]:not([tabindex="-1"])');
  if (focusable) focusable.focus();

  // Key handling: escape para cerrar & trap Tab
  modal.addEventListener('keydown', modalKeyHandler);
  modal.addEventListener('focusin', trapFocus);
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;

  // quitar clase que muestra el modal (genera animación de salida)
  modal.classList.remove('show');
  modal.setAttribute('aria-hidden', 'true');

  // Forzamos ocultado con display none para evitar overlays residuales
  // (es importante porque puede haber lugares que hayan usado inline styles).
  try {
    modal.style.display = 'none';
  } catch (e) {
    // si no se puede setear style, ignoramos el error
    console.warn('closeModal: no se pudo ajustar modal.style.display', e);
  }

  // Restaurar scroll del body
  document.body.style.overflow = '';

  // Quitar listeners añadidos en openModal
  modal.removeEventListener('keydown', modalKeyHandler);
  modal.removeEventListener('focusin', trapFocus);

  // Devolver foco al elemento que lo tenía antes
  if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
    lastFocusedElement.focus();
  }

  activeModal = null;
}

function modalKeyHandler(e) {
  if (e.key === 'Escape') {
    //Cerrar usando dataset o botón cancel si existe
    if (activeModal) {
      // cerrar el modal actual; buscar botón cancelar dentro
      const btnCancel = activeModal.querySelector('.btn-secondary');
      if (btnCancel) btnCancel.click();
      else closeModal(activeModal.id);
    }
  }
  if (e.key === 'Tab') {
    // managed by focusin/trapFocus
  }
}

// focus trap básico: si focus sale del modal, regresarlo
function trapFocus(e) {
  if (!activeModal) return;
  const focusables = Array.from(activeModal.querySelectorAll('input, button, a, [tabindex]:not([tabindex="-1"])'))
    .filter(n => !n.hasAttribute('disabled'));
  if (focusables.length === 0) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const focused = document.activeElement;
  if (e.relatedTarget === null && focused === document.body) { // initial
    first.focus();
  }
  // ensure tab cycles
  activeModal.addEventListener('keydown', function(ev) {
    if (ev.key !== 'Tab') return;
    if (ev.shiftKey) { // shift + tab
      if (document.activeElement === first) {
        ev.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        ev.preventDefault();
        first.focus();
      }
    }
  }, { once: true });
}

/* For compatibility with previous code (keeps calls intact) */
function mostrarModal(id) { openModal(id); }
function ocultarModal(id) { closeModal(id); }

/* Toasts */
const toastContainer = document.getElementById('toast-container');
function showToast(message, type = 'success', duration = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = message;
  container.appendChild(t);
  // force reflow for animation
  setTimeout(() => t.classList.add('show'), 20);
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => container.removeChild(t), 220);
  }, duration);
}

/* ---------- Horarios (listener y render) ---------- */
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

    const citaExistente = citasGuardadas.find(c => c.dia === dia && c.hora === hora);
    if (citaExistente) {
      btn.classList.remove("hora-disponible");
      btn.classList.add("hora-ocupada");
      btn.disabled = true;
    } else {
      btn.disabled = false;
      btn.addEventListener("click", () => agendarCita(dia, hora));
    }
    contenedor.appendChild(btn);
  });
}

function ocultarHorarios() {
  const contenedor = document.getElementById("horarios");
  if (contenedor) contenedor.innerHTML = "";
}

function cargarHorariosPara(dia) {
  if (!dia) {
    alert("Debe seleccionar un día.");
    return;
  }
  if (!currentUser) {
    alert("Debes iniciar sesión con Google para ver horarios y agendar una cita.");
    return;
  }
  diaSeleccionado = dia;
  startHorariosListener(dia);
}

/* ---------- Agendar / Confirmar Cita ---------- */
function agendarCita(dia, hora) {
  if (!currentUser) {
    alert("Debes iniciar sesión con Google para agendar.");
    return;
  }
  diaCitaSeleccionado = dia;
  horaSeleccionada = hora;
  openModal("modal");
}

async function confirmarCita() {
  const nombreInput = document.getElementById("nombre");
  const telefonoInput = document.getElementById("telefono");
  if (!nombreInput || !telefonoInput) return;

  const nombre = nombreInput.value.trim();
  const telefono = telefonoInput.value.trim();
  if (!nombre || !telefono) {
    alert("Debe ingresar un nombre y un número válido.");
    return;
  }

  const cita = {
    dia: diaCitaSeleccionado,
    hora: horaSeleccionada,
    nombre,
    telefono,
    userId: currentUser.uid,
    createdAt: new Date().toISOString()
  };

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

/* ---------- Cargar lista de citas ---------- */
let unsubscribeLista = null;
function startListaListener() {
  if (unsubscribeLista) unsubscribeLista();

  const listaCitas = document.getElementById("lista-citas");
  if (!listaCitas) return;

  if (!currentUser) {
    listaCitas.innerHTML = "<li>Inicia sesión para ver tus citas.</li>";
    return;
  }

  if (isAdmin) {
    unsubscribeLista = onSnapshot(collection(db, "citas"), (snapshot) => {
      renderLista(snapshot);
    }, error => {
      console.error("Error al cargar todas las citas (admin):", error);
      showToast("Error cargando citas (admin)", "error");
    });
  } else {
    const qUser = q(collection(db, "citas"), where("userId", "==", currentUser.uid));
    unsubscribeLista = onSnapshot(qUser, (snapshot) => {
      renderLista(snapshot);
    }, error => {
      console.error("Error al cargar citas del usuario:", error);
      showToast("Error cargando tus citas", "error");
    });
  }
}

// Reemplaza la función renderLista por esta versión que crea estructura semántica y clases útiles
function renderLista(snapshot) {
  const listaCitas = document.getElementById("lista-citas");
  if (!listaCitas) return;
  listaCitas.innerHTML = "";

  snapshot.forEach(docSnap => {
    const cita = docSnap.data();
    const citaId = docSnap.id;

    // Estructura del item mejorada: <li> <div.appt-info>... </div> <div.appt-actions>... </div> </li>
    const li = document.createElement("li");
    li.className = "appt-card";

    // Info principal (nombre, teléfono, hora, día)
    const info = document.createElement("div");
    info.className = "appt-info";

    const nombreEl = document.createElement("div");
    nombreEl.className = "appt-name";
    nombreEl.textContent = cita.nombre || "Sin nombre";

    const telefonoEl = document.createElement("div");
    telefonoEl.className = "appt-phone";
    telefonoEl.textContent = cita.telefono || "-";

    const metaEl = document.createElement("div");
    metaEl.className = "appt-meta";
    // hora y dia en líneas separadas para mejor lectura en móvil
    metaEl.innerHTML = `<span class="appt-time">${cita.hora || "-"}</span> <span class="sep">·</span> <span class="appt-day">${cita.dia || "-"}</span>`;

    info.appendChild(nombreEl);
    info.appendChild(telefonoEl);
    info.appendChild(metaEl);

    // Acciones (botones)
    const accionesWrapper = document.createElement("div");
    accionesWrapper.className = "appt-actions";

    // Si la cita pertenece al usuario, permitimos editar/eliminar
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

    // Admin puede eliminar cualquiera desde la UI (usa confirmación adicional)
    if (isAdmin && cita.userId !== (currentUser && currentUser.uid)) {
      const btnEliminarAdmin = document.createElement("button");
      btnEliminarAdmin.textContent = "Eliminar (admin)";
      btnEliminarAdmin.className = "eliminar-btn appt-btn";
      btnEliminarAdmin.addEventListener("click", () => confirmAdminDelete(citaId));
      accionesWrapper.appendChild(btnEliminarAdmin);
    }

    // Si admin, también mostrar owner (en la info)
    if (isAdmin) {
      const ownerEl = document.createElement("div");
      ownerEl.className = "appt-owner";
      ownerEl.textContent = `Owner: ${cita.userId}`;
      info.appendChild(ownerEl);
    }

    // Appending
    li.appendChild(info);
    if (accionesWrapper.childElementCount > 0) li.appendChild(accionesWrapper);
    listaCitas.appendChild(li);
  });
}

/* ---------- Editar cita (igual, con toasts) ---------- */
// Reemplaza la función abrirModalEditar en script.js por esta versión:
function abrirModalEditar(id, cita) {
  const modalEditar = document.getElementById("modal-editar");
  const modalConfirmacion = document.getElementById("modal-confirmacion-edicion");
  const nombreInput = document.getElementById("editar-nombre");
  const telefonoInput = document.getElementById("editar-telefono");
  const btnGuardar = document.getElementById("guardar-edicion");
  const btnCancelar = document.getElementById("cancelar-edicion");
  const btnCerrarConfirmacion = document.getElementById("cerrar-confirmacion-edicion");

  if (!modalEditar || !nombreInput || !telefonoInput || !btnGuardar || !btnCancelar) {
    console.error("Elementos del modal de edición no encontrados.");
    return;
  }

  // Usar openModal en vez de manipular style.display manualmente
  openModal("modal-editar");

  // Rellenar campos
  nombreInput.value = cita.nombre || "";
  telefonoInput.value = cita.telefono || "";

  // Evitar listeners duplicados: reemplazamos los botones por clones
  btnGuardar.replaceWith(btnGuardar.cloneNode(true));
  btnCancelar.replaceWith(btnCancelar.cloneNode(true));
  btnCerrarConfirmacion.replaceWith(btnCerrarConfirmacion.cloneNode(true));

  // Re-obtener referencias a los botones "nuevos"
  const nuevoBtnGuardar = document.getElementById("guardar-edicion");
  const nuevoBtnCancelar = document.getElementById("cancelar-edicion");
  const nuevoBtnCerrarConfirmacion = document.getElementById("cerrar-confirmacion-edicion");

  nuevoBtnGuardar.addEventListener("click", async function () {
    try {
      const citaRef = doc(db, "citas", id);
      await updateDoc(citaRef, {
        nombre: nombreInput.value,
        telefono: telefonoInput.value
      });
      // Cerrar modal correctamente usando closeModal
      closeModal("modal-editar");
      showToast("Cita actualizada", "success");
      openModal("modal-confirmacion-edicion");
    } catch (error) {
      console.error("Error al actualizar la cita:", error);
      showToast("Error actualizando cita", "error");
    }
  });

  nuevoBtnCancelar.addEventListener("click", function () {
    closeModal("modal-editar");
  });

  nuevoBtnCerrarConfirmacion.addEventListener("click", function () {
    closeModal("modal-confirmacion-edicion");
  });
}

/* ---------- Eliminar cita con confirmación (usuario propietario) ---------- */
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

/* ---------- Confirmación admin para acciones sensibles ---------- */
function confirmAdminDelete(citaId) {
  if (!isAdmin) {
    showToast("No autorizado", "error");
    return;
  }
  pendingAdminAction = { type: 'delete', id: citaId };
  // abrir modal admin confirm
  openModal('modal-admin-confirm');
  const input = document.getElementById('admin-confirm-input');
  if (input) { input.value = ''; input.focus(); }
}

async function performPendingAdminAction() {
  if (!pendingAdminAction) return;
  if (pendingAdminAction.type === 'delete') {
    try {
      await deleteDoc(doc(db, "citas", pendingAdminAction.id));
      showToast("Cita eliminada (admin)", "success");
    } catch (err) {
      console.error("Error eliminando (admin):", err);
      showToast("Error al eliminar (admin)", "error");
    }
  } else if (pendingAdminAction.type === 'reset') {
    try {
      // delete all
      const snapshot = await new Promise((res, rej) => {
        const col = collection(db, "citas");
        const unsub = onSnapshot(col, s => { unsub(); res(s); }, err => rej(err));
      });
      const promises = [];
      snapshot.forEach(docSnap => promises.push(deleteDoc(doc(db, "citas", docSnap.id))));
      await Promise.all(promises);
      showToast("Todas las citas eliminadas", "success");
    } catch (err) {
      console.error("Error reseteando citas:", err);
      showToast("Error reseteando citas", "error");
    }
  }
  pendingAdminAction = null;
}

/* ---------- Reset global (admin) ---------- */
async function resetearTodasLasCitas() {
  if (!isAdmin) {
    alert("No estás autorizado.");
    return;
  }
  pendingAdminAction = { type: 'reset' };
  openModal('modal-admin-confirm');
  const input = document.getElementById('admin-confirm-input');
  if (input) { input.value = ''; input.focus(); }
}

/* admin modal approve/cancel binding */
document.addEventListener('DOMContentLoaded', () => {
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
});

/* ---------- Auth: login/logout y control de estado ---------- */
async function doLogin() {
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    console.error("Error en login:", err);
    showToast("Error al iniciar sesión", "error");
  }
}

async function doLogout() {
  try {
    await signOut(auth);
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

  // Mostrar reset si admin
  const resetBtn = document.getElementById("reset-all");
  if (adminFlag) {
    resetBtn.style.display = "inline-block";
  } else {
    resetBtn.style.display = "none";
  }
}

/* ---------- Inicialización y binding de eventos ---------- */
document.addEventListener("DOMContentLoaded", () => {
  // Días
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

  // Modal agendar (botones)
  const btnConfirmar = document.getElementById("confirmar-cita");
  const btnCancelarModal = document.getElementById("cancelar-modal");
  if (btnConfirmar) btnConfirmar.addEventListener("click", confirmarCita);
  if (btnCancelarModal) btnCancelarModal.addEventListener("click", cerrarModalAgendar);

  // Cerrar confirmaciones
  const cerrarConfirmacion = document.getElementById("cerrar-confirmacion");
  if (cerrarConfirmacion) cerrarConfirmacion.addEventListener("click", () => closeModal("modal-confirmacion"));

  // Cancelar eliminar
  const cancelarEliminar = document.getElementById("cancelar-eliminar");
  if (cancelarEliminar) cancelarEliminar.addEventListener("click", () => closeModal("modal-eliminar"));

  // Cerrar eliminación exitosa
  const cerrarEliminacionExitosa = document.getElementById("cerrar-eliminacion-exitosa");
  if (cerrarEliminacionExitosa) cerrarEliminacionExitosa.addEventListener("click", () => closeModal("modal-eliminacion-exitosa"));

  // Reset all (admin)
  const resetAllBtn = document.getElementById("reset-all");
  if (resetAllBtn) resetAllBtn.addEventListener("click", resetearTodasLasCitas);

  // Lista de citas (se ajustará cuando haya user)
  startListaListener();

  // Observador de auth
  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (!user) {
      isAdmin = false;
      updateAuthUI(null, false);
      if (unsubscribeLista) { unsubscribeLista(); unsubscribeLista = null; }
      if (unsubscribeHorarios) { unsubscribeHorarios(); unsubscribeHorarios = null; }
      document.getElementById("lista-citas").innerHTML = "<li>Inicia sesión para ver y gestionar tus citas.</li>";
      return;
    }
    isAdmin = await checkAdminStatus(user.uid);
    updateAuthUI(user, isAdmin);
    startHorariosListener(diaSeleccionado || Object.keys(horarios)[0]);
    startListaListener();
  });
});