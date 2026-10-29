package com.codemobile.app;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.LinkProperties;
import android.net.Network;
import android.system.Os;
import android.system.OsConstants;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.*;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.zip.GZIPInputStream;

/** Linux embutido: Ubuntu Base ARM64/glibc via proroot, sem root real e sem servidor externo. */
@CapacitorPlugin(name = "Shell")
public class ShellPlugin extends Plugin {
  private static final Set<String> IGN = new HashSet<>(Arrays.asList("node_modules", ".git", ".cache", ".npm", "__pycache__", ".venv"));

  private File root() { return new File(getContext().getFilesDir(), "ubuntu-rootfs"); }
  private File legacyRoot() { return new File(getContext().getFilesDir(), "alpine"); }
  private File lib(String n) { return new File(getContext().getApplicationInfo().nativeLibraryDir, n); }
  private File runtimeTmp() { return new File(getContext().getFilesDir(), "proroot-tmp"); }
  private boolean ready() {
    File ok = new File(root(), ".ok"), marker = new File(root(), ".codemobile-engine");
    if (!ok.isFile() || !marker.isFile() || !hasBuildMarker()) return false;
    try { return prootBuildInfo().equals(new String(readAll(marker), StandardCharsets.UTF_8).trim()); }
    catch (Exception e) { return false; }
  }
  private boolean hasRootfs() { try { getContext().getAssets().open("rootfs.bin").close(); return true; } catch (IOException e) { return false; } }
  private boolean hasEngine() { return lib("libproroot.so").isFile() && lib("libproroot-runtime.so").isFile() &&
      lib("libproroot-bridge.so").isFile() && lib("libproroot-linker.so").isFile() && lib("libproroot-stub-loader.so").isFile(); }

  private boolean hasBuildMarker() {
    String info = prootBuildInfo();
    return info.contains("engine=proroot") && info.contains("binary_sha256_verified=true") && info.contains("rootfs=Ubuntu Base");
  }

  private String prootBuildInfo() {
    try (InputStream in = getContext().getAssets().open("linux-engine-info.txt")) {
      return new String(readAll(in), StandardCharsets.UTF_8).trim();
    } catch (Exception e) { return "engine=unknown (APK sem marcador proroot)"; }
  }

  /** Atualiza apenas o resolv.conf criado pelo CodeMobile; não sobrescreve DNS personalizado. */
  private void syncManagedDns(File r, boolean force) {
    try {
      File etc = new File(r, "etc"); if (!etc.exists()) etc.mkdirs();
      File f = new File(etc, "resolv.conf");
      String old = f.exists() ? new String(readAll(f), StandardCharsets.UTF_8) : "";
      boolean managed = force || !f.exists() || old.startsWith("# CodeMobile managed DNS") ||
          old.trim().equals("nameserver 8.8.8.8\nnameserver 1.1.1.1");
      if (!managed) return;
      List<InetAddress> dns = new ArrayList<>();
      try {
        ConnectivityManager cm = (ConnectivityManager)getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
        Network net = cm == null ? null : cm.getActiveNetwork();
        LinkProperties lp = cm == null || net == null ? null : cm.getLinkProperties(net);
        if (lp != null) dns.addAll(lp.getDnsServers());
      } catch (Exception ignored) { }
      // Prefer IPv4 DNS addresses because they do not require an interface scope suffix.
      Collections.sort(dns, (a, b) -> Boolean.compare(!(a instanceof Inet4Address), !(b instanceof Inet4Address)));
      StringBuilder out = new StringBuilder("# CodeMobile managed DNS\n");
      Set<String> seen = new LinkedHashSet<>();
      for (InetAddress a : dns) {
        if (a == null || a.isAnyLocalAddress() || a.isLoopbackAddress() || a.isLinkLocalAddress()) continue;
        String host = a.getHostAddress(); int zone = host.indexOf('%'); if (zone >= 0) host = host.substring(0, zone);
        if (host.matches("[0-9a-fA-F:.]+") && seen.add(host)) out.append("nameserver ").append(host).append('\n');
      }
      if (seen.isEmpty()) out.append("nameserver 1.1.1.1\nnameserver 8.8.8.8\n");
      if (isLink(f)) f.delete();
      write(f, out.toString());
    } catch (Exception ignored) { /* DNS atualizado não pode impedir um comando local. */ }
  }

