import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <svg width={32} height={32} viewBox="0 0 32 32" fill="none">
        <polygon points="16,2 28,9 28,23 16,30 4,23 4,9" fill="#0a0e17" stroke="#00e5ff" strokeWidth="1.2"/>
        <polygon points="16,5.5 25,10.5 25,22.5 16,27.5 7,22.5 7,10.5" fill="none" stroke="#00e5ff" strokeWidth="0.5" opacity="0.3"/>
        <polyline points="9,22 12.5,17.5 16,12.5 19.5,15 23,9" fill="none" stroke="#00e5ff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="23" cy="9" r="2" fill="#00e5ff"/>
      </svg>
    ),
    { ...size }
  );
}
