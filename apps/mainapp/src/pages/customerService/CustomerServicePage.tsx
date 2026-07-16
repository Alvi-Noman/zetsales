import { useEffect, useRef, useState } from "react";
import {
  Camera,
  Image as ImageIcon,
  Loader2,
  MessageCircle,
  Send,
} from "lucide-react";
import clsx from "clsx";
import type { ConversationDTO, MessageDTO } from "@zetsales/shared";
import {
  listConversations,
  listMessages,
  sendReply,
  uploadMessagingImage,
} from "../../lib/messagingApi";
import { useToast } from "../../components/ui/ToastProvider";

const PROVIDER_ICON = { facebook: MessageCircle, instagram: Camera } as const;

const POLL_INTERVAL_MS = 10_000;

function ConversationRow({
  conversation,
  active,
  onClick,
}: {
  conversation: ConversationDTO;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = PROVIDER_ICON[conversation.provider];
  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left transition-colors",
        active ? "bg-indigo-50" : "hover:bg-slate-50",
      )}
    >
      <div className="relative shrink-0">
        {conversation.participantAvatar ? (
          <img
            src={conversation.participantAvatar}
            alt=""
            className="h-10 w-10 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-500">
            {conversation.participantName.slice(0, 1).toUpperCase()}
          </div>
        )}
        <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white text-slate-500 ring-1 ring-slate-200">
          <Icon size={9} />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-semibold text-slate-800">
            {conversation.participantName}
          </p>
          <span className="shrink-0 text-[11px] text-slate-400">
            {new Date(conversation.lastMessageAt).toLocaleDateString()}
          </span>
        </div>
        <p className="truncate text-xs text-slate-400">
          {conversation.accountName}
        </p>
        <p className="mt-0.5 truncate text-xs text-slate-500">
          {conversation.lastMessagePreview || "No messages yet"}
        </p>
      </div>
      {conversation.unreadCount > 0 && (
        <span className="mt-1 flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-indigo-600 px-1.5 text-[10px] font-bold text-white">
          {conversation.unreadCount}
        </span>
      )}
    </button>
  );
}

export function CustomerServicePage() {
  const toast = useToast();
  const [conversations, setConversations] = useState<ConversationDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageDTO[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadConversations = async () => {
    try {
      const list = await listConversations();
      setConversations(list);
    } catch {
      toast.push("Could not load conversations.", "info");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadConversations();
    const interval = setInterval(
      () => {
        if (document.visibilityState === "visible") void loadConversations();
      },
      POLL_INTERVAL_MS,
    );
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMessages = async (conversationId: string) => {
    try {
      const list = await listMessages(conversationId);
      setMessages(list);
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId ? { ...c, unreadCount: 0 } : c,
        ),
      );
    } catch {
      toast.push("Could not load this conversation.", "info");
    }
  };

  useEffect(() => {
    if (!activeId) return;
    void loadMessages(activeId);
    const interval = setInterval(
      () => {
        if (document.visibilityState === "visible") void loadMessages(activeId);
      },
      POLL_INTERVAL_MS,
    );
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || !activeId) return;
    setSending(true);
    try {
      const sent = await sendReply(activeId, { text });
      setMessages((prev) => [...prev, sent]);
      setDraft("");
      void loadConversations();
    } catch {
      toast.push("Could not send this reply.", "info");
    } finally {
      setSending(false);
    }
  };

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again
    if (!file || !activeId) return;
    setUploadingImage(true);
    try {
      const imageUrl = await uploadMessagingImage(file);
      const sent = await sendReply(activeId, { imageUrl });
      setMessages((prev) => [...prev, sent]);
      void loadConversations();
    } catch {
      toast.push("Could not send this image.", "info");
    } finally {
      setUploadingImage(false);
    }
  };

  const active = conversations.find((c) => c.id === activeId) ?? null;

  return (
    <div className="zs-page">
      <div className="zs-page-header">
        <h1 className="zs-page-title">Messages</h1>
        <p className="zs-page-description">
          All your connected Facebook and Instagram conversations, in one inbox.
        </p>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-80 shrink-0 overflow-y-auto border-r border-slate-200 bg-white">
          {loading ? (
            <div className="py-10 text-center text-sm text-slate-400">
              Loading...
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
              <MessageCircle size={24} className="text-slate-300" />
              <p className="text-sm font-medium text-slate-600">
                No conversations yet
              </p>
              <p className="text-xs text-slate-400">
                Connect your Facebook Business Suite from Integrations →
                Messaging to start receiving messages here.
              </p>
            </div>
          ) : (
            conversations.map((c) => (
              <ConversationRow
                key={c.id}
                conversation={c}
                active={c.id === activeId}
                onClick={() => setActiveId(c.id)}
              />
            ))
          )}
        </div>

        <div className="flex flex-1 flex-col bg-white">
          {!active ? (
            <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
              Select a conversation to view messages
            </div>
          ) : (
            <>
              <div className="border-b border-slate-200 bg-white px-6 py-3.5">
                <p className="text-sm font-semibold text-slate-800">
                  {active.participantName}
                </p>
                <p className="text-xs text-slate-400">
                  via {active.accountName}
                </p>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5">
                <div className="space-y-3">
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={clsx(
                        "flex",
                        m.direction === "out" ? "justify-end" : "justify-start",
                      )}
                    >
                      <div
                        className={clsx(
                          "max-w-md space-y-2 rounded-lg px-4 py-2.5 text-sm",
                          m.direction === "out"
                            ? "bg-indigo-600 text-white"
                            : "bg-white text-slate-800 shadow-sm",
                          m.attachments.length > 0 && !m.text && "p-1.5",
                        )}
                      >
                        {m.attachments.map((url) => (
                          <a
                            key={url}
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="block"
                          >
                            <img
                              src={url}
                              alt=""
                              className="max-h-64 rounded-lg object-cover"
                            />
                          </a>
                        ))}
                        {m.text && <p>{m.text}</p>}
                      </div>
                    </div>
                  ))}
                  <div ref={bottomRef} />
                </div>
              </div>

              <div className="border-t border-slate-200 bg-white p-4">
                <div className="flex items-end gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleImagePick}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingImage}
                    title="Send an image"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {uploadingImage ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <ImageIcon size={16} />
                    )}
                  </button>
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void handleSend();
                      }
                    }}
                    placeholder="Type a reply..."
                    rows={1}
                    className="flex-1 resize-none rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15"
                  />
                  <button
                    onClick={handleSend}
                    disabled={sending || !draft.trim()}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {sending ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Send size={16} />
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
