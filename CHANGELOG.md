# Registro de cambios

Todas las versiones de la extensión Botonazo. El número de versión de cada paquete
debe ser mayor que el anterior para que la Chrome Web Store lo acepte.

## 1.1.0 — 15 de octubre de 2026

- **Acceso a los sitios opcional.** El paquete ya no declara `host_permissions`:
  pide `activeTab` y `<all_urls>` como `optional_host_permissions`, que se concede
  una sola vez con «Permitir en todos los sitios» desde la bienvenida, desde
  **Ajustes › General** (donde también se puede quitar) o desde el panel del QR,
  con el estado y una explicación de para qué sirve.
- Sin ese permiso, las capturas, los carteles y avisos, el texto, los atajos, la
  multimedia y los webhooks responden en el celular «Permite el acceso a los
  sitios en el panel de Botonazo», en lugar de un error genérico. La pestaña
  controlada muestra el mismo aviso y la lista de pestañas numera las pestañas
  («Pestaña 1», «Pestaña 2»…) porque Chrome oculta sus títulos. OBS, pestañas,
  ventanas, zoom y la grabación de la pestaña siguen funcionando igual.
- La prueba de punta a punta (79 comprobaciones) también verifica el caso sin
  permiso.

## 1.0.0 — 15 de octubre de 2026

Primera versión.

- **Deck de botones en el celular** conectado por código QR (WebRTC directo y
  cifrado, con retransmisión de Cloudflare para redes restrictivas). Varias
  páginas, 3–5 columnas, vibración y pantalla siempre encendida.
- **Editor visual** en la extensión: 46 acciones, 103 íconos o cualquier emoji,
  12 colores, arrastrar para ordenar, mover entre páginas, macros de hasta 20
  pasos, importar y exportar en JSON y un deck de ejemplo con tres páginas
  (Inicio, OBS y Atajos) más plantillas de Multimedia.
- **Capturas y grabación**: captura de la pestaña a Descargas › Botonazo y al
  celular; grabación de la pestaña con sonido en MP4; grabación de la pantalla
  o de una ventana desde el estudio; pantalla en vivo en el celular.
- **OBS Studio** (WebSocket 5): transmitir, grabar, pausar, escenas, silenciar,
  mostrar u ocultar fuentes, repetición y cámara virtual, con botones que se
  iluminan con el estado real de OBS y cronómetro del directo.
- **Pestañas y ventanas**, **multimedia**, **mensajes en pantalla** (cartel,
  privacidad, avisos y confeti), **atajos de teclado**, **texto**, **portapapeles**,
  **sitios web** y **webhooks**.
