import { createSession, runCapture } from "../index";
import { seed } from "../fs";
import { KALI_LABS } from "../labs";
import { webcrypto } from "crypto";

if (!global.crypto?.subtle) global.crypto = webcrypto;
const H = "/home/kali";
const mk = (lab, inputs = []) => {
  const nodes = seed({});
  Object.entries(lab.starter || {}).forEach(([p, c]) => { nodes[p] = { t: "f", c, m: 0o644, o: "kali" }; });
  const s = createSession({ lab: {}, nodes, readLine: async () => (inputs.length ? inputs.shift() : null) });
  const run = async (src) => { const sh2 = s.sh.clone(); sh2.readLine = async () => null; sh2.lim = { steps: 0, out: 0, abort: false }; let o = ""; await sh2.run(src, { stdin: null, out: (t) => { o += t; }, err: (t) => { o += t; } }); return { out: o }; };
  const check = async (i) => lab.tasks[i].check({ fs: s.fs, last: s.last, sh: s.sh, run });
  return { s, check };
};
const L = (id) => KALI_LABS.find((l) => l.id === id);

test.each([["auto-ping-sweep", "sweep.sh", [4]], ["auto-port-wrapper", "portscan.sh", [1, 2, 4]], ["auto-log-analyzer", "analyze.sh", [2, 3, 4, 5]]])("%s reference solution passes the auto-checker", async (id, f, idx) => {
  const lab = L(id), { s, check } = mk(lab);
  s.fs.write(`${H}/scripts/${f}`, lab.ladder[2]);
  await runCapture(s, `chmod +x scripts/${f}`);
  for (const i of idx) expect([i, await check(i)]).toEqual([i, true]);
});
test("ping sweep: save results", async () => {
  const lab = L("auto-ping-sweep"), { s, check } = mk(lab);
  s.fs.write(`${H}/scripts/sweep.sh`, lab.ladder[2]);
  await runCapture(s, "chmod +x scripts/sweep.sh; ./scripts/sweep.sh > live.txt");
  expect(await check(5)).toBe(true);
  expect(s.fs.read(`${H}/live.txt`).trim().split("\n")).toHaveLength(5);
});
test("log analyzer count-per-IP one-liner", async () => {
  const { s, check } = mk(L("auto-log-analyzer"));
  await runCapture(s, "grep Failed /var/log/auth.log | awk '{print $(NF-3)}' | sort | uniq -c");
  expect(await check(1)).toBe(true);
});
test("msfconsole attack + defend flow", async () => {
  const lab = L("msf-ftp-backdoor"), { s, check } = mk(lab, ["search ftp", "use 0", "set RHOSTS 10.0.0.21", "run", "sysinfo", "exit", "exit"]);
  await runCapture(s, "msfconsole");
  expect(await check(1)).toBe(true); expect(await check(2)).toBe(true);
  await runCapture(s, "grep SOCP-FTPd /var/log/syslog"); expect(await check(3)).toBe(true);
  await runCapture(s, "sudo sed -i 's/backdoor_listener=enabled/backdoor_listener=disabled/' /etc/socp-ftpd.conf"); expect(await check(4)).toBe(true);
  const s2 = mk(lab, ["use 0", "set RHOSTS 10.0.0.21", "run", "exit"]); s2.s.fs.n = s.fs.n;
  await runCapture(s2.s, "msfconsole"); expect(s2.s.sh.msf.verified).toBe(true);
});
test("training lab solutions (sample)", async () => {
  const cases = [["sh-filters", 2, "awk -F, '$3==\"soc\" {print $2}' data/users.csv"], ["sh-filters", 3, "cut -d, -f3 data/users.csv | tail -n +2 | sort | uniq -c"], ["sh-loops", 5, "for i in 1 2 3 4 5 6; do [ $((i%2)) -eq 0 ] && continue; echo $i; done"],
    ["lx-find", 2, "find /usr/bin -perm 755"], ["lx-find", 5, "find data -name '*.txt' | xargs grep alpha"], ["sh-filters", 6, "wc -l /etc/passwd"], ["lx-services", 3, "sudo systemctl start ssh; sudo systemctl start apache2; netstat -tulpn"], ["sh-ctrl", 3, "p=22; case $p in 22) echo ssh;; 80|443) echo web;; *) echo other;; esac"]];
  for (const [id, i, src] of cases) { const { s, check } = mk(L(id)); await runCapture(s, src); expect([id, i, await check(i)]).toEqual([id, i, true]); }
});
