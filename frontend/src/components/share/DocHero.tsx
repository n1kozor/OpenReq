import { Box, Typography, Chip } from "@mui/material";
import {
  Api as ApiIcon,
  Schedule as ScheduleIcon,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";

interface DocHeroProps {
  title: string;
  description: string | null;
  endpointCount: number;
  generatedAt: string;
}

export default function DocHero({ title, description, endpointCount, generatedAt }: DocHeroProps) {
  const { t } = useTranslation();

  const formattedDate = new Date(generatedAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Box sx={{ mb: 4, pb: 3, borderBottom: 1, borderColor: "divider" }}>
      <Typography
        variant="h3"
        fontWeight={800}
        sx={{
          background: "linear-gradient(135deg, #6366f1, #a78bfa)",
          backgroundClip: "text",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          mb: 1,
        }}
      >
        {title}
      </Typography>

      {description && (
        <Typography variant="body1" color="text.secondary" sx={{ mb: 2, maxWidth: 700 }}>
          {description}
        </Typography>
      )}

      <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap" }}>
        <Chip
          icon={<ApiIcon />}
          label={`${endpointCount} ${t("share.endpoints")}`}
          size="small"
          variant="outlined"
          color="primary"
        />
        <Chip
          icon={<ScheduleIcon />}
          label={`${t("share.generatedAt")}: ${formattedDate}`}
          size="small"
          variant="outlined"
        />
      </Box>
    </Box>
  );
}
