import {
  HousePoint,
  PushNotificationTemplate,
  ScheduleSlot,
  Territory,
} from '../types/territory';

/**
 * Genera el enlace directo de navegación en Google Maps hacia una coordenada GPS exacta
 */
export function getGoogleMapsNavigationUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;
}

/**
 * Genera el enlace especial del grupo para que el Conductor lo comparta con los publicadores de su salida
 */
export function getPublisherGroupLink(slotId: string): string {
  return `${window.location.origin}/?grupo=${encodeURIComponent(slotId)}`;
}

/**
 * Construye el mensaje completo del Programa Semanal de Predicación para que el Admin lo comparta por WhatsApp con 1 botón
 */
export function buildWeeklyScheduleWhatsAppMessage(
  congregationName: string,
  schedule: ScheduleSlot[],
  territories: Territory[]
): string {
  const lines = [
    `📅 *PROGRAMA SEMANAL DE PREDICACIÓN*`,
    `🏛️ *${congregationName || 'Congregación'}*`,
    ``,
  ];

  if (schedule.length === 0) {
    lines.push(`No hay salidas programadas.`);
    return lines.join('\n');
  }

  schedule.forEach((slot) => {
    const terrNames =
      territories
        .filter((t) => slot.territoryIds.includes(t.id))
        .map((t) => t.name)
        .join(', ') || 'Por asignar';

    const dateFormatted = slot.date ? ` (${slot.date})` : '';
    const dayLabel = slot.dayOfWeek || slot.dayName;

    lines.push(
      `🔹 *${dayLabel}${dateFormatted} — ${slot.time} hs*`,
      `👤 *Conductor:* ${slot.conductorName}`,
      `📍 *Punto de encuentro:* ${slot.meetingPointName}`,
      `🗺️ *Ubicación Maps:* ${slot.meetingPointUrl}`,
      `🧭 *Territorio(s):* ${terrNames}` +
        (slot.notes ? `\n📝 _Nota: ${slot.notes}_` : ''),
      ``
    );
  });

  return lines.join('\n');
}

export function openWhatsAppShare(text: string): void {
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Rellena una plantilla de Notificación Push editable por el Admin con los datos reales de la salida
 */
export function renderPushTemplate(
  template: PushNotificationTemplate,
  slot: ScheduleSlot,
  territories: Territory[],
  housePoints: HousePoint[]
): { title: string; body: string } {
  const assignedTerritories = territories.filter((t) =>
    slot.territoryIds.includes(t.id)
  );
  const terrNames =
    assignedTerritories.map((t) => t.name).join(', ') || 'Territorio asignado';

  const relevantPoints = housePoints.filter((p) =>
    slot.territoryIds.includes(p.territoryId)
  );
  const noVisitarCount = relevantPoints.filter(
    (p) => p.category === 'no_visitar'
  ).length;
  const noEnCasaCount = relevantPoints.filter(
    (p) => p.status === 'no_en_casa'
  ).length;

  const replaceVars = (text: string) =>
    text
      .replace(/\{conductor\}/g, slot.conductorName)
      .replace(/\{dia\}/g, slot.dayName)
      .replace(/\{hora\}/g, slot.time)
      .replace(/\{punto_encuentro\}/g, slot.meetingPointName)
      .replace(/\{territorio\}/g, terrNames)
      .replace(/\{no_en_casa_pendientes\}/g, String(noEnCasaCount))
      .replace(/\{no_visitar\}/g, String(noVisitarCount));

  return {
    title: replaceVars(template.titleTemplate),
    body: replaceVars(template.bodyTemplate),
  };
}

/**
 * Dispara una Notificación Push nativa en el navegador / celular
 */
export async function triggerBrowserNotification(
  title: string,
  body: string
): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }

  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }

  if (permission !== 'granted') {
    return false;
  }

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(title, {
          body,
          icon: '/manifest.json',
          vibrate: [200, 100, 200],
        } as NotificationOptions);
        return true;
      }
    }
    new Notification(title, { body });
    return true;
  } catch {
    return false;
  }
}
