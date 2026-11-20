import { Shell, Exit, LimitError, Interrupt } from "./interp";
import { Incomplete, BashSyntax, parse } from "./parse";
import { VFS, seed, HOME } from "./fs";
import { createCmds } from "./cmds";

export { HOME };
export function createSession({ lab, nodes, readLine, edit }) {
  const fs = new VFS(nodes || seed(lab?.kali?.fs));
  const sh = new Shell({ fs, cmds: createCmds(lab), readLine, hooks: { edit } });
  const last = { cmd: "", out: "", code: 0 };
  const needsMore = (src) => { if (/\\$/.test(src)) return true; try { parse(src); return false; } catch (e) { return e instanceof Incomplete; } };
  async function runLine(src, out, err) {
    sh.lim = { steps: 0, out: 0, abort: false };
    if (src.trim()) sh.history.push(src.replace(/\n/g, "; "));
    const buf = [];
    const guard = (t) => { sh.lim.out += t.length; if (sh.lim.out > 1_000_000) throw new LimitError("script exceeded limit: more than 1 MB of output, aborted"); buf.push(t); out(t); };
    let code = 0;
    try { code = await sh.run(src, { stdin: null, out: guard, err: (t) => { buf.push(t); err(t); } }); }
    catch (e) {
      if (e instanceof Exit) code = e.code;
      else if (e instanceof BashSyntax) { err(`bash: ${e.message}\n`); code = 2; }
      else if (e instanceof LimitError || e instanceof Interrupt) { err(`${e.message}\n`); code = 130; }
      else { err(`bash: ${e.message}\n`); code = 1; }
    }
    sh.status = code;
    Object.assign(last, { cmd: src, out: buf.join(""), code });
    return code;
  }
  const prompt = () => `kali@socpro-kali:${sh.cwd === HOME ? "~" : sh.cwd.startsWith(HOME + "/") ? "~" + sh.cwd.slice(HOME.length) : sh.cwd}$`;
  const complete = (line) => {
    const parts = line.split(/\s+/), w = parts[parts.length - 1];
    if (parts.length === 1) return [...Object.keys(sh.cmds), ...Object.keys(sh.funcs)].filter((c) => c.startsWith(w)).sort();
    const slash = w.lastIndexOf("/"), dirPart = slash >= 0 ? w.slice(0, slash + 1) : "", dir = sh.path(dirPart || ".");
    return fs.isDir(dir) ? fs.list(dir).filter((n) => n.startsWith(w.slice(slash + 1))).map((n) => dirPart + n + (fs.isDir(`${dir === "/" ? "" : dir}/${n}`) ? "/" : "")) : [];
  };
  return { sh, fs, runLine, needsMore, prompt, complete, last };
}

export async function runCapture(session, src) {
  let out = "";
  const code = await session.runLine(src, (t) => { out += t; }, (t) => { out += t; });
  return { out, code };
}
