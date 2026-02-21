import { forwardRef, useEffect, useRef, type ReactNode } from "react";
import { Box, Typography, IconButton, Tooltip } from "@mui/material";
import { Minimize, CropSquare } from "@mui/icons-material";
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
          borderRadius: 0,
          border: `1px solid ${isDark ? "#4e5157" : "#d1d1d1"}`,
          backgroundColor: isDark ? "#2b2d30" : "#ffffff",
          overflow: "hidden",
          transition: "border-color 0.1s ease",
          "&:hover": {
            borderColor: isDark ? "#4e5157" : "#b0b0b0",
          },
          "&.react-draggable-dragging": {
            boxShadow: `0 4px 16px ${alpha("#000", isDark ? 0.4 : 0.12)}`,
            borderColor: theme.palette.primary.main,
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
            px: 1,
            py: 0.25,
            minHeight: 26,
            cursor: "grab",
            borderBottom: isMinimized
              ? "none"
              : `1px solid ${isDark ? "#4e5157" : "#d1d1d1"}`,
            backgroundColor: isDark ? "#393b40" : "#e8e8e8",
            userSelect: "none",
            flexShrink: 0,
            "&:active": { cursor: "grabbing" },
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, color: "text.secondary" }}>
            {icon}
          </Box>
          <Typography
            variant="caption"
            sx={{
              fontWeight: 500,
              fontSize: "0.72rem",
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