  @PluginMethod
  public void status(PluginCall call) {
    JSObject o = new JSObject();
    boolean arm64 = Arrays.asList(android.os.Build.SUPPORTED_ABIS).contains("arm64-v8a");
    boolean launcher = lib("libproroot.so").isFile();
    boolean stub = lib("libproroot-stub-loader.so").isFile();
    o.put("plugin", true);
    o.put("engine", "proroot");
    o.put("available", arm64 && hasEngine() && hasRootfs() && hasBuildMarker());
    o.put("engineReady", arm64 && hasEngine() && hasBuildMarker());
    o.put("prootBuild", prootBuildInfo());
    o.put("patchedProot", false);
    o.put("ready", ready());
    o.put("architecture", android.os.Build.SUPPORTED_ABIS.length > 0 ? android.os.Build.SUPPORTED_ABIS[0] : "unknown");
    o.put("lib", launcher); o.put("loader", stub); o.put("runtime", lib("libproroot-runtime.so").isFile());
    o.put("bridge", lib("libproroot-bridge.so").isFile()); o.put("linker", lib("libproroot-linker.so").isFile());
    o.put("rootfs", hasRootfs());
    o.put("legacyAlpinePresent", legacyRoot().exists());
    call.resolve(o);
  }

  /** Remove a instalação Linux do armazenamento privado. Os projetos em files/ws ficam intactos. */
  @PluginMethod
  public void remove(final PluginCall call) {
    new Thread(() -> {
      try {
        deleteRec(root());
        deleteRec(legacyRoot());
        deleteRec(runtimeTmp());
        JSObject o = new JSObject(); o.put("ready", false); o.put("removed", true);
        o.put("engineBundled", hasEngine());
        call.resolve(o);
      } catch (Exception e) { call.reject("Não foi possível excluir a instalação Linux: " + e); }
    }).start();
  }

  /** Reset remove a instalação Ubuntu/legacy Alpine; projetos do app são preservados. */
  @PluginMethod
  public void reset(final PluginCall call) {
    new Thread(() -> {
      try {
        deleteRec(root());
        deleteRec(legacyRoot());
        deleteRec(runtimeTmp());
        JSObject o = new JSObject(); o.put("ready", false); o.put("reset", true);
        call.resolve(o);
      } catch (Exception e) { call.reject("Não foi possível resetar o Linux: " + e); }
    }).start();
  }

  /** Android API 22-25 não expõe Process.destroyForcibly(); usa reflexão para preservar compatibilidade. */
  private static void stopProcess(Process p) {
    try { Process.class.getMethod("destroyForcibly").invoke(p); }
    catch (Exception unavailable) { try { p.destroy(); } catch (Exception ignored) { } }
  }

