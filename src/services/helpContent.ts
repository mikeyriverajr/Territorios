export type HelpCategoryId =
  | 'inicio_rapido'
  | 'publicador'
  | 'conductor'
  | 'admin'
  | 'faq'
  | 'kml_mapas'
  | 'nube_s13';

export interface HelpCategoryMeta {
  id: HelpCategoryId;
  label: string;
  shortLabel: string;
  description: string;
}

export interface HelpArticle {
  id: string;
  categoryId: HelpCategoryId;
  title: string;
  summary: string;
  roleBadge: string;
  steps?: string[];
  tips?: string[];
  warning?: string;
  keywords: string[];
}

export function normalizeHelpCategoryId(id?: HelpCategoryId): HelpCategoryId {
  if (id === 'kml_mapas' || id === 'nube_s13') return 'admin';
  return id || 'inicio_rapido';
}

export const HELP_CATEGORIES: HelpCategoryMeta[] = [
  {
    id: 'inicio_rapido',
    label: '¿Cómo funciona todo?',
    shortLabel: '¿Cómo funciona?',
    description:
      'Explicación sencilla de quién usa la aplicación y qué significan los colores del mapa.',
  },
  {
    id: 'publicador',
    label: 'Ayuda para Publicadores',
    shortLabel: 'Soy Publicador',
    description:
      'Cómo abrir el enlace de WhatsApp, anotar una casa donde no atendieron y marcar cuando ya atendieron.',
  },
  {
    id: 'conductor',
    label: 'Ayuda para Conductores',
    shortLabel: 'Soy Conductor',
    description:
      'Cómo entrar con tu clave (PIN), ver el mapa general, compartir el enlace y entregar el territorio.',
  },
  {
    id: 'admin',
    label: 'Ayuda para el Encargado de Territorios',
    shortLabel: 'Soy Encargado',
    description:
      'Cómo armar el programa semanal, asignar territorios a una o varias personas, reiniciar territorios y bajar la hoja S-13.',
  },
  {
    id: 'faq',
    label: 'Preguntas Comunes y Soluciones',
    shortLabel: 'Dudas Comunes',
    description:
      'Qué hacer si no funciona tu ubicación (GPS), si olvidaste tu clave o si tocaste algo por error.',
  },
];

