"use client";

import dynamic from "next/dynamic";
import { OfficeFloor } from "./office-floor";
import type { OfficeViewMode, OfficeViewProps } from "./office-layout";

const Office3D = dynamic(
  () => import("./office-3d").then((m) => m.Office3D),
  {
    ssr: false,
    loading: () => (
      <div className="office-stage office-stage-3d">
        <p className="office-hint">Loading 3D office…</p>
      </div>
    ),
  },
);

type OfficeViewportProps = OfficeViewProps & {
  mode: OfficeViewMode;
};

export function OfficeViewport({ mode, ...props }: OfficeViewportProps) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {mode === "3d" ? <Office3D {...props} /> : <OfficeFloor {...props} />}
    </div>
  );
}
