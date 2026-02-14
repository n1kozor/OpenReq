import { forwardRef, useEffect, useRef, type ReactNode } from "react";
import { Box, Typography, IconButton, Tooltip } from "@mui/material";
import { DragIndicator, Minimize, CropSquare } from "@mui/icons-material";
import { alpha, useTheme } from "@mui/material/styles";
import { useTranslation } from "react-i18next";

interface DraggablePanelProps {
  titleKey: string;
  icon: ReactNode;
  isMinimized: boolean;
  onToggleMinimize: () => void;
  children: ReactNode;
  style?: React.CSSProperties;
  className?: string;
}

const DraggablePanel = forwardRef<HTMLDivElement, DraggablePanelProps>(
  function DraggablePanel(
    { titleKey, icon, isMinimized, onToggleMinimize, children, style, className, ...rest },
    ref,
  ) {
    const { t } = useTranslation();
    const theme = useTheme();
    const isDark = theme.palette.mode === "dark";
    const contentRef = useRef<HTMLDivElement>(null);

    // Trigger Monaco relayout on panel resize
    useEffect(() => {
      const el = contentRef.current;
      if (!el) return;
      const observer = new ResizeObserver(() => {
        window.dispatchEvent(new Event("resize"));
      });
      observer.observe(el);
      return () => observer.disconnect();
    }, []);

    return (
      <Box
        ref={ref}
        style={style}
        className={className}
        {...rest}
        sx={{
          display: "flex",
          flexDirection: "column",
          borderRadius: 2.5,
          border: `1px solid ${alpha(isDark ? "#8b949e" : "#64748b", 0.1)}`,
          backgroundColor: isDark ? alpha("#111620", 0.6) : "#ffffff",
          backdropFilter: isDark ? "blur(8px)" : undefined,
          overflow: "hidden",
          transition: "border-color 0.2s ease, box-shadow 0.2s ease",
          "&:hover": {
            borderColor: alpha(isDark ? "#8b949e" : "#64748b", 0.2),
          },
          "&.react-draggable-dragging": {
            boxShadow: `0 8px 32px ${alpha("#000", isDark ? 0.5 : 0.15)}`,
            borderColor: alpha(theme.palette.primary.main, 0.4),
            zIndex: 1000,
          },
          height: "100%",
        }}
      >
        {/* Drag Handle / Title Bar */}
        <Box
          className="panel-drag-handle"
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.75,
            px: 1.5,
            py: 0.5,
            minHeight: 32,
            cursor: "grab",
            borderBottom: isMinimized
              ? "none"
              : `1px solid ${alpha(isDark ? "#8b949e" : "#64748b", 0.08)}`,
            backgroundColor: alpha(
              isDark ? "#1a1f2e" : "#f8fafc",
              isDark ? 0.5 : 0.8,
            ),
            userSelect: "none",
            flexShrink: 0,
            "&:active": { cursor: "grabbing" },
          }}
        >
          <DragIndicator
            sx={{
              fontSize: 14,
              color: "text.secondary",
              opacity: 0.4,
              transition: "opacity 0.15s",
              ".panel-drag-handle:hover &": { opacity: 0.8 },
            }}
          />
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, color: "text.secondary" }}>
            {icon}
          </Box>
          <Typography
            variant="caption"
            sx={{
              fontWeight: 600,
              fontSize: "0.72rem",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "text.secondary",
            }}
          >
            {t(titleKey)}
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          <Tooltip title={isMinimized ? t("layout.maximize") : t("layout.minimize")}>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onToggleMinimize();
              }}
              sx={{
                width: 20,
                height: 20,
                borderRadius: 1,
                color: "text.secondary",
                opacity: 0.5,
                transition: "opacity 0.15s",
                "&:hover": {
                  opacity: 1,
                  backgroundColor: alpha(theme.palette.primary.main, 0.08),
                },
              }}
            >
              {isMinimized ? (
                <CropSquare sx={{ fontSize: 12 }} />
              ) : (
                <Minimize sx={{ fontSize: 12 }} />
              )}
            </IconButton>
          </Tooltip>
        </Box>

        {/* Content */}
        {!isMinimized && (
          <Box
            ref={contentRef}
            sx={{
              flex: 1,
              overflow: "auto",
              minHeight: 0,
            }}
          >
            {children}
          </Box>
        )}
      </Box>
    );
  },
);

export default DraggablePanel;
