# 01. Guía del Administrador (Siervo de Territorios)

Este manual explica todas las herramientas disponibles para el **Siervo de Territorios** y los hermanos con privilegios de **Administrador (`isAdmin`)**.

---

## 📑 Contenido
1. [Asistente de Configuración Inicial (Desde Cero)](#1-asistente-de-configuración-inicial-desde-cero)
2. [Pestaña: Programa y Conductores](#2-pestaña-programa-y-conductores)
3. [Pestaña: Notificaciones Push](#3-pestaña-notificaciones-push)
4. [Pestaña: Territorios y S-13](#4-pestaña-territorios-y-s-13)
5. [Pestaña: Editor de Mapas](#5-pestaña-editor-de-mapas)
6. [Pestaña: Ajustes (Nube, Respaldos y Mapas)](#6-pestaña-ajustes-nube-respaldos-y-mapas)
7. [Alternar entre Panel Admin y Mi Vista Conductor](#7-alternar-entre-panel-admin-y-mi-vista-conductor)

---

## 1. Asistente de Configuración Inicial (Desde Cero)

Cuando la aplicación se abre por primera vez en un dispositivo sin datos configurados (o cuando el Administrador pulsa **`🪄 Abrir Asistente de Configuración Inicial`** en la pestaña *Ajustes*), aparece el asistente guiado de **4 pasos**:

### Paso 1: Congregación y Conexión a la Nube
- **Nombre de la Congregación:** Escriba el nombre oficial (ej. *Congregación Central*).
- **Conectar con Supabase (Opcional pero recomendado):**
  - Si su congregación ya usa Supabase, ingrese la **Supabase Project URL**, la **Supabase Anon Key** y el **ID de Congregación** (por defecto `main`) y pulse **Conectar**. Si ya existen datos guardados en la nube para ese ID, la aplicación los descargará automáticamente y saltará el resto del asistente.
  - Si está creando el proyecto desde cero, el asistente incluye el script SQL listo para copiar (`CONGREGATION_STATE_SQL`) y pegar en el *SQL Editor* de Supabase. Consulte la [Guía de Nube y Despliegue](05-nube-supabase-y-despliegue.md) para más detalles.
- **Restaurar Copia de Seguridad (`.json`):** Si viene de otro dispositivo o servidor, puede cargar directamente un respaldo `.json` en este paso.
- **Datos de Demostración:** En la esquina superior derecha del asistente existe el enlace *"O cargar con datos de demostración"* para probar la aplicación inmediatamente con 3 territorios y salidas de ejemplo.

### Paso 2: Subir los 2 Archivos KML/KMZ de Google My Maps
- Suba el **Archivo 1** (polígonos de los territorios generales) y luego el **Archivo 2** (manzanas y puntos de casas rurales o `NO VISITAR`).
- Puede probar el vínculo con el botón de los 2 archivos de ejemplo incluidos (`archivo1_territorios_ejemplo.kml` y `archivo2_manzanas_y_casas_ejemplo.kml`).
- Si aún no tiene los mapas listos, puede continuar y cargarlos o dibujarlos luego en el *Editor de Mapas* o en *Ajustes*.

### Paso 3: Conductores y Permisos de Administrador
- Registre a los hermanos encargados indicando:
  - **Nombre:** Ej. `Hno. Carlos Gómez`
  - **PIN:** Mínimo **4 dígitos** (hasta 8 caracteres numéricos).
  - **Casilla `🛡️ Dar permisos de Administrador`:** Marque esta opción en el Siervo de Territorios y en cualquier auxiliar que deba gestionar el panel.
- Si ningún conductor tiene marcada la casilla de Administrador al finalizar, el sistema asignará automáticamente privilegios de Administrador al **primer conductor** de la lista para evitar que la congregación quede bloqueada sin acceso administrativo.

### Paso 4: Primera Salida del Programa Semanal (Opcional)
- Puede crear la primera salida indicando día, hora, conductor, punto de encuentro y territorio, o finalizar directamente para entrar al **Panel Admin**.

---

## 2. Pestaña: Programa y Conductores

Esta es la pantalla principal de trabajo semanal. Se divide en dos columnas:

### A. Crear y Editar Salidas del Programa Semanal
En el formulario **Nueva Salida** (o **✏️ Editar Salida**), los únicos campos obligatorios son **Fecha** y **Hora** (los demás son opcionales):
1. **Fecha y Día de la semana (Fecha obligatoria):** Al elegir la **Fecha** en el calendario, el campo **Día** (`Lunes` a `Domingo`) se actualiza automáticamente. Si cambia el **Día**, la fecha salta a la próxima ocurrencia de ese día.
2. **Hora (obligatoria):** Especifique la hora de la salida (ej. `09:30`).
3. **Encargado(s) (opcional):** Seleccione uno o más conductores de la lista. Si lo deja vacío, recibirá una advertencia antes de publicar y la salida figurará como *"Por asignar"*.
4. **Localidad y Punto de Encuentro (Link Maps, opcionales):**
   - Seleccione una localidad de la lista desplegable (ej. *Salón del Reino*, *Arroyo Porã*) o déjelo sin localidad (en cuyo caso recibirá una advertencia antes de publicar y aparecerá como *"Por asignar"*).
   - Pulse **`✏️ Personalizar`** para abrir el **Gestor de Localidades Personalizadas**: allí puede agregar nuevos puntos frecuentes (nombre + link de Google Maps) o eliminar los que ya no use. Al elegir una localidad guardada, su enlace de Google Maps se rellena automáticamente.
   - Si indica una localidad pero deja el enlace de Maps vacío, el sistema genera automáticamente un enlace de búsqueda en Google Maps con el nombre del punto de encuentro.
5. **Territorio(s) (opcional):**
   - Puede agregar **uno o varios territorios** a una misma salida usando el desplegable `+ Agregar territorio...`, o dejarlo sin territorios por el momento.
   - El selector muestra la última fecha en que se trabajó cada territorio y si actualmente está asignado a algún hermano.
   - **Alerta de conflicto:** Si selecciona un territorio que ya figura asignado a otro hermano (y eligió al menos un encargado), el sistema mostrará un aviso pidiendo confirmación antes de agregarlo o reasignarlo al conductor de la salida.
6. **Notas para el conductor (opcional):** Campo para indicaciones prácticas (ej. *"Hacer primero las casas No en casa de la manzana 1A"*).

### B. Acciones sobre el Programa Semanal Publicado
Debajo del formulario verá todas las salidas ordenadas cronológicamente:
- **En cada salida individual:**
  - `Copiar`: Copia al portapapeles el bloque de texto con formato y emoticonos listo para WhatsApp (`🔹 Día - Hora hs`, `👤 Encargado`, `🗺️ Localidad`, `📍 Punto de Encuentro`).
  - `WhatsApp`: Copia y abre directamente WhatsApp con el mensaje de esa salida.
  - `Duplicar`: Clona esa salida en el formulario sumando automáticamente **+7 días** a la fecha, lista para ajustar o publicar la semana siguiente.
  - `Editar`: Carga los datos de la salida en el formulario superior para modificarla.
  - `Mapa`: Abre directamente el primer territorio de esa salida en el Mapa Interactivo.
  - `🗑️ (Papelera)`: Elimina esa salida del programa.
- **Acciones globales para toda la semana:**
  - **`Duplicar Semana (+7 días)`:** Clona de una sola vez **todas** las salidas actuales avanzando sus fechas 7 días hacia adelante.
  - **`Copiar Mensaje` / `Abrir en WhatsApp`:** Generan y envían el programa semanal completo con una vista previa en tiempo real en la parte inferior.

### C. Gestión de Conductores y PINs (Columna Derecha)
- **Agregar Conductor:** Ingrese nombre, PIN (ej. `5555`) y marque `🛡️ Dar permisos de Administrador` si corresponde.
- **Administrar existentes:**
  - Puede ver el PIN de cada conductor para recordárselo si lo olvida.
  - Botón **`Hacer Admin` / `Quitar Admin`**: Otorga o revoca acceso administrativo al instante.
  - **Regla de seguridad:** Si solo queda **1 Administrador**, los botones de quitar permiso de Admin y eliminar quedan deshabilitados para ese usuario, garantizando que siempre haya un administrador activo.

---

## 3. Pestaña: Notificaciones Push

Esta sección es exclusiva del Administrador y permite preparar y enviar avisos directos a los conductores:

### Las 3 Plantillas Configurables
1. **1. Recordatorio Previo a la Salida** (`antes_salida`): Pensado para enviarse horas antes de la reunión para el servicio.
2. **2. Aviso de Inicio: NO VISITAR y No en Casa** (`inicio_alertas`): Resume al conductor cuántas direcciones `NO VISITAR` y cuántas casas `No en casa` pendientes hay en el territorio asignado.
3. **3. Recordatorio al Finalizar la Predicación** (`cierre_salida`): Recuerda al conductor marcar las manzanas completadas o devolver el territorio al concluir.

### Variables Dinámicas Disponibles
Puede editar libremente el **Título** y el **Mensaje** de cada plantilla usando estas etiquetas entre llaves, que se reemplazan automáticamente con los datos reales de la salida:

| Variable | Qué inserta automáticamente |
| :--- | :--- |
| `{conductor}` | Nombre del conductor asignado a la salida |
| `{dia}` | Día de la salida (ej. `Sábado`) |
| `{hora}` | Hora de la salida (ej. `09:30`) |
| `{punto_encuentro}` | Nombre del punto de encuentro |
| `{territorio}` | Nombre(s) de los territorios de la salida |
| `{no_en_casa_pendientes}` | Cantidad de casas `No en casa` pendientes en esos territorios |
| `{no_visitar}` | Cantidad de direcciones `NO VISITAR` en esos territorios |

### Enviar una Notificación
1. Seleccione la salida en el desplegable superior (*Previsualizar o enviar notificación Push para la salida*).
2. Revise el cuadro **📱 Vista Previa en el Celular de...**.
3. Pulse **`Enviar esta Notificación Push a [Conductor] Ahora`**. El conductor verá el aviso en su bandeja de entrada dentro de la app y, si concedió permiso en su navegador, recibirá también la notificación nativa en su dispositivo.

---

## 4. Pestaña: Territorios y S-13

Permite controlar el estado completo de cada territorio, sus manzanas, las asignaciones personales y el registro oficial **S-13**.

### Buscador y Ordenamiento
- **Buscador:** Filtre instantáneamente por número/nombre de territorio, descripción o nombre del hermano asignado (ignora tildes y mayúsculas).
- **Ordenar por:**
  - `Número (1 → N)`
  - `Trabajados hace más tiempo (Prioridad)`: Muestra primero los territorios sin fecha o trabajados hace más tiempo, ideal para decidir qué territorio asignar a continuación.
  - `Completados recientemente`
  - `Estado (En curso primero)`
  - `Asignado a (A → Z)`

### Tarjeta de cada Territorio
Cada tarjeta muestra:
- Estado (`En curso` o `Completado`), última fecha en que se completó, conteo de manzanas completadas (`X/Y`), cantidad de casas `No en casa` pendientes y cantidad de direcciones `NO VISITAR`.
- **Asignación Directa / Personal:** Seleccione un conductor en el menú desplegable para entregarle ese territorio de forma personal (fuera o además del programa semanal) y agregue una nota opcional (ej. *"Trabajar los domingos por la tarde"*).
- **Fechas por Manzana:** Muestra el estado (`Pendiente`, `En progreso`, `✓ Completada`) y la fecha de la última vez que se trabajó cada manzana.
- **Lista rápida de "No en casa":** Muestra los puntos pendientes con enlace directo a `Maps`.
- **Botones de acción:**
  - `🗺️ Abrir en Mapa Interactivo`: Abre ese territorio en el mapa de campo con privilegios de Administrador.
  - `✓ Marcar Territorio Completo`: Marca todas las manzanas como completadas, cambia el estado del territorio a `Completado` y agrega automáticamente una fila en el **Historial S-13**.
  - `🔄 Reiniciar (Conserva NO VISITAR)`: Prepara el territorio para un nuevo ciclo (`En curso`, manzanas en `Pendiente`, limpia casas ya atendidas y `No en casa` del ciclo anterior, y vuelve a `Pendiente` las casas rurales), **manteniendo intactas todas las direcciones marcadas como `NO VISITAR`**.

### Historial de Territorios Completados (S-13)
- Registra automáticamente cada cierre de territorio hecho por un conductor o administrador con: **Territorio**, **Conductor**, **Fecha Inicio**, **Fecha Completado**, **Total de Manzanas**, **Casas No en Casa Atendidas** y **Notas**.
- Pulse **`Descargar Planilla CSV / Excel (S-13)`** para descargar un archivo `.csv` con codificación UTF-8 BOM que se abre correctamente con tildes y eñes en Microsoft Excel, LibreOffice Calc o Google Sheets.

---

## 5. Pestaña: Editor de Mapas

Herramienta visual para dibujar o corregir límites de **Territorios** y **Manzanas** directamente sobre el mapa satelital o de calles:

- **Dibujar tocando en el mapa:** Pulse **`+ Dibujar Territorio`** o **`+ Dibujar Manzana`** en la barra superior (o **`+ Dibujar Manzana`** desde cualquier territorio en la pestaña *Territorios y S-13*) y haga clic o toque cada esquina en el mapa. Al tener 3 o más puntos, toque el círculo verde **`1`** (o haga doble clic / pulse `Enter`) para cerrar la figura.
- **Creación rápida en cadena:** Al dibujar un territorio puede usar **`Guardar y dibujar manzanas`** para pasar de inmediato a su primera manzana (`1A`, `2A`, etc.); al dibujar manzanas puede usar **`Guardar y dibujar otra manzana`** para seguir con la siguiente (`1B`, `1C`...) con numeración automática.
- **Panel jerárquico Territorio → Manzanas:** El panel izquierdo muestra siempre el territorio activo junto con la lista completa de sus manzanas para cambiar entre ellas, acercar el mapa o eliminar manzanas con un clic. También puede insertar una caja rápida de 4 esquinas con **`+ Caja`**.
- **Edición precisa de bordes y propiedades:**
  - Cambie número de territorio, código de manzana (`1A`, `2B`...), nombre, descripción, tipo (`Urbano`, `Rural`, `Mixto`) o territorio padre (con sugerencia automática de código al mover una manzana).
  - Arrastre las esquinas amarillas (`1, 2, 3...`), toque o **arrastre los circulitos azules (`+`)** para crear una esquina intermedia en un solo gesto, haga **clic derecho** en una esquina para quitarla o use **`🔄 Redibujar borde desde cero`**.
  - **Imán a esquinas vecinas (`🧲 Imán`):** Ajusta automáticamente el trazo a vértices de territorios y manzanas contiguas (mantenga `Alt` para pausarlo momentáneamente).
  - **Casas de referencia (`🏠 Casas`):** Muestra u oculta los pines de casas registradas en el territorio para evitar dividir una cuadra por error.
- **Integridad de datos y atajos:** Soporta `Ctrl+Z` / `Ctrl+Y` para deshacer/rehacer y `Backspace` mientras dibuja. Al renombrar una manzana se actualizan las referencias de sus casas, y al eliminar una manzana **se conservan todas las casas y direcciones `NO VISITAR`** dentro del territorio.

---

## 6. Pestaña: Ajustes (Nube, Respaldos y Mapas)

### Datos de la Congregación y Asistente
- Permite editar y guardar el **Nombre de la Congregación**.
- Incluye el botón **`🪄 Abrir Asistente de Configuración Inicial (Desde Cero)`** con confirmación previa para reconfigurar la app o iniciar una congregación nueva.

### Sincronización en la Nube (Supabase)
- Muestre u oculte la insignia `✓ Configurado por Variables de Entorno` si el sitio fue compilado con `.env`.
- Permite ingresar o actualizar `Supabase Project URL`, `Supabase Anon Key` e `ID de Congregación` y pulsar **`☁️ Guardar y Subir Datos Actuales a Supabase`** para forzar la subida inmediata del estado actual.

### Copia de Seguridad Completa (`.json`)
- **`💾 Descargar Copia de Seguridad (.json)`:** Exporta absolutamente toda la base de datos de la congregación (conductores, PINs, territorios, manzanas, casas `No en casa`, direcciones `NO VISITAR`, programa semanal, plantillas e historial S-13).
- **`📂 Restaurar Copia de Seguridad (.json)`:** Permite restaurar una copia previa en cualquier momento o migrar los datos a otro servidor/URL.

### Importar o Exportar Mapas (Google My Maps)
- **`🌍 Exportar Todo para Google Maps (.KML)`:** Descarga un único archivo `.kml` organizado en 3 carpetas (*Territorios*, *Manzanas*, *Casas y Puntos*) con estilos y colores listos para abrir en Google My Maps o Google Earth.
- **Importar los 2 Archivos `.kml` o `.kmz`:** Suba el Archivo 1 y el Archivo 2, verifique el resumen en la vista previa y decida si marcar **`Reemplazar mapas anteriores al guardar`** (la cual **conserva las direcciones `NO VISITAR` existentes**) o desmarcarla para agregar nuevos territorios a los existentes. Consulte el manual [04. Mapas KML y Google My Maps](04-mapas-kml-google-mymaps.md).

---

## 7. Alternar entre Panel Admin y Mi Vista Conductor

Todo usuario con privilegios de Administrador (`isAdmin: true`) dispone en la barra superior azul oscuro de un botón de cambio rápido:
- Estando en el Panel Admin, el botón dice **`Mi Vista Conductor`**: al pulsarlo pasa a ver exactamente el portal de conductor con sus propias salidas y territorios asignados.
- Estando en su Vista Conductor, el botón cambia a **`Panel Admin`** (color ámbar) para regresar de inmediato a las funciones administrativas.
