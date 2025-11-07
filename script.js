// script.js
// Mueve aquí TODO el JS que estaba en el HTML y reemplaza handlers inline por addEventListener.
// Este archivo es un módulo porque importa Firebase desde CDN.

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-firestore.js";

/* ---------- Configuración Firebase ---------- */
const firebaseConfig = {
  apiKey: "AIzaSyDeSHWfxU-lU-ID4YvaQQm479CADhXowWE",
  authDomain: "barberiacitas-94e43.firebaseapp.com",
  projectId: "barberiacitas-94e43",
  storageBucket: "barberiacitas-94e43.firebasestorage.app",
  messagingSenderId: "113964486737",
  appId: "1:113964486737:web:c513937562113309309d5e870",
  measurementId: "G-ZQ4LV7M646"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

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

let userId = localStorage.getItem("userId");
if (!userId) {
  userId = "user-" + Math.random().toString(36).slice(2, 11);
  localStorage.setItem("userId", userId);
}

/* ---------- Utilidades de UI (mostrar/ocultar modales) ---------- */
function mostrarModal(id) {
  const m = document.getElementById(id);
  if (m) { m.style.display = "flex"; m.setAttribute('aria-hidden','false'); }
}
function ocultarModal(id) {
  const m = document.getElementById(id);
  if (m) { m.style.display = "none"; m.setAttribute('aria-hidden','true'); }
}

/* ---------- Horarios ---------- */
function ocultarHorarios() {
  const contenedor = document.getElementById("horarios");
  if (contenedor) contenedor.innerHTML = "";
}

function cargarHorariosPara(dia) {
  const contenedor = document.getElementById("horarios");
  if (!contenedor) return;

  contenedor.innerHTML = "";

  if (!dia) {
    alert("Debe seleccionar un día.");
    return;
  }

  // Escuchar cambios en la colección 'citas' y renderizar los horarios (se actualiza en tiempo real)
  // Nota: onSnapshot aquí se ejecutará cada vez que haya cambios; usamos snapshot local para saber horarios ocupados.
  onSnapshot(collection(db, "citas"), (snapshot) => {
    const citasGuardadas = snapshot.docs.map(d => d.data());

    contenedor.innerHTML = "";

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
  }, error => {
    console.error("Error al escuchar citas:", error);
  });
}

/* ---------- Agendar / Confirmar Cita ---------- */
function agendarCita(dia, hora) {
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
    userId
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

/* ---------- Cargar lista de citas (y enlaces para editar/eliminar propios) ---------- */
function cargarListaCitas() {
  const listaCitas = document.getElementById("lista-citas");
  if (!listaCitas) return;

  onSnapshot(collection(db, "citas"), (snapshot) => {
    listaCitas.innerHTML = "";
    snapshot.forEach(docSnap => {
      const cita = docSnap.data();
      const citaId = docSnap.id;

      const li = document.createElement("li");
      const texto = document.createElement("span");
      texto.textContent = `${cita.nombre || "No disponible"} - ${cita.telefono || "No disponible"} - ${cita.hora || "No disponible"} - ${cita.dia || "No disponible"}`;
      li.appendChild(texto);

      // Si la cita pertenece al usuario, permitimos editar/eliminar
      if (cita.userId === userId) {
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

      listaCitas.appendChild(li);
    });
  }, error => {
    console.error("Error al cargar la lista de citas:", error);
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

  // Evitar duplicación de listeners: reemplazamos los botones por clones sin listeners previos
  btnGuardar.replaceWith(btnGuardar.cloneNode(true));
  btnCancelar.replaceWith(btnCancelar.cloneNode(true));
  btnCerrarConfirmacion.replaceWith(btnCerrarConfirmacion.cloneNode(true));

  // Re-obtener referencias
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
      modalEditar.style.display = "none";
      modalConfirmacion.style.display = "flex";
      // La lista se actualizará automáticamente por onSnapshot en cargarListaCitas()
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
  // Reemplazar para quitar listeners previos
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

/* ---------- Inicialización y binding de eventos ---------- */
document.addEventListener("DOMContentLoaded", () => {
  // Botones de días
  const botonesDias = document.querySelectorAll("#dias-de-la-semana .dia-btn");
  botonesDias.forEach(boton => {
    boton.addEventListener("click", function () {
      // clase visual
      botonesDias.forEach(b => b.classList.remove("dia-actual"));
      this.classList.add("dia-actual");

      const dia = this.getAttribute("data-dia");
      // Si el mismo día es clickeado nuevamente, ocultamos horarios
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

  // Levantar escucha y renderizado de citas
  cargarListaCitas();
});