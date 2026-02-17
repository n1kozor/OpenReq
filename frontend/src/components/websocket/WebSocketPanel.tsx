import { useState, useRef, useCallback, useEffect } from "react";
import {
  Box,
  TextField,
  Button,
  Typography,
  Chip,
  IconButton,
  List,
  ListItem,
  Tooltip,
} from "@mui/material";
import {
  Cable,
  Send,
  PowerOff,
  Delete,
  ContentCopy,
  ArrowUpward,
  ArrowDownward,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import type { WebSocketMessage } from "@/types";
import { API_URL } from "@/api/client";

interface WebSocketPanelProps {
  open?: boolean;
}

export default function WebSocketPanel(_props: WebSocketPanelProps) {
  const { t } = useTranslation();
  const [wsUrl, setWsUrl] = useState("ws://localhost:8080");
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [messages, setMessages] = useState<WebSocketMessage[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const getWsProxyUrl = () => {
    if (API_URL) {
      return API_URL.replace("http", "ws") + "/api/v1/ws-proxy";
    }
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}/api/v1/ws-proxy`;
  };

  const handleConnect = useCallback(() => {
    if (connected || connecting) return;
    setConnecting(true);

    const proxyUrl = getWsProxyUrl();
    const token = localStorage.getItem("openreq-token");
    const ws = new WebSocket(`${proxyUrl}?token=${token}`);

    ws.onopen = () => {
      wsRef.current = ws;
      // Send connect command
      ws.send(
        JSON.stringify({
          action: "connect",
          url: wsUrl,
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "connected") {
          setConnected(true);
          setConnecting(false);
          setMessages((prev) => [
            ...prev,
            {
              data: t("websocket.connected", { url: data.url }),
              timestamp: data.timestamp || Date.now(),
              direction: "received" as const,
            },
          ]);
        } else if (data.type === "disconnected") {
          setConnected(false);
          setConnecting(false);
          setMessages((prev) => [
            ...prev,
            {
              data: t("websocket.disconnectedMsg"),
              timestamp: data.timestamp || Date.now(),
              direction: "received" as const,
            },
          ]);
        } else if (data.type === "message") {
          setMessages((prev) => [
            ...prev,
            {
              data: data.data,
              timestamp: data.timestamp || Date.now(),
              direction: data.direction || "received",
            },
          ]);
        } else if (data.type === "error") {
          setConnecting(false);
          setMessages((prev) => [
            ...prev,
            {
              data: `Error: ${data.message}`,
              timestamp: data.timestamp || Date.now(),
              direction: "received" as const,
            },
          ]);
        }
      } catch {
        // Not JSON, treat as raw message
        setMessages((prev) => [
          ...prev,
          {
            data: event.data,
            timestamp: Date.now(),
            direction: "received" as const,
          },
        ]);
      }
    };

    ws.onerror = () => {
      setConnecting(false);
      setConnected(false);
    };

    ws.onclose = () => {
      setConnected(false);
      setConnecting(false);
      wsRef.current = null;
    };
  }, [wsUrl, connected, connecting, t]);

  const handleDisconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({ action: "disconnect" }));
    }
  }, []);

  const handleSendMessage = useCallback(() => {
    if (!wsRef.current || !messageInput.trim()) return;

    wsRef.current.send(
      JSON.stringify({
        action: "send",
        data: messageInput,
      })
    );
    setMessageInput("");
  }, [messageInput]);

  const handleClearMessages = () => {
    setMessages([]);
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3,
    });
  };

  return (
    <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1.5, height: "100%", overflow: "hidden" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Cable color={connected ? "success" : "action"} />
        <Typography variant="subtitle2">{t("websocket.title")}</Typography>
        <Chip
          label={
            connected
              ? t("websocket.statusConnected")
              : connecting
              ? t("websocket.statusConnecting")
              : t("websocket.statusDisconnected")
          }
          color={connected ? "success" : connecting ? "warning" : "default"}
          size="small"
          sx={{ height: 20, fontSize: 10 }}
        />
        <Box sx={{ flexGrow: 1 }} />
        <Tooltip title={t("websocket.clearMessages")}>
          <IconButton size="small" onClick={handleClearMessages}>
            <Delete sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Box>

      <Box sx={{ display: "flex", gap: 1 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="ws://localhost:8080"
          value={wsUrl}
          onChange={(e) => setWsUrl(e.target.value)}
          disabled={connected}
          sx={{
            "& .MuiOutlinedInput-root": {
              fontFamily: "monospace",
              fontSize: 13,
            },
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !connected) handleConnect();
          }}
        />
        {!connected ? (
          <Button
            variant="contained"
            color="success"
            onClick={handleConnect}
            disabled={connecting || !wsUrl}
            startIcon={<Cable />}
            sx={{ minWidth: 120, whiteSpace: "nowrap" }}
          >
            {connecting
              ? t("websocket.connecting")
              : t("websocket.connect")}
          </Button>
        ) : (
          <Button
            variant="outlined"
            color="error"
            onClick={handleDisconnect}
            startIcon={<PowerOff />}
            sx={{ minWidth: 120, whiteSpace: "nowrap" }}
          >
            {t("websocket.disconnect")}
          </Button>
        )}
      </Box>

      {/* Message input */}
      {connected && (
        <Box sx={{ display: "flex", gap: 1 }}>
          <TextField
            fullWidth
            size="small"
            placeholder={t("websocket.messageInput")}
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            multiline
            maxRows={3}
            sx={{
              "& .MuiOutlinedInput-root": {
                fontFamily: "monospace",
                fontSize: 13,
              },
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
          />
          <Button
            variant="contained"
            onClick={handleSendMessage}
            disabled={!messageInput.trim()}
            startIcon={<Send />}
            sx={{ minWidth: 90 }}
          >
            {t("request.send")}
          </Button>
        </Box>
      )}

      {/* Messages list */}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          border: 1,
          borderColor: "divider",
          borderRadius: 1,
          bgcolor: "background.default",
        }}
      >
        {messages.length === 0 ? (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ p: 3, textAlign: "center" }}
          >
            {t("websocket.noMessages")}
          </Typography>
        ) : (
          <List dense disablePadding>
            {messages.map((msg, i) => (
              <ListItem
                key={i}
                sx={{
                  py: 0.75,
                  px: 1.5,
                  bgcolor:
                    msg.direction === "sent"
                      ? "action.hover"
                      : "transparent",
                  borderBottom: "1px solid",
                  borderColor: "divider",
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    gap: 1,
                    width: "100%",
                    alignItems: "flex-start",
                  }}
                >
                  {msg.direction === "sent" ? (
                    <ArrowUpward
                      sx={{ fontSize: 14, color: "success.main", mt: 0.5 }}
                    />
                  ) : (
                    <ArrowDownward
                      sx={{ fontSize: 14, color: "info.main", mt: 0.5 }}
                    />
                  )}
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography
                      variant="body2"
                      sx={{
                        fontFamily: "monospace",
                        fontSize: 12,
                        wordBreak: "break-all",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {msg.data}
                    </Typography>
                  </Box>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      whiteSpace: "nowrap",
                      fontSize: 10,
                      mt: 0.25,
                    }}
                  >
                    {formatTime(msg.timestamp)}
                  </Typography>
                  <Tooltip title={t("codegen.copy")}>
                    <IconButton
                      size="small"
                      onClick={() =>
                        navigator.clipboard.writeText(msg.data)
                      }
                      sx={{ p: 0.25 }}
                    >
                      <ContentCopy sx={{ fontSize: 12 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              </ListItem>
            ))}
            <div ref={messagesEndRef} />
          </List>
        )}
      </Box>
    </Box>
  );
}
