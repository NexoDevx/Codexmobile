package com.codemobile.app;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

/** Persiste APK, EXE, ZIP e outros resultados em Downloads sem depender de blob-download na WebView. */
@CapacitorPlugin(name = "Download")
public class DownloadPlugin extends Plugin {
  private static final String RELATIVE_DIR = Environment.DIRECTORY_DOWNLOADS;
  private final ConcurrentMap<String, Session> sessions = new ConcurrentHashMap<>();

  private static final class Session {
    final String name;
    final String mime;
    final Uri uri;
    final File legacyFile;
    final OutputStream stream;
    long bytes;
    Session(String name, String mime, Uri uri, File legacyFile, OutputStream stream) {
      this.name = name; this.mime = mime; this.uri = uri; this.legacyFile = legacyFile; this.stream = stream;
    }
  }

  private String safeName(String value) {
    String name = value == null ? "arquivo.bin" : value.replace('\\', '/');
    int slash = name.lastIndexOf('/');
    if (slash >= 0) name = name.substring(slash + 1);
    name = name.replaceAll("[\\p{Cntrl}<>:\"|?*]", "_").trim();
    while (name.startsWith(".")) name = name.substring(1);
    if (name.isEmpty()) name = "arquivo.bin";
    if (name.length() > 180) {
      int dot = name.lastIndexOf('.');
      String ext = dot > 0 && name.length() - dot <= 16 ? name.substring(dot) : "";
      name = name.substring(0, Math.max(1, 180 - ext.length())) + ext;
    }
    return name;
  }

  private String uniqueDownloadName(ContentResolver resolver, String requested) {
    String base = requested, ext = "";
    int dot = requested.lastIndexOf('.');
    if (dot > 0 && requested.length() - dot <= 16) { base = requested.substring(0, dot); ext = requested.substring(dot); }
    String name = requested;
    for (int i = 2; i <= 999; i++) {
      boolean exists = false;
      try (Cursor c = resolver.query(MediaStore.Downloads.EXTERNAL_CONTENT_URI,
          new String[]{MediaStore.MediaColumns.DISPLAY_NAME},
          MediaStore.MediaColumns.RELATIVE_PATH + "=? AND " + MediaStore.MediaColumns.DISPLAY_NAME + "=?",
          new String[]{RELATIVE_DIR + "/", name}, null)) {
        exists = c != null && c.moveToFirst();
      } catch (Exception ignored) { return name; }
      if (!exists) return name;
      name = base + " (" + i + ")" + ext;
    }
    return base + "-" + System.currentTimeMillis() + ext;
  }

  @PluginMethod
  public void status(PluginCall call) {
    JSObject ret = new JSObject();
    ret.put("ok", true);
    ret.put("publicDownloads", Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q);
    ret.put("directory", Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ? "Downloads" : "Android/data/com.codemobile.app/files/Download");
    call.resolve(ret);
  }

