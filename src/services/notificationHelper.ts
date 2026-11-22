import {
  HousePoint,
  PushNotificationTemplate,
  ScheduleSlot,
  Territory,
} from '../types/territory';
import { getSlotConductorLabel } from './storageAndSync';

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
  return `${window.location.origin}${window.location.pathname}?grupo=${encodeURIComponent(
    slotId
  )}`;
}

/**
 * Genera el enlace especial de territorio personal para compartir con publicadores sin login
 */
export function getPublisherTerritoryLink(territoryId: string): string {
  return `${window.location.origin}${window.location.pathname}?territorio=${encodeURIComponent(
    territoryId
  )}`;
}

/**
 * Construye el mensaje de WhatsApp con el link del grupo para publicadores
 */
export function buildPublisherLinkWhatsAppMessage(
  slot: ScheduleSlot,
  territoryNames?: string[]
): string {
  const link = getPublisherGroupLink(slot.id);
  const dayLabel = slot.dayName || slot.dayOfWeek || 'hoy';
  const terrInfo =
    territoryNames && territoryNames.length > 0
      ? ` — ${territoryNames.join(', ')}`
      : '';
  return `🗺️ Link para anotar casas "No en casa" (${dayLabel} ${slot.time} hs${terrInfo}):\n${link}`;
}

/**
 * Construye el mensaje de WhatsApp con el link de un territorio personal para publicadores
 */
export function buildPublisherTerritoryWhatsAppMessage(
  territory: Territory,
  conductorName?: string
): string {
  const link = getPublisherTerritoryLink(territory.id);
  const byLabel = conductorName ? ` (Encargado: ${conductorName})` : '';
  return `🗺️ Link para anotar casas "No en casa" en ${territory.name}${byLabel}:\n${link}`;
}

/**
 * Formatea una salida individual exactamente con la plantilla requerida para WhatsApp
 */
export function formatScheduleSlotMessage(slot: ScheduleSlot): string {
  if (!slot) return '';
  const dayLabel = slot.dayOfWeek || slot.dayName || 'Día por definir';
  const time = slot.time || '00:00';
  const conductor = getSlotConductorLabel(slot);
  const location = slot.meetingPointName || 'Por asignar';
  const url = slot.meetingPointUrl || '';
  return [
    `🔹 ${dayLabel} - ${time} hs`,
    `👤 Encargado: ${conductor}`,
    `📍 Ubicación: ${location}`,
    `🗺️ Punto de Encuentro: ${url}`,
  ].join('\n');
}

/**
 * Construye el mensaje completo del Programa Semanal de Predicación para que el Admin lo comparta por WhatsApp con 1 botón
 */
export function buildWeeklyScheduleWhatsAppMessage(
  _congregationName?: string,
  schedule?: ScheduleSlot[],
  _territories?: Territory[]
): string {
  const safeList = Array.isArray(schedule) ? schedule.filter(Boolean) : [];
  if (safeList.length === 0) {
    return 'No hay salidas programadas.';
  }

  return safeList.map(formatScheduleSlotMessage).filter(Boolean).join('\n\n');
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
  housePoints: HousePoint[],
  conductorOverrideName?: string
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

  const conductorLabel = conductorOverrideName || getSlotConductorLabel(slot);

  const replaceVars = (text: string) =>
    text
      .replace(/\{conductor\}/g, conductorLabel)
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
          icon: './terrimap-icon.svg',
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
