import { LEVELS } from "../lib/badges";

const SIZES = { xs: "h-6 w-6", sm: "h-8 w-8", md: "h-12 w-12", lg: "h-24 w-24 sm:h-28 sm:w-28" };

export const RankAvatar = ({ rank, size = "sm", testId, frame }) => {
  const l = LEVELS[rank] || LEVELS.Recruit;
  const img = (
    <img src={l.img} alt={`${rank || "Recruit"} avatar`} title={rank} data-testid={testId} loading="lazy"
      className={`${SIZES[size]} shrink-0 rounded-full object-cover ${frame ? "relative" : `border-2 ${l.ring}`}`} />
  );
  if (!frame) return img;
  return <span className={`avatar-frame frame-${frame} shrink-0`} data-testid={testId && `${testId}-frame-${frame}`}>{img}</span>;
};