  /** Teste real do runtime e de operações necessárias para apt/dpkg antes de marcar o Linux pronto. */
  private String selfTest(File r) throws Exception {
    File tmp = runtimeTmp(); tmp.mkdirs();
    String cmd = "echo ok; test -x /bin/sh || exit 31; test -e /lib/ld-linux-aarch64.so.1 || test -e /lib/aarch64-linux-gnu/ld-linux-aarch64.so.1 || exit 32; " +
      "mkdir -p /tmp/cm-proroot-check; printf x >/tmp/cm-proroot-check/a && mv /tmp/cm-proroot-check/a /tmp/cm-proroot-check/b && test -s /tmp/cm-proroot-check/b && echo CM_RENAME_OK || echo CM_RENAME_FAIL; " +
      "rm -rf /tmp/cm-proroot-check; echo CM_GLIBC_OK; uname -m";
    ProcessBuilder pb = new ProcessBuilder(lib("libproroot.so").getPath(), "-r", r.getPath(), "-0", "--link2symlink", "-b", "/dev", "-b", "/proc", "-b", "/sys", "-w", "/", "/bin/sh", "-c", cmd);
    pb.redirectErrorStream(true);
    Map<String, String> env = pb.environment(); env.clear();
    env.put("PROROOT_TMP_DIR", tmp.getPath()); env.put("PROROOT_STUB_LOADER", lib("libproroot-stub-loader.so").getPath());
    env.put("HOME", "/root"); env.put("PATH", "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin");
    env.put("TMPDIR", "/tmp"); env.put("TERM", "dumb"); env.put("LANG", "C.UTF-8");
    final Process p = pb.start(); final StringBuilder sb = new StringBuilder();
    Thread rd = new Thread(() -> { try (InputStream in = p.getInputStream()) { byte[] b = new byte[4096]; int n; while ((n = in.read(b)) > 0) synchronized (sb) { sb.append(new String(b, 0, n, StandardCharsets.UTF_8)); } } catch (IOException ignored) { } });
    rd.start(); long deadline = System.currentTimeMillis() + 20000L; int exit = -1; boolean timedOut = false;
    while (exit < 0) { try { exit = p.exitValue(); } catch (IllegalThreadStateException running) {
      if (System.currentTimeMillis() >= deadline) { timedOut = true; stopProcess(p); try { exit = p.waitFor(); } catch (InterruptedException e) { Thread.currentThread().interrupt(); exit = 130; } break; }
      try { Thread.sleep(50L); } catch (InterruptedException e) { Thread.currentThread().interrupt(); stopProcess(p); exit = 130; break; }
    }}
    rd.join(1500); synchronized (sb) { return sb.toString() + "\nCM_LINUX_EXIT:" + exit + "\n" + (timedOut ? "CM_LINUX_TIMEOUT\n" : ""); }
  }

  @PluginMethod
  public void install(final PluginCall call) {
    new Thread(() -> {
      try {
        if (!hasEngine() || !hasBuildMarker()) { call.reject("Runtime proroot/Ubuntu incompleto no APK (launcher/runtime/bridge/linker/stub-loader ou marcador de build). Recompile o APK pelo workflow oficial."); return; }
        if (!Arrays.asList(android.os.Build.SUPPORTED_ABIS).contains("arm64-v8a")) { call.reject("Este Linux embutido requer Android ARM64 (arm64-v8a)."); return; }
        File r = root();
        if (!ready()) {
          deleteRec(r); r.mkdirs();
          try (InputStream in = getContext().getAssets().open("rootfs.bin")) { untar(in, r); }
          new File(r, "tmp").mkdirs(); new File(r, "work").mkdirs(); new File(r, "root").mkdirs(); new File(r, "etc").mkdirs();
          try { Os.chmod(new File(r, "tmp").getPath(), 01777); } catch (Exception ignored) { }
          runtimeTmp().mkdirs(); syncManagedDns(r, true);
          String t = selfTest(r);
          if (!java.util.regex.Pattern.compile("(?m)^ok$").matcher(t).find() || !t.contains("CM_RENAME_OK") || !t.contains("CM_GLIBC_OK") || !t.contains("CM_LINUX_EXIT:0") || t.contains("CM_LINUX_TIMEOUT")) {
            deleteRec(r);
            call.reject("Ubuntu Base foi extraído, mas o runtime proroot falhou no teste real (shell/glibc/rename/exit).\n" + (t.length() > 1400 ? t.substring(0, 1400) : t) + "\nConfira o marcador em assets/linux-engine-info.txt e o diagnóstico no Terminal."); return;
          }
          write(new File(r, ".codemobile-engine"), prootBuildInfo());
          if (!new File(r, ".ok").createNewFile()) throw new IOException("Não foi possível gravar o marcador de instalação");
        }
        JSObject o = new JSObject(); o.put("ready", true); call.resolve(o);
      } catch (Exception e) { call.reject("Falha ao instalar o Linux embutido: " + e); }
    }).start();
  }

