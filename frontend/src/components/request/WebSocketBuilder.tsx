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
  Tabs,
  Tab,
  Badge,
  Portal,
} from "@mui/material";
import {
  Cable,
  Send,
  PowerOff,
  Delete,
  ContentCopy,
  ArrowUpward,
  ArrowDownward,
  Save,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import KeyValueEditor from "@/components/common/KeyValueEditor";
import { VariableValueCell } from "@/components/common/KeyValueEditor";
import AuthEditor from "./AuthEditor";
import { useVariableGroups } from "@/hooks/useVariableGroups";
import type { KeyValuePair, AuthType, OAuthConfig, WebSocketMessage, Environment, EnvironmentVariable } from "@/types";
import { API_URL } from "@/api/client";

interface WebSocketBuilderProps {
  url: string;
  headers: KeyValuePair[];
  authType: AuthType;
  bearerToken: string;
  basicUsername: string;
  basicPassword: string;
  apiKeyName: string;
  apiKeyValue: string;
  apiKeyPlacement: "header" | "query";
  oauthConfig: OAuthConfig;
  wsMessages: WebSocketMessage[];
  wsConnected: boolean;
  onUrlChange: (u: string) => void;
  onHeadersChange: (h: KeyValuePair[]) => void;
  onAuthTypeChange: (a: AuthType) => void;
  onBearerTokenChange: (v: string) => void;
  onBasicUsernameChange: (v: string) => void;
  onBasicPasswordChange: (v: string) => void;
  onApiKeyNameChange: (v: string) => void;
  onApiKeyValueChange: (v: string) => void;
  onApiKeyPlacementChange: (v: "header" | "query") => void;
  onOAuthConfigChange: (config: OAuthConfig) => void;
  onWsMessagesChange: (msgs: WebSocketMessage[]) => void;
  onWsConnectedChange: (connected: boolean) => void;
  onSave: () => void;
  // Variable support
  environments?: Environment[];
  selectedEnvId?: string | null;
  envOverrideId?: string | null;
  collectionVariables?: Record<string, string>;
  workspaceGlobals?: Record<string, string>;
}

export default function WebSocketBuilder(props: WebSocketBuilderProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState(0);
  const [connecting, setConnecting] = useState(false);
  const [messageInput, setMessageInput] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const connectButtonRef = useRef<HTMLButtonElement | null>(null);
  const [showFloatingConnect, setShowFloatingConnect] = useState(false);

  // Variable resolution
  const activeEnvId = props.envOverrideId ?? props.selectedEnvId ?? null;
  const activeEnv = props.environments?.find((e) => e.id === activeEnvId);
  const envVariables: EnvironmentVariable[] = activeEnv?.variables ?? [];

  const { groups: variableGroups, resolved: resolvedVariables } = useVariableGroups(
    envVariables,
    props.collectionVariables ?? {},
    props.workspaceGlobals,
  );

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [props.wsMessages]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const target = connectButtonRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowFloatingConnect(!entry.isIntersecting);
      },
      { root: null, rootMargin: "-56px 0px 0px 0px", threshold: 0.95 }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  const getWsProxyUrl = () => {
    if (API_URL) {
      return API_URL.replace("http", "ws") + "/api/v1/ws-proxy";
    }
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}/api/v1/ws-proxy`;
  };

  const handleConnect = useCallback(() => {
    if (props.wsConnected || connecting) return;
    setConnecting(true);

    const proxyUrl = getWsProxyUrl();
    const token = localStorage.getItem("openreq-token");
    const ws = new WebSocket(`${proxyUrl}?token=${token}`);

    ws.onopen = () => {
      wsRef.current = ws;
      ws.send(JSON.stringify({ action: "connect", url: props.url }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "connected") {
          props.onWsConnectedChange(true);
          setConnecting(false);
          props.onWsMessagesChange([
            ...props.wsMessages,
            { data: t("websocket.connected", { url: data.url }), timestamp: data.timestamp || Date.now(), direction: "received" },
          ]);
        } else if (data.type === "disconnected") {
          props.onWsConnectedChange(false);
          setConnecting(false);
          props.onWsMessagesChange([
            ...props.wsMessages,
            { data: t("websocket.disconnectedMsg"), timestamp: data.timestamp || Date.now(), direction: "received" },
          ]);
        } else if (data.type === "message") {
          props.onWsMessagesChange([
            ...props.wsMessages,
            { data: data.data, timestamp: data.timestamp || Date.now(), direction: data.direction || "received" },
          ]);
        } else if (data.type === "error") {
          setConnecting(false);
          props.onWsMessagesChange([
            ...props.wsMessages,
            { data: `Error: ${data.message}`, timestamp: data.timestamp || Date.now(), direction: "received" },
          ]);
        }
      } catch {
        props.onWsMessagesChange([
          ...props.wsMessages,
          { data: event.data, timestamp: Date.now(), direction: "received" },
        ]);
      }
    };

    ws.onerror = () => {
      setConnecting(false);
      props.onWsConnectedChange(false);
    };

    ws.onclose = () => {
      props.onWsConnectedChange(false);
      setConnecting(false);
      wsRef.current = null;
    };
  }, [props, connecting, t]);

  const handleDisconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({ action: "disconnect" }));
    }
  }, []);

  const handleSendMessage = useCallback(() => {
    if (!wsRef.current || !messageInput.trim()) return;
    wsRef.current.send(JSON.stringify({ action: "send", data: messageInput }));
    setMessageInput("");
  }, [messageInput]);

  const handleClearMessages = () => {
    props.onWsMessagesChange([]);
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

  const activeHeadersCount = props.headers.filter((h) => h.enabled && h.key).length;

  return (
    <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1.5, height: "100%", overflow: "hidden" }}>
      {/* URL bar */}
      <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
        <Chip
          icon={<Cable />}
          label="WS"
          size="small"
          sx={{ fontWeight: 700, bgcolor: "#14b8a6", color: "#fff", "& .MuiChip-icon": { color: "#fff" } }}
        />
        <Box sx={{ flex: "1 1 320px", minWidth: 220, border: 1, borderColor: "divider", borderRadius: 1, px: 1, py: 0.25 }}>
          <VariableValueCell
            value={props.url}
            onChange={props.onUrlChange}
            placeholder={t("websocket.urlPlaceholder")}
            resolvedVariables={resolvedVariables}
            variableGroups={variableGroups}
          />
        </Box>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          {!props.wsConnected ? (
            <Button
              ref={connectButtonRef}
              variant="contained"
              color="success"
              onClick={handleConnect}
              disabled={connecting || !props.url}
              startIcon={<Cable />}
              sx={{ minWidth: 130, whiteSpace: "nowrap", height: 36 }}
            >
              {connecting ? t("websocket.connecting") : t("websocket.connect")}
            </Button>
          ) : (
            <Button
              ref={connectButtonRef}
              variant="outlined"
              color="error"
              onClick={handleDisconnect}
              startIcon={<PowerOff />}
              sx={{ minWidth: 130, whiteSpace: "nowrap", height: 36 }}
            >
              {t("websocket.disconnect")}
            </Button>
          )}
          <Button
            variant="outlined"
            onClick={props.onSave}
            startIcon={<Save sx={{ fontSize: 16 }} />}
            sx={{ minWidth: 80, whiteSpace: "nowrap", height: 36 }}
          >
            {t("common.save")}
          </Button>
        </Box>
      </Box>

      {/* Status chip */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Chip
          label={
            props.wsConnected
              ? t("websocket.statusConnected")
              : connecting
              ? t("websocket.statusConnecting")
              : t("websocket.statusDisconnected")
          }
          color={props.wsConnected ? "success" : connecting ? "warning" : "default"}
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

      {/* Tabs: Headers / Auth / Messages */}
      <Tabs value={tab} onChange={(_, v) => setTab(v)}>
        <Tab
          label={
            <Badge
              badgeContent={activeHeadersCount}
              color="primary"
              sx={{ "& .MuiBadge-badge": { fontSize: 10, minWidth: 16, height: 16 } }}
            >
              {t("websocket.headers")}
            </Badge>
          }
        />
        <Tab label={t("request.auth")} />
        <Tab label={t("websocket.messages")} />
      </Tabs>

      <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {tab === 0 && (
          <KeyValueEditor
            pairs={props.headers}
            onChange={props.onHeadersChange}
            keyLabel={t("request.header")}
            valueLabel={t("common.value")}
            resolvedVariables={resolvedVariables}
            variableGroups={variableGroups}
          />
        )}

        {tab === 1 && (
          <AuthEditor
            authType={props.authType}
            bearerToken={props.bearerToken}
            basicUsername={props.basicUsername}
            basicPassword={props.basicPassword}
            apiKeyName={props.apiKeyName}
            apiKeyValue={props.apiKeyValue}
            apiKeyPlacement={props.apiKeyPlacement}
            onAuthTypeChange={props.onAuthTypeChange}
            onBearerTokenChange={props.onBearerTokenChange}
            onBasicUsernameChange={props.onBasicUsernameChange}
            onBasicPasswordChange={props.onBasicPasswordChange}
            onApiKeyNameChange={props.onApiKeyNameChange}
            onApiKeyValueChange={props.onApiKeyValueChange}
            onApiKeyPlacementChange={props.onApiKeyPlacementChange}
            oauthConfig={props.oauthConfig}
            onOAuthConfigChange={props.onOAuthConfigChange}
            resolvedVariables={resolvedVariables}
            variableGroups={variableGroups}
          />
        )}

        {tab === 2 && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1, height: "100%" }}>
            {/* Message send input */}
            {props.wsConnected && (
              <Box sx={{ display: "flex", gap: 1 }}>
                <TextField
                  fullWidth
                  size="small"
                  placeholder={t("websocket.messageInput")}
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  multiline
                  maxRows={3}
                  sx={{ "& .MuiOutlinedInput-root": { fontFamily: "monospace", fontSize: 13 } }}
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
                  {t("websocket.sendMessage")}
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
              {props.wsMessages.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: "center" }}>
                  {t("websocket.noMessages")}
                </Typography>
              ) : (
                <List dense disablePadding>
                  {props.wsMessages.map((msg, i) => (
                    <ListItem
                      key={i}
                      sx={{
                        py: 0.75,
                        px: 1.5,
                        bgcolor: msg.direction === "sent" ? "action.hover" : "transparent",
                        borderBottom: "1px solid",
                        borderColor: "divider",
                      }}
                    >
                      <Box sx={{ display: "flex", gap: 1, width: "100%", alignItems: "flex-start" }}>
                        {msg.direction === "sent" ? (
                          <ArrowUpward sx={{ fontSize: 14, color: "success.main", mt: 0.5 }} />
                        ) : (
                          <ArrowDownward sx={{ fontSize: 14, color: "info.main", mt: 0.5 }} />
                        )}
                        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                          <Typography
                            variant="body2"
                            sx={{ fontFamily: "monospace", fontSize: 12, wordBreak: "break-all", whiteSpace: "pre-wrap" }}
                          >
                            {msg.data}
                          </Typography>
                        </Box>
                        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap", fontSize: 10, mt: 0.25 }}>
                          {formatTime(msg.timestamp)}
                        </Typography>
                        <Tooltip title={t("codegen.copy")}>
                          <IconButton size="small" onClick={() => navigator.clipboard.writeText(msg.data)} sx={{ p: 0.25 }}>
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
        )}
      </Box>

      {showFloatingConnect && (
        <Portal>
          {!props.wsConnected ? (
            <Button
              variant="contained"
              color="success"
              onClick={handleConnect}
              disabled={connecting || !props.url}
              startIcon={<Cable />}
              sx={{
                position: "fixed",
                right: 24,
                bottom: 24,
                zIndex: 1400,
                borderRadius: 999,
                px: 2.25,
                py: 1,
                fontWeight: 700,
                fontSize: "0.9rem",
                boxShadow: "0 12px 30px rgba(0,0,0,0.2)",
              }}
            >
              {connecting ? t("websocket.connecting") : t("websocket.connect")}
            </Button>
          ) : (
            <Button
              variant="contained"
              color="error"
              onClick={handleDisconnect}
              startIcon={<PowerOff />}
              sx={{
                position: "fixed",
                right: 24,
                bottom: 24,
                zIndex: 1400,
                borderRadius: 999,
                px: 2.25,
                py: 1,
                fontWeight: 700,
                fontSize: "0.9rem",
                boxShadow: "0 12px 30px rgba(0,0,0,0.2)",
              }}
            >
              {t("websocket.disconnect")}
            </Button>
          )}
        </Portal>
      )}
    </Box>
  );
}
