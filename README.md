<p align="center">
  <img src="extension/icons/icon-128.png" width="96" alt="Botonazo">
</p>

<h1 align="center">Botonazo</h1>
<p align="center">Tu deck de botones para Chrome, en el celular.<br>
Diseña tus botones en la extensión, escanea un QR y controla todo con un toque:<br>
capturas, grabación, OBS, pestañas, ventanas, multimedia, atajos, webhooks y macros.</p>
<p align="center"><sub>Creado por <b>Miguel Mogrovejo</b> · v1.0.0 · hermano de <a href="https://github.com/mjmc4498/mando">Presentazo</a></sub></p>

---

## Funciones

| | |
|---|---|
| **Capturas y grabación** | Captura de la pestaña (a Descargas › Botonazo y al celular, listo para guardar o compartir). Grabación de la pestaña con sonido en MP4. Grabación de la pantalla completa o de una ventana desde el *estudio*. **Ver la pantalla en vivo** en el celular (video real o imágenes). |
| **Transmisiones con OBS Studio** | Iniciar/detener la transmisión y la grabación, pausar, cambiar de escena, silenciar fuentes de audio, mostrar u ocultar fuentes, guardar la repetición y la cámara virtual. Los botones se iluminan con el estado real de OBS y muestran el cronómetro del directo. |
| **Pestañas y ventanas** | Siguiente/anterior, lista de pestañas en el celular para saltar a cualquiera (o cerrarla), ir a la pestaña que suena, nueva, cerrar, recargar, duplicar, fijar, silenciar, cambiar de ventana, nueva ventana, pantalla completa y minimizar. |
| **Multimedia** | Reproducir/pausar, adelantar/retroceder, volumen, silenciar y velocidad del video o audio que suena (YouTube, Twitch, Spotify web…). |
| **Mensajes en pantalla** | Cartel «Volvemos pronto» (pantalla completa, centrado o barra inferior), pantalla de privacidad, avisos y lluvia de confeti. Se ven en la transmisión porque se dibujan sobre la página. |
| **Teclado y web** | Atajos de teclado de la página, escribir textos, copiar al portapapeles, abrir sitios, zoom, desplazar, atrás/adelante y **webhooks HTTP** (Streamer.bot, Home Assistant, Zapier, IFTTT, Discord…). |
| **Deck a tu medida** | 46 acciones, 103 íconos o cualquier emoji, 12 colores, hasta 12 páginas de 40 botones, macros de hasta 20 pasos con pausas, botones para saltar entre páginas, importar/exportar en JSON y 3, 4 o 5 columnas. |
| **Conexión** | WebRTC directo y cifrado; retransmisión de Cloudflare para redes restrictivas; reconexión automática; código QR nuevo en cada sesión; varios celulares a la vez; vibración y pantalla siempre encendida en el celular. |

Probado de principio a fin con **63 comprobaciones automáticas** (extensión + celular reales conectados por PeerJS, OBS simulado, grabación real de la pestaña y video en vivo).

## Cómo funciona

```
┌──────────── Chrome (computadora) ────────────┐          ┌──────── Celular ────────┐
│                                               │          │                         │
│  options.html ── editor del deck              │          │  remote/ (GitHub Pages) │
│  popup.html ──── muestra el QR                │   QR     │  index.html + app.js    │
│      │                                        │ ───────▶ │  dibuja tu deck         │
│      ▼                                        │          │          │              │
│  background.js (service worker)               │  WebRTC  │  pulsa «botón 7f3k…»    │
│   · resuelve el botón → ejecuta la acción     │ ◀══════▶ │  PeerJS (cliente)       │
│   · pestañas, ventanas, capturas, webhooks    │ cifrado  │  (+ video en vivo)      │
│      │                                        │          └─────────────────────────┘
│      ▼                                        │
│  offscreen.html ── PeerJS (anfitrión),        │        Señalización: 0.peerjs.com
│      grabación (MediaRecorder), OBS WebSocket │        (solo para conectar; no ve
│      │                                        │         el contenido)
│      ▼                                        │
│  content/ ── carteles, confeti, atajos, texto │ ──▶ OBS Studio (ws://localhost:4455)
│  studio.html ── grabar pantalla o ventana     │
└───────────────────────────────────────────────┘
```