export const HELP_ARTICLES: HelpArticle[] = [
  // ================= INICIO RÁPIDO =================
  {
    id: 'roles-flujo-general',
    categoryId: 'inicio_rapido',
    title: 'Así de fácil funciona entre todos',
    roleBadge: 'Para todos',
    summary:
      'Cada hermano ve solo lo que necesita para salir a predicar, sin pasos complicados.',
    steps: [
      'Si eres Publicador: No necesitas entrar con clave. Solo toca el enlace azul que te envían por WhatsApp y ya ves el mapa de ese día.',
      'Si eres Conductor (o tienes un territorio personal): Entras con tu nombre y tu número secreto de 4 cifras (PIN). Desde ahí compartes el enlace a tu grupo, marcas las manzanas listas y anotas casas.',
      'Si eres el Encargado (Administrador): Armas el programa de la semana, repartes los territorios, reinicias los que se devuelven y descargas la hoja oficial S-13 en PDF.',
    ],
    tips: [
      'Todo lo que anota una persona se guarda solo y al momento lo ven los demás hermanos del grupo que tengan Internet.',
    ],
    keywords: ['inicio', 'como funciona', 'roles', 'publicador', 'conductor', 'encargado'],
  },
  {
    id: 'colores-del-mapa',
    categoryId: 'inicio_rapido',
    title: 'Qué significan los colores y circulitos del mapa',
    roleBadge: 'Para todos',
    summary:
      'De un solo vistazo puedes saber qué falta predicar y en qué casas no hay que tocar.',
    steps: [
      'Manzana Azul (ej. 1A): Todavía falta predicarla.',
      'Manzana Amarilla o Naranja: Ya empezaron a trabajar en esa manzana.',
      'Manzana Verde con ✓: Esa manzana ya se terminó.',
      'Circulito Naranja con un número (ej. 1, 2): Es una casa donde no atendieron ("No en casa") para volver en otro momento.',
      'Circulito Rojo con signo "!": Es una casa que pidió NO VISITAR. Nunca toques en esa puerta.',
    ],
    keywords: ['colores', 'manzana', 'azul', 'verde', 'naranja', 'rojo', 'simbolos'],
  },

  // ================= PUBLICADOR =================
  {
    id: 'pub-como-entrar',
    categoryId: 'publicador',
    title: 'Cómo abrir el mapa sin contraseña',
    roleBadge: 'Publicador',
    summary:
      'No tienes que descargar ninguna aplicación ni recordar claves.',
    steps: [
      'Abre el mensaje de WhatsApp donde el conductor (o el hermano del territorio) envió el enlace.',
      'Toca las letras azules del enlace y el mapa se abrirá en tu teléfono.',
      'Si arriba a la derecha ves la vista de foto real (Satélite) y prefieres ver los nombres de las calles, toca el botón "🗺️ Calles". Para volver a ver los techos de las casas, toca "🛰️ Satélite".',
    ],
    keywords: ['publicador', 'entrar', 'enlace', 'link', 'whatsapp', 'satelite', 'calles'],
  },
  {
    id: 'pub-anotar-no-en-casa',
    categoryId: 'publicador',
    title: 'Cómo anotar una casa donde no atendieron ("No en casa")',
    roleBadge: 'Publicador',
    summary:
      'Se hace en pocos segundos tocando directamente sobre la casa en el mapa.',
    steps: [
      'Acerca el mapa con dos dedos hasta ver bien los techos de la cuadra donde estás.',
      'Toca con el dedo justo encima del techo de la casa donde no hubo respuesta. (También puedes tocar el botón naranja de abajo "Anotar en mi ubicación GPS actual" si estás parado frente a la puerta).',
      'Revisa el número de manzana que aparece arriba. Si quedaste en la cuadra de al lado, toca "Cambiar" y elige la manzana correcta.',
      'Escribe una referencia sencilla para reconocer la puerta, por ejemplo: "N° 432 reja negra" o "Portón blanco".',
      'Toca el botón "Guardar".',
    ],
    warning:
      'Para cuidar la privacidad de los vecinos, escribe solo señas de la casa (número, color de puerta o reja). Nunca anotes nombres ni teléfonos de personas.',
    keywords: ['no en casa', 'anotar', 'guardar', 'techo', 'gps', 'casa'],
  },
  {
    id: 'pub-visitar-y-atender',
    categoryId: 'publicador',
    title: 'Cómo visitar casas anotadas y marcar "¡Ya atendieron!"',
    roleBadge: 'Publicador',
    summary:
      'Cuando vuelves a pasar por un "No en casa", puedes pedir indicaciones para llegar y quitarlo de la lista si ya te recibieron.',
    steps: [
      'Toca un circulito naranja en el mapa o elige una casa de la lista que aparece debajo del mapa.',
      'Si no sabes dónde queda exactamente, toca el botón azul "Cómo llegar" y tu teléfono te guiará caminando.',
      'Si logras hablar con alguien en esa casa, toca el botón verde "¡Ya atendieron!" (o el botón ✓ en la lista). De inmediato se quitará de los pendientes.',
    ],
    warning:
      'Respeta siempre los circulitos rojos con "!". Significan NO VISITAR. Si un vecino pide que no vuelvan a pasar, avísale al conductor para que él lo deje anotado.',
    keywords: ['visitar', 'atendieron', 'como llegar', 'no visitar', 'pendientes'],
  },

  // ================= CONDUCTOR =================
  {
    id: 'cond-entrar-y-compartir',
    categoryId: 'conductor',
    title: 'Entrar a tus territorios y enviar el enlace a los publicadores',
    roleBadge: 'Conductor',
    summary:
      'Tanto en las salidas de grupo como en tus territorios personales puedes compartir el enlace para que otros te ayuden.',
    steps: [
      'En la pantalla de inicio, busca tu nombre en la lista, escribe tu número secreto (PIN) de 4 cifras y toca "Entrar".',
      'Verás tus tarjetas de Salidas del Programa y también tus Territorios Personales. Si compartes el territorio con otro hermano, verás su nombre indicado en la tarjeta.',
      'En cada tarjeta (de salida o de territorio personal) verás la caja amarilla "Link para Publicadores". Toca "Compartir" para mandarlo directo por WhatsApp, o "Copiar" para pegarlo tú mismo.',
      'Cuando vayas a salir, toca el botón grande azul "ABRIR EL MAPA".',
    ],
    tips: [
      'Si quieres mirar todo el territorio de la congregación para ubicarte mejor, toca el botón "Mapa General" arriba en tu pantalla de inicio.',
    ],
    keywords: ['conductor', 'pin', 'entrar', 'link', 'compartir', 'territorio personal', 'mapa general'],
  },
  {
    id: 'cond-manzanas-y-no-visitar',
    categoryId: 'conductor',
    title: 'Marcar manzanas terminadas y anotar "NO VISITAR"',
    roleBadge: 'Conductor',
    summary:
      'Tú llevas la cuenta de las manzanas que se van completando y puedes registrar casas que piden no ser visitadas.',
    steps: [
      'Para marcar una manzana lista: en el panel de "Manzanas", toca el número de la manzana (por ejemplo 1A). Se pondrá verde con ✓.',
      'Para anotar una casa o un "NO VISITAR": toca la casa en el mapa, elige arriba "🏠 No en Casa" o "🛑 NO VISITAR", agrega una descripción sencilla y toca "Guardar".',
      'Para ver la ruta hacia una casa pendiente, tócala y pulsa "Cómo llegar". Si ya atendieron, pulsa "¡Ya Atendió!". Si volvieron y no había nadie, pulsa "Sigue sin haber nadie".',
    ],
    tips: [
      'Las direcciones "NO VISITAR" nunca se borran solas, ni siquiera cuando el territorio vuelve a empezar.',
    ],
    keywords: ['manzanas', 'completar', 'no visitar', 'marcar', 'verde'],
  },
  {
    id: 'cond-devolver-territorio',
    categoryId: 'conductor',
    title: 'Devolver el territorio cuando se termina',
    roleBadge: 'Conductor',
    summary:
      'Al terminar todas las manzanas, avisas al sistema que el territorio quedó completo.',
    steps: [
      'Revisa que ya terminaron las manzanas y las casas pendientes.',
      'Toca el botón verde "Marcar Territorio Completado" y confirma tocando "Sí, devolver territorio".',
      'El sistema anotará la fecha en la hoja de registro S-13 y quitará el territorio de tu lista (y de quienes lo compartían contigo).',
    ],
    tips: [
      'Las marcas de manzanas y casas quedan guardadas hasta que el Encargado revise y toque "Reiniciar" para la próxima vez.',
    ],
    keywords: ['devolver', 'terminar', 'completado', 'reiniciar', 's-13'],
  },

  // ================= ENCARGADO / ADMIN =================
  {
    id: 'admin-programa-y-conductores',
    categoryId: 'admin',
    title: 'Armar el Programa Semanal y enviarlo por WhatsApp',
    roleBadge: 'Encargado',
    summary:
      'Crea las salidas de la semana y copia el mensaje ya ordenado con emoticonos para enviarlo al grupo.',
    steps: [
      'En la pestaña "Programa y Conductores", elige la fecha, el horario, uno o varios encargados, el punto de encuentro y uno o más territorios.',
      'Si el territorio ya lo tiene otra persona, la pantalla te preguntará si deseas agregar al nuevo hermano junto con el actual o reemplazarlo.',
      'Toca "Publicar Salida". Cuando termines de cargar la semana, toca "Copiar Mensaje" o "Abrir en WhatsApp" para enviarlo al grupo.',
      'A la derecha de esa misma pantalla puedes agregar nuevos conductores, ver su PIN si se lo olvidaron o dar permisos de Encargado a otro hermano.',
    ],
    keywords: ['programa', 'salida', 'whatsapp', 'conductores', 'pin', 'varios', 'compartir'],
  },
  {
    id: 'admin-territorios-reiniciar-s13',
    categoryId: 'admin',
    title: 'Administrar Territorios, Reiniciarlos y Bajar el PDF S-13',
    roleBadge: 'Encargado',
    summary:
      'Busca rápido cualquier territorio, asígnalo a una o varias personas y descarga el formulario oficial S-13 en PDF.',
    steps: [
      'En la pestaña "Territorios y S-13", usa los filtros de arriba ("Sin asignar", "En curso", "Completados") o el buscador para encontrar rápido el territorio que necesitas.',
      'Toca "Gestionar" en cualquier territorio para asignarlo a una o varias personas. (En la hoja oficial S-13 siempre figurará la primera persona a la que se le asignó).',
      'Cuando un conductor devuelve un territorio, aparecerá como "Completado" conservando sus marcas para que puedas revisarlo. Cuando quieras volver a usarlo desde cero, toca "Reiniciar".',
      'Entra a la sub-pestaña "Historial y PDF S-13", elige el Año de servicio y toca "Descargar PDF Oficial (S-13)" para obtener la hoja lista para guardar o imprimir.',
    ],
    keywords: ['territorios', 'reiniciar', 's-13', 'pdf', 'asignar', 'varias personas', 'buscar'],
  },
  {
    id: 'admin-editor-y-respaldo',
    categoryId: 'admin',
    title: 'Dibujar territorios, agregar manzanas y guardar copia de seguridad',
    roleBadge: 'Encargado',
    summary:
      'Puedes dibujar territorios y manzanas tocando en el mapa, editar bordes existentes con imán a esquinas vecinas y guardar una copia de todos tus datos.',
    steps: [
      'En "Editor de Mapas", toca "+ Dibujar Territorio" o "+ Dibujar Manzana" para marcar las esquinas directamente sobre el mapa satelital (toca el círculo verde 1 o haz doble clic para cerrar; usa "Guardar y dibujar otra manzana" para crear varias seguidas).',
      'Para editar una manzana o territorio existente, selecciónalo en la lista (o tócalo en el mapa), arrastra las esquinas amarillas, toca o arrastra los círculos azules (+) para crear nuevas esquinas, o haz clic derecho en una esquina para quitarla.',
      'El modo "Imán" ajusta automáticamente las esquinas nuevas a vértices vecinos (manten Alt para desactivarlo temporalmente) y al eliminar una manzana se conservan todas las casas y direcciones "NO VISITAR" del territorio.',
      'En "Ajustes -> Copia de Seguridad": descarga periódicamente el respaldo .json y gestiona las importaciones/exportaciones de Google My Maps.',
    ],
    keywords: ['editor', 'mapas', 'bordes', 'dibujar', 'manzana', 'respaldo', 'copia', 'ajustes'],
  },

  // ================= DUDAS COMUNES =================
  {
    id: 'faq-gps-permisos',
    categoryId: 'faq',
    title: 'El mapa no muestra mi punto azul (GPS)',
    roleBadge: 'Solución rápida',
    summary:
      'Casi siempre ocurre porque el teléfono tiene la ubicación apagada o el navegador pidió permiso y se cerró sin aceptar.',
    steps: [
      'Primero revisa que la "Ubicación" (GPS) esté encendida en el menú rápido de tu teléfono.',
      'En Android (Chrome): toca el ícono que está al lado de la dirección de la página arriba -> Permisos -> Ubicación -> elige "Permitir".',
      'En iPhone (Safari): ve a Ajustes del iPhone -> Privacidad y seguridad -> Localización -> Sitios web de Safari -> elige "Al usarse la app".',
      'Vuelve al mapa, recarga la página y toca el botón "Mi ubicación GPS".',
    ],
    keywords: ['gps', 'ubicacion', 'punto azul', 'android', 'iphone', 'permiso'],
  },
  {
    id: 'faq-pin-y-errores',
    categoryId: 'faq',
    title: 'Olvidé mi clave (PIN) o anoté una casa por error',
    roleBadge: 'Solución rápida',
    summary:
      'Ambas cosas se arreglan muy rápido.',
    steps: [
      'Si olvidaste tu PIN: pídele al Encargado de Territorios que entre a "Programa y Conductores"; allí ve el PIN de cada hermano al instante.',
      'Si anotaste una casa equivocada: si eres Publicador, tócala y marca "¡Ya atendieron!" para sacarla de la lista. Si eres Conductor, tócala y pulsa "Borrar punto".',
      'Si el mapa se quedó blanco o dice que falta Internet: activa tus datos móviles o Wi-Fi y toca "Reintentar Conexión".',
    ],
    keywords: ['pin', 'clave', 'olvide', 'error', 'borrar', 'internet', 'sin conexion'],
  },
];

