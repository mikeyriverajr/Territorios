export type HelpCategoryId =
  | 'inicio_rapido'
  | 'publicador'
  | 'conductor'
  | 'admin'
  | 'kml_mapas'
  | 'nube_s13'
  | 'faq';

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

export const HELP_CATEGORIES: HelpCategoryMeta[] = [
  {
    id: 'inicio_rapido',
    label: 'Inicio Rápido y Roles',
    shortLabel: 'Inicio Rápido',
    description:
      'Visión general de cómo funciona el sistema entre Administrador, Conductores y Publicadores.',
  },
  {
    id: 'publicador',
    label: 'Guía para Publicadores',
    shortLabel: 'Publicadores',
    description:
      'Cómo entrar sin contraseña, leer el mapa satelital, anotar casas "No en casa" y marcar visitas.',
  },
  {
    id: 'conductor',
    label: 'Guía del Conductor',
    shortLabel: 'Conductores',
    description:
      'Compartir el link del grupo, marcar manzanas, registrar "NO VISITAR" y devolver territorios.',
  },
  {
    id: 'admin',
    label: 'Manual del Administrador',
    shortLabel: 'Admin / Siervo',
    description:
      'Programa semanal, conductores y PINs, plantillas Push, territorios personales y ajustes.',
  },
  {
    id: 'kml_mapas',
    label: 'Mapas KML y Editor Visual',
    shortLabel: 'Mapas KML',
    description:
      'Sistema de 2 archivos de Google My Maps, reglas de vinculación automática y Editor de Mapas.',
  },
  {
    id: 'nube_s13',
    label: 'Nube Supabase, S-13 y Respaldos',
    shortLabel: 'Nube y S-13',
    description:
      'Sincronización en vivo, modo sin conexión, historial oficial S-13 y copias de seguridad JSON.',
  },
  {
    id: 'faq',
    label: 'Preguntas Frecuentes',
    shortLabel: 'FAQ / Ayuda',
    description:
      'Soluciones rápidas a dudas sobre GPS en Android/iPhone, PINs olvidados, links y KML.',
  },
];

