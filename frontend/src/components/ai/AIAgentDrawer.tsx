import type { ReactNode } from "react";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  TextField,
  List,
  ListItemButton,
  ListItemText,
  Chip,
  Menu,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Tooltip,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  LinearProgress,
  Divider,
  ListItemIcon,
} from "@mui/material";
import {
  Close,
  Add,
  Send,
  Stop,
  Delete,
  AttachFile,
  ChatBubbleOutline,
  FormatListBulleted,
  ContentCopy,
  SmartToy,
  PlaylistAdd,
  ArrowDropDown,
  PlayArrow,
  Public,
  PublicOff,
  DriveFileRenameOutline,
  FolderOpen,
  Http,
  Cable,
  Hub,
} from "@mui/icons-material";
import { alpha, useTheme } from "@mui/material/styles";
import { useTranslation } from "react-i18next";
import { aiChatApi, appSettingsApi, collectionsApi } from "@/api/endpoints";
import { API_URL } from "@/api/client";
import type {
  Collection,
  CollectionItem,
  RequestTab,
  AIConversation,
  AIChatMessage,
  OllamaModel,
  OpenAIModel,
  AppSettings,
} from "@/types";

export const DRAWER_WIDTH = 420;

type ScriptTarget = "pre-request" | "post-response";
type ScriptScope = "request" | "collection";

export interface ApplyScriptPayload {
  script: string;
  target: ScriptTarget;
  scope: ScriptScope;
}

interface AIAgentDrawerProps {
  open: boolean;
  onClose: () => void;
  collections: Collection[];
  activeTab: RequestTab | undefined;
  onApplyScript?: (payload: ApplyScriptPayload) => void;
  currentWorkspaceId?: string | null;
  currentUserId?: string;
}

// ── Simple Markdown Renderer ──

function detectScriptType(code: string, lang: string): ScriptTarget | null {
  const lower = (code + " " + lang).toLowerCase();
  if (lower.includes("pre-request") || lower.includes("pre request")) return "pre-request";
  if (lower.includes("post-response") || lower.includes("post response") || lower.includes("req.test") || lower.includes("req.expect") || lower.includes("req.response")) return "post-response";
  return null;
}