  @PluginMethod
  public void exec(final PluginCall call) {
    new Thread(() -> {
      try {
        if (!ready()) { call.reject("Linux embutido não instalado ou pertence a outra versão do runtime. Use Instalar Linux para validar/reinstalar o ambiente."); return; }
        syncManagedDns(root(), false);
        String cmd = call.getString("cmd", "");
        if (cmd == null || cmd.trim().isEmpty()) { call.reject("cmd vazio"); return; }
        String raw = call.getString("project", "projeto");
        String project = raw.replaceAll("[^\\w.-]+", "_").replaceAll("^\\.+", "_");
        if (project.length() > 48) project = project.substring(0, 48);
        if (project.isEmpty()) project = "projeto";
        if (!project.equals(raw)) project += "-" + sha8(raw);   // nomes diferentes nunca colidem
        int to = Math.max(1, Math.min(call.getInt("timeout", 60), 600));
        File base = new File(getContext().getFilesDir(), "ws/" + project); base.mkdirs();

        // 1) projeto (memória do app) -> pasta no disco
        JSObject files = call.getObject("files", new JSObject());
        Set<String> keep = new HashSet<>();
        String baseCanon = base.getCanonicalPath() + File.separator;
        Map<String, String> disk = new TreeMap<>(); walk(base, "", disk);
        Iterator<String> it = files.keys();
        while (it.hasNext()) {
          String k = it.next();
          if (k.startsWith("/") || k.contains("../")) continue;
          String v = files.optString(k, "");
          keep.add(k);
          if (!v.equals(disk.get(k))) {
            File f = new File(base, k); f.getParentFile().mkdirs();
            if (!f.getCanonicalPath().startsWith(baseCanon) || isLink(f)) continue;   // nunca escreve fora do projeto
            write(f, v);
          }
        }
        // só apaga o que o app gerenciava e removeu; arquivos desconhecidos/externos ficam
        File mf = new File(getContext().getFilesDir(), "manifest/" + project + ".txt"); mf.getParentFile().mkdirs();
        Set<String> man = new HashSet<>();
        if (mf.exists()) for (String ln : new String(readAll(mf), StandardCharsets.UTF_8).split("\n")) if (!ln.isEmpty()) man.add(ln);
        for (String k : man) if (!keep.contains(k)) { File f = new File(base, k); if (f.getCanonicalPath().startsWith(baseCanon) && !isLink(f)) f.delete(); }
        Map<String, String> before = new TreeMap<>(); walk(base, "", before);

        // 2) roda no Ubuntu ARM64/glibc via proroot
        File tmp = runtimeTmp(); tmp.mkdirs();
        List<String> a = new ArrayList<>(Arrays.asList(lib("libproroot.so").getPath(), "-r", root().getPath(), "-0", "--link2symlink",
            "-b", "/dev", "-b", "/proc", "-b", "/sys", "-b", base.getPath() + ":/work", "-w", "/work", "/bin/sh", "-c", "cd /work && (" + cmd + ")"));
        ProcessBuilder pb = new ProcessBuilder(a); pb.redirectErrorStream(true);
        Map<String, String> env = pb.environment(); env.clear();
        env.put("PROROOT_TMP_DIR", tmp.getPath()); env.put("PROROOT_STUB_LOADER", lib("libproroot-stub-loader.so").getPath());
        env.put("HOME", "/root"); env.put("PATH", "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"); env.put("TERM", "dumb"); env.put("LANG", "C.UTF-8");
        env.put("CI", "1"); env.put("PAGER", "cat"); env.put("GIT_PAGER", "cat"); env.put("GIT_TERMINAL_PROMPT", "0"); env.put("GIT_EDITOR", "true");
        env.put("TMPDIR", "/tmp"); env.put("PYTHONUNBUFFERED", "1");
        final Process p = pb.start();
        final StringBuilder sb = new StringBuilder();
        Thread rd = new Thread(() -> {
          try (InputStream in = p.getInputStream()) {
            byte[] buf = new byte[8192]; int n;
            while ((n = in.read(buf)) > 0) { synchronized (sb) { sb.append(new String(buf, 0, n, StandardCharsets.UTF_8)); if (sb.length() > 60000) sb.delete(0, sb.length() - 30000); } }
          } catch (IOException e) { }
        });
        rd.start();
        long end = System.currentTimeMillis() + to * 1000L; boolean timedOut = false; int code = -1;
        while (true) {
          try { code = p.exitValue(); break; }
          catch (IllegalThreadStateException e) {
            if (System.currentTimeMillis() > end) { timedOut = true; stopProcess(p); try { p.waitFor(); code = 124; } catch (InterruptedException ie2) { Thread.currentThread().interrupt(); code = 130; } break; }
            try { Thread.sleep(80); } catch (InterruptedException ie) { }
          }
        }
        rd.join(1500);

        // 3) o que mudou no disco volta para o projeto
        Map<String, String> after = new TreeMap<>(); walk(base, "", after);
        JSObject ch = new JSObject(); JSArray del = new JSArray();
        for (Map.Entry<String, String> e : after.entrySet()) if (!e.getValue().equals(before.get(e.getKey()))) ch.put(e.getKey(), e.getValue());
        for (String k : before.keySet()) if (!after.containsKey(k)) del.put(k);
        Set<String> known = new HashSet<>(keep);
        Iterator<String> ck = ch.keys(); while (ck.hasNext()) known.add(ck.next());
        for (String k : before.keySet()) if (!after.containsKey(k)) known.remove(k);
        StringBuilder mb = new StringBuilder(); for (String k : known) mb.append(k).append('\n');
        write(mf, mb.toString());
        String out; synchronized (sb) { out = sb.toString(); }
        if (out.length() > 12000) out = out.substring(out.length() - 12000);
        JSObject r = new JSObject();
        r.put("code", code); r.put("out", out); r.put("timedOut", timedOut); r.put("changed", ch); r.put("deleted", del);
        call.resolve(r);
      } catch (Exception e) { call.reject("Erro no terminal: " + e); }
    }).start();
  }

