import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { BadgeCheck, XCircle, Download } from "lucide-react";
import { api, API } from "../lib/api";
import { Glass } from "../components/common";
import PublicNav from "../components/PublicNav";

export default function Verify() {
  const { id } = useParams();
  const [c, setC] = useState(undefined);
  useEffect(() => { api.get(`/public/verify/${id}`).then((r) => setC(r.data)).catch(() => setC(null)); }, [id]);
  const valid = c && c.status === "valid";
  return (
    <div className="min-h-screen grid-bg">
      <PublicNav />
      <div className="max-w-2xl mx-auto px-6 py-20">
        <div className="eyebrow mb-3">// certificate verification</div>
        {c === undefined ? <p className="font-mono cursor-blink">verifying </p> : (
          <Glass className="p-8" data-testid="verify-result">
            <div className="flex items-center gap-3">
              {valid ? <BadgeCheck className="h-8 w-8 text-green-400" /> : <XCircle className="h-8 w-8 text-red-400" />}
              <h1 className="text-2xl font-bold" data-testid="verify-status">{!c ? "Certificate not found" : valid ? "Valid certificate" : "Certificate revoked"}</h1>
            </div>
            {c && <div className="mt-6 space-y-2 font-mono text-sm">
              <div><span className="text-slate-500">Holder: </span><span data-testid="verify-holder">{c.name}</span></div>
              <div><span className="text-slate-500">Path: </span>{c.path_title}</div>
              <div><span className="text-slate-500">Score: </span>{c.score}%</div>
              <div><span className="text-slate-500">Issued: </span>{c.issued_at.slice(0, 10)}</div>
              <div><span className="text-slate-500">ID: </span>{c.id}</div>
              <a href={`${API}/public/certificates/${c.id}/pdf`} target="_blank" rel="noreferrer" className="ghost-btn mt-4" data-testid="verify-download-pdf"><Download className="h-4 w-4" /> View PDF</a>
            </div>}
          </Glass>
        )}
      </div>
    </div>
  );
}
