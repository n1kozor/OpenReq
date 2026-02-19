import { useState, useEffect, useCallback, useRef } from "react";
import {
  Box,
  Typography,
  CircularProgress,
  IconButton,
  Tooltip,
  Alert,
  useMediaQuery,
  Drawer,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import {
  DarkMode,
  LightMode,
  Menu as MenuIcon,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { publicApi } from "@/api/endpoints";
import type { SharePublicMeta, ShareDocsData } from "@/types";
import PasswordPrompt from "@/components/share/PasswordPrompt";
import DocSidebar from "@/components/share/DocSidebar";
import DocHero from "@/components/share/DocHero";
import DocEndpoint from "@/components/share/DocEndpoint";

interface ShareDocPageProps {
  mode: "dark" | "light";
  onToggleTheme: () => void;
}

type PageState = "loading" | "password" | "ready" | "error";

export default function ShareDocPage({ mode, onToggleTheme }: ShareDocPageProps) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const [state, setState] = useState<PageState>("loading");
  const [meta, setMeta] = useState<SharePublicMeta | null>(null);
  const [docs, setDocs] = useState<ShareDocsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwLoading, setPwLoading] = useState(false);
  const [activeEndpoint, setActiveEndpoint] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const sessionTokenRef = useRef<string | null>(null);

  // Extract token from URL
  const token = window.location.pathname.split("/share/")[1]?.split("/")[0] || "";

  const fetchDocs = useCallback(async () => {
    try {
      const { data } = await publicApi.getShareDocs(token, sessionTokenRef.current || undefined);
      setDocs(data);
      setState("ready");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Failed to load documentation";
      setError(msg);
      setState("error");
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      setError(t("share.notFound"));
      setState("error");
      return;
    }

    publicApi
      .getShareMeta(token)
      .then(({ data }) => {
        setMeta(data);
        if (data.has_password) {
          setState("password");
        } else {
          fetchDocs();
        }
      })
      .catch((err) => {
        const detail = err?.response?.data?.detail || "Share not found";
        setError(detail);
        setState("error");
      });
  }, [token, t, fetchDocs]);

  const handleVerifyPassword = async (password: string) => {
    setPwLoading(true);
    setPwError(null);
    try {
      const { data } = await publicApi.verifyPassword(token, password);
      sessionTokenRef.current = data.session_token;
      await fetchDocs();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || t("share.incorrectPassword");
      setPwError(msg);
    } finally {
      setPwLoading(false);
    }
  };

  const handleSelectEndpoint = (index: number) => {
    setActiveEndpoint(index);
    setSidebarOpen(false);
    const el = document.getElementById(`endpoint-${index}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Language toggle
  const languages = ["en", "hu", "de"] as const;
  const langFlags: Record<string, string> = { en: "GB", hu: "HU", de: "DE" };
  const nextLang = () => {
    const idx = languages.indexOf(i18n.language as (typeof languages)[number]);
    const next = languages[(idx + 1) % languages.length];
    i18n.changeLanguage(next);
  };

  // Loading state
  if (state === "loading") {
    return (
      <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "background.default" }}>
        <CircularProgress size={32} />
      </Box>
    );
  }

  // Error state
  if (state === "error") {
    return (
      <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "background.default", p: 2 }}>
        <Alert severity="error" sx={{ maxWidth: 500 }}>
          {error}
        </Alert>
      </Box>
    );
  }

  // Password prompt
  if (state === "password" && meta) {
    return (
      <PasswordPrompt
        title={meta.title}
        onVerify={handleVerifyPassword}
        error={pwError}
        loading={pwLoading}
      />
    );
  }

  // Ready — render docs
  if (!docs) return null;

  const sidebarContent = (
    <DocSidebar
      title={docs.title}
      endpoints={docs.endpoints}
      folderTree={docs.folder_tree}
      activeIndex={activeEndpoint}
      onSelect={handleSelectEndpoint}
    />
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}>
      {/* Sidebar — desktop: fixed, mobile: drawer */}
      {isMobile ? (
        <Drawer
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          slotProps={{ paper: { sx: { width: 280 } } }}
        >
          {sidebarContent}
        </Drawer>
      ) : (
        sidebarContent
      )}

      {/* Main content */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {/* Top bar */}
        <Box
          sx={{
            position: "sticky",
            top: 0,
            zIndex: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 1,
            px: 2,
            py: 1,
            bgcolor: "background.paper",
            borderBottom: 1,
            borderColor: "divider",
          }}
        >
          {isMobile && (
            <IconButton onClick={() => setSidebarOpen(true)} sx={{ mr: "auto" }}>
              <MenuIcon />
            </IconButton>
          )}
          <Tooltip title="Language">
            <IconButton onClick={nextLang} size="small">
              <img
                src={`https://flagcdn.com/w20/${langFlags[i18n.language]?.toLowerCase() || "gb"}.png`}
                alt={i18n.language}
                style={{ width: 20, height: 15, borderRadius: 2 }}
              />
            </IconButton>
          </Tooltip>
          <Tooltip title={mode === "dark" ? "Light mode" : "Dark mode"}>
            <IconButton onClick={onToggleTheme} size="small">
              {mode === "dark" ? <LightMode fontSize="small" /> : <DarkMode fontSize="small" />}
            </IconButton>
          </Tooltip>
        </Box>

        {/* Doc content */}
        <Box sx={{ maxWidth: 900, mx: "auto", p: { xs: 2, md: 4 } }}>
          <DocHero
            title={docs.title}
            description={docs.description}
            endpointCount={docs.endpoint_count}
            generatedAt={docs.generated_at}
          />

          {docs.endpoints.length === 0 ? (
            <Typography color="text.secondary" sx={{ py: 8, textAlign: "center" }}>
              {t("share.noResults")}
            </Typography>
          ) : (
            docs.endpoints.map((ep) => (
              <DocEndpoint key={ep.index} endpoint={ep} />
            ))
          )}
        </Box>
      </Box>
    </Box>
  );
}
