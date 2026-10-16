# Ficha para la Chrome Web Store — Botonazo

Todo lo que pide el [Panel del desarrollador](https://chrome.google.com/webstore/devconsole), listo para copiar y pegar.

---

## 1. Paquete

| Campo | Valor |
|---|---|
| Archivo para subir | `dist/botonazo-1.1.0.zip` · versión 1.1.0 |
| Autor | Miguel Mogrovejo |

> Antes de enviar a revisión publica el repositorio `botonazo` con GitHub Pages (ver README, paso 1): la extensión abre `https://mjmc4498.github.io/botonazo/` en el celular y la política de privacidad vive en esa misma dirección.

---

## 2. Pestaña «Ficha de la tienda»

### Idioma: Español

**Nombre** (viene del manifiesto, 45 caracteres)
```
Botonazo: tu deck de botones desde el celular
```

**Resumen** (viene del manifiesto, 124/132 caracteres)
```
Crea tu deck de botones y úsalo desde el celular: capturas, grabación, OBS, pestañas, ventanas, multimedia, atajos y macros.
```

**Descripción**
```
Convierte tu celular en un deck de botones para Chrome, como los de los streamers, pero sin comprar hardware. Diseña tus botones en la extensión, escanea un código QR y controla todo con un toque. Sin apps y sin cuentas.

📸 CAPTURAS Y GRABACIÓN
• Captura la pestaña: se guarda en Descargas › Botonazo y llega a tu celular para guardarla o compartirla.
• Graba la pestaña en video con su sonido (MP4) y detén la grabación con el mismo botón.
• Graba la pantalla completa o una ventana desde el estudio de Botonazo.
• Mira la pantalla en vivo en tu celular.

🔴 TRANSMISIONES CON OBS STUDIO
• Inicia y detén la transmisión o la grabación, y pausa la grabación.
• Cambia de escena, silencia el micrófono y muestra u oculta fuentes.
• Guarda la repetición y activa la cámara virtual.
• Los botones se iluminan con el estado real de OBS y muestran el cronómetro del directo.

🗂 PESTAÑAS Y VENTANAS
• Pasa a la pestaña siguiente o anterior, o elige cualquiera desde la lista en tu celular.
• Ve a la pestaña que está sonando, abre, cierra, recarga, duplica, fija o silencia pestañas.
• Cambia de ventana, abre una nueva, ponla en pantalla completa o minimízala.

▶ MULTIMEDIA
• Reproduce o pausa, adelanta o retrocede, cambia el volumen o la velocidad del video que suena.

💬 MENSAJES EN PANTALLA
• Cartel «Volvemos pronto» a pantalla completa, centrado o como barra inferior.
• Pantalla de privacidad, avisos rápidos y lluvia de confeti para celebrar en directo.

⌨ ATAJOS Y AUTOMATIZACIÓN
• Atajos de teclado de la página, textos predefinidos y copiar al portapapeles.
• Abre tus sitios favoritos, cambia el zoom y desplázate.
• Webhooks HTTP para Streamer.bot, Home Assistant, Zapier, IFTTT, Discord y cualquier servicio.
• Macros: varias acciones seguidas con un solo botón.

🎨 TU DECK, A TU MEDIDA
• 46 acciones, 103 íconos o cualquier emoji y 12 colores.
• Varias páginas, de 3, 4 o 5 columnas, y botones para saltar entre ellas.
• Arrastra para ordenar. Importa y exporta tu deck.

CÓMO FUNCIONA
1. Diseña tus botones en el editor de Botonazo.
2. Haz clic en el ícono de Botonazo (o pulsa Alt+Shift+D) y escanea el código QR.
3. Tu deck se abre en el navegador del celular. ¡Dale al botonazo!

PRIVADO Y SEGURO
• Conexión directa y cifrada de extremo a extremo (WebRTC) entre tu celular y tu computadora.
• El celular solo envía qué botón pulsaste: las direcciones, textos y contraseñas de tus botones nunca salen de la computadora.
• Sin cuentas, sin anuncios, sin analítica. Botonazo no recopila datos personales.
• El acceso a los sitios es opcional: lo concedes una sola vez desde Botonazo y puedes quitarlo cuando quieras.
• Tus capturas y videos se guardan solo en tus dispositivos.
• Genera un código nuevo en cualquier momento para desconectar a todos.

Creado por Miguel Mogrovejo.
```

**Categoría:** Productividad › Herramientas

**Idioma:** Español

---

## 3. Recursos gráficos

| Recurso | Archivo | Tamaño |
|---|---|---|
| Ícono de la tienda | `store/icon-128.png` | 128×128 |
| Captura 1 | `store/screenshots/1-tu-deck-en-el-celular.png` | 1280×800 |
| Captura 2 | `store/screenshots/2-disena-tu-deck.png` | 1280×800 |
| Captura 3 | `store/screenshots/3-transmite-con-obs.png` | 1280×800 |
| Captura 4 | `store/screenshots/4-capturas-y-pantalla-en-vivo.png` | 1280×800 |
| Captura 5 | `store/screenshots/5-conecta-con-un-qr.png` | 1280×800 |
| Mosaico promocional pequeño | `store/promo-small-440x280.png` | 440×280 |
| Mosaico de marquesina (opcional) | `store/promo-marquee-1400x560.png` | 1400×560 |

---

## 4. Enlaces

| Campo | Valor |
|---|---|
| Sitio web oficial | `https://mjmc4498.github.io/botonazo/` |
| URL de asistencia | `https://github.com/mjmc4498/botonazo/issues` |
| Política de privacidad | `https://mjmc4498.github.io/botonazo/privacy.html` |

---

## 5. Pestaña «Prácticas de privacidad»

**Descripción del propósito único**
```
Botonazo convierte el celular del usuario en un deck de botones para Chrome. El usuario configura sus botones en la extensión y, al escanear un código QR, los usa desde el celular para ejecutar acciones en el navegador: capturar o grabar la pestaña, ver la pantalla en el celular, cambiar de pestaña o de ventana, controlar el video que suena, mostrar carteles en pantalla, enviar atajos y textos, controlar OBS Studio y llamar a webhooks.
```

**Justificación de permisos**

`offscreen`
```
Mantiene en segundo plano la conexión WebRTC con el celular del usuario (los service workers no pueden usar WebRTC), graba con MediaRecorder la pestaña que el usuario pide grabar, crea el archivo de video para descargarlo y copia al portapapeles el texto de los botones de tipo «Copiar». Motivos: WEB_RTC, USER_MEDIA, BLOBS y CLIPBOARD.
```

`tabCapture`
```
Solo cuando el usuario pulsa «Grabar pestaña» o «Ver pantalla en el celular»: captura el video y el sonido de la pestaña para guardarlo como archivo en su computadora o mostrarlo en vivo en su propio celular, por la conexión directa y cifrada. Chrome exige que el usuario haya invocado la extensión en esa pestaña.
```

`downloads`
```
Guarda en la carpeta Descargas › Botonazo las capturas de pantalla y los videos que el usuario pide con sus botones.
```

`scripting`
```
Inserta los scripts de Botonazo en la pestaña solo cuando el usuario pulsa un botón que los necesita: mostrar carteles, avisos, la pantalla de privacidad o confeti sobre la página, enviar atajos de teclado y texto, desplazar la página y controlar sus videos. No hay scripts registrados de forma permanente.
```

`storage`
```
Guarda el deck que diseña el usuario, sus ajustes (formato de capturas, calidad de video, conexión con OBS) y el identificador aleatorio de la sesión para que el celular pueda reconectarse. La contraseña de OBS se guarda solo en el almacenamiento local.
```

`activeTab`
```
Cuando el usuario hace clic en el ícono de Botonazo (o pulsa Alt+Shift+D) se abre el panel con el código QR. activeTab permite usar los botones en esa pestaña —capturarla, mostrar carteles, enviar atajos y texto, controlar su video y mostrar su título en el celular— sin tener acceso a todos los sitios.
```

Permiso de host opcional (`optional_host_permissions`: `<all_urls>`)
```
No se pide al instalar: el paquete no declara host_permissions. Botonazo lo solicita en tiempo de ejecución con chrome.permissions.request, solo cuando el usuario pulsa «Permitir en todos los sitios» en la bienvenida, en Ajustes › General o en el panel del QR, junto a una explicación de para qué sirve; puede quitarlo con «Quitar acceso». Hace falta porque los botones se pulsan en el celular, sin tocar la computadora, y actúan sobre la pestaña que el usuario está viendo, que puede ser cualquier sitio (paneles de transmisión, YouTube, documentos, archivos locales…), a menudo con iframes de otros dominios; activeTab solo cubre la pestaña donde se abrió el panel y Chrome lo retira al navegar. Con este acceso Botonazo captura la pestaña visible (captureVisibleTab), muestra carteles encima de la página, simula atajos y texto, controla el video o audio de la pestaña, muestra en el celular los títulos de las pestañas abiertas y llama a los webhooks que configuró el usuario, siempre a pedido del usuario. Sin el permiso, esas acciones responden en el celular «Permite el acceso a los sitios en el panel de Botonazo» y el resto (OBS, pestañas, ventanas, grabación) sigue funcionando. Botonazo no lee ni transmite el contenido de las páginas; solo envía al celular del usuario el título de la pestaña, la lista de pestañas cuando la pide, y las capturas o imágenes que él solicita.
```

**¿Usas código remoto?** → **No.** Todo el JavaScript va incluido en el paquete (PeerJS, el generador de QR y el cliente de OBS están en `lib/`). La conexión con el servidor de señalización de PeerJS, con OBS y con los webhooks del usuario solo intercambia datos, no código.

**Uso de datos** — marca:
- ☑ **Contenido del sitio web** — el título de la pestaña controlada, la lista de pestañas, y las capturas o imágenes de la pantalla que el usuario pide se envían a su propio celular (cifrados de punto a punto; nunca llegan al desarrollador).

Y las tres certificaciones:
- ☑ No vendo ni transfiero datos de usuarios a terceros fuera de los casos de uso aprobados.
- ☑ No uso ni transfiero datos de usuarios para fines no relacionados con el propósito único del elemento.
- ☑ No uso ni transfiero datos de usuarios para determinar la solvencia crediticia ni para otorgar préstamos.

---

## 6. Instrucciones para el revisor (campo «Notas para el revisor», opcional)

```
1. Al instalar se abre el editor con un deck de ejemplo (páginas Inicio, OBS y Atajos).
2. En el aviso «Acceso a los sitios» pulsa «Permitir en todos los sitios» y acepta el diálogo de Chrome. Es un permiso opcional: sin él, los botones que actúan sobre la página responden en el celular «Permite el acceso a los sitios en el panel de Botonazo».
3. Abre cualquier sitio web en una pestaña y haz clic en el ícono de Botonazo: se muestra un código QR.
4. Escanéalo con un celular, o pulsa «Copiar enlace» y ábrelo en otra ventana o dispositivo.
5. En la página que se abre pulsa, por ejemplo, «Captura», «Volvemos pronto», «Pestañas» o «Grabar pestaña» (otra vez para detener).
Los botones de la página OBS requieren OBS Studio con el servidor WebSocket activado (Ajustes › OBS Studio); el resto funciona sin nada más.
No se necesita cuenta ni credenciales.
```

---

## 7. Distribución

- **Visibilidad:** Pública
- **Regiones:** Todas
- **Precio:** Gratis
