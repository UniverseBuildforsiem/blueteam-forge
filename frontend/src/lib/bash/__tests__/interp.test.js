import { createSession, runCapture } from "../index";
import { webcrypto } from "crypto";

if (!global.crypto?.subtle) global.crypto = webcrypto;
const LAB = { kali: { fs: { "/home/analyst/README.txt": "Case: test\n", "/home/analyst/evidence/email.eml": "Return-Path: <x@y>\nSubject: hi\n", "/home/analyst/auth.log": "Jun 12 03:10:01 kali sshd[1]: Failed password for root from 1.1.1.1 port 22 ssh2\nJun 12 03:10:02 kali sshd[2]: Failed password for root from 2.2.2.2 port 22 ssh2\nJun 12 03:10:03 kali sshd[3]: Failed password for admin from 1.1.1.1 port 22 ssh2\n" },
  net: { whois: { "cdn-update.top": "Registrar: NameCheap" }, dns: { "cdn-update.top": "185.220.101.45" }, nmap: { "10.0.0.99": "22/tcp open ssh" }, curl: {} } } };
const mk = (o = {}) => createSession({ lab: LAB, ...o });
const run = async (s, src) => (await runCapture(s, src)).out;

test("1 arithmetic", async () => { expect(await run(mk(), "x=5; echo $((x*2))")).toBe("10\n"); });
test("2 for loop piped to wc", async () => { expect(await run(mk(), "for i in 1 2 3; do echo $i; done | wc -l")).toBe("3\n"); });
test("3 function local + return", async () => {
  const s = mk();
  expect(await run(s, "x=global\nf() {\n  local x=inner\n  echo $x $1\n  return 3\n}\nf arg; echo \"$? $x\"")).toBe("inner arg\n3 global\n");
});
test("4 file test", async () => { expect(await run(mk(), "if [ -f evidence/email.eml ]; then echo yes; fi")).toBe("yes\n"); });
test("5 grep | awk | sort | uniq -c", async () => {
  expect(await run(mk(), "grep Failed auth.log | awk '{print $11}' | sort | uniq -c")).toBe("      2 1.1.1.1\n      1 2.2.2.2\n");
});
test("6 script with $1, chmod +x", async () => {
  const s = mk();
  await run(s, "echo 'echo \"hi $1 ($#)\"' > s.sh");
  expect(await run(s, "./s.sh bob")).toMatch(/Permission denied/);
  expect(await run(s, "bash s.sh bob")).toBe("hi bob (1)\n");
  await run(s, "chmod +x s.sh");
  expect(await run(s, "./s.sh alice")).toBe("hi alice (1)\n");
  expect(await run(s, "./s.sh")).toBe("hi  (0)\n");
});
test("7 infinite loop is stopped", async () => {
  const s = mk();
  const r = await runCapture(s, "while true; do :; done");
  expect(r.out).toMatch(/script exceeded limit/);
  expect(r.code).toBe(130);
}, 20000);
test("8 heredoc script", async () => {
  const s = mk();
  await run(s, "cat > a.sh <<'EOF'\n#!/bin/bash\nfor ((i=0;i<3;i++)); do echo \"n=$i\"; done\nEOF");
  await run(s, "chmod +x a.sh");
  expect(await run(s, "./a.sh")).toBe("n=0\nn=1\nn=2\n");
});
test("9 redirect + append + read back", async () => {
  const s = mk();
  await run(s, "echo one > f.txt; echo two >> f.txt");
  expect(await run(s, "cat f.txt")).toBe("one\ntwo\n");
  expect(await run(s, "while read l; do echo \"[$l]\"; done < f.txt")).toBe("[one]\n[two]\n");
});
test("10 original commands keep their outputs", async () => {
  const s = mk();
  expect(await run(s, "cat README.txt")).toBe("Case: test\n");
  expect(await run(s, "whois cdn-update.top")).toBe("Registrar: NameCheap\n");
  expect(await run(s, "dig cdn-update.top")).toBe("; <<>> DiG 9.18 (simulated) <<>> cdn-update.top\n;; ANSWER SECTION:\ncdn-update.top.\t300\tIN\tA\t185.220.101.45\n");
  expect(await run(s, "nmap 10.0.0.99")).toBe("Starting Nmap 7.94 (simulated)\nNmap scan report for 10.0.0.99\n22/tcp open ssh\n\nNmap done: 1 IP address scanned\n");
  expect(await run(s, "echo aGVsbG8= | base64 -d")).toBe("hello\n");
  expect(await run(s, "file evidence/email.eml")).toBe("evidence/email.eml: SMTP mail, ASCII text\n");
  expect(await run(s, "grep -c Failed auth.log")).toBe("3\n");
  expect(await run(s, "head -n 1 auth.log | cut -d' ' -f5")).toBe("sshd[1]:\n");
});
test("extras: case, cfor, ${:-}, test errors, awk arrays, sed, tr, read -p", async () => {
  const s = mk({ readLine: async () => "neo" });
  expect(await run(s, "case foo.sh in *.txt) echo t;; *.sh|*.bash) echo s;; esac")).toBe("s\n");
  expect(await run(s, "echo ${NOPE:-dflt} $(echo sub) $((2**5))")).toBe("dflt sub 32\n");
  expect(await run(s, "[ -eq 5 ]")).toMatch(/unary operator expected/);
  expect(await run(s, "if then")).toMatch(/syntax error near unexpected token `then'/);
  expect(await run(s, "printf 'a b\\nc b\\n' | awk '{a[$2]++} END{for(k in a) print k, a[k]}'")).toBe("b 2\n");
  expect(await run(s, "echo hello | sed 's/l/L/g' | tr a-z A-Z")).toBe("HELLO\n");
  expect(await run(s, "read -p 'name: ' n; echo \"hi $n\"")).toBe("name: hi neo\n");
  expect(await run(s, "n=0; until [ $n -ge 3 ]; do n=$((n+1)); [ $n -eq 2 ] && continue; echo $n; done")).toBe("1\n3\n");
  expect(await run(s, "set_x() { echo \"$@\"; }; set_x a 'b c'; shift_t() { shift; echo $1; }; shift_t x y")).toBe("a b c\ny\n");
  expect(await run(s, "awk -F, 'NR>1 && $3==\"soc\" {printf \"%s:%d\\n\", $2, NF}' data/users.csv")).toBe("alice:4\ncarol:4\nerin:4\n");
  expect(await run(s, "diff data/a.txt data/b.txt")).toBe("3c3\n< charlie\n---\n> delta\n");
});
