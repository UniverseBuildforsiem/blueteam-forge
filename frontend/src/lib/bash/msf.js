const MOD = "exploit/unix/ftp/socp_training_backdoor";
const BANNER = "\n      =[ metasploit v6.3 (SIMULATED training console) ]\n+ -- --=[ 1 authored scenario: SOCP-FTPd training backdoor on 10.0.0.21 ]\n\nType 'help' for commands. No real exploit code runs here.\n";

export async function msfconsole(io, sh) {
  if (!sh.readLine) { io.out("msfconsole needs an interactive terminal\n"); return 1; }
  io.out(BANNER);
  const o = { RHOSTS: "", RPORT: "21", LHOST: "10.0.0.15", LPORT: "4444" };
  let mod = null, met = false;
  for (;;) {
    const prompt = met ? "meterpreter > " : mod ? `msf6 exploit(${mod.split("/").pop()}) > ` : "msf6 > ";
    const line = await sh.readLine(prompt, "msf");
    if (line == null) return 0;
    io.out(`${prompt}${line}\n`);
    const [c, ...a] = line.trim().split(/\s+/);
    if (!c) continue;
    if (met) {
      if (c === "sysinfo") io.out("Computer     : web01\nOS           : Ubuntu 20.04 (Linux 5.4.0)\nArchitecture : x64\nMeterpreter  : x64/linux (simulated)\n");
      else if (c === "getuid") io.out("Server username: root\n");
      else if (c === "pwd") io.out("/\n");
      else if (c === "ls") io.out("Listing: /\n=========\n40755/rwxr-xr-x  dir  etc\n40755/rwxr-xr-x  dir  home\n40755/rwxr-xr-x  dir  var\n100644/rw-r--r-- fil  flag.txt\n");
      else if (c === "cat" && a[0] === "flag.txt") io.out("SOCP{ftp_backdoor_detect_and_patch}\n");
      else if (c === "exit" || c === "background") { met = false; io.out("[*] Session 1 closed. Now DEFEND: detect it in /var/log/syslog, patch /etc/socp-ftpd.conf (backdoor_listener=disabled), then re-run the module to verify.\n"); sh.msf = { ...(sh.msf || {}), exploited: true }; sh.fs.write("/var/log/syslog", "Jun 12 09:20:13 web01 SOCP-FTPd[777]: USER backdoor:) from 10.0.0.15 - shell spawned on port 6200\n", true); }
      else io.out(`[-] Unknown command: ${c}. Try sysinfo, getuid, pwd, ls, cat flag.txt, exit\n`);
      continue;
    }
    if (c === "exit" || c === "quit") { io.out("[*] Exiting msfconsole\n"); return 0; }
    if (c === "help") io.out("search TERM · use MODULE|N · show options · set NAME VALUE · run|exploit · sessions · back · exit\n");
    else if (c === "search") io.out(/ftp|socp|backdoor/i.test(a.join(" ")) ? `\nMatching Modules\n================\n   #  Name                                      Rank       Description\n   0  ${MOD}  excellent  SOCP-FTPd 2.3.4 training backdoor (fictional)\n` : "[-] No results. Hint: search ftp\n");
    else if (c === "use") { if (a[0] === "0" || a[0] === MOD) { mod = MOD; io.out("[*] No payload configured, defaulting to cmd/unix/interact (simulated)\n"); } else io.out(`[-] No results from search\n[-] Failed to load module: ${a[0] || ""}\n`); }
    else if (c === "back") mod = null;
    else if (c === "show" && a[0] === "options") io.out(mod ? `\nModule options (${MOD}):\n\n   Name    Current Setting  Required\n   ----    ---------------  --------\n${Object.entries(o).map(([k, v]) => `   ${k.padEnd(8)}${(v || "").padEnd(17)}yes`).join("\n")}\n` : "[-] No module selected\n");
    else if (c === "set") { const k = (a[0] || "").toUpperCase(); if (!(k in o)) io.out(`[-] Unknown option: ${a[0] || ""}\n`); else { o[k] = a[1] || ""; io.out(`${k} => ${o[k]}\n`); } }
    else if (c === "run" || c === "exploit") {
      if (!mod) io.out("[-] No module selected. Use 'use 0' after a search.\n");
      else if (!o.RHOSTS) io.out("[-] Msf::OptionValidateError The following options failed to validate: RHOSTS\n");
      else if (o.RHOSTS !== "10.0.0.21") io.out(`[-] ${o.RHOSTS}: lab mode only allows the authored target 10.0.0.21\n`);
      else if (/backdoor_listener=disabled/.test(sh.fs.get("/etc/socp-ftpd.conf")?.c || "")) { io.out(`[*] ${o.RHOSTS}:21 - Banner: 220 (SOCP-FTPd 2.3.5 patched)\n[-] ${o.RHOSTS}:21 - Exploit completed, but no session was created. Target is patched.\n`); sh.msf = { ...(sh.msf || {}), verified: true }; }
      else { if (!sh.fs.get("/etc/socp-ftpd.conf")) sh.fs.write("/etc/socp-ftpd.conf", "version=2.3.4\nbackdoor_listener=enabled\n"); io.out(`[*] ${o.RHOSTS}:21 - Banner: 220 (SOCP-FTPd 2.3.4 training build)\n[*] ${o.RHOSTS}:21 - Triggering the training backdoor (scripted)\n[+] ${o.RHOSTS}:6200 - Backdoor service detected\n[*] Command shell session 1 opened (10.0.0.15:${o.LPORT} -> 10.0.0.21:6200) (simulated)\n`); met = true; sh.msf = { exploited: false, opened: true }; }
    }
    else if (c === "sessions") io.out(sh.msf?.opened ? "\nActive sessions\n===============\n  Id  Type          Connection\n  1   meterpreter   10.0.0.15:4444 -> 10.0.0.21:6200 (closed)\n" : "No active sessions.\n");
    else io.out(`[-] Unknown command: ${c}\n`);
  }
}
