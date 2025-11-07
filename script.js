// script.js (modificado para Google Sign-In con Firebase Auth y roles admin)
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-app.js";
import {
  getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc,
  query as q, where, getDoc
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

/* ---------- Utilidades de UI (mostrar/ocultar modales) ---------- */
function mostrarModal(id) {
  const m = document.getElementById(id);
  if (m) { m.style.display = "flex"; m.setAttribute('aria-hidden','false'); }
}
function ocultarModal(id) {
  const m = document.getElementById(id);
  if (m) { m.style.display = "none"; m.setAttribute('aria-hidden','true'); }
}

/* ---------- Horarios ----------
 - Para marcar horarios ocupados necesitamos leer TODAS las citas (solo para saber ocupados).
 - La lista de citas mostrada al usuario se limita a las suyas (query por userId).
*/
let unsubscribeHorarios = null;
function startHorariosListener(dia) {
  // cancelamos listener previo si existe
  if (unsubscribeHorarios) unsubscribeHorarios();

  // escuchamos toda la colección 'citas' para marcar ocupados
  const col = collection(db, "citas");
  unsubscribeHorarios = onSnapshot(col, (snapshot) => {
    const citasGuardadas = snapshot.docs.map(d => d.data());
    renderHorarios(dia, citasGuardadas);
  }, error => {
    console.error("Error al escuchar citas para horarios:", error);
  });
}

function renderHorarios(dia, citasGuardadas) {
  const contenedor = document.getElementById("horarios");
  if (!contenedor) return;
  contenedor.innerHTML = "";

  if (!dia) {
    return;
  }

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
  diaSeleccionado = dia;
  // start listener will re-render horarios on every change
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
  mostrarModal("modal");
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
    cerrarModalAgendar();
    mostrarModal("modal-confirmacion");
  } catch (err) {
    console.error("Error al guardar la cita:", err);
    alert("Ocurrió un error al guardar la cita. Revisa la consola.");
  }
}

function cerrarModalAgendar() {
  ocultarModal("modal");
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

  // Si es admin: muestra todas las citas; sino: solo las del usuario
  if (isAdmin) {
    unsubscribeLista = onSnapshot(collection(db, "citas"), (snapshot) => {
      renderLista(snapshot);
    }, error => {
      console.error("Error al cargar todas las citas (admin):", error);
    });
  } else {
    const qUser = q(collection(db, "citas"), where("userId", "==", currentUser.uid));
    unsubscribeLista = onSnapshot(qUser, (snapshot) => {
      renderLista(snapshot);
    }, error => {
      console.error("Error al cargar citas del usuario:", error);
    });
  }
}

function renderLista(snapshot) {
  const listaCitas = document.getElementById("lista-citas");
  if (!listaCitas) return;
  listaCitas.innerHTML = "";

  snapshot.forEach(docSnap => {
    const cita = docSnap.data();
    const citaId = docSnap.id;

    const li = document.createElement("li");
    const texto = document.createElement("span");

    // Para usuarios normales solo mostramos nombre/telefono de SU cita; admin ve owner también
    let textoPrincipal = `${cita.nombre || "No disponible"} - ${cita.telefono || "No disponible"} - ${cita.hora || "No disponible"} - ${cita.dia || "No disponible"}`;
    if (isAdmin) {
      textoPrincipal += ` - owner: ${cita.userId}`;
    }
    texto.textContent = textoPrincipal;
    li.appendChild(texto);

    // Si la cita pertenece al usuario, permitimos editar/eliminar
    if (cita.userId === (currentUser && currentUser.uid)) {
      const acciones = document.createElement("div");

      const btnEditar = document.createElement("button");
      btnEditar.textContent = "Editar";
      btnEditar.className = "editar-btn";
      btnEditar.addEventListener("click", () => abrirModalEditar(citaId, cita));
      acciones.appendChild(btnEditar);

      const btnEliminar = document.createElement("button");
      btnEliminar.textContent = "Eliminar";
      btnEliminar.className = "eliminar-btn";
      btnEliminar.addEventListener("click", () => eliminarCita(citaId));
      acciones.appendChild(btnEliminar);

      li.appendChild(acciones);
    }

    // Admin puede eliminar cualquiera desde la UI (opcional)
    if (isAdmin && cita.userId !== (currentUser && currentUser.uid)) {
      const accionesAdmin = document.createElement("div");
      const btnEliminarAdmin = document.createElement("button");
      btnEliminarAdmin.textContent = "Eliminar (admin)";
      btnEliminarAdmin.className = "eliminar-btn";
      btnEliminarAdmin.addEventListener("click", async () => {
        if (!confirm("Eliminar esta cita definitivamente?")) return;
        try {
          await deleteDoc(doc(db, "citas", citaId));
        } catch (err) {
          console.error("Error eliminando (admin):", err);
          alert("No se pudo eliminar la cita.");
        }
      });
      accionesAdmin.appendChild(btnEliminarAdmin);
      li.appendChild(accionesAdmin);
    }

    listaCitas.appendChild(li);
  });
}