  // ---------- utilidades ----------
  private static String sha8(String s) throws Exception {
    byte[] d = java.security.MessageDigest.getInstance("SHA-1").digest(s.getBytes(StandardCharsets.UTF_8));
    StringBuilder b = new StringBuilder(); for (int i = 0; i < 4; i++) b.append(String.format("%02x", d[i])); return b.toString();
  }

  private static boolean isLink(File f) { try { return OsConstants.S_ISLNK(Os.lstat(f.getPath()).st_mode); } catch (Exception e) { return false; } }

  private void deleteRec(File f) {
    try { if (OsConstants.S_ISDIR(Os.lstat(f.getPath()).st_mode)) { File[] c = f.listFiles(); if (c != null) for (File x : c) deleteRec(x); } } catch (Exception e) { }
    f.delete();
  }

  private void walk(File base, String rel, Map<String, String> out) {
    File[] fs = new File(base, rel).listFiles();
    if (fs == null) return;
    Arrays.sort(fs);
    for (File f : fs) {
      String n = f.getName();
      if (IGN.contains(n) || isLink(f)) continue;
      String r = rel.isEmpty() ? n : rel + "/" + n;
      if (f.isDirectory()) walk(base, r, out);
      else if (f.isFile() && out.size() < 600 && f.length() <= 200000) {
        try {
          byte[] b = readAll(f); boolean bin = false;
          for (byte x : b) if (x == 0) { bin = true; break; }
          if (!bin) out.put(r, new String(b, StandardCharsets.UTF_8));
        } catch (IOException e) { }
      }
    }
  }

  private static byte[] readAll(InputStream in) throws IOException {
    try (ByteArrayOutputStream o = new ByteArrayOutputStream()) {
      byte[] buf = new byte[8192]; int n;
      while ((n = in.read(buf)) > 0) o.write(buf, 0, n);
      return o.toByteArray();
    }
  }