- **El celular nunca envía acciones, solo el id del botón.** La extensión busca ese botón en tu deck y ejecuta lo configurado. Así el celular no puede pedir webhooks, textos ni URLs arbitrarias, y los detalles (direcciones, contraseñas, textos) no salen de la computadora.
- El QR contiene `https://…/botonazo/#id=<sesión>&k=<clave>`. La clave viaja en el fragmento `#` (nunca llega a un servidor) y el celular la borra de la barra de direcciones al conectarse.
- PeerJS limita los mensajes JSON a ~16 KB: el deck, la lista de pestañas y las imágenes se envían en partes que el celular vuelve a unir.
- Los scripts de contenido **no se registran de forma permanente**: se insertan en la pestaña solo cuando un botón los necesita.
- La capa visual (carteles, confeti) se dibuja en la capa superior del navegador (`popover`), por eso se ve incluso en pantalla completa y sale en las transmisiones de OBS.
- La grabación y la vista en vivo comparten una sola captura de la pestaña (Chrome no permite capturarla dos veces).

## Estructura

```
botonazo/
├── extension/           ← lo que se empaqueta y sube a la Chrome Web Store
│   ├── manifest.json
│   ├── background.js    service worker: sesión y ejecución de cada acción
│   ├── actions.js       catálogo de acciones (campos, íconos, interruptores)
│   ├── deck.js          deck: plantillas, validación y versión para el celular
│   ├── offscreen.*      conexión WebRTC, grabación de la pestaña y OBS
│   ├── popup.*          panel con el QR
│   ├── options.*        editor del deck y ajustes (también es la bienvenida)
│   ├── studio.*         ventana para grabar la pantalla o una ventana
│   ├── content/         carteles, confeti, atajos y texto en la página
│   ├── lib/             PeerJS, QR, íconos, cliente de OBS, i18n
│   ├── _locales/        textos en español
│   └── icons/
├── remote/              ← deck del celular (se publica en GitHub Pages)
│   ├── privacy.html     política de privacidad (URL pública para la tienda)
│   └── favicon.ico, icon.svg, manifest.webmanifest…
├── cloudflare/          ← Worker de credenciales TURN (opcional: se comparte el de Presentazo)
├── store/               ← imágenes y textos para la ficha de la tienda (LISTING.md)
├── design/              logos SVG y composiciones de las imágenes de la tienda
├── presentacion/        presentación del producto (botonazo.pptx)
├── scripts/             build.sh, render.py, capture-store.mjs, demo-deck.mjs
├── test/                prueba de punta a punta, OBS simulado y páginas de prueba
└── dist/                paquetes generados (.zip / .crx)
```

## Publicación paso a paso

### 1. Publica el deck del celular (una sola vez)

El QR abre `https://mjmc4498.github.io/botonazo/`, así que esa página debe existir:

```bash
cd botonazo
git init -b main && git add . && git commit -m "Botonazo 1.0.0"
gh repo create mjmc4498/botonazo --public --source . --push
gh api -X POST repos/mjmc4498/botonazo/pages -f build_type=workflow
```

El flujo `.github/workflows/pages.yml` publica la carpeta `remote/` en cada cambio. En 1–2 minutos estarán disponibles:

- Deck: `https://mjmc4498.github.io/botonazo/`
- Privacidad: `https://mjmc4498.github.io/botonazo/privacy.html`

> ¿Otra dirección? Cambia `REMOTE_URL` en `extension/config.js` (y `homepage_url` en el manifiesto) y vuelve a empaquetar. También puede cambiarse en **Ajustes › Avanzado** sin reempaquetar.

### 2. Prueba la extensión en tu Chrome

1. Ejecuta `./scripts/build.sh`.
2. Abre `chrome://extensions`, activa **Modo de desarrollador** y pulsa **Cargar extensión sin empaquetar**.
3. Elige la carpeta `dist/botonazo/` (su ruta no cambia entre versiones).
4. Se abre el editor: arma tu deck. Luego haz clic en el ícono de Botonazo (o `Alt+Shift+D`) y escanea el QR.

### 3. Empaqueta

```bash
./scripts/build.sh
```

Genera `dist/botonazo-<versión>.zip` para la tienda y la carpeta `dist/botonazo/` para «Cargar extensión sin empaquetar» (valida manifiesto, íconos, idiomas y scripts antes de comprimir, y regenera el deck de ejemplo del modo demostración).

Para un `.crx` instalable fuera de la tienda: `./scripts/build.sh --crx` (la clave queda en `keys/botonazo.pem`; guárdala y no la subas a git). **La Chrome Web Store solo acepta el ZIP**; ella firma el paquete final.

### 4. Sube a la Chrome Web Store