/* ---------- Editar cita ---------- */
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

  // Mostrar modal de edición y rellenar valores
  modalEditar.style.display = "flex";
  nombreInput.value = cita.nombre || "";
  telefonoInput.value = cita.telefono || "";

  // Evitar duplicación de listeners: reemplazamos los botones por clones
  btnGuardar.replaceWith(btnGuardar.cloneNode(true));
  btnCancelar.replaceWith(btnCancelar.cloneNode(true));
  btnCerrarConfirmacion.replaceWith(btnCerrarConfirmacion.cloneNode(true));

  const nuevoBtnGuardar = document.getElementById("guardar-edicion");
  const nuevoBtnCancelar = document.getElementById("cancelar-edicion");
  const nuevoBtnCerrarConfirmacion = document.getElementById("cerrar-confirmacion-edicion");

  nuevoBtnGuardar.addEventListener("click", async function () {
    try {
      const citaRef = doc(db, "citas", id);
      // Solo se permite si es el propietario (las reglas del servidor lo reforzarán)
      await updateDoc(citaRef, {
        nombre: nombreInput.value,
        telefono: telefonoInput.value
      });
      modalEditar.style.display = "none";
      modalConfirmacion.style.display = "flex";
    } catch (error) {
      console.error("Error al actualizar la cita:", error);
      alert("No se pudo actualizar la cita. Revisa la consola.");
    }
  });

  nuevoBtnCancelar.addEventListener("click", function () {
    modalEditar.style.display = "none";
  });

  nuevoBtnCerrarConfirmacion.addEventListener("click", function () {
    modalConfirmacion.style.display = "none";
  });
}

/* ---------- Eliminar cita con confirmación ---------- */
function eliminarCita(id) {
  const modalEliminar = document.getElementById("modal-eliminar");
  if (!modalEliminar) return;

  modalEliminar.style.display = "flex";

  const btnConfirmar = document.getElementById("confirmar-eliminar");
  btnConfirmar.replaceWith(btnConfirmar.cloneNode(true));
  const nuevoConfirmar = document.getElementById("confirmar-eliminar");

  nuevoConfirmar.addEventListener("click", async function () {
    try {
      await deleteDoc(doc(db, "citas", id));
      modalEliminar.style.display = "none";
      const modalEliminacionExitosa = document.getElementById("modal-eliminacion-exitosa");
      if (modalEliminacionExitosa) modalEliminacionExitosa.style.display = "flex";
    } catch (error) {
      console.error("Error al eliminar cita:", error);
      alert("No se pudo eliminar la cita. Revisa la consola.");
    }
  });
}

/* ---------- Auth: login/logout y control de estado ---------- */
async function doLogin() {
  try {
    await signInWithPopup(auth, provider);
    // onAuthStateChanged manejará UI
  } catch (err) {
    console.error("Error en login:", err);
    alert("No se pudo iniciar sesión.");
  }
}

