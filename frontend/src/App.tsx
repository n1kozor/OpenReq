import { useState, useMemo, useEffect } from "react";
import { ThemeProvider, CssBaseline, Box, CircularProgress } from "@mui/material";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { darkTheme, lightTheme } from "@/theme";
import { useAuth } from "@/hooks/useAuth";
import { setupApi, workspacesApi } from "@/api/endpoints";
import AppShell from "@/components/layout/AppShell";
import Login from "@/pages/Login";
import SetupWizard from "@/pages/SetupWizard";
import WorkspaceSelector from "@/pages/WorkspaceSelector";
import ShareDocPage from "@/pages/ShareDocPage";
import "@/i18n";

const IS_STANDALONE = import.meta.env.VITE_STANDALONE === "true";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

export default function App() {
  const savedMode = (localStorage.getItem("openreq-theme") as "dark" | "light") || "dark";
  const [mode, setMode] = useState<"dark" | "light">(savedMode);
  const { user, loading, login, logout, refetchUser } = useAuth();
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [needsWorkspace, setNeedsWorkspace] = useState<boolean | null>(null);

  const theme = useMemo(() => (mode === "dark" ? darkTheme : lightTheme), [mode]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", mode);
  }, [mode]);

  // Check if first-run setup is needed
  useEffect(() => {
    if (IS_STANDALONE) {
      setSetupRequired(false);
      setCheckingSetup(false);
      return;
    }
    setupApi
      .status()
      .then(({ data }) => setSetupRequired(data.setup_required))
      .catch(() => setSetupRequired(false))
      .finally(() => setCheckingSetup(false));
  }, []);

  // Check if user needs to select a workspace (after login)
  useEffect(() => {
    if (IS_STANDALONE) {
      setNeedsWorkspace(false);
      return;
    }
    if (user && setupRequired === false) {
      workspacesApi
        .list()
        .then(({ data }) => {
          setNeedsWorkspace(data.length === 0);
        })
        .catch(() => setNeedsWorkspace(false));
    } else if (!user) {
      setNeedsWorkspace(null);
    }
  }, [user, setupRequired]);

  const toggleTheme = () => {
    const next = mode === "dark" ? "light" : "dark";
    setMode(next);
    localStorage.setItem("openreq-theme", next);
  };

  const handleSetupComplete = async () => {
    setSetupRequired(false);
    setNeedsWorkspace(false);
    await refetchUser();
  };

  const handleWorkspaceSelected = () => {
    setNeedsWorkspace(false);
  };

  // Public share page — no auth needed
  const isSharePage = window.location.pathname.startsWith("/share/");
  if (isSharePage) {
    return (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <ShareDocPage mode={mode} onToggleTheme={toggleTheme} />
        </ThemeProvider>
      </QueryClientProvider>
    );
  }

  if (loading || checkingSetup) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box
          sx={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: "background.default",
          }}
        >
          <CircularProgress size={32} sx={{ color: "primary.main" }} />
        </Box>
      </ThemeProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {setupRequired ? (
          <SetupWizard
            onComplete={handleSetupComplete}
            mode={mode}
            setMode={(m) => {
              setMode(m);
              localStorage.setItem("openreq-theme", m);
            }}
          />
        ) : user ? (
          needsWorkspace ? (
            <WorkspaceSelector
              onComplete={handleWorkspaceSelected}
              mode={mode}
            />
          ) : needsWorkspace === null ? (
            <Box
              sx={{
                minHeight: "100vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                bgcolor: "background.default",
              }}
            >
              <CircularProgress size={32} sx={{ color: "primary.main" }} />
            </Box>
          ) : (
            <AppShell
              mode={mode}
              onToggleTheme={toggleTheme}
              onLogout={logout}
              user={user}
            />
          )
        ) : (
          <Login onLogin={login} mode={mode} onToggleTheme={toggleTheme} />
        )}
      </ThemeProvider>
    </QueryClientProvider>
  );
}
