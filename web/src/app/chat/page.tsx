// Chat was merged into "Datos y Chat" — redirect legacy /chat links
import { redirect } from "next/navigation";

export default function ChatPage() {
  redirect("/datos");
}