async function doLogout() {
  try {
    await signOut(auth);
  } catch (err) {
    console.error("Error en logout:", err);
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
    btn.className = "btn-auth";
    btn.textContent = "Iniciar sesión con Google";
    btn.addEventListener("click", doLogin);
    authArea.appendChild(btn);
    document.getElementById("reset-all").style.display = "none";
    return;
  }

  const info = document.createElement("span");
  info.textContent = `${user.displayName || user.email}`;
  info.style.marginRight = "10px";
  authArea.appendChild(info);

  const btnLogout = document.createElement("button");
  btnLogout.textContent = "Salir";
  btnLogout.className = "btn-auth";
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

/* ---------- Reset global de citas (admin) ---------- */
async function resetearTodasLasCitas() {
  if (!isAdmin) {
    alert("No estás autorizado.");
    return;
  }
  if (!confirm("¿Seguro que quieres eliminar todas las citas? Esta acción es irreversible.")) return;
  try {
    const snapshot = await (collection(db, "citas") /* get snapshot via onSnapshot is possible but here a single fetch*/ , new Promise((res, rej) => {
      // simple fetch of all docs via onSnapshot once
      const col = collection(db, "citas");
      const unsub = onSnapshot(col, s => { unsub(); res(s); }, err => rej(err));
    }));
    const batchDeletes = [];
    snapshot.forEach(docSnap => {
      batchDeletes.push(deleteDoc(doc(db, "citas", docSnap.id)));
    });
    await Promise.all(batchDeletes);
    alert("Se eliminaron todas las citas.");
  } catch (err) {
    console.error("Error reseteando citas:", err);
    alert("No se pudo resetear las citas.");
  }
}

/* ---------- Inicialización y binding de eventos ---------- */
document.addEventListener("DOMContentLoaded", () => {
  // Botones de días
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

  // Confirmar / Cancelar citas (modal agendar)
  const btnConfirmar = document.getElementById("confirmar-cita");
  const btnCancelarModal = document.getElementById("cancelar-modal");
  if (btnConfirmar) btnConfirmar.addEventListener("click", confirmarCita);
  if (btnCancelarModal) btnCancelarModal.addEventListener("click", cerrarModalAgendar);

  // Cerrar confirmaciones
  const cerrarConfirmacion = document.getElementById("cerrar-confirmacion");
  if (cerrarConfirmacion) cerrarConfirmacion.addEventListener("click", () => ocultarModal("modal-confirmacion"));

  // Cancelar eliminar
  const cancelarEliminar = document.getElementById("cancelar-eliminar");
  if (cancelarEliminar) cancelarEliminar.addEventListener("click", () => ocultarModal("modal-eliminar"));

  // Cerrar eliminación exitosa
  const cerrarEliminacionExitosa = document.getElementById("cerrar-eliminacion-exitosa");
  if (cerrarEliminacionExitosa) cerrarEliminacionExitosa.addEventListener("click", () => ocultarModal("modal-eliminacion-exitosa"));

  // Reset all (admin)
  const resetAllBtn = document.getElementById("reset-all");
  if (resetAllBtn) resetAllBtn.addEventListener("click", resetearTodasLasCitas);

  // Levantar escucha lista de citas (se ajustará cuando haya user)
  startListaListener();

  // Observador de auth
  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (!user) {
      isAdmin = false;
      updateAuthUI(null, false);
      // detener listeners de lista/hora
      if (unsubscribeLista) { unsubscribeLista(); unsubscribeLista = null; }
      if (unsubscribeHorarios) { unsubscribeHorarios(); unsubscribeHorarios = null; }
      // For unauthenticated users, simply show message
      document.getElementById("lista-citas").innerHTML = "<li>Inicia sesión para ver y gestionar tus citas.</li>";
      return;
    }
    // comprobar si es admin
    isAdmin = await checkAdminStatus(user.uid);
    updateAuthUI(user, isAdmin);
    // iniciar listeners pertinentes
    startHorariosListener(diaSeleccionado || Object.keys(horarios)[0]);
    startListaListener();
  });
});