export const HELP_ARTICLES: HelpArticle[] = [
  // ================= INICIO RÁPIDO =================
  {
    id: 'roles-flujo-general',
    categoryId: 'inicio_rapido',
    title: 'Los 3 roles y el flujo semanal de predicación',
    roleBadge: 'Todos los usuarios',
    summary:
      'El sistema conecta al Siervo de Territorios, los Conductores de Salida y los Publicadores en un solo mapa en tiempo real.',
    steps: [
      '1. Administrador (Siervo de Territorios): Carga los mapas KML, crea los conductores con su PIN y arma el Programa Semanal (que puede copiar directo a WhatsApp).',
      '2. Conductor de Salida: Ingresa con su nombre y PIN, ve sus salidas y territorios personales, y comparte el "Link para Publicadores" (?grupo=...) en su grupo de predicación.',
      '3. Publicadores: Tocan el enlace del conductor sin necesidad de cuenta ni PIN; marcan casas "No en casa" tocando sobre los techos en el mapa satelital y marcan como atendidas las casas que visitan.',
      '4. Cierre del Territorio: Cuando se completan todas las manzanas, el conductor pulsa "Marcar Territorio Completado" para devolverlo y guardar automáticamente el registro S-13.',
    ],
    tips: [
      'Quien tenga privilegios de Administrador puede alternar entre "Panel Admin" y "Mi Vista Conductor" desde el botón superior.',
      'Todos los cambios se sincronizan cada 4 segundos entre celulares cuando hay conexión a Internet.',
    ],
    keywords: ['roles', 'flujo', 'inicio', 'resumen', 'admin', 'conductor', 'publicador'],
  },
  {
    id: 'codigos-unicos-casas',
    categoryId: 'inicio_rapido',
    title: 'Cómo funcionan los códigos únicos de casas (ej. 1A-1, T3-1, 1B-NV1)',
    roleBadge: 'Todos los usuarios',
    summary:
      'Cada casa registrada recibe automáticamente un código corto correlativo para identificarla fácilmente en el grupo.',
    steps: [
      'Casas "No en casa" en manzanas urbanas: Se numeran con el código de su manzana seguido de un número correlativo, por ejemplo 1A-1, 1A-2, 1B-1.',
      'Casas en territorios rurales (sin manzanas): Se numeran con el número de territorio, por ejemplo T3-1, T3-2.',
      'Direcciones permanentes "NO VISITAR": Reciben el prefijo NV, por ejemplo 1B-NV1 o T3-NV1, y se muestran con un círculo rojo y signo "!".',
    ],
    keywords: ['codigo', '1A-1', 'T3-1', 'NV', 'numeracion', 'shortCode'],
  },

  // ================= PUBLICADOR =================
  {
    id: 'pub-como-entrar',
    categoryId: 'publicador',
    title: 'Ingresar a la predicación sin usuario ni PIN',
    roleBadge: 'Publicador',
    summary:
      'Los publicadores solo necesitan tocar el enlace que envía el conductor por WhatsApp (?grupo=...).',
    steps: [
      'Toque el enlace enviado al grupo por el conductor de la salida.',
      'Se abrirá directamente el mapa satelital del territorio correspondiente a esa salida.',
      'Si la salida incluye más de un territorio, use los botones de arriba para cambiar entre ellos.',
    ],
    tips: [
      'Si prefiere ver los nombres de las calles, toque "🗺️ Calles" arriba a la derecha y vuelva a "🛰️ Satélite" cuando quiera ubicar el techo exacto de una casa.',
    ],
    keywords: ['publicador', 'link', 'grupo', 'entrar', 'sin pin', 'sin login'],
  },
  {
    id: 'pub-anotar-no-en-casa',
    categoryId: 'publicador',
    title: 'Cómo anotar una casa "No en casa" tocando el mapa o con GPS',
    roleBadge: 'Publicador',
    summary:
      'Anote una casa donde no atendieron en menos de 10 segundos para que el grupo pueda volver en otro horario.',
    steps: [
      'Método 1 (Más preciso): Haga zoom con dos dedos sobre la cuadra en el mapa satelital y toque directamente sobre el techo de la casa donde no atendieron.',
      'Método 2 (Por GPS): Parado frente a la vivienda, pulse el botón naranja "Anotar en mi ubicación GPS actual" en la parte inferior izquierda del mapa.',
      'Verifique la manzana detectada automáticamente (ej. Manzana 1A). Si quedó justo en la vereda límite, toque "Cambiar" junto al nombre de la manzana.',
      'Escriba una referencia física clara (ej. "N° 432 Reja negra" o "Portón blanco") y pulse "Guardar".',
    ],
    warning:
      'Por privacidad, anote únicamente características físicas visibles desde la calle o numeración de puerta. Nunca escriba nombres propios ni teléfonos de vecinos.',
    keywords: ['no en casa', 'anotar', 'tocar mapa', 'gps', 'techo', 'guardar'],
  },
  {
    id: 'pub-visitar-y-atender',
    categoryId: 'publicador',
    title: 'Cómo visitar casas pendientes, usar Google Maps y marcar "¡Ya atendieron!"',
    roleBadge: 'Publicador',
    summary:
      'Consulte las casas "No en casa" pendientes del territorio y avise al instante cuando alguien atienda.',
    steps: [
      'Toque cualquier círculo naranja numerado en el mapa o elija una casa en la lista "Casas No en casa" debajo del mapa.',
      'Toque "Cómo llegar" (botón azul) para que Google Maps trace el recorrido caminando hasta esa puerta.',
      'Si logra conversar con la persona en la vivienda, toque el botón verde "¡Ya atendieron!" (o el botón ✓ en la lista). La casa desaparecerá de inmediato de los pendientes de todo el grupo.',
    ],
    warning:
      'Respete siempre los círculos rojos con signo "!". Indican direcciones "NO VISITAR" y no se debe tocar en esas puertas. Si un vecino pide que no vuelvan a pasar, avise al conductor para que él lo registre.',
    keywords: ['atendido', 'como llegar', 'maps', 'no visitar', 'lista', 'pendientes'],
  },

  // ================= CONDUCTOR =================
  {
    id: 'cond-portal-y-link',
    categoryId: 'conductor',
    title: 'Portal del Conductor, Notificaciones Push y Link del Grupo',
    roleBadge: 'Conductor',
    summary:
      'En su portal verá tanto sus salidas del programa semanal como los territorios personales asignados directamente.',
    steps: [
      'Inicie sesión eligiendo su nombre en la pantalla de acceso e ingresando su PIN personal.',
      'Si tiene avisos amarillos de Notificaciones Push arriba de todo, léalos y pulse "Entendido".',
      'En cada salida programada encontrará el bloque "Link para Publicadores": toque "Copiar" o "Compartir" para enviarlo al grupo de WhatsApp antes de salir.',
      'Toque "ABRIR EL MAPA" para iniciar el trabajo en el territorio (primero verá un resumen con las direcciones NO VISITAR y las manzanas pendientes).',
    ],
    tips: [
      'También puede copiar el "Link Publicadores" desde la barra superior dentro del mismo Mapa de Campo.',
    ],
    keywords: ['conductor', 'portal', 'pin', 'notificaciones', 'push', 'compartir link'],
  },
  {
    id: 'cond-manzanas-y-puntos',
    categoryId: 'conductor',
    title: 'Marcar manzanas completadas y registrar "NO VISITAR"',
    roleBadge: 'Conductor',
    summary:
      'El conductor controla el avance de cada manzana y tiene el permiso exclusivo de crear o borrar direcciones "NO VISITAR".',
    steps: [
      'Para marcar manzanas: En el panel de "Manzanas", toque el código de cada manzana terminada (ej. 1A, 1B). Cambiará a verde con ✓ tanto en el mapa como en la nube.',
      'Para anotar una casa o un NO VISITAR: Toque directamente sobre la casa en el mapa (o use "Mi GPS") y en el formulario elija la categoría "🏠 No en Casa" o "🛑 NO VISITAR".',
      'Use las etiquetas rápidas (Reja negra, Portón blanco, 2do piso, etc.) y pulse "Guardar".',
      'Para registrar un nuevo intento en una casa pendiente: Toque el pin naranja y elija "¡Ya Atendió!" o "Sigue sin haber nadie" (esto guarda la fecha del intento).',
    ],
    tips: [
      'Si un publicador anota una casa en una manzana pendiente, la manzana pasa automáticamente a estado "En progreso" (color ámbar) hasta que usted la marque como completada.',
    ],
    keywords: ['manzana', 'completada', 'no visitar', 'intentos', 'sigue sin haber nadie', 'borrar punto'],
  },
  {
    id: 'cond-devolver-territorio',
    categoryId: 'conductor',
    title: 'Completar y devolver el territorio al finalizar (Registro S-13)',
    roleBadge: 'Conductor',
    summary:
      'Al terminar todas las manzanas de un territorio, devuélvalo con un clic para registrar el trabajo en el formulario S-13.',
    steps: [
      'Verifique que todas las manzanas estén completadas y las casas pendientes revisadas.',
      'Pulse el botón verde "Marcar Territorio Completado" en la esquina inferior derecha del mapa.',
      'Confirme pulsando "Sí, devolver territorio".',
      'El sistema registrará automáticamente la fecha de finalización en el Historial S-13, limpiará las casas "No en casa" ya resueltas, reiniciará las manzanas para el próximo ciclo y conservará intactas las direcciones "NO VISITAR".',
    ],
    keywords: ['devolver', 'completar territorio', 's-13', 'reiniciar', 'terminar'],
  },

  // ================= ADMINISTRADOR =================
  {
    id: 'admin-programa-semanal',
    categoryId: 'admin',
    title: 'Armar el Programa Semanal, Puntos de Encuentro y WhatsApp',
    roleBadge: 'Administrador',
    summary:
      'Cree salidas por fecha y turno, reutilice puntos de encuentro personalizados y envíe el programa listo por WhatsApp.',
    steps: [
      'En la pestaña "Programa y Conductores", elija Fecha (sincroniza el Día automáticamente), Turno y Hora.',
      'Seleccione el Encargado y la Ubicación. Pulse "✏️ Personalizar" junto a Ubicación para guardar puntos frecuentes (Salón del Reino, plazas, esquinas) con su enlace de Google Maps.',
      'Agregue uno o varios territorios a la salida. Si un territorio ya pertenece a otro hermano, el sistema pedirá confirmación antes de reasignarlo.',
      'Pulse "Publicar Salida". Abajo verá el programa ordenado cronológicamente con botones para "Duplicar" una salida (+7 días), "Duplicar Semana (+7 días)", "Copiar Mensaje" o "Abrir en WhatsApp".',
    ],
    keywords: ['programa', 'salida', 'whatsapp', 'duplicar', 'punto de encuentro', 'ubicacion'],
  },
  {
    id: 'admin-conductores-y-push',
    categoryId: 'admin',
    title: 'Gestión de Conductores, PINs y Plantillas de Notificaciones Push',
    roleBadge: 'Administrador',
    summary:
      'Administre quiénes tienen acceso al sistema, otorgue permisos de Administrador y personalice las notificaciones Push.',
    steps: [
      'En la columna derecha de "Programa y Conductores", agregue conductores indicando nombre, PIN (4+ dígitos) y si tendrán permisos de Administrador (🛡️ Admin).',
      'Por seguridad, el sistema siempre exige mantener al menos 1 Administrador activo.',
      'En la pestaña "Notificaciones Push", edite las 3 plantillas automáticas (previo a la salida, inicio con alertas NO VISITAR, cierre de salida) usando variables como {conductor}, {dia}, {hora}, {territorio}, {punto_encuentro}, {no_en_casa_pendientes} y {no_visitar}.',
      'Seleccione una salida, revise la vista previa en tiempo real y pulse "Enviar esta Notificación Push" para enviarla al instante.',
    ],
    keywords: ['conductores', 'pin', 'admin', 'notificaciones', 'plantillas', 'variables'],
  },
  {
    id: 'admin-territorios-s13',
    categoryId: 'admin',
    title: 'Territorios Personales, Ordenamiento por Antigüedad e Historial S-13',
    roleBadge: 'Administrador',
    summary:
      'Supervise el avance de cada territorio, asigne territorios personales y exporte el registro S-13 a Excel.',
    steps: [
      'En la pestaña "Territorios y S-13", use el buscador y el selector "Ordenar por: Trabajados hace más tiempo (Prioridad)" para detectar qué territorios necesitan atención urgente.',
      'Use el recuadro "Asignación Directa / Personal" dentro de cualquier tarjeta para entregar un territorio a un hermano con una nota opcional.',
      'Puede abrir el mapa de cualquier territorio, marcarlo como completado o pulsar "Reiniciar (Conserva NO VISITAR)" para empezar un nuevo ciclo.',
      'Al final de la pestaña encontrará la tabla del "Historial de Territorios Completados (S-13)" y el botón verde "Descargar Planilla CSV / Excel (S-13)".',
    ],
    keywords: ['s-13', 'csv', 'excel', 'territorio personal', 'asignar', 'ordenar', 'reiniciar'],
  },

  // ================= MAPAS KML Y EDITOR =================
  {
    id: 'kml-dos-archivos',
    categoryId: 'kml_mapas',
    title: 'Sistema de 2 Archivos KML/KMZ desde Google My Maps',
    roleBadge: 'Administrador',
    summary:
      'Importe por separado el Archivo 1 (límites de territorios) y el Archivo 2 (manzanas y casas rurales) con vinculación automática.',
    steps: [
      'En Google My Maps, toque el menú (⋮) y seleccione "Exportar a KML/KMZ" para descargar sus capas.',
      'Archivo 1 (Territorios): Debe contener los polígonos exteriores nombrados como "Territorio 1", "Territorio 2", "T-3", etc. Si el nombre o descripción incluye "rural", "campo" o "quinta", se marcará como territorio rural.',
      'Archivo 2 (Manzanas y Casas): Los polígonos se importan como Manzanas (ej. "1A", "Manzana 1B"). Los marcadores puntuales se importan como "Casa Rural" o como "NO VISITAR" si su texto contiene "no visitar" o "no tocar".',
      'En "Ajustes -> Importar o Exportar Mapas", suba ambos archivos (o pruebe primero con el botón "Probar con los 2 KML de ejemplo") y elija si desea reemplazar mapas anteriores (conservando siempre los NO VISITAR) o agregar a los existentes.',
    ],
    tips: [
      'El sistema vincula cada manzana/punto al Archivo 1 en 4 pasos: 1) Número en el código (ej. 12A -> Territorio 12), 2) Intersección geográfica Ray-Casting dentro del polígono, 3) Nombre de la carpeta <Folder> del KML, 4) Centroide más cercano por distancia Haversine.',
      'También puede exportar todo el estado actual a Google My Maps pulsando "Exportar Todo para Google Maps (.KML)".',
    ],
    keywords: ['kml', 'kmz', 'google my maps', 'archivo 1', 'archivo 2', 'exportar', 'importar'],
  },
  {
    id: 'editor-visual-mapas',
    categoryId: 'kml_mapas',
    title: 'Editor Visual de Mapas: crear y corregir bordes sin salir de la app',
    roleBadge: 'Administrador',
    summary:
      'Corrija esquinas, cambie códigos o cree territorios y manzanas nuevos directamente sobre la vista satelital.',
    steps: [
      'Abra la pestaña "Editor de Mapas" y elija si desea "Editar Territorio" o "Editar Manzana" (o cree nuevos con "+ Nuevo Territorio" / "+ Nueva Manzana").',
      'Herramienta "✋ Mover / +": Arrastre los círculos amarillos numerados para mover esquinas, o toque los circulitos azules (+) intermedios para sumar una esquina nueva.',
      'Herramienta "➕ Tocar y Añadir": Toque cualquier punto del mapa para insertar una nueva esquina al polígono.',
      'Herramienta "🗑️ Quitar Esquina": Toque cualquier vértice rojo para eliminarlo (siempre se mantienen al menos 3 esquinas).',
      'Modifique el código/número o el nombre si es necesario y pulse "Guardar Cambios de Nombre y Bordes".',
    ],
    keywords: ['editor', 'poligonos', 'esquinas', 'vertices', 'bordes', 'dibujar'],
  },

  // ================= NUBE, OFFLINE Y RESPALDOS =================
  {
    id: 'nube-supabase-sync',
    categoryId: 'nube_s13',
    title: 'Sincronización en tiempo real con Supabase y servidor local',
    roleBadge: 'Administrador Técnico',
    summary:
      'Los dispositivos consultan la nube cada 4 segundos usando la tabla congregation_state de Supabase o el servidor Node local.',
    steps: [
      'Cree un proyecto gratuito en Supabase y ejecute el script SQL incluido en el Asistente Inicial (crea la tabla public.congregation_state con políticas RLS).',
      'Copie su Project URL y su anon public key desde Project Settings -> API.',
      'Para que los links de publicadores (?grupo=...) funcionen en cualquier celular desde el primer segundo, configure VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY y VITE_CONGREGATION_ID en .env o en GitHub Actions Secrets antes de compilar.',
      'También puede configurar o forzar la subida en vivo desde "Ajustes -> Sincronización en la Nube (Supabase)".',
    ],
    tips: [
      'Si se hospeda con "npm start" (server.mjs) en una red local o VPS sin Supabase, los datos se sincronizan automáticamente mediante /api/cloud-state en .cloud-db.json.',
    ],
    keywords: ['supabase', 'nube', 'sincronizacion', 'sql', 'env', 'congregation_state', 'server'],
  },
  {
    id: 'offline-y-respaldos',
    categoryId: 'nube_s13',
    title: 'Modo sin conexión (PWA) y Copias de Seguridad JSON',
    roleBadge: 'Administrador / Campo',
    summary:
      'La aplicación guarda los datos localmente si pierde señal en el campo y permite respaldar todo en un archivo .json.',
    steps: [
      'Antes de ir a una zona rural sin señal, abra el territorio con Wi-Fi y recorra el mapa con zoom: el Service Worker guardará las imágenes satelitales en caché automáticamente.',
      'Si anota casas sin conexión, se guardan en su dispositivo (y en offlineQueue) hasta que recupere señal.',
      'Respaldo completo: En "Ajustes -> Copia de Seguridad Completa (.json)", descargue periódicamente el archivo de respaldo con toda la congregación. Puede restaurarlo en cualquier momento desde "Ajustes" o desde el Paso 1 del Asistente Inicial.',
    ],
    keywords: ['offline', 'sin conexion', 'cache', 'pwa', 'json', 'respaldo', 'backup'],
  },

  // ================= FAQ =================
  {
    id: 'faq-gps-permisos',
    categoryId: 'faq',
    title: 'El GPS no ubica mi posición en Android o iPhone',
    roleBadge: 'Ayuda Técnica',
    summary:
      'Verifique los permisos de ubicación del navegador y que el acceso sea mediante HTTPS.',
    steps: [
      'Android (Chrome): Toque el ícono del candado/ajustes junto a la dirección web -> Permisos -> Ubicación -> Permitir. Asegúrese de tener encendido el GPS del teléfono.',
      'iPhone / iPad (Safari): Vaya a Ajustes de iOS -> Privacidad y seguridad -> Localización -> Sitios web de Safari -> Al usarse la app. También revise el botón "aA" en la barra de Safari -> Configuración del sitio web -> Ubicación.',
      'Recargue la página y vuelva a pulsar "Mi GPS".',
    ],
    keywords: ['gps', 'ubicacion', 'android', 'iphone', 'safari', 'chrome', 'permisos'],
  },
  {
    id: 'faq-link-no-carga',
    categoryId: 'faq',
    title: 'Un publicador ve "No se pudo cargar la salida desde la nube"',
    roleBadge: 'Ayuda Técnica',
    summary:
      'Significa que el celular del publicador no tiene datos previos guardados y no pudo descargar la base desde Supabase.',
    steps: [
      'Pida al hermano revisar si tiene datos móviles activos y tocar "Reintentar Conexión".',
      'Si el problema ocurre en todos los celulares nuevos, verifique como Administrador que el sitio se haya compilado con las variables VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY y que exista un guardado reciente en "Ajustes".',
    ],
    keywords: ['no se pudo cargar', 'nube', 'error', 'link publicador', 'offline'],
  },
  {
    id: 'faq-pin-y-novisitar',
    categoryId: 'faq',
    title: 'Olvido de PIN de conductor y protección de direcciones "NO VISITAR"',
    roleBadge: 'Administrador',
    summary:
      'Cómo recuperar el PIN de un hermano y confirmación sobre la permanencia de alertas NO VISITAR.',
    steps: [
      '¿Conductor olvidó su PIN?: El Administrador puede verlo directamente debajo del nombre de cada conductor en "Programa y Conductores" (columna derecha).',
      '¿Se borran los "NO VISITAR" al reiniciar?: Nunca. Ni al reiniciar un ciclo, ni al devolver el territorio, ni al reemplazar archivos KML se eliminan las direcciones marcadas como "NO VISITAR".',
    ],
    keywords: ['pin', 'olvide', 'contraseña', 'no visitar', 'seguridad', 'borrar'],
  },
];

