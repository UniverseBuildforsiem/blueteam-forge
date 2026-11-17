import { PageHeader } from "../../components/common";
import { NotesList } from "../../components/academy/Notes";

export default function MyNotes() {
  return <div><PageHeader eyebrow="// interview prep" title="My Notes" sub="Every note you wrote under your lessons, in one place. Search them before an interview or download them as PDF or text." /><NotesList /></div>;
}