  private static byte[] readAll(File f) throws IOException {
    try (FileInputStream in = new FileInputStream(f)) {
      ByteArrayOutputStream o = new ByteArrayOutputStream(); byte[] buf = new byte[8192]; int n;
      while ((n = in.read(buf)) > 0) o.write(buf, 0, n);
      return o.toByteArray();
    }
  }

  private static void write(File f, String s) throws IOException { try (FileOutputStream o = new FileOutputStream(f)) { o.write(s.getBytes(StandardCharsets.UTF_8)); } }

  private static void copy(File a, File b) throws IOException {
    try (FileInputStream in = new FileInputStream(a); FileOutputStream o = new FileOutputStream(b)) { byte[] buf = new byte[8192]; int n; while ((n = in.read(buf)) > 0) o.write(buf, 0, n); }
  }

  private static String cstr(byte[] b, int off, int len) { int e = off; while (e < off + len && b[e] != 0) e++; return new String(b, off, e - off, StandardCharsets.UTF_8); }
  private static long oct(byte[] b, int off, int len) { String s = cstr(b, off, len).trim(); return s.isEmpty() ? 0 : Long.parseLong(s, 8); }

  private static void skipN(DataInputStream in, long n) throws IOException {
    while (n > 0) { int k = in.skipBytes((int) Math.min(n, Integer.MAX_VALUE)); if (k <= 0) { if (in.read() < 0) break; k = 1; } n -= k; }
  }

  /** tar.gz -> pasta (arquivos, pastas, symlinks e hardlinks; sem depender de nada externo) */
  private void untar(InputStream raw, File dest) throws Exception {
    DataInputStream in = new DataInputStream(new BufferedInputStream(new GZIPInputStream(raw), 1 << 16));
    byte[] h = new byte[512]; String longName = null;
    while (true) {
      try { in.readFully(h); } catch (EOFException e) { break; }
      if (h[0] == 0) break;
      String name = cstr(h, 0, 100); long size = oct(h, 124, 12); int mode = (int) oct(h, 100, 8); char t = (char) h[156]; String link = cstr(h, 157, 100);
      if ("ustar".equals(cstr(h, 257, 5))) { String pre = cstr(h, 345, 155); if (!pre.isEmpty()) name = pre + "/" + name; }
      long pad = (512 - size % 512) % 512;
      if (t == 'L') { byte[] b = new byte[(int) size]; in.readFully(b); skipN(in, pad); longName = cstr(b, 0, b.length); continue; }
      if (t == 'x' || t == 'g' || t == 'K') { skipN(in, size + pad); continue; }
      if (longName != null) { name = longName; longName = null; }
      while (name.startsWith("./")) name = name.substring(2);
      while (name.startsWith("/")) name = name.substring(1);
      if (name.isEmpty() || name.equals(".") || name.equals("..") || name.contains("../")) { skipN(in, size + pad); continue; }
      File f = new File(dest, name);
      f.getParentFile().mkdirs();
      if (t == '5') { f.mkdirs(); f.setReadable(true, false); f.setWritable(true, true); f.setExecutable(true, false); }
      else if (t == '2') { f.delete(); Os.symlink(link, f.getPath()); }
      else if (t == '1') { copy(new File(dest, link.replaceFirst("^\\./", "")), f); f.setExecutable((mode & 0111) != 0, false); }
      else if (t == '0' || t == '\0' || t == '7') {
        try (FileOutputStream o = new FileOutputStream(f)) {
          byte[] buf = new byte[1 << 16]; long left = size;
          while (left > 0) { int n = in.read(buf, 0, (int) Math.min(buf.length, left)); if (n < 0) throw new EOFException(); o.write(buf, 0, n); left -= n; }
        }
        f.setReadable(true, false); f.setWritable(true, true); f.setExecutable((mode & 0111) != 0, false);
        skipN(in, pad);
        continue;
      }
      skipN(in, size + pad);
    }
  }
}