1. Entra al [Panel del desarrollador](https://chrome.google.com/webstore/devconsole) (la misma cuenta de Presentazo; el registro de USD 5 ya está pagado).
2. **Nuevo elemento** → sube `dist/botonazo-1.0.0.zip`.
3. Completa las pestañas copiando los textos de [`store/LISTING.md`](store/LISTING.md) y sube las imágenes de `store/`.
4. **Enviar para revisión.** Por los permisos de acceso a todos los sitios y de captura de pestañas la revisión puede tardar algunos días; las justificaciones de cada permiso ya están redactadas en `LISTING.md`.

### Nuevas versiones

1. Sube `version` en `extension/manifest.json` (y `VERSION` en `remote/app.js`, y el `?v=` de `remote/index.html` si cambió el celular).
2. Anota los cambios en `CHANGELOG.md`.
3. `./scripts/build.sh` y sube el nuevo ZIP en el panel (**Paquete › Subir nuevo paquete**).
4. En Chrome, pulsa **Actualizar** en la página de Extensiones: la carpeta `dist/botonazo/` siempre tiene la última versión.

## Uso con OBS Studio

1. En OBS (28 o posterior): **Herramientas › Ajustes del servidor WebSocket** → activa el servidor y anota el puerto (4455) y la contraseña.
2. En Botonazo: **Ajustes › OBS Studio** → activa «Controlar OBS Studio», escribe el puerto y la contraseña y pulsa **Probar conexión**. Si conecta, el editor te sugiere tus escenas y fuentes reales al configurar los botones.
3. La página **OBS** del deck de ejemplo trae escenas llamadas «Principal», «Pantalla» y «Pausa»: cámbialas por los nombres de las tuyas.

## Desarrollo

```bash
npm install                 # Puppeteer y ws (solo para pruebas y capturas)
npm run serve               # servidor local en http://localhost:8766 (otra terminal)
npm run test:e2e            # prueba completa extensión ↔ celular ↔ OBS simulado (63 comprobaciones)
npm run icons               # regenera íconos y favicon desde design/*.svg
npm run demo-deck           # regenera remote/demo-deck.json
npm run store:capture       # capturas reales de la extensión
npm run store:images        # compone las imágenes de la tienda
```

- Vista previa del deck sin computadora: `http://localhost:8766/remote/?demo` (añade `&page=1`, `&sheet=tabs`, `&sheet=shot` o `&viewer`).
- Prueba local con el celular: en **Ajustes › Avanzado** pon `http://<IP-de-tu-computadora>:8766/remote/` (misma red Wi-Fi).
- La prueba de punta a punta autoriza la captura de pestañas con `--allowlisted-extension-id`, así ejerce la grabación y el video en vivo reales sin hacer clic en el ícono.

### Retransmisión con Cloudflare (redes restrictivas)

Botonazo comparte con Presentazo el Worker `https://mando-turn.mjmc4498.workers.dev`, que entrega credenciales temporales del servidor TURN de Cloudflare (gratis hasta 1.000 GB al mes, con pausa automática a los 900 GB). Acepta cualquier extensión de Chrome y el origen `https://mjmc4498.github.io`, así que no hay que configurar nada. Consumo del mes: <https://mando-turn.mjmc4498.workers.dev/estado>.

La carpeta `cloudflare/` tiene una copia (`botonazo-turn`) por si algún día prefieres un Worker propio: `cd cloudflare && npx wrangler deploy`, guarda los secretos `TURN_KEY_ID`, `TURN_KEY_API_TOKEN` y `CF_ANALYTICS_TOKEN`, y cambia `ICE_ENDPOINT` en `extension/config.js` y `remote/app.js`.

## Permisos

| Permiso | Para qué |
|---|---|
| `<all_urls>` | Ejecutar los botones en la pestaña (carteles, atajos, texto, video) y capturar la pestaña visible. |
| `tabCapture` | Grabar la pestaña y mostrarla en vivo en el celular. |
| `downloads` | Guardar capturas y videos en Descargas › Botonazo. |
| `scripting` | Insertar los scripts solo cuando un botón los necesita. |
| `offscreen` | Mantener la conexión WebRTC, grabar el video y copiar al portapapeles. |
| `storage` | Guardar el deck, los ajustes y la sesión. |

## Limitaciones

- Chrome no permite extensiones en `chrome://`, en la Chrome Web Store ni en su visor de PDF: ahí no funcionan los carteles, atajos ni capturas.
- Para **grabar una pestaña** o verla en video en vivo, Chrome exige que hayas hecho clic en el ícono de Botonazo sobre esa pestaña (abrir el panel del QR cuenta). Si no, Botonazo te lo indica en el celular; la vista en vivo usa entonces imágenes de la pestaña visible.
- Los atajos de teclado son eventos sintéticos: funcionan con los atajos de las páginas web, no con los del sistema operativo ni con los propios de Chrome (para esos están las acciones de pestañas y ventanas).
- La grabación de pantalla completa siempre pasa por el selector de Chrome en la computadora.

## Licencia

© 2026 Miguel Mogrovejo. Incluye PeerJS y QR Code Generator (MIT) e íconos basados en Lucide (ISC) — ver `extension/THIRD_PARTY_NOTICES.txt`.
