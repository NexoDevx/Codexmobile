/* Download de artefatos: Downloads público no Android 10+, download do navegador fora do APK. */
(function () {
  'use strict';
  const CHUNK_SIZE = 192 * 1024;

  function safeName(value) {
    let name = String(value || 'arquivo.bin').replace(/[\\/]/g, '_').replace(/[\u0000-\u001f<>:"|?*]/g, '_').trim();
    while (name.startsWith('.')) name = name.slice(1);
    if (!name) name = 'arquivo.bin';
    if (name.length > 180) {
      const dot = name.lastIndexOf('.');
      const ext = dot > 0 && name.length - dot <= 16 ? name.slice(dot) : '';
      name = name.slice(0, Math.max(1, 180 - ext.length)) + ext;
    }
    return name;
  }

  function base64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(bytes.length, i + 0x8000)));
    }
    return btoa(s);
  }

  function pluginFor(cap) {
    if (!cap) return null;
    if (cap.Plugins && cap.Plugins.Download) return cap.Plugins.Download;
    if (cap.PluginsNative && cap.PluginsNative.Download) return cap.PluginsNative.Download;
    // registerPlugin pertence normalmente ao módulo @capacitor/core, não ao global injetado.
    return typeof cap.registerPlugin === 'function' ? cap.registerPlugin('Download') : null;
  }

  function notify(message, error) {
    try {
      const d = window.document;
      if (!d || !d.body || !d.createElement) return;
      let box = d.getElementById('cm-download-notice');
      if (!box) {
        box = d.createElement('div'); box.id = 'cm-download-notice'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite');
        box.style.cssText = 'position:fixed;z-index:99999;left:12px;right:12px;bottom:calc(76px + env(safe-area-inset-bottom,0px));padding:12px 14px;border-radius:12px;background:#18212b;color:#fff;box-shadow:0 4px 20px #0005;font:14px/1.4 system-ui;';
        d.body.appendChild(box);
      }
      box.textContent = message; box.style.display = 'block'; box.style.border = error ? '1px solid #e76f6f' : '1px solid #4b9b77';
      clearTimeout(window.__cmDownloadNoticeTimer);
      window.__cmDownloadNoticeTimer = setTimeout(() => { if (box) box.style.display = 'none'; }, 6500);
    } catch (_) { /* Aviso visual nunca deve quebrar o salvamento. */ }
  }

  async function saveNative(plugin, name, blob) {
    for (const method of ['beginDownload', 'writeChunk', 'finishDownload', 'abortDownload']) {
      if (typeof plugin[method] !== 'function') throw new Error('DownloadPlugin incompleto: método ' + method + ' ausente. Gere um APK novo com o plugin de Downloads.');
    }
    const start = await plugin.beginDownload({ name, mimeType: blob.type || 'application/octet-stream' });
    if (!start || !start.id) throw new Error('O plugin nativo não criou uma sessão de download.');
    try {
      for (let offset = 0; offset < blob.size; offset += CHUNK_SIZE) {
        const part = new Uint8Array(await blob.slice(offset, Math.min(blob.size, offset + CHUNK_SIZE)).arrayBuffer());
        await plugin.writeChunk({ id: start.id, data: base64(part) });
      }
      return await plugin.finishDownload({ id: start.id });
    } catch (e) {
      try { await plugin.abortDownload({ id: start.id }); } catch (_) { }
      throw e;
    }
  }

  async function saveOutput(rawName, blob) {
    if (!(blob instanceof Blob)) blob = new Blob([blob]);
    const name = safeName(rawName);
    const cap = window.Capacitor;
    let native = !!(cap && ((cap.Plugins && cap.Plugins.Download) || (cap.PluginsNative && cap.PluginsNative.Download)));
    try { native = native || !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()); } catch (_) { /* Se o bridge não respondeu, ainda tentamos o plugin quando ele estiver exposto. */ }
    if (native) {
      const plugin = pluginFor(cap);
      if (!plugin) throw new Error('Este APK não expõe o DownloadPlugin. O seletor/Downloads só funcionarão depois de gerar e instalar o APK atualizado.');
      const result = await saveNative(plugin, name, blob);
      if (!result || result.saved !== true) throw new Error('O Android não confirmou que o arquivo foi salvo.');
      notify('✅ Salvo em ' + (result.path || ('Downloads/' + (result.name || name))));
      return result;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener'; a.style.display = 'none';
    document.body.appendChild(a);
    try { a.click(); } finally { a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
    notify('⬇️ Download iniciado: ' + name + '. Confira a pasta Downloads do navegador.');
    return { saved: false, browserDownload: true, name };
  }

  window.cmSaveOutput = saveOutput;
  window.cmSafeDownloadName = safeName;
})();
