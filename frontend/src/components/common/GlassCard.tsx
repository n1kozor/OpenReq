import { Paper, type PaperProps } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";

export default function GlassCard({ sx, children, ...props }: PaperProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  return (
    <Paper
      variant="outlined"
      sx={{
        borderRadius: 2.5,
        borderColor: isDark
          ? alpha("#8b949e", 0.1)
          : alpha("#64748b", 0.12),
        backgroundColor: isDark
          ? alpha("#111620", 0.6)
          : "#ffffff",
        backdropFilter: isDark ? "blur(8px)" : undefined,
        transition: "all 0.2s ease",
        "&:hover": {
          borderColor: isDark
            ? alpha("#8b949e", 0.2)
            : alpha("#64748b", 0.2),
        },
        ...sx,
      }}
      {...props}
    >
      {children}
    </Paper>
  );
}
