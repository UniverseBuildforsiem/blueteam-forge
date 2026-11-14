import { Linkedin, Download, Image as ImageIcon, Copy, BadgeCheck } from "lucide-react";
import { toast } from "sonner";
import { API } from "../../lib/api";

export const certVerifyUrl = (c) => c.verify_url || `${window.location.origin}/verify/${c.id}`;

export function CertShare({ cert }) {
  const url = certVerifyUrl(cert);
  const d = new Date(cert.issued_at);
  const post = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
  const add = `https://www.linkedin.com/profile/add?${new URLSearchParams({ startTask: "CERTIFICATION_NAME", name: cert.course_title, organizationName: "SOCProfessionals Academy",
    issueYear: d.getFullYear(), issueMonth: d.getMonth() + 1, certUrl: url, certId: cert.id })}`;
  const copy = () => navigator.clipboard.writeText(url).then(() => toast.success("Verify link copied"));
  return (
    <div className="flex flex-wrap gap-2" data-testid="cert-share">
      <a href={post} target="_blank" rel="noreferrer" className="glow-btn" data-testid="cert-share-linkedin"><Linkedin className="h-4 w-4" />Share on LinkedIn</a>
      <a href={add} target="_blank" rel="noreferrer" className="ghost-btn" data-testid="cert-add-linkedin-profile"><BadgeCheck className="h-4 w-4" />Add to LinkedIn profile</a>
      <a href={`${API}/academy/certificates/${cert.id}/pdf`} className="ghost-btn" data-testid="cert-download-pdf"><Download className="h-4 w-4" />PDF</a>
      <a href={`${API}/academy/certificates/${cert.id}/png`} className="ghost-btn" data-testid="cert-download-png"><ImageIcon className="h-4 w-4" />Image</a>
      <button onClick={copy} className="ghost-btn" data-testid="cert-copy-verify-link"><Copy className="h-4 w-4" />Copy verify link</button>
    </div>);
}
