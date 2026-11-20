# 06. Preguntas Frecuentes y Solución de Problemas

Aquí encontrará respuestas rápidas a las dudas más comunes de Administradores, Conductores y Publicadores.

---

## 📑 Contenido
1. [GPS, Ubicación y Brújula en Celulares](#1-gps-ubicación-y-brújula-en-celulares)
2. [Problemas con Enlaces de Publicadores (`?grupo=...`)](#2-problemas-con-enlaces-de-publicadores-grupo)
3. [Direcciones "NO VISITAR" y Reinicio de Territorios](#3-direcciones-no-visitar-y-reinicio-de-territorios)
4. [Acceso, PINs y Permisos de Administrador](#4-acceso-pins-y-permisos-de-administrador)
5. [Problemas al Importar Archivos KML/KMZ](#5-problemas-al-importar-archivos-kmlkmz)
6. [Copias de Seguridad y Buenas Prácticas](#6-copias-de-seguridad-y-buenas-prácticas)

---

## 1. GPS, Ubicación y Brújula en Celulares

### El botón GPS no muestra mi ubicación o da error de permiso
Los navegadores modernos bloquean el GPS si la página no está servida por **HTTPS** (por ejemplo `github.io`) o `localhost`, o si se denegó el permiso anteriormente.

- **En Android (Google Chrome):**
  1. Toque el ícono del **candado / ajustes** a la izquierda de la barra de direcciones (URL).
  2. Entre a **Permisos → Ubicación** y cámbielo a **Permitir**.
  3. Verifique que la **Ubicación (GPS)** del teléfono esté encendida en el panel rápido de Android.
  4. Recargue la página y pulse **`Mi GPS`**.

- **En iPhone / iPad (Safari iOS):**
  1. Abra **Ajustes** del iPhone → **Privacidad y seguridad** → **Localización** y asegúrese de que esté activada.
  2. En esa misma lista entre a **Sitios web de Safari** y seleccione **Al usarse la app**.
  3. También dentro de Safari puede tocar el botón **`aA`** o el ícono de ajustes en la barra de direcciones → **Configuración del sitio web → Ubicación → Permitir**.

### El haz azul de dirección no gira cuando muevo el celular
- En la vista de Publicador (`PublisherLightView`), el haz azul usa los sensores de orientación del dispositivo (`deviceorientation` / `deviceorientationabsolute`).
- Algunos dispositivos iOS requieren permiso explícito para sensores de movimiento o navegadores compatibles con brújula; si el hardware no reporta rumbo, seguirá viendo el punto azul GPS exacto aunque sin el abanico direccional.

---

## 2. Problemas con Enlaces de Publicadores (`?grupo=...`)

### Al abrir el link aparece: "No se pudo cargar la salida desde la nube"
Esto ocurre cuando un publicador abre el enlace en un teléfono que todavía no tiene datos locales guardados y:
1. El teléfono **no tiene conexión a Internet** en ese momento, **o**
2. La aplicación se desplegó **sin configurar `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`** en las variables de entorno (`.env` / GitHub Actions Secrets).

**Solución:**
- Pida al publicador verificar sus datos móviles o Wi-Fi y tocar **`Reintentar Conexión`**.
- Para el Administrador: asegúrese de haber configurado los Secrets de Supabase antes de compilar/desplegar (ver [Guía de Nube y Despliegue](05-nube-supabase-y-despliegue.md)) y haber guardado al menos una vez los datos desde **Ajustes**.

### El publicador dice que ve un territorio diferente al esperado
- Verifique que compartió el enlace correcto de la salida del día (`?grupo=sched-...`).
- Si una salida fue editada para cambiarle el territorio, los cambios pueden tardar hasta **4 segundos** en reflejarse automáticamente en los celulares conectados, o de inmediato si el publicador recarga la página.
- Si el `ID` de la salida ya no existe (por ejemplo, fue eliminada del programa), la vista de publicador mostrará como respaldo la primera salida disponible en el programa actual.

---

## 3. Direcciones "NO VISITAR" y Reinicio de Territorios

### ¿Se borran las direcciones "NO VISITAR" cuando se completa o reinicia un territorio?
**No. Nunca se borran automáticamente.**
Tanto la función **`Reiniciar (Conserva NO VISITAR)`** en el Panel Admin, como el botón **`Completar y Devolver Territorio`** del Conductor, como la reimportación de archivos KML con **`Reemplazar mapas anteriores`**, están programados para **preservar permanentemente** todos los puntos cuya categoría sea `no_visitar`.

### ¿Por qué un publicador no puede marcar ni borrar un "NO VISITAR"?
Por seguridad y exactitud en los registros de la congregación, la vista de publicador solo permite anotar casas `No en casa` y marcar visitas como atendidas. Solo un **Conductor** o **Administrador** (desde `FieldMapView`) puede crear o eliminar una dirección `NO VISITAR`.

---

## 4. Acceso, PINs y Permisos de Administrador

### Un conductor olvidó su PIN de acceso
1. Un Administrador debe ingresar al **Panel Admin → Programa y Conductores**.
2. En la columna derecha (**Conductores y PINs de Acceso**), debajo del nombre de cada hermano se muestra directamente su PIN actual para poder recordárselo.

### No puedo quitar el permiso de Administrador o eliminar a un usuario
El sistema bloquea los botones **`Quitar Admin`** y **`🗑️ Eliminar`** cuando solo queda **1 conductor con permiso de Administrador**, para evitar que nadie pueda volver a entrar al Panel Admin. Si desea reemplazar al administrador actual:
1. Primero marque como Admin al nuevo hermano (`Hacer Admin`).
2. Luego podrá quitar permisos o eliminar al administrador anterior.

### ¿Cómo instalo la aplicación como ícono en el celular (PWA)?
- **Android (Chrome):** Abra la web → menú **`⋮`** → **`Instalar aplicación`** o **`Agregar a la pantalla principal`**.
- **iPhone (Safari):** Abra la web → botón **`Compartir`** (cuadrado con flecha hacia arriba) → **`Agregar a inicio`**.

---

## 5. Problemas al Importar Archivos KML/KMZ

### Al subir el Archivo 2 dice "0 manzanas" o "0 puntos"
- Verifique que exportó la capa correcta desde Google My Maps y que los elementos son **polígonos cerrados** (para manzanas) o **marcadores** (para casas), no solo líneas sueltas (`LineString`).
- Compruebe que cada polígono de manzana tenga al menos 3 coordenadas válidas.

### Una manzana quedó vinculada al territorio equivocado
Esto suele pasar si el nombre de la manzana contiene un número diferente (por ejemplo, se llama `2A` pero se dibujó sobre el Territorio `1`, ya que la regla #1 prioriza el número en el código de la manzana).
- **Solución rápida:** Vaya a **Panel Admin → Editor de Mapas**, seleccione **`🧱 Editar Manzana`**, elija esa manzana y cambie el campo **Pertenece al Territorio** y su **Código** sin necesidad de reimportar el archivo KML.

### Las manzanas quedaron fuera de lugar respecto a la calle
Use la pestaña **Editor de Mapas** en el Panel Admin con la vista satelital activada y la herramienta **`✋ Mover / +`** para arrastrar las esquinas amarillas exactamente sobre las veredas o límites reales.

---

## 6. Copias de Seguridad y Buenas Prácticas

- **Respaldo Semanal:** Se recomienda que el Siervo de Territorios descargue una **Copia de Seguridad Completa (`.json`)** desde **Panel Admin → Ajustes** al menos una vez al mes o antes de hacer cambios masivos en los mapas.
- **Exportación S-13:** Al cierre del año de servicio o mensualmente, descargue la **`Planilla CSV / Excel (S-13)`** desde **Territorios y S-13** para conservar el registro histórico oficial de la congregación.
- **Privacidad de Datos:** Nunca escriba nombres completos de vecinos, números de teléfono ni notas personales sensibles en el campo *Descripción* o *Notas* de las casas `No en casa` o `NO VISITAR`; limite las notas a referencias visuales del domicilio (ej. *"Portón gris - no volver a visitar"*).
