import type {
  ProctoringRound,
  ProctoringViolationType,
} from "@/app/lib/db/models/Candidate";

/** Maps a violation type to a human-readable closure reason shown to candidates and HR. */
export function describeClosure(
  type: ProctoringViolationType,
  round: ProctoringRound
): string {
  const roundLabel = round === "quiz" ? "Quiz" : "AI interview";
  switch (type) {
    case "face_mismatch":
      return `${roundLabel} was closed because the person on camera did not match your profile photo.`;
    case "multi_face":
      return `${roundLabel} was closed because more than one person was detected in front of the camera.`;
    case "no_face":
      return `${roundLabel} was closed because no face was visible in the camera for an extended period.`;
    case "voice_detected":
      return `${roundLabel} was closed because background voices were detected during the session.`;
    case "tab_switch":
      return `${roundLabel} was closed because you switched away from the assessment tab too many times.`;
    case "window_blur":
      return `${roundLabel} was closed because you moved focus away from the assessment window too many times.`;
    case "fullscreen_exit":
      return `${roundLabel} was closed because you exited fullscreen mode, which is required.`;
    case "copy_paste":
      return `${roundLabel} was closed because copy / paste activity violated the anti-cheating rules.`;
    case "camera_denied":
    case "camera_lost":
      return `${roundLabel} could not continue because the camera was disconnected or denied.`;
    default:
      return `${roundLabel} was closed due to an anti-cheating violation.`;
  }
}
