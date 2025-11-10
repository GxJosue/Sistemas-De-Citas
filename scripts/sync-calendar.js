// scripts/sync-calendar.js
// Sync Firestore -> Google Calendar (creación) + limpieza de eventos huérfanos (borrados en Firestore)

const admin = require("firebase-admin");
const { google } = require("googleapis");

function log(...args) { console.log(new Date().toISOString(), ...args); }

// Helpers
function parseTimeTo24(hora) {
  if (!hora || typeof hora !== "string") return null;
  const m = hora.match(/^\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*$/i);
  if (!m) return null;
  let hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  const period = m[3].toUpperCase();
  if (period === "PM" && hh !== 12) hh += 12;
  if (period === "AM" && hh === 12) hh = 0;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
function addOneHour(dateStr, time24) {
  const [hh, mm] = time24.split(":").map(Number);
  let startH = hh, startM = mm;
  let endH = (hh + 1);
  let endDate = dateStr;
  if (endH >= 24) {
    endH = endH - 24;
    const d = new Date(`${dateStr}T00:00:00`);
    d.setDate(d.getDate() + 1);
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    endDate = `${y}-${mo}-${da}`;
  }
  const start = `${dateStr}T${String(startH).padStart(2, "0")}:${String(startM).padStart(2,"0")}:00`;
  const end = `${endDate}T${String(endH).padStart(2, "0")}:${String(startM).padStart(2,"0")}:00`;
  return { start, end };
}

async function deleteOrphanCalendarEvents(calendar, db, calendarId, timezone) {
  log("Iniciando limpieza de eventos huérfanos en calendar:", calendarId);
  // Rango temporal razonable: desde hace 1 año hasta dentro de 1 año
  const now = new Date();
  const past = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  const future = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

  let pageToken = undefined;
  let totalChecked = 0;
  let totalDeleted = 0;
  do {
    const res = await calendar.events.list({
      calendarId,
      timeMin: past.toISOString(),
      timeMax: future.toISOString(),
      singleEvents: true,
      maxResults: 2500,
      pageToken,
      showDeleted: false,
    });
    const events = res.data.items || [];
    pageToken = res.data.nextPageToken;
    log("Listado page, eventos:", events.length);

    for (const ev of events) {
      totalChecked++;
      const props = ev.extendedProperties && ev.extendedProperties.private;
      if (!props || !props.citaDocId) continue;
      const citaId = props.citaDocId;
      try {
        const doc = await db.collection("citas").doc(citaId).get();
        if (!doc.exists) {
          // doc borrado -> borrar evento en calendar
          try {
            await calendar.events.delete({ calendarId, eventId: ev.id });
            log("Evento huérfano borrado:", ev.id, "citaDocId:", citaId);
            totalDeleted++;
          } catch (err) {
            console.error("Error borrando evento huérfano:", ev.id, err && err.message ? err.message : err);
          }
        }
      } catch (err) {
        console.error("Error verificando doc", citaId, err && err.message ? err.message : err);
      }
    }

  } while (pageToken);

  log(`Limpieza completada. Chequeados: ${totalChecked}, Eliminados: ${totalDeleted}`);
}

async function main() {
  log("Iniciando sync-calendar script...");

  const saJsonRaw = process.env.FIREBASE_SA_KEY;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const calendarId = process.env.CALENDAR_ID;
  const timezone = process.env.TIMEZONE || "UTC";

  if (!saJsonRaw || !projectId || !calendarId) {
    console.error("FALTAN VARIABLES: verifica FIREBASE_SA_KEY, FIREBASE_PROJECT_ID y CALENDAR_ID en secrets.");
    process.exit(1);
  }

  let sa;
  try {
    sa = typeof saJsonRaw === "string" ? JSON.parse(saJsonRaw) : saJsonRaw;
  } catch (err) {
    console.error("Error parseando FIREBASE_SA_KEY JSON:", err);
    process.exit(1);
  }

  // Inicializar Firebase Admin
  try {
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      projectId: projectId,
    });
  } catch (err) {
    log("Warning inicializando admin (ignored):", err && err.message ? err.message : err);
  }
  const db = admin.firestore();

  // Autenticación para Google Calendar (JWT con service account)
  const jwtClient = new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });
  try {
    await jwtClient.authorize();
  } catch (err) {
    console.error("Error authorizing JWT:", err);
    process.exit(1);
  }
  const calendar = google.calendar({ version: "v3", auth: jwtClient });

  try {
    // Crear eventos para docs sin calendarEventId
    const LIMIT = 200;
    const snapshot = await db.collection("citas").orderBy("createdAt", "desc").limit(LIMIT).get();
    if (!snapshot.empty) {
      const docs = [];
      snapshot.forEach(doc => docs.push({ id: doc.id, ref: doc.ref, data: doc.data() }));
      for (const item of docs.reverse()) {
        const data = item.data || {};
        if (data.calendarEventId) continue; // ya sincronizado
        log("Procesando cita:", item.id, data.fecha, data.hora, data.nombre || "");
        try {
          const title = data.nombre ? `Cita - ${data.nombre}` : "Cita - Barbería";
          const descriptionParts = [];
          if (data.telefono) descriptionParts.push(`Teléfono: ${data.telefono}`);
          if (data.userId) descriptionParts.push(`UserID: ${data.userId}`);
          if (data.createdAt) descriptionParts.push(`Creada: ${data.createdAt}`);
          const description = descriptionParts.join("\n");

          let res;
          if (data.fecha && data.hora) {
            const time24 = parseTimeTo24(data.hora);
            if (!time24) {
              const eventAllDay = { summary: title, description, start: { date: data.fecha }, end: { date: data.fecha } };
              res = await calendar.events.insert({ calendarId, resource: eventAllDay });
            } else {
              const { start, end } = addOneHour(data.fecha, time24);
              const event = {
                summary: title,
                description,
                start: { dateTime: start, timeZone: timezone },
                end: { dateTime: end, timeZone: timezone },
                extendedProperties: { private: { citaDocId: item.id } },
              };
              res = await calendar.events.insert({ calendarId, resource: event });
            }
          } else {
            const now = new Date();
            const isoNow = now.toISOString();
            const later = new Date(now.getTime() + (60 * 60 * 1000)).toISOString();
            const genericEvent = {
              summary: title,
              description,
              start: { dateTime: isoNow, timeZone: timezone },
              end: { dateTime: later, timeZone: timezone },
              extendedProperties: { private: { citaDocId: item.id } },
            };
            res = await calendar.events.insert({ calendarId, resource: genericEvent });
          }

          if (res && res.data && res.data.id) {
            await item.ref.update({ calendarEventId: res.data.id });
            log("Evento creado y documento actualizado:", res.data.id);
          } else {
            log("Respuesta inesperada al crear evento para doc", item.id, res && res.data);
          }

        } catch (err) {
          console.error("Error procesando cita", item.id, err && err.message ? err.message : err);
        }
      }
    } else {
      log("No hay citas en Firestore.");
    }

    // Limpieza: borrar eventos en Calendar cuyos citaDocId ya no existan en Firestore
    await deleteOrphanCalendarEvents(calendar, db, calendarId, timezone);

    log("Sincronización finalizada.");
  } catch (err) {
    console.error("Error general en sincronización:", err && err.message ? err.message : err);
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Script finalizó con error:", err && err.message ? err.message : err);
  process.exit(1);
});