export const PUBLISHER_WHATSAPP_GUIDE_TEXT = [
  '🗺️ *GUÍA RÁPIDA PARA PUBLICADORES*',
  '',
  '1️⃣ *Cómo entrar:* Toca el enlace azul que te enviaron por WhatsApp. No necesitas contraseña.',
  '2️⃣ *Ver las calles:* Arriba a la derecha puedes cambiar entre foto real (*🛰️ Satélite*) y plano con nombres (*🗺️ Calles*).',
  '3️⃣ *Anotar donde no atendieron ("No en casa"):*',
  '   • Acerca el mapa y toca *encima del techo de la casa*, o toca abajo *"Anotar en mi ubicación GPS actual"*.',
  '   • Escribe una seña fácil (ej. _"N° 432 reja negra"_) y toca *Guardar*.',
  '4️⃣ *Volver a visitar:* Toca un circulito naranja 🟠, pulsa *Cómo llegar* y si te atienden toca *✓ ¡Ya atendieron!*',
  '🛑 *MUY IMPORTANTE:* Los circulitos rojos con *"!"* son casas *NO VISITAR*. Nunca toques en esas puertas.',
].join('\n');

export const CONDUCTOR_WHATSAPP_GUIDE_TEXT = [
  '🧭 *GUÍA RÁPIDA PARA CONDUCTORES*',
  '',
  '1️⃣ *Entrar:* Elige tu nombre en la lista, escribe tu PIN de 4 números y toca *Entrar*.',
  '2️⃣ *Ver todos los territorios:* En tu inicio tienes el botón *Mapa General* para ubicarte viendo todos los colores.',
  '3️⃣ *Mandar el mapa al grupo:* En tu salida o territorio personal, toca *Compartir* dentro de *Link para Publicadores* y envíalo por WhatsApp.',
  '4️⃣ *Marcar manzanas listas:* Dentro del mapa, toca el número de cada manzana terminada (1A, 1B...) para ponerla verde ✓.',
  '5️⃣ *Anotar NO VISITAR:* Solo tú y el encargado pueden marcar *🛑 NO VISITAR* tocando la casa en el mapa.',
  '6️⃣ *Al terminar:* Toca *Marcar Territorio Completado* para devolverlo.',
].join('\n');
