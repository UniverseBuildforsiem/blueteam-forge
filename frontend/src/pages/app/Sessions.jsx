import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Users, Video, ExternalLink, BellRing } from "lucide-react";
import { toast } from "sonner";
import { Calendar } from "../../components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { api, errMsg, fmtDate } from "../../lib/api";
import { Glass, PageHeader, Empty } from "../../components/common";

function SessionCard({ s, onRsvp }) {
  return (
    <Glass className="p-5 flex flex-col sm:flex-row gap-4 sm:items-center" data-testid={`session-card-${s.id}`}>
      <div className="flex-1">
        <div className="text-xs font-mono text-cyan-400">{fmtDate(s.start)} · {s.duration_min} min</div>
        <div className="font-bold mt-1">{s.title}</div>
        <div className="text-sm text-slate-400 mt-1">{s.description}</div>
        <div className="text-xs font-mono text-slate-500 mt-2 flex items-center gap-3"><span>host: {s.instructor}</span><span className="flex items-center gap-1"><Users className="h-3 w-3" />{s.rsvp_count}/{s.capacity}</span></div>
      </div>
      <div className="flex flex-wrap gap-2">
        {s.is_past ? (s.recording_url ? <a href={s.recording_url} target="_blank" rel="noreferrer" className="ghost-btn" data-testid={`session-recording-${s.id}`}><Video className="h-4 w-4" />Recording</a> : <span className="text-xs font-mono text-slate-500">recording pending</span>) : <>
          {s.registered && <a href={s.join_link} target="_blank" rel="noreferrer" className="glow-btn" data-testid={`session-join-${s.id}`}><ExternalLink className="h-4 w-4" />Join</a>}
          <button onClick={() => onRsvp(s)} className="ghost-btn" data-testid={`session-rsvp-${s.id}`}>{s.registered ? "Cancel RSVP" : <><BellRing className="h-4 w-4" />RSVP</>}</button>
        </>}
      </div>
    </Glass>
  );
}

export default function Sessions() {
  const [ss, setSs] = useState([]);
  const [day, setDay] = useState();
  const load = () => api.get("/sessions").then((r) => setSs(r.data));
  useEffect(() => { load(); }, []);
  const rsvp = async (s) => {
    try { const { data } = await api.post(`/sessions/${s.id}/rsvp`); toast.success(data.registered ? "Registered — reminder email sent" : "RSVP cancelled"); load(); } catch (e) { toast.error(errMsg(e)); }
  };
  const days = useMemo(() => ss.map((s) => new Date(s.start)), [ss]);
  const filt = (arr) => (day ? arr.filter((s) => new Date(s.start).toDateString() === day.toDateString()) : arr);
  const up = filt(ss.filter((s) => !s.is_past));
  const past = filt(ss.filter((s) => s.is_past)).reverse();
  return (
    <div>
      <PageHeader eyebrow="// live sessions" title="Instructor-led sessions" sub="RSVP to get a reminder email and unlock the join link. Recordings appear after the event." />
      <div className="grid lg:grid-cols-[auto_1fr] gap-6">
        <Glass className="p-3 h-fit">
          <Calendar mode="single" selected={day} onSelect={setDay} modifiers={{ session: days }} modifiersClassNames={{ session: "!text-[#00FF66] font-bold underline" }} data-testid="sessions-calendar" />
          {day && <button className="ghost-btn w-full justify-center !text-xs mt-2" onClick={() => setDay(undefined)} data-testid="sessions-clear-day">Show all dates</button>}
        </Glass>
        <Tabs defaultValue="up">
          <TabsList className="bg-black/40"><TabsTrigger value="up" data-testid="sessions-tab-upcoming"><CalendarClock className="h-4 w-4 mr-1" />Upcoming ({up.length})</TabsTrigger><TabsTrigger value="past" data-testid="sessions-tab-past">Past ({past.length})</TabsTrigger></TabsList>
          <TabsContent value="up" className="space-y-3 mt-4">{up.length ? up.map((s) => <SessionCard key={s.id} s={s} onRsvp={rsvp} />) : <Empty text="no upcoming sessions" />}</TabsContent>
          <TabsContent value="past" className="space-y-3 mt-4">{past.length ? past.map((s) => <SessionCard key={s.id} s={s} onRsvp={rsvp} />) : <Empty text="no past sessions" />}</TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
