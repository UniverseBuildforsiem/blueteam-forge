import { Children, isValidElement } from "react";
import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Radar } from "lucide-react";
import { toast } from "sonner";

export const headingId = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const text = (c) => Children.toArray(c).map((x) => (typeof x === "string" ? x : isValidElement(x) ? text(x.props.children) : "")).join("");

function Code({ className, children }) {
  const lang = /language-(\w+)/.exec(className || "")?.[1];
  const src = String(children).replace(/\n$/, "");
  if (!lang && !src.includes("\n")) return <code className="font-mono text-[0.85em] bg-cyan-500/10 text-cyan-200 px-1.5 py-0.5 rounded-sm">{children}</code>;
  const copy = () => { navigator.clipboard.writeText(src); toast.success("Copied"); };
  const hunt = lang === "spl" || lang === "kql";
  return (
    <div className="my-5 border border-white/10 bg-black/60 rounded-sm overflow-hidden" data-testid="md-code-block">
      <div className="flex items-center gap-3 px-3 py-1.5 border-b border-white/10 text-[10px] font-mono uppercase text-slate-500">
        <span className={hunt ? "text-green-400" : ""}>{lang || "text"}</span>
        {hunt && <Link to={`/app/siem?lang=${lang}&q=${encodeURIComponent(src)}`} className="inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-200"><Radar className="h-3 w-3" />try in siem</Link>}
        <button onClick={copy} className="ml-auto inline-flex items-center gap-1 hover:text-cyan-300"><Copy className="h-3 w-3" />copy</button>
      </div>
      <pre className="p-4 overflow-x-auto text-xs leading-relaxed text-slate-200 font-mono"><code>{src}</code></pre>
    </div>);
}

const C = {
  h2: ({ children }) => <h2 id={headingId(text(children))} className="text-2xl font-bold mt-12 mb-4 scroll-mt-24 text-slate-100 border-l-2 border-cyan-400 pl-3">{children}</h2>,
  h3: ({ children }) => <h3 className="text-lg font-bold mt-8 mb-3 text-cyan-200">{children}</h3>,
  h4: ({ children }) => <h4 className="font-bold mt-6 mb-2 text-slate-200">{children}</h4>,
  p: ({ children }) => <p className="my-4 leading-relaxed text-slate-300">{children}</p>,
  ul: ({ children, className }) => <ul className={`my-4 space-y-2 ${className?.includes("contains-task-list") ? "" : "list-disc pl-6"} text-slate-300 marker:text-cyan-400`}>{children}</ul>,
  ol: ({ children }) => <ol className="my-4 space-y-2 list-decimal pl-6 text-slate-300 marker:text-green-400 marker:font-mono">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed [&>input]:mr-2 [&>input]:accent-green-500">{children}</li>,
  a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-cyan-300 underline underline-offset-2 hover:text-cyan-200">{children}</a>,
  blockquote: ({ children }) => <blockquote className="my-5 border-l-2 border-amber-400/60 bg-amber-500/5 px-4 py-1 text-slate-300">{children}</blockquote>,
  table: ({ children }) => <div className="my-6 overflow-x-auto border border-white/10"><table className="w-full text-sm">{children}</table></div>,
  th: ({ children }) => <th className="text-left font-mono text-[11px] uppercase text-cyan-300 bg-cyan-500/5 px-3 py-2 border-b border-white/10">{children}</th>,
  td: ({ children }) => <td className="px-3 py-2 border-b border-white/5 text-slate-300 align-top">{children}</td>,
  strong: ({ children }) => <strong className="text-slate-100 font-semibold">{children}</strong>,
  hr: () => <hr className="my-10 border-white/10" />,
  pre: ({ children }) => <>{children}</>,
  code: Code,
};

export default function Markdown({ children }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={C}>{children || ""}</ReactMarkdown>;
}
