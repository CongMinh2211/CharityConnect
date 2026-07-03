import { Bot, ExternalLink, Globe2, LoaderCircle, MessageCircle, Send, Trash2, X } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { askAssistant } from "../lib/api";
import type { AssistantSource } from "../types";

interface ChatMessage {
  role: "assistant" | "user";
  content: string;
  sources?: AssistantSource[];
  actions?: Array<{ label: string; path: string }>;
  mode?: "DEMO" | "OPENAI";
  scope?: "INTERNAL" | "EXTERNAL_WEB";
}

const welcome: ChatMessage = { role: "assistant", content: "Chào bạn! Mình ưu tiên dữ liệu CharityConnect. Nếu câu hỏi nằm ngoài website, mình có thể tìm nguồn công khai khi OpenAI API được cấu hình." };
const initialSuggestions = ["Cách đăng nhập?", "Cách xác minh biên nhận?", "Thống kê toàn dân ở đâu?"];

export function AssistantWidget(): JSX.Element {
  const { user } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleToggle = () => setOpen(true);
    document.addEventListener("toggle-chatbot", handleToggle);
    return () => document.removeEventListener("toggle-chatbot", handleToggle);
  }, []);

  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([welcome]);
  const [suggestions, setSuggestions] = useState(initialSuggestions);
  const [loading, setLoading] = useState(false);
  const [activeMode, setActiveMode] = useState<"DEMO" | "OPENAI">("DEMO");
  const inputRef = useRef<HTMLInputElement>(null);

  async function send(message: string): Promise<void> {
    const clean = message.trim();
    if (!clean || loading) return;
    const history = messages.filter((_, index) => index > 0).slice(-6).map(({ role, content }) => ({ role, content }));
    setMessages((items) => [...items, { role: "user", content: clean }]);
    setInput(""); setLoading(true);
    try {
      const result = await askAssistant({ message: clean, history, page: { path: location.pathname, role: user?.role ?? null } });
      setActiveMode(result.mode);
      setMessages((items) => [...items, { role: "assistant", content: result.answer, sources: result.sources, actions: result.actions, mode: result.mode, scope: result.scope }]);
      setSuggestions(result.suggestions);
    } catch {
      setMessages((items) => [...items, { role: "assistant", content: "Trợ lý đang tạm nghỉ. Các chức năng CharityConnect vẫn hoạt động bình thường." }]);
    } finally {
      setLoading(false); window.setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function submit(event: FormEvent): void { event.preventDefault(); void send(input); }
  function clearConversation(): void { setMessages([welcome]); setSuggestions(initialSuggestions); setActiveMode("DEMO"); }

  return <div className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-3 z-50 sm:bottom-7 sm:right-7">
    {open && <section aria-label="Trợ lý CharityConnect" className="mb-3 flex h-[min(620px,76vh)] w-[min(390px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[1.4rem] border border-ink/10 bg-white shadow-2xl">
      <div className="flex items-center justify-between bg-ink px-4 py-3 text-white"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-500 text-ink"><Bot size={20} /></span><div><p className="text-sm font-extrabold">Trợ lý CharityConnect</p><p className="text-[11px] text-white/65">{activeMode === "OPENAI" ? "Đã bật AI nâng cao" : "Trợ lý nội bộ CharityConnect"}</p></div></div><div className="flex"><button type="button" aria-label="Xóa hội thoại" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-white/10" onClick={clearConversation}><Trash2 size={17} /></button><button type="button" aria-label="Đóng trợ lý" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-white/10" onClick={() => setOpen(false)}><X size={19} /></button></div></div>
      <div aria-live="polite" className="flex-1 space-y-3 overflow-y-auto bg-sage-100/45 p-4">{messages.map((message, index) => <div key={`${message.role}-${index}`} className={message.role === "user" ? "ml-auto max-w-[88%]" : "max-w-[92%]"}><p className={`rounded-2xl px-3.5 py-2.5 text-sm leading-6 ${message.role === "user" ? "rounded-br-md bg-ink text-white" : "rounded-bl-md border border-ink/10 bg-white text-slate-700"}`}>{message.content}</p>{message.role === "assistant" && message.scope === "EXTERNAL_WEB" && <p className="mt-1.5 inline-flex items-center gap-1 px-1 text-[10px] font-extrabold uppercase tracking-wide text-trust-700"><Globe2 size={12} /> Nguồn ngoài</p>}{message.sources?.length ? <div className="mt-2 space-y-1">{message.sources.map((source) => source.url ? <a key={source.url} className="flex items-start gap-1.5 text-[11px] font-semibold text-trust-700 hover:underline" href={source.url} target="_blank" rel="noreferrer"><ExternalLink className="mt-0.5 shrink-0" size={11} />{source.title}</a> : <p key={`${source.kind}-${source.title}`} className="px-1 text-[10px] font-semibold text-slate-500">Nguồn nội bộ: {source.title}</p>)}</div> : null}{message.actions?.length ? <div className="mt-2 flex flex-wrap gap-2">{message.actions.map((action) => <Link key={action.path} className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-3 py-1.5 text-[11px] font-extrabold text-ink" to={action.path} onClick={() => setOpen(false)}>{action.label}<ExternalLink size={12} /></Link>)}</div> : null}</div>)}{loading && <p className="inline-flex items-center gap-2 rounded-2xl bg-white px-3.5 py-2.5 text-sm text-slate-500"><LoaderCircle className="animate-spin" size={16} /> Đang đối chiếu nguồn phù hợp…</p>}</div>
      <div className="border-t border-ink/10 bg-white p-3"><div className="mb-2 flex gap-2 overflow-x-auto pb-1">{suggestions.slice(0, 3).map((item) => <button key={item} type="button" className="shrink-0 rounded-full border border-ink/15 px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-sage-100" onClick={() => void send(item)}>{item}</button>)}</div><form className="flex gap-2" onSubmit={submit}><label className="sr-only" htmlFor="assistant-message">Nhập câu hỏi</label><input ref={inputRef} id="assistant-message" className="input !min-h-11 !py-2 text-sm" maxLength={500} placeholder="Hỏi CharityConnect hoặc thông tin khác…" value={input} onChange={(event) => setInput(event.target.value)} /><button type="submit" aria-label="Gửi câu hỏi" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-500 text-ink disabled:opacity-50" disabled={!input.trim() || loading}><Send size={18} /></button></form><p className="mt-2 text-center text-[10px] text-slate-400">Không gửi thông tin cá nhân, số thẻ hoặc API key.</p></div>
    </section>}
    <button type="button" aria-expanded={open} aria-label={open ? "Đóng trợ lý" : "Mở trợ lý CharityConnect"} className="ml-auto flex min-h-14 items-center gap-2 rounded-2xl bg-ink px-4 font-extrabold text-white shadow-xl transition hover:-translate-y-0.5 hover:bg-brand-700" onClick={() => setOpen((value) => !value)}>{open ? <X size={21} /> : <MessageCircle size={21} />}<span className="hidden sm:inline">Hỏi trợ lý</span></button>
  </div>;
}