export const PUBLISHER_WHATSAPP_GUIDE_TEXT = [
  '🗺️ *GUÍA RÁPIDA PARA PUBLICADORES — MAPA DE TERRITORIO*',
  '',
  '1️⃣ *Ingresar:* Solo toque el enlace del grupo que envió el conductor (no necesita usuario ni contraseña).',
  '2️⃣ *Ver el mapa:* Arriba a la derecha puede alternar entre *🛰️ Satélite* (recomendado para ver los techos) y *🗺️ Calles*.',
  '3️⃣ *Anotar una casa "No en casa":*',
  '   • Haga zoom y toque directamente *sobre el techo de la casa* en el mapa, O toque abajo *"Anotar en mi ubicación GPS actual"*.',
  '   • Verifique la manzana, escriba una seña física (ej. _"N° 432 Reja negra"_) y toque *Guardar*.',
  '4️⃣ *Visitar pendientes:* Toque un círculo naranja 🟠 (o elija en la lista de abajo), pulse *Cómo llegar* y si alguien atiende, toque *✓ ¡Ya atendieron!*',
  '🛑 *IMPORTANTE:* Los círculos rojos con *"!"* son direcciones *NO VISITAR*. Nunca toque en esas puertas.',
].join('\n');

export const CONDUCTOR_WHATSAPP_GUIDE_TEXT = [
  '🧭 *GUÍA RÁPIDA PARA CONDUCTORES DE SALIDA*',
  '',
  '1️⃣ *Ingresar:* Seleccione su nombre en la pantalla de acceso e ingrese su PIN personal.',
  '2️⃣ *Compartir con el grupo:* En su salida asignada, toque *Compartir* o *Copiar* en el recuadro *Link para Publicadores* y envíelo al WhatsApp del grupo.',
  '3️⃣ *En el campo:* Pulse *ABRIR EL MAPA*. Revise el aviso inicial con las direcciones *🛑 NO VISITAR* y las manzanas pendientes.',
  '4️⃣ *Marcar avance:* Toque los botones de las *Manzanas* (1A, 1B...) para pasarlas a verde ✓ a medida que se completan.',
  '5️⃣ *Registrar NO VISITAR:* Solo los conductores y el administrador pueden marcar *🛑 NO VISITAR* tocando la casa en el mapa.',
  '6️⃣ *Al terminar todo el territorio:* Pulse el botón verde *Marcar Territorio Completado* y confirme la devolución para que quede guardado en el registro S-13.',
].join('\n');
