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
 * Formatea una salida individual exactamente con la plantilla requerida para WhatsApp
 */
export function formatScheduleSlotMessage(slot: ScheduleSlot): string {
  const dayLabel = slot.dayOfWeek || slot.dayName;
  return [
    `🔹 ${dayLabel} - ${slot.time} hs`,
    `👤 Encargado: ${slot.conductorName}`,
    `📍 Ubicación: ${slot.meetingPointName}`,
    `🗺️ Punto de Encuentro: ${slot.meetingPointUrl}`,
  ].join('\n');
}

/**
 * Construye el mensaje completo del Programa Semanal de Predicación para que el Admin lo comparta por WhatsApp con 1 botón
 */
export function buildWeeklyScheduleWhatsAppMessage(
  _congregationName: string,
  schedule: ScheduleSlot[],
  _territories?: Territory[]
): string {
  if (schedule.length === 0) {
    return 'No hay salidas programadas.';
  }

  return schedule.map(formatScheduleSlotMessage).join('\n\n');
}

export function openWhatsAppShare(text: string): void {
  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Copia texto al portapapeles con compatibilidad nativa y fallback
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Intentar fallback
  }

  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch {
    return false;
  }
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