  @PluginMethod
  public void beginDownload(PluginCall call) {
    try {
      String requested = safeName(call.getString("name", "arquivo.bin"));
      String mime = call.getString("mimeType", "application/octet-stream");
      if (mime == null || mime.trim().isEmpty()) mime = "application/octet-stream";
      String id = UUID.randomUUID().toString();
      ContentResolver resolver = getContext().getContentResolver();
      Uri uri = null;
      File legacy = null;
      OutputStream stream;
      String actual = requested;
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        actual = uniqueDownloadName(resolver, requested);
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, actual);
        values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
        values.put(MediaStore.MediaColumns.RELATIVE_PATH, RELATIVE_DIR);
        values.put(MediaStore.MediaColumns.IS_PENDING, 1);
        uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (uri == null) throw new IOException("O Android não criou o arquivo na pasta Downloads.");
        try { stream = resolver.openOutputStream(uri, "w"); }
        catch (Exception e) { try { resolver.delete(uri, null, null); } catch (Exception ignored) { } throw e; }
        if (stream == null) { try { resolver.delete(uri, null, null); } catch (Exception ignored) { } throw new IOException("Não foi possível abrir o arquivo de destino."); }
      } else {
        File externalDownloads = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (externalDownloads == null) throw new IOException("O armazenamento externo do app não está disponível.");
        File parent = externalDownloads;
        if (!parent.exists() && !parent.mkdirs()) throw new IOException("Não foi possível criar a pasta de downloads do app.");
        legacy = new File(parent, requested);
        if (legacy.exists()) {
          String base = requested, ext = ""; int dot = requested.lastIndexOf('.');
          if (dot > 0 && requested.length() - dot <= 16) { base = requested.substring(0, dot); ext = requested.substring(dot); }
          int i = 2; while (legacy.exists() && i < 1000) legacy = new File(parent, base + " (" + i++ + ")" + ext);
        }
        actual = legacy.getName();
        stream = new FileOutputStream(legacy, false);
      }
      sessions.put(id, new Session(actual, mime, uri, legacy, stream));
      JSObject ret = new JSObject(); ret.put("id", id); ret.put("name", actual); ret.put("mimeType", mime);
      call.resolve(ret);
    } catch (Exception e) { call.reject("Não foi possível iniciar o salvamento em Downloads: " + message(e), e); }
  }

  @PluginMethod
  public void writeChunk(PluginCall call) {
    String id = call.getString("id", "");
    Session s = sessions.get(id);
    if (s == null) { call.reject("Sessão de download não encontrada ou já encerrada."); return; }
    try {
      String encoded = call.getString("data", "");
      if (encoded == null) encoded = "";
      if (encoded.length() > 800000) throw new IOException("Bloco muito grande; envie blocos menores.");
      byte[] bytes = Base64.decode(encoded, Base64.DEFAULT);
      synchronized (s) { s.stream.write(bytes); s.bytes += bytes.length; }
      JSObject ret = new JSObject(); ret.put("written", bytes.length); ret.put("totalBytes", s.bytes); call.resolve(ret);
    } catch (Exception e) { call.reject("Falha gravando o arquivo: " + message(e), e); }
  }

  @PluginMethod
  public void finishDownload(PluginCall call) {
    String id = call.getString("id", "");
    Session s = sessions.remove(id);
    if (s == null) { call.reject("Sessão de download não encontrada ou já encerrada."); return; }
    try {
      synchronized (s) { s.stream.flush(); s.stream.close(); }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && s.uri != null) {
        ContentValues values = new ContentValues(); values.put(MediaStore.MediaColumns.IS_PENDING, 0);
        int updated = getContext().getContentResolver().update(s.uri, values, null, null);
        if (updated <= 0) throw new IOException("O Android não conseguiu finalizar o arquivo em Downloads.");
      }
      JSObject ret = new JSObject(); ret.put("saved", true); ret.put("name", s.name); ret.put("bytes", s.bytes);
      ret.put("path", Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ? "Downloads/" + s.name : s.legacyFile.getAbsolutePath());
      ret.put("uri", s.uri == null ? "" : s.uri.toString()); call.resolve(ret);
    } catch (Exception e) {
      try { s.stream.close(); } catch (Exception ignored) { }
      deleteSession(s);
      call.reject("O arquivo não foi concluído em Downloads: " + message(e), e);
    }
  }

  @PluginMethod
  public void abortDownload(PluginCall call) {
    String id = call.getString("id", ""); Session s = sessions.remove(id);
    if (s != null) { try { s.stream.close(); } catch (Exception ignored) { } deleteSession(s); }
    JSObject ret = new JSObject(); ret.put("aborted", true); call.resolve(ret);
  }

  private void deleteSession(Session s) {
    try { if (s.uri != null) getContext().getContentResolver().delete(s.uri, null, null); } catch (Exception ignored) { }
    try { if (s.legacyFile != null && s.legacyFile.exists()) s.legacyFile.delete(); } catch (Exception ignored) { }
  }

  private String message(Exception e) { return e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage(); }
}
