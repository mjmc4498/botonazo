// Acceso a los sitios en las pruebas automáticas (prueba de punta a punta y capturas).
//
// Botonazo pide <all_urls> como permiso opcional y Chrome solo lo concede con un clic en
// su diálogo, que no se puede pulsar en modo headless. Para concederlo se recarga por CDP
// (Extensions.loadUnpacked) una copia de la extensión, primero con host_permissions
// —Chrome lo concede al instalar— y luego con el manifiesto real: Chrome conserva el
// permiso ya concedido, igual que cuando se actualiza una extensión.
import fs from 'node:fs';
import path from 'node:path';

// Copia la extensión a `dest`: así la prueba nunca modifica extension/manifest.json.
export function copyExtension(src, dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
  return dest;
}

// Concede el acceso a los sitios a la copia en `dir`. La extensión se recarga, así que
// sus páginas abiertas se cierran y el service worker se reinicia.
export async function grantSiteAccess(browser, dir) {
  const file = path.join(dir, 'manifest.json');
  const real = fs.readFileSync(file, 'utf8');
  try {
    fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(real), host_permissions: ['<all_urls>'] }));
    await browser.installExtension(dir);
  } finally {
    fs.writeFileSync(file, real);
  }
  await browser.installExtension(dir);
}