function renderMarkdown(
  text: string,
  onApplyScript?: (payload: ApplyScriptPayload) => void,
  onRunCollection?: () => void,
  isRunningCollection?: boolean,
  t?: (key: string) => string,
): ReactNode[] {
  const elements: ReactNode[] = [];
  const lines = text.split("\n");
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    // Action tag: Run Collection
    if (line.trim() === "<<ACTION:RUN_COLLECTION>>") {
      elements.push(
        <Button
          key={key++}
          variant="contained"
          color="primary"
          size="small"
          startIcon={isRunningCollection ? <CircularProgress size={14} color="inherit" /> : <PlayArrow />}
          onClick={onRunCollection}
          disabled={isRunningCollection}
          sx={{ my: 1, textTransform: "none", fontWeight: 600 }}
        >
          {isRunningCollection ? (t?.("aiAgent.runningTests") || "Running tests...") : (t?.("aiAgent.runTests") || "Run Collection Tests")}
        </Button>,
      );
      i++;
      continue;
    }

    // Code block
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith("```")) {
        codeLines.push(lines[i]!);
        i++;
      }
      i++; // skip closing ```
      const code = codeLines.join("\n");
      const scriptType = (lang === "python" || lang === "javascript" || lang === "js" || lang === "py" || !lang)
        ? detectScriptType(code, lang)
        : null;
      elements.push(
        <CodeBlock key={key++} code={code} language={lang} scriptType={scriptType} onApplyScript={onApplyScript} />,
      );
      continue;
    }

    // Heading
    if (line.startsWith("### ")) {
      elements.push(
        <Typography key={key++} variant="subtitle2" sx={{ mt: 1.5, mb: 0.5, fontWeight: 700 }}>
          {line.slice(4)}
        </Typography>,
      );
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      elements.push(
        <Typography key={key++} variant="subtitle1" sx={{ mt: 1.5, mb: 0.5, fontWeight: 700 }}>
          {line.slice(3)}
        </Typography>,
      );
      i++;
      continue;
    }
    if (line.startsWith("# ")) {
      elements.push(
        <Typography key={key++} variant="h6" sx={{ mt: 1.5, mb: 0.5, fontWeight: 700 }}>
          {line.slice(2)}
        </Typography>,
      );
      i++;
      continue;
    }

    // Empty line
    if (!line.trim()) {
      elements.push(<Box key={key++} sx={{ height: 8 }} />);
      i++;
      continue;
    }

    // Bullet
    if (line.match(/^[-*]\s/)) {
      elements.push(
        <Typography key={key++} variant="body2" component="div" sx={{ pl: 2, position: "relative", "&::before": { content: '"\\2022"', position: "absolute", left: 4 } }}>
          {renderInlineMarkdown(line.slice(2))}
        </Typography>,
      );
      i++;
      continue;
    }

    // Numbered list
    const numMatch = line.match(/^(\d+)\.\s/);
    if (numMatch) {
      elements.push(
        <Typography key={key++} variant="body2" component="div" sx={{ pl: 2 }}>
          {numMatch[1]}. {renderInlineMarkdown(line.slice(numMatch[0].length))}
        </Typography>,
      );
      i++;
      continue;
    }

    // Regular paragraph
    elements.push(
      <Typography key={key++} variant="body2" component="div" sx={{ lineHeight: 1.6 }}>
        {renderInlineMarkdown(line)}
      </Typography>,
    );
    i++;
  }

  return elements;
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Inline code
    const codeMatch = remaining.match(/`([^`]+)`/);
    // Bold
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);

    // Find earliest match
    const matches = [
      codeMatch ? { type: "code", match: codeMatch } : null,
      boldMatch ? { type: "bold", match: boldMatch } : null,
    ].filter(Boolean).sort((a, b) => a!.match.index! - b!.match.index!);

    if (matches.length === 0) {
      parts.push(remaining);
      break;
    }

    const first = matches[0]!;
    const idx = first.match.index!;

    if (idx > 0) {
      parts.push(remaining.slice(0, idx));
    }

    if (first.type === "code") {
      parts.push(
        <Box
          key={key++}
          component="code"
          sx={{
            px: 0.5,
            py: 0.25,
            borderRadius: 0.5,
            bgcolor: "action.hover",
            fontFamily: "monospace",
            fontSize: "0.85em",
          }}
        >
          {first.match[1]}
        </Box>,
      );
    } else if (first.type === "bold") {
      parts.push(
        <Box key={key++} component="strong" sx={{ fontWeight: 700 }}>
          {first.match[1]}
        </Box>,
      );
    }

    remaining = remaining.slice(idx + first.match[0].length);
  }

  return parts;
}

function CodeBlock({
  code,
  language,
  scriptType,
  onApplyScript,
}: {
  code: string;
  language: string;
  scriptType?: ScriptTarget | null;
  onApplyScript?: (payload: ApplyScriptPayload) => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [copied, setCopied] = useState(false);
  const [applied, setApplied] = useState(false);
  const [applyMenuAnchor, setApplyMenuAnchor] = useState<HTMLElement | null>(null);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  const handleApply = useCallback((target: ScriptTarget, scope: ScriptScope) => {
    const cleanedCode = code
      .split("\n")
      .filter((line) => {
        const trimmed = line.trim();
        return !(
          (trimmed.startsWith("//") || trimmed.startsWith("#")) &&
          (/pre.?request|post.?response/i.test(trimmed))
        );
      })
      .join("\n")
      .trim();
    onApplyScript?.({ script: cleanedCode, target, scope });
    setApplied(true);
    setTimeout(() => setApplied(false), 2500);
  }, [code, onApplyScript]);

  return (
    <Box
      sx={{
        position: "relative",
        borderRadius: 1.5,
        overflow: "hidden",
        my: 1,
        bgcolor: theme.palette.mode === "dark" ? alpha("#000", 0.3) : alpha("#000", 0.05),
      }}
    >
      {/* Header bar */}
      <Box sx={{ display: "flex", alignItems: "center", px: 1.5, py: 0.5, borderBottom: 1, borderColor: "divider", minHeight: 28 }}>
        <Typography sx={{ fontSize: 11, color: "text.secondary", flex: 1 }}>
          {language || "code"}
        </Typography>
        <Box sx={{ display: "flex", gap: 0.25 }}>
          {scriptType && onApplyScript && (
            <>
              <Button
                size="small"
                startIcon={<PlaylistAdd sx={{ fontSize: 14 }} />}
                endIcon={<ArrowDropDown sx={{ fontSize: 14 }} />}
                onClick={(e) => setApplyMenuAnchor(e.currentTarget)}
                sx={{
                  fontSize: 10.5,
                  textTransform: "none",
                  py: 0,
                  px: 0.75,
                  minWidth: 0,
                  height: 22,
                  color: applied ? "success.main" : "primary.main",
                }}
              >
                {applied ? t("aiAgent.scriptApplied") : t("aiAgent.applyScript")}
              </Button>
              <Menu
                anchorEl={applyMenuAnchor}
                open={!!applyMenuAnchor}
                onClose={() => setApplyMenuAnchor(null)}
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                transformOrigin={{ vertical: "top", horizontal: "right" }}
              >
                <MenuItem
                  onClick={() => { handleApply(scriptType, "request"); setApplyMenuAnchor(null); }}
                  sx={{ fontSize: 12 }}
                >
                  {t("aiAgent.applyToRequest")}
                </MenuItem>
                <MenuItem
                  onClick={() => { handleApply(scriptType, "collection"); setApplyMenuAnchor(null); }}
                  sx={{ fontSize: 12 }}
                >
                  {t("aiAgent.applyToCollection")}
                </MenuItem>
              </Menu>
            </>
          )}
          <IconButton
            size="small"
            onClick={handleCopy}
            sx={{ opacity: 0.6, "&:hover": { opacity: 1 }, width: 22, height: 22 }}
          >
            <ContentCopy sx={{ fontSize: 13 }} />
          </IconButton>
        </Box>
      </Box>
      <Box
        component="pre"
        sx={{
          p: 1.5,
          m: 0,
          overflowX: "auto",
          fontSize: 12.5,
          fontFamily: "monospace",
          lineHeight: 1.5,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        <code>{code}</code>
      </Box>
      {copied && (
        <Typography sx={{ position: "absolute", top: 32, right: 32, fontSize: 11, color: "success.main" }}>
          Copied!
        </Typography>
      )}
    </Box>
  );
}

// ── Typing indicator ──

function TypingIndicator() {
  return (
    <Box sx={{ display: "flex", gap: 0.5, py: 1, px: 2 }}>
      {[0, 1, 2].map((i) => (
        <Box
          key={i}
          sx={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            bgcolor: "text.secondary",
            opacity: 0.5,
            animation: "pulse 1.4s ease-in-out infinite",
            animationDelay: `${i * 0.2}s`,
            "@keyframes pulse": {
              "0%, 80%, 100%": { opacity: 0.3, transform: "scale(0.8)" },
              "40%": { opacity: 1, transform: "scale(1)" },
            },
          }}
        />
      ))}
    </Box>
  );
}

// ── Main Component ──

export default function AIAgentDrawer({
  open,
  onClose,
  collections,
  activeTab,
  onApplyScript,
  currentWorkspaceId,
  currentUserId,
}: AIAgentDrawerProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  // State
  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AIChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [showConvList, setShowConvList] = useState(false);
  const [isRunningCollection, setIsRunningCollection] = useState(false);

  // Provider/Model
  const [provider, setProvider] = useState<"openai" | "ollama">("openai");
  const [model, setModel] = useState("");
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [openaiModels, setOpenaiModels] = useState<OpenAIModel[]>([]);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);

  // Context
  const [contextType, setContextType] = useState<"collection" | "request" | "folder" | null>(null);
  const [contextId, setContextId] = useState<string | null>(null);
  const [contextName, setContextName] = useState<string | null>(null);
  const [attachMenuAnchor, setAttachMenuAnchor] = useState<HTMLElement | null>(null);
  const [showAttachDialog, setShowAttachDialog] = useState(false);
  const [attachCollectionId, setAttachCollectionId] = useState<string>("");
  const [attachItems, setAttachItems] = useState<Record<string, CollectionItem[]>>({});
  const [attachLoading, setAttachLoading] = useState<Record<string, boolean>>({});
  const [attachSearch, setAttachSearch] = useState("");

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Rename
  const [renameTarget, setRenameTarget] = useState<{ id: string; title: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Right-click context menu for conversations
  const [convContextMenu, setConvContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
    conv: AIConversation;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const streamingTextRef = useRef("");

  // Read-only for shared conversations not owned by current user
  const isReadOnly = useMemo(() => {
    if (!activeConvId || !currentUserId) return false;
    const conv = conversations.find((c) => c.id === activeConvId);
    return conv ? conv.user_id !== currentUserId : false;
  }, [activeConvId, conversations, currentUserId]);

  // ── Escape key to close ──
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // If context menu or dialog is open, don't close drawer
        if (convContextMenu || deleteTarget || renameTarget || showAttachDialog) return;
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose, convContextMenu, deleteTarget, renameTarget, showAttachDialog]);

  // ── Load settings + conversations on open ──
  useEffect(() => {
    if (!open) return;

    appSettingsApi.get().then(({ data }) => {
      setAppSettings(data);
      setProvider(data.ai_provider || "openai");
      if (data.openai_model) setModel(data.openai_model);
      if (data.ai_provider === "ollama" && data.has_ollama_url) {
        appSettingsApi.getOllamaModels(data.ollama_base_url || undefined).then(({ data: models }) => {
          setOllamaModels(models);
        }).catch(() => {});
      }
      if (data.has_openai_key) {
        appSettingsApi.getOpenAIModels().then(({ data: models }) => {
          setOpenaiModels(models);
        }).catch(() => {});
      }
    }).catch(() => {});

    loadConversations();
  }, [open]);

  const loadConversations = useCallback(async () => {
    try {
      const { data } = await aiChatApi.listConversations(currentWorkspaceId || undefined);
      setConversations(data);
    } catch {
      /* ignore */
    }
  }, [currentWorkspaceId]);

  // ── Load messages when active conversation changes ──
  useEffect(() => {
    if (!activeConvId) {
      setMessages([]);
      return;
    }
    loadMessages(activeConvId);
  }, [activeConvId]);

  const loadMessages = useCallback(async (convId: string) => {
    try {
      const { data } = await aiChatApi.listMessages(convId);
      setMessages(data);
    } catch {
      /* ignore */
    }
  }, []);

  // ── Auto-scroll to bottom ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  // ── Create new conversation ──
  const handleNewChat = useCallback(async () => {
    try {
      const { data } = await aiChatApi.createConversation({
        title: t("aiAgent.defaultTitle"),
        provider,
        model: model || undefined,
        workspace_id: currentWorkspaceId || undefined,
      });
      setConversations((prev) => [data, ...prev]);
      setActiveConvId(data.id);
      setMessages([]);
      setShowConvList(false);
    } catch {
      /* ignore */
    }
  }, [provider, model, t, currentWorkspaceId]);

  // ── Stop streaming ──
  const handleStopStreaming = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    const finalText = streamingTextRef.current.trim();
    streamingTextRef.current = "";
    setStreamingText("");
    setIsStreaming(false);
    if (finalText) {
      const assistantMsg: AIChatMessage = {
        id: `temp-assistant-${Date.now()}`,
        conversation_id: activeConvId || "",
        role: "assistant",
        content: finalText,
        context_type: null,
        context_id: null,
        context_name: null,
        created_at: new Date().toISOString(),
      };
      setMessages((msgs) => [...msgs, assistantMsg]);
    }
  }, [activeConvId]);

  // ── Core send logic (reusable) ──
  const sendMessageProgrammatic = useCallback(async (messageText: string) => {
    if (!messageText.trim() || isStreaming) return;

    let convId = activeConvId;

    if (!convId) {
      try {
        const { data } = await aiChatApi.createConversation({
          title: messageText.trim().slice(0, 50) || t("aiAgent.defaultTitle"),
          provider,
          model: model || undefined,
          workspace_id: currentWorkspaceId || undefined,
        });
        setConversations((prev) => [data, ...prev]);
        convId = data.id;
        setActiveConvId(data.id);
      } catch {
        return;
      }
    }

    const userContent = messageText.trim();
    setIsStreaming(true);
    setStreamingText("");
    streamingTextRef.current = "";

    // Optimistically add user message
    const optimisticMsg: AIChatMessage = {
      id: `temp-${Date.now()}`,
      conversation_id: convId,
      role: "user",
      content: userContent,
      context_type: contextType,
      context_id: contextId,
      context_name: contextName,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    // Clear context after sending
    const sendContextType = contextType;
    const sendContextId = contextId;
    const sendContextName = contextName;
    setContextType(null);
    setContextId(null);
    setContextName(null);

    const ctrl = aiChatApi.sendMessage(
      convId,
      {
        content: userContent,
        context_type: sendContextType,
        context_id: sendContextId,
        context_name: sendContextName,
        provider,
        model: model || undefined,
      },
      {
        onDelta: (text) => {
          streamingTextRef.current += text;
          setStreamingText((prev) => prev + text);
        },
        onDone: () => {
          // Read from ref to avoid React Strict Mode double-invoke issue
          const finalText = streamingTextRef.current.trim();
          streamingTextRef.current = "";
          setStreamingText("");
          setIsStreaming(false);
          if (finalText) {
            const assistantMsg: AIChatMessage = {
              id: `temp-assistant-${Date.now()}`,
              conversation_id: convId!,
              role: "assistant",
              content: finalText,
              context_type: null,
              context_id: null,
              context_name: null,
              created_at: new Date().toISOString(),
            };
            setMessages((msgs) => [...msgs, assistantMsg]);
          }
          loadConversations();
        },
        onError: (message) => {
          streamingTextRef.current = "";
          setStreamingText("");
          setIsStreaming(false);
          const errorMsg: AIChatMessage = {
            id: `temp-error-${Date.now()}`,
            conversation_id: convId!,
            role: "assistant",
            content: `Error: ${message}`,
            context_type: null,
            context_id: null,
            context_name: null,
            created_at: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, errorMsg]);
        },
      },
    );
    abortRef.current = ctrl;
  }, [isStreaming, activeConvId, provider, model, contextType, contextId, contextName, t, loadConversations, currentWorkspaceId]);

  // ── Send from input ──
  const handleSend = useCallback(async () => {
    if (!inputText.trim()) return;
    const text = inputText.trim();
    setInputText("");
    await sendMessageProgrammatic(text);
  }, [inputText, sendMessageProgrammatic]);

  // ── Run collection tests ──
  const handleRunCollection = useCallback(async () => {
    const collectionId = contextType === "collection" ? contextId : activeTab?.collectionId;
    if (!collectionId || isRunningCollection || isStreaming) return;

    setIsRunningCollection(true);
    const token = localStorage.getItem("openreq-token");
    const params = new URLSearchParams();
    params.set("iterations", "1");
    params.set("delay_ms", "0");

    try {
      const response = await fetch(
        `${API_URL}/api/v1/proxy/run/${collectionId}?${params.toString()}`,
        {
          method: "POST",
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        },
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const reader = response.body?.getReader();
      if (!reader) { setIsRunningCollection(false); return; }

      const decoder = new TextDecoder();
      let buffer = "";
      const results: Array<{
        request_name: string;
        method: string;
        status: string;
        status_code?: number;
        elapsed_ms?: number;
        error?: string;
        test_results?: Array<{ name: string; passed: boolean; error: string | null }>;
      }> = [];

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "result") {
              results.push({
                request_name: event.request_name,
                method: event.method,
                status: event.status,
                status_code: event.response?.status_code,
                elapsed_ms: event.response?.elapsed_ms,
                error: event.error,
                test_results: event.response?.script_result?.test_results,
              });
            }
          } catch { /* skip */ }
        }
      }

      // Format results summary
      const totalRequests = results.length;
      const passed = results.filter((r) => r.status === "success").length;
      const failed = totalRequests - passed;
      let allTests = 0;
      let passedTests = 0;
      let failedTests = 0;

      const summaryLines: string[] = [
        "[Collection Test Results]",
        "",
        `Total requests: ${totalRequests} | Passed: ${passed} | Failed: ${failed}`,
        "",
        "Detailed results:",
      ];

      for (const r of results) {
        const icon = r.status === "success" ? "OK" : "ERROR";
        summaryLines.push(`- ${r.method} ${r.request_name}: ${icon} (HTTP ${r.status_code ?? "N/A"}, ${r.elapsed_ms ?? 0}ms)`);
        if (r.error) summaryLines.push(`  Error: ${r.error}`);
        if (r.test_results && r.test_results.length > 0) {
          for (const tr of r.test_results) {
            allTests++;
            if (tr.passed) passedTests++;
            else failedTests++;
            summaryLines.push(`  ${tr.passed ? "PASS" : "FAIL"}: ${tr.name}${tr.error ? ` - ${tr.error}` : ""}`);
          }
        }
      }

      summaryLines.push("", `Test summary: ${passedTests}/${allTests} passed, ${failedTests} failed`);
      summaryLines.push("", "Please analyze these results and suggest improvements.");

      setIsRunningCollection(false);
      await sendMessageProgrammatic(summaryLines.join("\n"));
    } catch (err: unknown) {
      setIsRunningCollection(false);
      const errMsg: AIChatMessage = {
        id: `temp-runerr-${Date.now()}`,
        conversation_id: activeConvId || "",
        role: "assistant",
        content: `Error running collection tests: ${err instanceof Error ? err.message : String(err)}`,
        context_type: null,
        context_id: null,
        context_name: null,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errMsg]);
    }
  }, [contextType, contextId, activeTab?.collectionId, isRunningCollection, isStreaming, activeConvId, sendMessageProgrammatic]);

  // ── Delete conversation ──
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await aiChatApi.deleteConversation(deleteTarget);
      setConversations((prev) => prev.filter((c) => c.id !== deleteTarget));
      if (activeConvId === deleteTarget) {
        setActiveConvId(null);
        setMessages([]);
      }
    } catch {
      /* ignore */
    }
    setDeleteTarget(null);
  }, [deleteTarget, activeConvId]);

  // ── Rename conversation ──
  const handleRename = useCallback(async () => {
    if (!renameTarget || !renameValue.trim()) return;
    try {
      const { data } = await aiChatApi.updateConversation(renameTarget.id, { title: renameValue.trim() });
      setConversations((prev) => prev.map((c) => (c.id === data.id ? { ...c, title: data.title } : c)));
    } catch {
      /* ignore */
    }
    setRenameTarget(null);
  }, [renameTarget, renameValue]);

  // ── Toggle share ──
  const handleToggleShare = useCallback(async (convId: string, shared: boolean) => {
    try {
      const { data } = await aiChatApi.updateConversation(convId, { is_shared: shared });
      setConversations((prev) => prev.map((c) => (c.id === data.id ? { ...c, is_shared: data.is_shared } : c)));
    } catch { /* ignore */ }
  }, []);

  // ── Attach context ──
  const loadAttachItems = useCallback(async (collectionId: string) => {
    if (!collectionId || attachLoading[collectionId]) return;
    setAttachLoading((prev) => ({ ...prev, [collectionId]: true }));
    try {
      const { data } = await collectionsApi.listItems(collectionId);
      setAttachItems((prev) => ({ ...prev, [collectionId]: data }));
    } catch {
      /* ignore */
    } finally {
      setAttachLoading((prev) => ({ ...prev, [collectionId]: false }));
    }
  }, [attachLoading]);

  useEffect(() => {
    if (!showAttachDialog) return;
    const nextId = attachCollectionId || activeTab?.collectionId || collections[0]?.id || "";
    if (nextId && nextId !== attachCollectionId) setAttachCollectionId(nextId);
  }, [showAttachDialog, attachCollectionId, activeTab?.collectionId, collections]);

  useEffect(() => {
    if (!showAttachDialog || !attachCollectionId) return;
    if (!attachItems[attachCollectionId]) loadAttachItems(attachCollectionId);
  }, [showAttachDialog, attachCollectionId, attachItems, loadAttachItems]);

  const attachRows = useMemo(() => {
    const items = attachItems[attachCollectionId] ?? [];
    if (items.length === 0) return [] as Array<{ item: CollectionItem; depth: number }>;

    const childrenByParent = new Map<string | null, CollectionItem[]>();
    for (const item of items) {
      const parent = item.parent_id ?? null;
      const list = childrenByParent.get(parent) ?? [];
      list.push(item);
      childrenByParent.set(parent, list);
    }
    for (const list of childrenByParent.values()) {
      list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    }

    const rows: Array<{ item: CollectionItem; depth: number }> = [];
    const walk = (parentId: string | null, depth: number) => {
      const nodes = childrenByParent.get(parentId) ?? [];
      for (const node of nodes) {
        rows.push({ item: node, depth });
        if (node.is_folder) walk(node.id, depth + 1);
      }
    };
    walk(null, 0);

    const term = attachSearch.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => r.item.name.toLowerCase().includes(term));
  }, [attachItems, attachCollectionId, attachSearch]);

  const getAttachPath = useCallback((itemId: string | null) => {
    if (!itemId) return "";
    const items = attachItems[attachCollectionId] ?? [];
    const map = new Map<string, CollectionItem>(items.map((i) => [i.id, i]));
    const parts: string[] = [];
    let cur = map.get(itemId);
    while (cur) {
      parts.push(cur.name);
      if (!cur.parent_id) break;
      cur = map.get(cur.parent_id);
    }
    return parts.reverse().join(" / ");
  }, [attachItems, attachCollectionId]);

  const handleAttachCollection = useCallback((collectionId: string) => {
    const col = collections.find((c) => c.id === collectionId);
    setContextType("collection");
    setContextId(collectionId);
    setContextName(col?.name ?? "Collection");
    setShowAttachDialog(false);
    setAttachMenuAnchor(null);
  }, [collections]);

  const handleAttachFolder = useCallback((folder: CollectionItem) => {
    const col = collections.find((c) => c.id === attachCollectionId);
    const path = getAttachPath(folder.id);
    setContextType("folder");
    setContextId(folder.id);
    setContextName(col ? `${col.name} / ${path}` : path || folder.name);
    setShowAttachDialog(false);
    setAttachMenuAnchor(null);
  }, [collections, attachCollectionId, getAttachPath]);

  const handleAttachRequestFromTree = useCallback((item: CollectionItem) => {
    if (!item.request_id) return;
    const col = collections.find((c) => c.id === attachCollectionId);
    const path = getAttachPath(item.id);
    setContextType("request");
    setContextId(item.request_id);
    setContextName(col ? `${col.name} / ${path}` : path || item.name);
    setShowAttachDialog(false);
    setAttachMenuAnchor(null);
  }, [collections, attachCollectionId, getAttachPath]);

  const handleAttachRequest = useCallback(() => {
    if (!activeTab?.savedRequestId) return;
    setContextType("request");
    setContextId(activeTab.savedRequestId);
    setContextName(`${activeTab.method} ${activeTab.name}`);
    setAttachMenuAnchor(null);
  }, [activeTab]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // ── Right-click on conversation ──
  const handleConvContextMenu = useCallback((e: React.MouseEvent, conv: AIConversation) => {
    e.preventDefault();
    e.stopPropagation();
    setConvContextMenu({ mouseX: e.clientX - 2, mouseY: e.clientY - 4, conv });
  }, []);

  const handleCloseConvContextMenu = useCallback(() => {
    setConvContextMenu(null);
  }, []);

  const hasProvider = appSettings
    ? (provider === "openai" && appSettings.has_openai_key) || (provider === "ollama" && appSettings.has_ollama_url)
    : false;

  return (
    <Drawer
      anchor="right"
      open={open}
      variant="persistent"
      sx={{
        "& .MuiDrawer-paper": {
          width: DRAWER_WIDTH,
          boxSizing: "border-box",
          borderLeft: `1px solid ${theme.palette.divider}`,
        },
      }}
    >
      <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
        {/* Spacer for fixed TopBar */}
        <Box sx={{ minHeight: "52px", flexShrink: 0 }} />
        {/* ── Header ── */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            px: 2,
            py: 1,
            borderBottom: 1,
            borderColor: "divider",
            bgcolor: isDark ? alpha("#fff", 0.02) : alpha("#000", 0.02),
            minHeight: 52,
          }}
        >
          <SmartToy sx={{ fontSize: 22, mr: 1, color: "primary.main" }} />
          <Typography variant="subtitle1" sx={{ fontWeight: 700, flex: 1 }}>
            George
          </Typography>
          <Tooltip title={t("aiAgent.conversations")}>
            <IconButton size="small" onClick={() => setShowConvList(!showConvList)}>
              <FormatListBulleted sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title={t("aiAgent.newChat")}>
            <IconButton size="small" onClick={handleNewChat}>
              <Add sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title={t("common.close")}>
            <IconButton
              size="small"
              onClick={onClose}
              sx={{
                ml: 0.5,
                bgcolor: isDark ? alpha("#fff", 0.08) : alpha("#000", 0.06),
                "&:hover": { bgcolor: isDark ? alpha("#fff", 0.15) : alpha("#000", 0.12) },
              }}
            >
              <Close sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </Box>

        {/* ── Conversation List (collapsible) ── */}
        {showConvList && (
          <Box
            sx={{
              maxHeight: 280,
              overflowY: "auto",
              borderBottom: 1,
              borderColor: "divider",
              bgcolor: isDark ? alpha("#fff", 0.01) : alpha("#000", 0.01),
            }}
          >
            {conversations.length === 0 ? (
              <Typography sx={{ p: 2, fontSize: 13, color: "text.secondary", textAlign: "center" }}>
                {t("aiAgent.noConversations")}
              </Typography>
            ) : (
              <List dense sx={{ py: 0.5 }}>
                {conversations.map((conv) => {
                  const isOwner = conv.user_id === currentUserId;
                  return (
                    <ListItemButton
                      key={conv.id}
                      selected={conv.id === activeConvId}
                      onClick={() => {
                        setActiveConvId(conv.id);
                        setShowConvList(false);
                      }}
                      onContextMenu={(e) => handleConvContextMenu(e, conv)}
                      sx={{
                        py: 0.5,
                        px: 2,
                        borderRadius: 1,
                        mx: 0.5,
                        my: 0.25,
                      }}
                    >
                      <ChatBubbleOutline sx={{ fontSize: 14, mr: 1, color: "text.secondary", flexShrink: 0 }} />
                      <ListItemText
                        primary={
                          <Typography
                            noWrap
                            sx={{ fontSize: 13, lineHeight: 1.4 }}
                          >
                            {conv.title}
                          </Typography>
                        }
                        secondary={
                          <Box component="span" sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.25 }}>
                            <Typography component="span" sx={{ fontSize: 11, color: "text.secondary" }}>
                              {new Date(conv.updated_at).toLocaleDateString()}
                            </Typography>
                            {conv.is_shared && (
                              <Public sx={{ fontSize: 11, color: "info.main" }} />
                            )}
                            {!isOwner && (
                              <Chip
                                label={t("aiAgent.readOnly")}
                                size="small"
                                sx={{ height: 16, fontSize: 10, "& .MuiChip-label": { px: 0.75 } }}
                              />
                            )}
                          </Box>
                        }
                        sx={{ my: 0 }}
                      />
                    </ListItemButton>
                  );
                })}
              </List>
            )}
          </Box>
        )}

        {/* ── Conversation Right-Click Context Menu ── */}
        <Menu
          open={!!convContextMenu}
          onClose={handleCloseConvContextMenu}
          anchorReference="anchorPosition"
          anchorPosition={
            convContextMenu
              ? { top: convContextMenu.mouseY, left: convContextMenu.mouseX }
              : undefined
          }
        >
          {convContextMenu && convContextMenu.conv.user_id === currentUserId && [
            <MenuItem
              key="rename"
              onClick={() => {
                setRenameTarget({ id: convContextMenu.conv.id, title: convContextMenu.conv.title });
                setRenameValue(convContextMenu.conv.title);
                handleCloseConvContextMenu();
              }}
              sx={{ fontSize: 13 }}
            >
              <ListItemIcon><DriveFileRenameOutline sx={{ fontSize: 16 }} /></ListItemIcon>
              {t("aiAgent.renameChat")}
            </MenuItem>,
            <MenuItem
              key="share"
              onClick={() => {
                handleToggleShare(convContextMenu.conv.id, !convContextMenu.conv.is_shared);
                handleCloseConvContextMenu();
              }}
              sx={{ fontSize: 13 }}
            >
              <ListItemIcon>
                {convContextMenu.conv.is_shared
                  ? <PublicOff sx={{ fontSize: 16 }} />
                  : <Public sx={{ fontSize: 16 }} />
                }
              </ListItemIcon>
              {convContextMenu.conv.is_shared ? t("aiAgent.unshare") : t("aiAgent.share")}
            </MenuItem>,
            <Divider key="div" />,
            <MenuItem
              key="delete"
              onClick={() => {
                setDeleteTarget(convContextMenu.conv.id);
                handleCloseConvContextMenu();
              }}
              sx={{ fontSize: 13, color: "error.main" }}
            >
              <ListItemIcon><Delete sx={{ fontSize: 16, color: "error.main" }} /></ListItemIcon>
              {t("aiAgent.deleteChat")}
            </MenuItem>,
          ]}
          {convContextMenu && convContextMenu.conv.user_id !== currentUserId && (
            <MenuItem disabled sx={{ fontSize: 13 }}>
              <ListItemIcon><Public sx={{ fontSize: 16 }} /></ListItemIcon>
              {t("aiAgent.sharedConversation")}
            </MenuItem>
          )}
        </Menu>

        {/* ── Running indicator ── */}
        {isRunningCollection && <LinearProgress sx={{ flexShrink: 0 }} />}

        {/* ── Messages Area ── */}
        <Box
          sx={{
            flex: 1,
            overflowY: "auto",
            px: 2,
            py: 1.5,
            display: "flex",
            flexDirection: "column",
            gap: 1.5,
          }}
        >
          {!hasProvider && (
            <Alert severity="warning" sx={{ fontSize: 13 }}>
              {t("aiAgent.noProvider")}
            </Alert>
          )}

          {messages.length === 0 && !streamingText && (
            <Box sx={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, py: 4 }}>
              <SmartToy sx={{ fontSize: 48, color: "text.disabled" }} />
              <Typography sx={{ fontSize: 14, color: "text.secondary", textAlign: "center", maxWidth: 300 }}>
                {t("aiAgent.welcomeMessage")}
              </Typography>
            </Box>
          )}

          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              isDark={isDark}
              onApplyScript={onApplyScript}
              onRunCollection={handleRunCollection}
              isRunningCollection={isRunningCollection}
              t={t}
            />
          ))}

          {/* Streaming response */}
          {isStreaming && streamingText && (
            <Box
              sx={{
                alignSelf: "flex-start",
                maxWidth: "90%",
                p: 1.5,
                borderRadius: 2,
                borderTopLeftRadius: 4,
                bgcolor: isDark ? alpha("#fff", 0.06) : alpha("#000", 0.04),
              }}
            >
              {renderMarkdown(streamingText, onApplyScript, handleRunCollection, isRunningCollection, t)}
            </Box>
          )}

          {isStreaming && !streamingText && <TypingIndicator />}

          <div ref={messagesEndRef} />
        </Box>

        {/* ── Context Chip ── */}
        {contextType && contextName && (
          <Box sx={{ px: 2, py: 0.5, borderTop: 1, borderColor: "divider" }}>
            <Chip
              size="small"
              label={`${contextType === "collection" ? t("collection.collection") : contextType === "folder" ? t("collection.folder") : "Request"}: ${contextName}`}
              onDelete={() => {
                setContextType(null);
                setContextId(null);
                setContextName(null);
              }}
              sx={{ fontSize: 12, maxWidth: "100%" }}
            />
          </Box>
        )}

        {/* ── Input Area ── */}
        <Box
          sx={{
            p: 1.5,
            borderTop: 1,
            borderColor: "divider",
            bgcolor: isDark ? alpha("#fff", 0.02) : alpha("#000", 0.02),
          }}
        >
          {/* Provider / Model selector */}
          <Box sx={{ display: "flex", gap: 1, mb: 1 }}>
            <FormControl size="small" sx={{ minWidth: 100 }}>
              <InputLabel sx={{ fontSize: 12 }}>{t("aiAgent.provider")}</InputLabel>
              <Select
                value={provider}
                onChange={(e) => setProvider(e.target.value as "openai" | "ollama")}
                label={t("aiAgent.provider")}
                sx={{ fontSize: 12, height: 32 }}
                disabled={isReadOnly}
              >
                <MenuItem value="openai" sx={{ fontSize: 12 }}>OpenAI</MenuItem>
                <MenuItem value="ollama" sx={{ fontSize: 12 }}>Ollama</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ flex: 1 }}>
              <InputLabel sx={{ fontSize: 12 }}>{t("aiAgent.model")}</InputLabel>
              {provider === "ollama" ? (
                <Select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  label={t("aiAgent.model")}
                  sx={{ fontSize: 12, height: 32 }}
                  disabled={isReadOnly}
                >
                  {ollamaModels.map((m) => (
                    <MenuItem key={m.name} value={m.name} sx={{ fontSize: 12 }}>
                      {m.name}
                    </MenuItem>
                  ))}
                </Select>
              ) : (
                <Select
                  value={model || appSettings?.openai_model || "gpt-4.1-mini"}
                  onChange={(e) => setModel(e.target.value)}
                  label={t("aiAgent.model")}
                  sx={{ fontSize: 12, height: 32 }}
                  disabled={isReadOnly}
                >
                  {openaiModels.length > 0 ? (
                    openaiModels.map((m) => (
                      <MenuItem key={m.id} value={m.id} sx={{ fontSize: 12 }}>{m.id}</MenuItem>
                    ))
                  ) : (
                    [
                      <MenuItem key="gpt-4.1-mini" value="gpt-4.1-mini" sx={{ fontSize: 12 }}>gpt-4.1-mini</MenuItem>,
                      <MenuItem key="gpt-4.1" value="gpt-4.1" sx={{ fontSize: 12 }}>gpt-4.1</MenuItem>,
                      <MenuItem key="gpt-5-mini" value="gpt-5-mini" sx={{ fontSize: 12 }}>gpt-5-mini</MenuItem>,
                    ]
                  )}
                </Select>
              )}
            </FormControl>
          </Box>

          {/* Input + buttons */}
          <Box sx={{ display: "flex", gap: 0.5, alignItems: "flex-end" }}>
            <Tooltip title={t("aiAgent.attachContext")}>
              <span>
                <IconButton
                  size="small"
                  onClick={(e) => setAttachMenuAnchor(e.currentTarget)}
                  sx={{ mb: 0.5 }}
                  disabled={isReadOnly}
                >
                  <AttachFile sx={{ fontSize: 18 }} />
                </IconButton>
              </span>
            </Tooltip>
            <TextField
              fullWidth
              multiline
              minRows={1}
              maxRows={4}
              size="small"
              placeholder={isReadOnly ? t("aiAgent.readOnly") : t("aiAgent.typeMessage")}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isStreaming || isReadOnly}
              sx={{
                "& .MuiInputBase-root": { fontSize: 13, py: 0.5 },
              }}
            />
            {isStreaming ? (
              <Tooltip title={t("runner.stop")}>
                <IconButton
                  size="small"
                  color="error"
                  onClick={handleStopStreaming}
                  sx={{ mb: 0.5 }}
                >
                  <Stop sx={{ fontSize: 20 }} />
                </IconButton>
              </Tooltip>
            ) : (
              <IconButton
                size="small"
                color="primary"
                onClick={handleSend}
                disabled={!inputText.trim() || !hasProvider || isReadOnly}
                sx={{ mb: 0.5 }}
              >
                <Send sx={{ fontSize: 18 }} />
              </IconButton>
            )}
          </Box>
        </Box>
      </Box>

      {/* ── Attach Context Menu ── */}
      <Menu
        anchorEl={attachMenuAnchor}
        open={!!attachMenuAnchor}
        onClose={() => setAttachMenuAnchor(null)}
      >
        <MenuItem
          onClick={() => {
            setShowAttachDialog(true);
            setAttachMenuAnchor(null);
          }}
          sx={{ fontSize: 13 }}
        >
          {t("aiAgent.attachContext")}
        </MenuItem>
        <MenuItem
          onClick={handleAttachRequest}
          disabled={!activeTab?.savedRequestId}
          sx={{ fontSize: 13 }}
        >
          {t("aiAgent.attachRequest")}
        </MenuItem>
      </Menu>

      {/* ── Attach Context Dialog ── */}
      <Dialog open={showAttachDialog} onClose={() => setShowAttachDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t("aiAgent.attachContext")}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, pt: 1 }}>
            <FormControl fullWidth size="small">
              <InputLabel>{t("collection.collection")}</InputLabel>
              <Select
                value={attachCollectionId || ""}
                label={t("collection.collection")}
                onChange={(e) => setAttachCollectionId(String(e.target.value))}
              >
                {collections.map((col) => (
                  <MenuItem key={col.id} value={col.id}>{col.name}</MenuItem>
                ))}
                {collections.length === 0 && (
                  <MenuItem disabled value="">
                    {t("dashboard.noCollections")}
                  </MenuItem>
                )}
              </Select>
            </FormControl>

            <TextField
              size="small"
              placeholder={t("common.search")}
              value={attachSearch}
              onChange={(e) => setAttachSearch(e.target.value)}
              fullWidth
            />

            {attachCollectionId && attachLoading[attachCollectionId] && (
              <LinearProgress />
            )}

            <List dense sx={{ maxHeight: 360, overflow: "auto", border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
              {attachRows.length === 0 && !attachLoading[attachCollectionId] && (
                <ListItemText
                  primary={collections.length === 0 ? t("dashboard.noCollections") : t("common.noData")}
                  sx={{ px: 2, py: 1.5, color: "text.secondary" }}
                />
              )}
              {attachRows.map(({ item, depth }) => {
                const isFolder = item.is_folder;
                const label = isFolder
                  ? t("collection.folder")
                  : item.protocol === "websocket"
                    ? "WS"
                    : item.protocol === "graphql"
                      ? "GraphQL"
                      : (item.method ? item.method.toUpperCase() : "HTTP");
                return (
                  <ListItemButton
                    key={item.id}
                    onClick={() => (isFolder ? handleAttachFolder(item) : handleAttachRequestFromTree(item))}
                    sx={{ pl: 2 + depth * 2 }}
                  >
                    <ListItemIcon sx={{ minWidth: 28 }}>
                      {isFolder ? (
                        <FolderOpen sx={{ fontSize: 18, color: "warning.main" }} />
                      ) : item.protocol === "websocket" ? (
                        <Cable sx={{ fontSize: 18, color: "#14b8a6" }} />
                      ) : item.protocol === "graphql" ? (
                        <Hub sx={{ fontSize: 18, color: "#e879f9" }} />
                      ) : (
                        <Http sx={{ fontSize: 18, color: "#34d399" }} />
                      )}
                    </ListItemIcon>
                    <ListItemText
                      primary={item.name}
                      secondary={label}
                      primaryTypographyProps={{ noWrap: true }}
                    />
                  </ListItemButton>
                );
              })}
            </List>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowAttachDialog(false)}>{t("common.cancel")}</Button>
          <Button
            variant="contained"
            onClick={() => {
              if (attachCollectionId) handleAttachCollection(attachCollectionId);
            }}
            disabled={!attachCollectionId}
          >
            {t("aiAgent.attachCollection")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>{t("aiAgent.deleteChat")}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t("aiAgent.deleteChatConfirm")}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>{t("common.cancel")}</Button>
          <Button onClick={handleDelete} color="error">{t("common.delete")}</Button>
        </DialogActions>
      </Dialog>

      {/* ── Rename Dialog ── */}
      <Dialog open={!!renameTarget} onClose={() => setRenameTarget(null)}>
        <DialogTitle>{t("aiAgent.renameChat")}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            size="small"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleRename();
              }
            }}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameTarget(null)}>{t("common.cancel")}</Button>
          <Button onClick={handleRename} variant="contained">{t("common.save")}</Button>
        </DialogActions>
      </Dialog>
    </Drawer>
  );
}

// ── Message Bubble ──

function MessageBubble({
  message,
  isDark,
  onApplyScript,
  onRunCollection,
  isRunningCollection,
  t,
}: {
  message: AIChatMessage;
  isDark: boolean;
  onApplyScript?: (payload: ApplyScriptPayload) => void;
  onRunCollection?: () => void;
  isRunningCollection?: boolean;
  t?: (key: string) => string;
}) {
  const isUser = message.role === "user";

  return (
    <Box
      sx={{
        alignSelf: isUser ? "flex-end" : "flex-start",
        maxWidth: "90%",
      }}
    >
      {/* Context badge */}
      {message.context_name && (
        <Typography sx={{ fontSize: 11, color: "text.secondary", mb: 0.25, px: 0.5 }}>
          {message.context_type === "collection" ? t("collection.collection") : message.context_type === "folder" ? t("collection.folder") : "Request"}: {message.context_name}
        </Typography>
      )}
      <Box
        sx={{
          p: 1.5,
          borderRadius: 2,
          ...(isUser
            ? {
                borderTopRightRadius: 4,
                bgcolor: "primary.main",
                color: "primary.contrastText",
              }
            : {
                borderTopLeftRadius: 4,
                bgcolor: isDark ? alpha("#fff", 0.06) : alpha("#000", 0.04),
              }),
        }}
      >
        {isUser ? (
          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.6 }}>
            {message.content}
          </Typography>
        ) : (
          <Box sx={{ "& > *:first-of-type": { mt: 0 } }}>
            {renderMarkdown(message.content, onApplyScript, onRunCollection, isRunningCollection, t)}
          </Box>
        )}
      </Box>
    </Box>
  );
}

