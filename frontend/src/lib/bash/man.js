export const MAN = {
  ls: "ls [-l] [-a] [-R] [FILE...]  list directory contents", cat: "cat [-n] [FILE...]  print files", grep: "grep [-E -i -v -c -n -r -o] PATTERN [FILE...]  print lines matching a regex",
  egrep: "egrep PATTERN [FILE...]  same as grep -E", awk: "awk [-F sep] 'pattern {action}' [FILE]  e.g. awk -F: '{print $1}' /etc/passwd; BEGIN/END, NR, NF, $NF, a[$1]++",
  sed: "sed [-n] [-i] 's/old/new/g' | 'Np' | '/re/d' [FILE]  stream editor", cut: "cut -d DELIM -f LIST [FILE]  select fields (LIST like 1,3 or 2-)", tr: "tr [-d] [-s] SET1 [SET2]  translate characters, e.g. tr a-z A-Z",
  sort: "sort [-r -n -u] [-k N] [-t SEP] [FILE]", uniq: "uniq [-c] [-d] [FILE]  collapse adjacent duplicate lines", wc: "wc [-l -w -c] [FILE]  count lines, words, bytes", head: "head [-n N] [FILE]", tail: "tail [-n N] [FILE]",
  paste: "paste [-d SEP] [-s] FILE...  merge lines", diff: "diff FILE1 FILE2  show line differences", cmp: "cmp FILE1 FILE2  first differing byte", tee: "tee [-a] FILE  copy stdin to file and stdout", xargs: "xargs [-n N] CMD  build commands from stdin",
  find: "find [DIR] [-name PAT] [-type f|d] [-perm MODE] [-size N[ckM]]", chmod: "chmod MODE FILE  e.g. chmod 755 x.sh or chmod +x x.sh", chown: "chown USER[:GROUP] FILE  (needs sudo)", mkdir: "mkdir [-p] DIR", rm: "rm [-r] [-f] FILE", cp: "cp [-r] SRC DEST", mv: "mv SRC DEST", touch: "touch FILE",
  echo: "echo [-n] [-e] TEXT", printf: "printf FORMAT [ARGS]  e.g. printf '%-10s %5d\\n' name 42", read: "read [-p PROMPT] VAR...  read a line into variables", test: "test EXPR | [ EXPR ]  -f -d -e -z -n, = !=, -eq -lt -gt ...",
  sudo: "sudo COMMAND  run as root", useradd: "useradd [-m] LOGIN  (needs sudo)", userdel: "userdel [-r] LOGIN", passwd: "passwd [USER]", groups: "groups [USER]", systemctl: "systemctl start|stop|restart|status ssh|apache2|postgresql", service: "service NAME start|stop|status",
  ps: "ps [aux]", kill: "kill PID", netstat: "netstat -tulpn  listening ports", ss: "ss -tulpn", ifconfig: "ifconfig", ip: "ip a", ping: "ping -c N HOST", nmap: "nmap [-sV] HOST", nc: "nc -zv HOST PORT  port check",
  nikto: "nikto -h HOST", gobuster: "gobuster dir -u URL -w WORDLIST", hydra: "hydra -l USER -P LIST ssh://HOST", sqlmap: "sqlmap -u 'http://HOST/page?id=1'", msfconsole: "msfconsole  simulated Metasploit (lab host 10.0.0.21 only)",
  vi: "vi FILE  i insert · Esc normal · :w save · :q quit · :wq · :q! · dd x yy p G gg /text", nano: "nano FILE  Ctrl+O save · Ctrl+X exit", bash: "bash SCRIPT [ARGS] | bash -c 'CMD'", man: "man CMD", which: "which CMD", whereis: "whereis CMD", tree: "tree [DIR]",
  whoami: "whoami", id: "id", uname: "uname [-a] [-r]", date: "date [+FORMAT]", cal: "cal", who: "who", w: "w", last: "last",
};
