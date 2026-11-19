import { useState } from "react";
import { toast } from "sonner";
import { Panel, Btn, In, Sel, Lbl, Table, useForm } from "../ui";
import { ScanRun } from "./ScanRun";
import { targetHosts } from "./lib";
import { profilesOf } from "./Scans";

const TZ = ["", "Asia/Kolkata", "UTC", "America/New_York", "Europe/London", "Asia/Singapore"];

export function Schedules2({ d, st, emit }) {
  const [f, on, reset] = useForm({ title: "", profile: d.profiles[0], target: "", frequency: "Daily", start: "2026-06-14T23:00", tz: "" });
  const [run, setRun] = useState(null);
  const add = (e) => {
    e.preventDefault();
    if (!f.title.trim() || !f.target.trim()) return toast.error("Title and target are required");
    if (!f.tz) return toast.error("Time zone is required");
    emit("scan.scheduled", { ...f, title: f.title.trim() }); toast.success("Schedule saved"); reset();
  };
  const now = (s) => { emit("schedule.run_now", { title: s.title }); setRun({ title: `${s.title} (run now)`, hosts: targetHosts(d, st, s.target) }); };
  return <div className="grid grid-cols-1 gap-3"><Panel title="Scheduled scans" tid="vmc-schedules"><div className="space-y-3">{run && <ScanRun d={d} hosts={run.hosts} title={run.title} onDone={() => { setRun(null); toast.success("Scheduled scan test processed"); }} />}
    <Table rowTid="vmc-sched-row" empty="No schedules" cols={["Title", "Occurs", "Next run", "Time zone", "Target", ""]} rows={(st.console.schedules || []).map((s, i) => [s.title, s.frequency, (s.start || "").replace("T", " "), s.tz || "-", s.target, <Btn disabled={!!run} onClick={() => now(s)} data-testid={`vmc-sched-runnow-${i}`}>Run now</Btn>])} /></div></Panel>
    <Panel title="New schedule"><form onSubmit={add} className="space-y-2"><Lbl t="Title"><In value={f.title} onChange={on("title")} data-testid="vmc-sched-title" /></Lbl>
      <Lbl t="Option profile"><Sel options={profilesOf(d, st)} value={f.profile} onChange={on("profile")} data-testid="vmc-sched-profile" /></Lbl>
      <Lbl t="Target IPs / ranges"><div className="flex gap-1"><In value={f.target} onChange={on("target")} data-testid="vmc-sched-target" /><Btn type="button" onClick={() => on("target")({ target: { value: d.m2.range } })} data-testid="vmc-sched-select-all">Select</Btn></div></Lbl>
      <Lbl t="Occurs"><Sel options={["Daily", "Weekly", "Monthly"]} value={f.frequency} onChange={on("frequency")} data-testid="vmc-sched-frequency" /></Lbl>
      <Lbl t="Start"><In type="datetime-local" value={f.start} onChange={on("start")} /></Lbl>
      <Lbl t="Time zone (required)"><Sel options={TZ} value={f.tz} onChange={on("tz")} data-testid="vmc-sched-tz" /></Lbl><Btn primary type="submit" data-testid="vmc-sched-save">Save schedule</Btn></form></Panel></div>;
}
